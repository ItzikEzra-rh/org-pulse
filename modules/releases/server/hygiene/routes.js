/**
 * Hygiene domain routes for the releases module.
 *
 * Provides endpoints for feature hygiene evaluation, configuration,
 * and Jira data refresh with fire-and-forget pattern.
 */

const { loadConfig } = require('./config');
const { evaluateHygiene, hygieneRules, RULE_CATEGORIES } = require('./hygiene-rules');
const { fetchHygieneFeatures } = require('./jira-fetch');
const { logAudit } = require('../planning/audit-log');
const { readRegistry } = require('../registry');
const {
  resolveReleaseProject,
  sendProjectScopeError,
  unavailableProjectData
} = require('../project-scope');

const DATA_PREFIX = 'releases/hygiene';
const COOLDOWN_MS = 5 * 60 * 1000;

const refreshState = {
  running: false,
  startedAt: null,
  completedAt: null,
  lastResult: null,
  progress: null,
  lastSuccessAt: null
};

/**
 * @openapi
 * /api/modules/releases/hygiene/features:
 *   get:
 *     summary: Get hygiene features for a release version
 *     tags: [Releases - Hygiene]
 *     parameters:
 *       - in: query
 *         name: version
 *         required: true
 *         schema: { type: string }
 *         description: Release version string
 *     responses:
 *       200:
 *         description: Feature hygiene data
 *       400:
 *         description: Missing version parameter
 */

/**
 * @openapi
 * /api/modules/releases/hygiene/summary:
 *   get:
 *     summary: Get aggregate hygiene violation summary for a release version
 *     tags: [Releases - Hygiene]
 *     parameters:
 *       - in: query
 *         name: version
 *         required: true
 *         schema: { type: string }
 *         description: Release version string
 *     responses:
 *       200:
 *         description: Hygiene violation summary
 *       400:
 *         description: Missing version parameter
 */

/**
 * @openapi
 * /api/modules/releases/hygiene/refresh/status:
 *   get:
 *     summary: Get current hygiene refresh status
 *     tags: [Releases - Hygiene]
 *     responses:
 *       200:
 *         description: Refresh state
 */

/**
 * @openapi
 * /api/modules/releases/hygiene/config:
 *   get:
 *     summary: Get hygiene rule configuration (planning-manager only)
 *     tags: [Releases - Hygiene]
 *     responses:
 *       200:
 *         description: Hygiene config with rule definitions
 */

/**
 * @openapi
 * /api/modules/releases/hygiene/program-report:
 *   get:
 *     summary: Get aggregate hygiene report across all versions
 *     tags: [Releases - Hygiene]
 *     responses:
 *       200:
 *         description: Cross-version hygiene summary for program reporting
 */

/**
 * @openapi
 * /api/modules/releases/hygiene/project-hygiene:
 *   get:
 *     summary: Get OSAC-style project-wide Jira hygiene results
 *     description: Read-only. Published by the org-pulse-data CI pipeline; the app performs no Jira calls or writes for this contract.
 *     tags: [Releases - Hygiene]
 *     responses:
 *       200:
 *         description: Project hygiene result contract
 *       404:
 *         description: No results have been published yet
 *       503:
 *         description: Published results could not be read (e.g. malformed JSON)
 */

/**
 * @openapi
 * /api/modules/releases/hygiene/project-hygiene/config:
 *   get:
 *     summary: Get OSAC-style project-wide Jira hygiene rule configuration
 *     description: Read-only. Rule definitions are owned and committed by org-pulse-data.
 *     tags: [Releases - Hygiene]
 *     responses:
 *       200:
 *         description: Project hygiene config contract
 *       404:
 *         description: No configuration has been published yet
 *       503:
 *         description: Published configuration could not be read (e.g. malformed JSON)
 */

module.exports = function registerHygieneRoutes(router, context) {
  const { storage, requireAuth, requirePlanningManager, requireScope, registerDiagnostics } = context;
  const projects = context.projects || null;

  function selectedProject(req, res) {
    const selection = resolveReleaseProject(projects, req.query);
    if (sendProjectScopeError(res, selection)) return null;
    return selection;
  }

  function projectMessage(selection, template) {
    const projectName = selection.profile?.displayName || selection.projectId;
    return template.replace('{project}', projectName);
  }

  function sendUnavailable(res, selection, message, status = 200) {
    const resolvedMessage = projectMessage(selection, message);
    return res.status(status).json({
      ...unavailableProjectData(selection.projectId, 'jira-hygiene', resolvedMessage),
      error: resolvedMessage
    });
  }

  function storageKey(version) {
    return DATA_PREFIX + '/features-' + version + '.json';
  }

  // Reads a data-side JSON contract file as-is. Distinct from the release-scoped
  // `storage.readFromStorage` calls below — readFromStorage only catches ENOENT,
  // so malformed JSON must be caught here and turned into an explicit 503.
  function readHygieneContract(res, key, notFoundMessage) {
    var data;
    try {
      data = storage.readFromStorage(key);
    } catch (err) {
      console.error('[hygiene] Failed to read ' + key + ':', err.message);
      return res.status(503).json({ error: 'Project hygiene data is temporarily unavailable' });
    }
    if (!data) {
      return res.status(404).json({ error: notFoundMessage });
    }
    return res.json(data);
  }

  async function runHygieneRefreshAll(options) {
    options = options || {};
    if (refreshState.running) return { status: 'already_running' };

    if (!options.skipCooldown && refreshState.lastSuccessAt &&
        Date.now() - new Date(refreshState.lastSuccessAt).getTime() < COOLDOWN_MS) {
      return { status: 'cooldown' };
    }

    var registry = readRegistry(storage.readFromStorage);
    var registryReleases = registry.releases || [];
    var seen = {};
    var activeVersions = [];
    for (var rri = 0; rri < registryReleases.length; rri++) {
      var rel = registryReleases[rri];
      if (rel.state === 'archived' || !rel.displayName) continue;
      if (seen[rel.displayName]) continue;
      seen[rel.displayName] = true;
      activeVersions.push(rel.displayName);
    }
    activeVersions.sort();

    if (activeVersions.length === 0) {
      return { status: 'success', message: 'No active versions to refresh', versions: [] };
    }

    refreshState.running = true;
    refreshState.startedAt = new Date().toISOString();
    refreshState.completedAt = null;
    refreshState.lastResult = null;
    refreshState.progress = { stage: 'starting', message: 'Refreshing all versions (' + activeVersions.length + ')' };

    var config = loadConfig(storage);
    var jira = require('../../../../shared/server/jira');
    var jiraRequest = jira.jiraRequest;
    var fetchAllJqlResults = jira.fetchAllJqlResults;
    var results = [];

    try {
      for (var vi = 0; vi < activeVersions.length; vi++) {
        var version = activeVersions[vi];
        refreshState.progress = {
          stage: 'refreshing',
          message: 'Refreshing ' + version + ' (' + (vi + 1) + '/' + activeVersions.length + ')'
        };

        var relForVersion = null;
        for (var rli = 0; rli < registryReleases.length; rli++) {
          var rr = registryReleases[rli];
          if (rr.id === version || rr.displayName === version) {
            relForVersion = rr;
            break;
          }
        }
        var jqlVersions = (relForVersion && relForVersion.fixVersions && relForVersion.fixVersions.length > 0)
          ? relForVersion.fixVersions
          : null;

        function onProgress(stage, detail) {
          refreshState.progress = {
            stage: stage,
            message: version + ': ' + (detail.message || stage) + ' (' + (vi + 1) + '/' + activeVersions.length + ')'
          };
        }

        try {
          var result = await fetchHygieneFeatures(jiraRequest, fetchAllJqlResults, version, config, onProgress, { jqlVersions: jqlVersions });
          var gaDate = relForVersion && relForVersion.milestones && (relForVersion.milestones.gaDate || relForVersion.milestones.ga);
          var versionReleased = false;
          var versionGaDate = null;

          if (gaDate) {
            var gaTime = new Date(gaDate + 'T00:00:00Z').getTime();
            if (!isNaN(gaTime) && Date.now() > gaTime) {
              versionReleased = true;
              versionGaDate = gaDate;
            }
          }

          var rulesConfig = config.rules || {};
          var featureKeys = Object.keys(result.features);
          for (var fi = 0; fi < featureKeys.length; fi++) {
            var feature = result.features[featureKeys[fi]];
            feature.versionReleased = versionReleased;
            feature.versionGaDate = versionGaDate;
            feature.violations = evaluateHygiene(feature, rulesConfig);
          }

          storage.writeToStorage(storageKey(version), result);
          results.push({ version: version, status: 'success', featureCount: featureKeys.length });
        } catch (err) {
          console.error('[hygiene] Refresh-all failed for ' + version + ':', err.message);
          results.push({ version: version, status: 'error', message: err.message });
        }
      }

      refreshState.running = false;
      refreshState.completedAt = new Date().toISOString();
      refreshState.lastSuccessAt = refreshState.completedAt;
      refreshState.lastResult = {
        status: 'success',
        totalVersions: activeVersions.length,
        versions: results
      };
      refreshState.progress = null;

      logAudit(storage.readFromStorage, storage.writeToStorage, {
        domain: 'hygiene',
        action: 'hygiene_refresh_all',
        user: (options && options.user) || 'system',
        summary: 'Hygiene data refreshed for ' + activeVersions.length + ' versions',
        details: { versions: results }
      });

      return refreshState.lastResult;
    } catch (err) {
      refreshState.running = false;
      refreshState.completedAt = new Date().toISOString();
      refreshState.lastResult = { status: 'error', message: err.message };
      refreshState.progress = null;
      throw err;
    }
  }

  // GET /features — hygiene features for a release version
  router.get('/features', requireAuth, requireScope('releases:read'), function(req, res) {
    const selection = selectedProject(req, res);
    if (!selection) return;
    var version = req.query.version;
    if (!version) {
      return res.status(400).json({ error: 'version query parameter is required' });
    }

    if (selection.projectId !== 'osac') {
      const message = projectMessage(selection, 'Jira Hygiene data has not been collected for {project}.');
      return res.json({
        ...unavailableProjectData(
          selection.projectId,
          'jira-hygiene',
          message
        ),
        error: message,
        version,
        features: {}
      });
    }

    var data = storage.readFromStorage(storageKey(version));
    if (!data) {
      return res.json({ features: {}, fetchedAt: null, version: version });
    }

    // Filter out bugs — they're stored for summary/report but not shown on the kanban
    var filtered = {};
    var keys = Object.keys(data.features || {});
    for (var i = 0; i < keys.length; i++) {
      if (data.features[keys[i]].issueType !== 'Bug') {
        filtered[keys[i]] = data.features[keys[i]];
      }
    }

    res.json({ features: filtered, fetchedAt: data.fetchedAt, version: data.version });
  });

  // GET /summary — aggregate violation summary
  router.get('/summary', requireAuth, requireScope('releases:read'), function(req, res) {
    const selection = selectedProject(req, res);
    if (!selection) return;
    var version = req.query.version;
    if (!version) {
      return res.status(400).json({ error: 'version query parameter is required' });
    }

    if (selection.projectId !== 'osac') {
      const message = projectMessage(selection, 'Jira Hygiene data has not been collected for {project}.');
      return res.json({
        ...unavailableProjectData(
          selection.projectId,
          'jira-hygiene',
          message
        ),
        error: message,
        version,
        totalFeatures: 0,
        featuresWithViolations: 0,
        violationsByRule: {},
        violationsByCategory: {}
      });
    }

    var data = storage.readFromStorage(storageKey(version));
    if (!data || !data.features) {
      return res.json({
        version: version,
        fetchedAt: null,
        totalFeatures: 0,
        featuresWithViolations: 0,
        violationsByRule: {},
        violationsByCategory: {}
      });
    }

    var config = loadConfig(storage);
    var rulesConfig = config.rules || {};

    var totalFeatures = 0;
    var featuresWithViolations = 0;
    var violationsByRule = {};
    var violationsByCategory = {};

    var keys = Object.keys(data.features);
    for (var i = 0; i < keys.length; i++) {
      var feature = data.features[keys[i]];
      totalFeatures++;

      var violations = evaluateHygiene(feature, rulesConfig);
      if (violations.length > 0) {
        featuresWithViolations++;
      }

      for (var j = 0; j < violations.length; j++) {
        var v = violations[j];
        violationsByRule[v.id] = (violationsByRule[v.id] || 0) + 1;
        violationsByCategory[v.category] = (violationsByCategory[v.category] || 0) + 1;
      }
    }

    res.json({
      version: version,
      fetchedAt: data.fetchedAt || null,
      totalFeatures: totalFeatures,
      featuresWithViolations: featuresWithViolations,
      violationsByRule: violationsByRule,
      violationsByCategory: violationsByCategory
    });
  });

  /**
   * @openapi
   * /api/modules/releases/hygiene/refresh-all:
   *   post:
   *     summary: Refresh hygiene data for all active release versions (planning-manager only)
   *     tags: [Releases - Hygiene]
   *     responses:
   *       200:
   *         description: Refresh started, already running, or no versions
   */
  router.post('/refresh-all', requirePlanningManager, requireScope('releases:write'), function(req, res) {
    const selection = selectedProject(req, res);
    if (!selection) return;
    if (selection.projectId !== 'osac') {
      return sendUnavailable(
        res,
        selection,
        'Jira Hygiene refresh is not configured for {project}.',
        409
      );
    }
    if (refreshState.running || (context.isRefreshRunning && context.isRefreshRunning())) {
      return res.json({ status: 'already_running' });
    }

    var registry = readRegistry(storage.readFromStorage);
    var registryReleases = registry.releases || [];
    var seen = {};
    var activeVersions = [];
    for (var rri = 0; rri < registryReleases.length; rri++) {
      var rel = registryReleases[rri];
      if (rel.state === 'archived' || !rel.displayName) continue;
      if (seen[rel.displayName]) continue;
      seen[rel.displayName] = true;
      activeVersions.push(rel.displayName);
    }
    activeVersions.sort();

    if (activeVersions.length === 0) {
      return res.json({ status: 'success', message: 'No active versions to refresh', versions: [] });
    }

    res.json({ status: 'started', versions: activeVersions });

    var userEmail = req.userEmail || 'unknown';
    runHygieneRefreshAll({ skipCooldown: true, user: userEmail }).catch(function() {});
  });

  // GET /refresh/status — current refresh state
  router.get('/refresh/status', requireAuth, requireScope('releases:read'), function(req, res) {
    const selection = selectedProject(req, res);
    if (!selection) return;
    if (selection.projectId !== 'osac') {
      return res.json({
        ...unavailableProjectData(
          selection.projectId,
          'jira-hygiene',
          'Jira Hygiene refresh status is unavailable for this project.'
        ),
        running: false,
        startedAt: null,
        completedAt: null,
        lastSuccessAt: null,
        lastResult: null,
        progress: null
      });
    }
    res.json({
      running: refreshState.running,
      startedAt: refreshState.startedAt,
      completedAt: refreshState.completedAt,
      lastSuccessAt: refreshState.lastSuccessAt,
      lastResult: refreshState.lastResult,
      progress: refreshState.progress
    });
  });

  // GET /config — hygiene rule configuration with rule definitions
  router.get('/config', requirePlanningManager, requireScope('releases:read'), function(req, res) {
    const selection = selectedProject(req, res);
    if (!selection) return;
    if (selection.projectId !== 'osac') {
      return sendUnavailable(
        res,
        selection,
        'Jira Hygiene rules have not been published for {project}.',
        404
      );
    }
    var config = loadConfig(storage);

    var ruleDefinitions = [];
    for (var i = 0; i < hygieneRules.length; i++) {
      var rule = hygieneRules[i];
      ruleDefinitions.push({
        id: rule.id,
        name: rule.name,
        description: rule.description,
        remediation: rule.remediation,
        category: rule.category,
        categoryLabel: RULE_CATEGORIES[rule.category] || rule.category,
        defaultEnabled: rule.defaultEnabled,
        defaultThreshold: rule.defaultThreshold || null
      });
    }

    res.json({
      config: config,
      ruleDefinitions: ruleDefinitions
    });
  });

  // GET /program-report — aggregate hygiene across all versions
  router.get('/program-report', requireAuth, requireScope('releases:read'), function(req, res) {
    const selection = selectedProject(req, res);
    if (!selection) return;
    if (selection.projectId !== 'osac') {
      return res.json({
        ...unavailableProjectData(
          selection.projectId,
          'jira-hygiene',
          'Jira Hygiene program report has not been collected for this project.'
        ),
        versions: [],
        totals: { totalFeatures: 0, featuresWithViolations: 0, violationsByRule: {}, violationsByTeam: {} },
        ruleDefinitions: {}
      });
    }
    var registry = readRegistry(storage.readFromStorage);
    var registryReleases = registry.releases || [];
    var config = loadConfig(storage);
    var rulesConfig = config.rules || {};

    // Scan stored hygiene data files instead of iterating registry
    // (hygiene version strings may differ from registry IDs)
    var hygieneFiles = storage.listStorageFiles ? storage.listStorageFiles('releases/hygiene') : [];
    var versions = [];

    for (var ri = 0; ri < hygieneFiles.length; ri++) {
      var match = hygieneFiles[ri].match(/^features-(.+)\.json$/);
      if (!match) continue;

      var versionId = match[1];
      var data = storage.readFromStorage(storageKey(versionId));
      if (!data || !data.features || Object.keys(data.features).length === 0) continue;

      // Look up registry release for GA date / released status
      var rel = null;
      for (var rri = 0; rri < registryReleases.length; rri++) {
        var rr = registryReleases[rri];
        if (rr.id === versionId || rr.displayName === versionId) {
          rel = rr;
          break;
        }
      }

      var gaDate = rel && rel.milestones && (rel.milestones.gaDate || rel.milestones.ga);
      var gaTime = gaDate ? new Date(gaDate + 'T00:00:00Z').getTime() : null;
      var isReleased = gaTime && !isNaN(gaTime) && Date.now() > gaTime;

      var totalFeatures = 0;
      var featuresWithViolations = 0;
      var violationsByRule = {};
      var violationsByTeam = {};
      var openChildrenTotal = 0;
      var openInReleasedTotal = 0;
      var featureList = [];

      var keys = Object.keys(data.features);
      for (var fi = 0; fi < keys.length; fi++) {
        var feature = data.features[keys[fi]];
        totalFeatures++;

        // Re-evaluate with current config + version-released status
        var enriched = Object.assign({}, feature, {
          versionReleased: !!isReleased,
          versionGaDate: gaDate || null
        });
        var violations = evaluateHygiene(enriched, rulesConfig);

        if (violations.length > 0) {
          featuresWithViolations++;
        }

        for (var vi = 0; vi < violations.length; vi++) {
          var v = violations[vi];
          violationsByRule[v.id] = (violationsByRule[v.id] || 0) + 1;
          if (v.id === 'open-children-on-closed') openChildrenTotal++;
          if (v.id === 'open-in-released-version') openInReleasedTotal++;
        }

        var team = feature.team || 'Unassigned';
        if (violations.length > 0) {
          violationsByTeam[team] = (violationsByTeam[team] || 0) + violations.length;
        }

        // Include feature-level detail for drill-down
        if (feature.issueType !== 'Bug') {
          featureList.push({
            key: feature.key,
            summary: feature.summary,
            issueType: feature.issueType,
            status: feature.status,
            team: feature.team || 'Unassigned',
            assignee: feature.assignee || 'Unassigned',
            violationCount: violations.length,
            violations: violations.map(function(vv) { return vv.id; })
          });
        }
      }

      versions.push({
        versionId: versionId,
        displayName: (rel && rel.displayName) || data.version || versionId,
        gaDate: gaDate || null,
        isReleased: !!isReleased,
        fetchedAt: data.fetchedAt || null,
        totalFeatures: totalFeatures,
        featuresWithViolations: featuresWithViolations,
        violationsByRule: violationsByRule,
        violationsByTeam: violationsByTeam,
        openChildrenTotal: openChildrenTotal,
        openInReleasedTotal: openInReleasedTotal,
        features: featureList
      });
    }

    // Build cross-version aggregates
    var totalViolationsByRule = {};
    var totalViolationsByTeam = {};
    var grandTotalFeatures = 0;
    var grandTotalWithViolations = 0;

    for (var ai = 0; ai < versions.length; ai++) {
      var ver = versions[ai];
      grandTotalFeatures += ver.totalFeatures;
      grandTotalWithViolations += ver.featuresWithViolations;

      var ruleKeys = Object.keys(ver.violationsByRule);
      for (var rki = 0; rki < ruleKeys.length; rki++) {
        totalViolationsByRule[ruleKeys[rki]] = (totalViolationsByRule[ruleKeys[rki]] || 0) + ver.violationsByRule[ruleKeys[rki]];
      }

      var teamKeys = Object.keys(ver.violationsByTeam);
      for (var tki = 0; tki < teamKeys.length; tki++) {
        totalViolationsByTeam[teamKeys[tki]] = (totalViolationsByTeam[teamKeys[tki]] || 0) + ver.violationsByTeam[teamKeys[tki]];
      }
    }

    // Rule definitions for labels
    var ruleMap = {};
    for (var rdi = 0; rdi < hygieneRules.length; rdi++) {
      var rule = hygieneRules[rdi];
      ruleMap[rule.id] = { name: rule.name, category: rule.category };
    }

    res.json({
      versions: versions,
      totals: {
        totalFeatures: grandTotalFeatures,
        featuresWithViolations: grandTotalWithViolations,
        violationsByRule: totalViolationsByRule,
        violationsByTeam: totalViolationsByTeam
      },
      ruleDefinitions: ruleMap
    });
  });

  // GET /project-hygiene — OSAC-style project-wide Jira hygiene results (read-only, data-side owned)
  router.get('/project-hygiene', requireAuth, requireScope('releases:read'), function(req, res) {
    const selection = selectedProject(req, res);
    if (!selection) return;
    if (selection.projectId !== 'osac') {
      return sendUnavailable(
        res,
        selection,
        'Jira Hygiene results have not been collected for {project}.',
        404
      );
    }
    readHygieneContract(
      res,
      DATA_PREFIX + '/project-hygiene-results.json',
      'Project hygiene results have not been published yet'
    );
  });

  // GET /project-hygiene/config — OSAC-style project-wide Jira hygiene rule config (read-only, data-side owned)
  router.get('/project-hygiene/config', requireAuth, requireScope('releases:read'), function(req, res) {
    const selection = selectedProject(req, res);
    if (!selection) return;
    if (selection.projectId !== 'osac') {
      return sendUnavailable(
        res,
        selection,
        'Jira Hygiene rules have not been published for {project}.',
        404
      );
    }
    readHygieneContract(
      res,
      DATA_PREFIX + '/project-hygiene-config.json',
      'Project hygiene configuration has not been published yet'
    );
  });

  // Diagnostics
  if (registerDiagnostics) {
    registerDiagnostics(function() {
      return {
        refreshState: { running: refreshState.running, lastResult: refreshState.lastResult }
      };
    });
  }

  if (context.registerRefresh) {
    context.registerRefresh('hygiene', {
      order: 70,
      timeout: 600000,
      description: 'Fetches feature data from Jira and evaluates hygiene rules across active releases.',
      handler: async function() {
        return runHygieneRefreshAll({ skipCooldown: true, user: 'system' });
      }
    });
  }
};

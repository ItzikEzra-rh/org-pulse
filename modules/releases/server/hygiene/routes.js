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
 *     summary: Get the selected project's Jira hygiene results
 *     description: Read-only. The selected project profile identifies one project-qualified source envelope published by org-pulse-data. A profile that declares legacyMigration returns that marker so the Execute Hygiene view can preserve its established collection path.
 *     tags: [Releases - Hygiene]
 *     parameters:
 *       - in: query
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *         description: Registered project profile whose Jira Hygiene capability is requested
 *     responses:
 *       200:
 *         description: One project's hygiene results, including a successful-empty state
 *       400:
 *         description: Invalid or missing project selection
 *       404:
 *         description: Unknown project
 *       503:
 *         description: Selected project's publication is invalid or unavailable
 */

/**
 * @openapi
 * /api/modules/releases/hygiene/project-hygiene/config:
 *   get:
 *     summary: Get the selected project's Jira hygiene configuration
 *     description: Read-only. Includes enabled rule scope, disabled-rule reasons, freshness, and collection status for one project.
 *     tags: [Releases - Hygiene]
 *     parameters:
 *       - in: query
 *         name: projectId
 *         required: true
 *         schema: { type: string }
 *         description: Registered project profile whose Jira Hygiene capability is requested
 *     responses:
 *       200:
 *         description: One selected project's resolved rule configuration
 *       400:
 *         description: Invalid or missing project selection
 *       404:
 *         description: Unknown project
 *       503:
 *         description: Selected project's publication is invalid or unavailable
 */

module.exports = function registerHygieneRoutes(router, context) {
  const { storage, requireAuth, requirePlanningManager, requireScope, registerDiagnostics } = context;
  const projects = context.projects || null;

  function selectedProject(req, res) {
    const selection = resolveReleaseProject(projects, req.query);
    if (sendProjectScopeError(res, selection)) return null;
    return selection;
  }

  function selectedHygieneProject(req, res) {
    if (!req.query || !Object.prototype.hasOwnProperty.call(req.query, 'projectId')) {
      res.status(400).json({
        projectId: null,
        state: 'unavailable',
        reason: 'project-selection-required',
        error: 'projectId query parameter is required'
      });
      return null;
    }
    return selectedProject(req, res);
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

  function projectHygieneUnavailable(selection, message, reason, extra = {}) {
    const resolvedMessage = projectMessage(selection, message);
    return {
      projectId: selection.projectId,
      state: 'unavailable',
      reason,
      capability: 'jira-hygiene',
      freshness: 'unknown',
      fetchedAt: null,
      message: resolvedMessage,
      error: extra.error || resolvedMessage,
      ...extra
    };
  }

  function readProjectHygieneStatus(selection, artifactKey) {
    if (!projects || typeof projects.resolve !== 'function') return null;
    const resolved = projects.resolve(selection.projectId);
    if (!resolved) return null;
    const key = `projects/${selection.projectId}/_publication/${encodeURIComponent(artifactKey)}.status.json`;
    return storage.readFromStorage(key) || null;
  }

  function validateProjectHygieneEnvelope(selection, capability, envelope) {
    const profile = selection.profile;
    const profileRevision = profile && profile.profileRevision;
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
      throw new Error('Published Jira Hygiene envelope must be an object');
    }
    if (!profileRevision || profileRevision === 'unversioned'
        || envelope.projectId !== selection.projectId
        || envelope.profileRevision !== profileRevision
        || envelope.artifactKey !== capability.artifactKey) {
      throw new Error('Published Jira Hygiene identity or profile revision does not match the selected project');
    }
    if (!['supported', 'empty'].includes(envelope.state)
        || !['fresh', 'stale'].includes(envelope.freshness)
        || typeof envelope.partial !== 'boolean'
        || !envelope.source || envelope.source.id !== capability.sourceId
        || envelope.source.kind !== 'jira'
        || !envelope.source.revision || !envelope.data || typeof envelope.data !== 'object') {
      throw new Error('Published Jira Hygiene envelope metadata is invalid');
    }

    const data = envelope.data;
    const configuration = data.configuration;
    const projectKey = profile.jiraProjectKey || profile.jira?.projectKey;
    if (!configuration || typeof configuration !== 'object'
        || data.projectId !== selection.projectId
        || data.profileRevision !== profileRevision
        || data.artifactKey !== capability.artifactKey
        || data.projectKey !== projectKey
        || configuration.projectId !== selection.projectId
        || configuration.profileRevision !== profileRevision
        || configuration.projectKey !== projectKey
        || configuration.configRevision !== envelope.source.revision
        || data.configRevision !== configuration.configRevision
        || !Array.isArray(configuration.enabledRuleIds)
        || !Array.isArray(configuration.rules)
        || !Array.isArray(data.rules)
        || !Array.isArray(data.errors)
        || !Array.isArray(data.configuredRuleIds)
        || !Array.isArray(data.evaluatedRuleIds)
        || !Array.isArray(data.successfulRuleIds)
        || !data.summary || typeof data.summary !== 'object'
        || data.partial !== envelope.partial) {
      throw new Error('Published Jira Hygiene configuration and result do not match');
    }

    const enabledIds = configuration.enabledRuleIds;
    const configRuleIds = configuration.rules.map(rule => rule && rule.id);
    const resultIds = data.rules.map(rule => rule && rule.id);
    if (new Set(enabledIds).size !== enabledIds.length
        || new Set(configRuleIds).size !== configRuleIds.length
        || enabledIds.some(id => !configRuleIds.includes(id))
        || JSON.stringify(enabledIds) !== JSON.stringify(data.configuredRuleIds)
        || JSON.stringify(enabledIds) !== JSON.stringify(data.evaluatedRuleIds)
        || JSON.stringify(enabledIds) !== JSON.stringify(resultIds)
        || data.successfulRuleIds.some(id => !enabledIds.includes(id))) {
      throw new Error('Published Jira Hygiene rule scope does not match its results');
    }
    for (const rule of configuration.rules) {
      if (!rule || typeof rule.id !== 'string') throw new Error('Published Jira Hygiene rule catalog entry is invalid');
      if (enabledIds.includes(rule.id)) {
        if (rule.enabled !== true) throw new Error(`Configured Jira Hygiene rule ${rule.id} is not enabled`);
      } else if (rule.enabled !== false || typeof rule.disabledReason !== 'string' || !rule.disabledReason.trim()) {
        throw new Error(`Disabled Jira Hygiene rule ${rule.id} is missing its policy reason`);
      }
    }

    for (const resultRule of data.rules) {
      if (!resultRule || !Number.isInteger(resultRule.count) || !Array.isArray(resultRule.issues)
          || resultRule.count < -1
          || (resultRule.count === -1 && resultRule.issues.length !== 0)
          || (resultRule.count >= 0 && resultRule.count !== resultRule.issues.length)) {
        throw new Error('Published Jira Hygiene rule result is invalid');
      }
      for (const issue of resultRule.issues) {
        if (!issue || typeof issue.key !== 'string' || !issue.key.startsWith(`${projectKey}-`)) {
          throw new Error('Published Jira Hygiene result contains an issue from another Jira project');
        }
      }
    }
    const failedRuleIds = data.rules.filter(rule => rule.count === -1).map(rule => rule.id);
    const successfulRuleIds = data.rules.filter(rule => rule.count >= 0).map(rule => rule.id);
    const uniqueIssueKeys = new Set(data.rules.flatMap(rule => rule.count < 0 ? [] : rule.issues.map(issue => issue.key)));
    const totalRuleMatches = data.rules.reduce((total, rule) => total + (rule.count < 0 ? 0 : rule.count), 0);
    if (!envelope.generatedAt || data.generatedAt !== envelope.generatedAt
        || data.summary.generatedAt !== envelope.generatedAt
        || !Number.isInteger(data.summary.uniqueIssueCount)
        || !Number.isInteger(data.summary.totalRuleMatches)
        || !Number.isInteger(data.summary.affectedRuleCount)
        || !Number.isInteger(data.summary.failedRuleCount)
        || data.summary.failedRuleCount !== failedRuleIds.length
        || data.summary.affectedRuleCount !== data.rules.filter(rule => rule.count > 0).length
        || data.summary.uniqueIssueCount !== uniqueIssueKeys.size
        || data.summary.totalRuleMatches !== totalRuleMatches
        || JSON.stringify(data.successfulRuleIds) !== JSON.stringify(successfulRuleIds)
        || JSON.stringify(data.errors.map(error => error && error.ruleId)) !== JSON.stringify(failedRuleIds)
        || (envelope.state === 'empty'
          && (envelope.partial || failedRuleIds.length > 0 || data.summary.totalRuleMatches !== 0))) {
      throw new Error('Published Jira Hygiene generation or summary metadata is inconsistent');
    }
    return data;
  }

  function readLegacyOsacHygiene(selection, capability, status) {
    const migration = capability && capability.legacyMigration;
    const profile = selection.profile;
    const projectKey = profile && (profile.jiraProjectKey || profile.jira?.projectKey);
    if (!migration || selection.projectId !== 'osac' || migration.projectId !== 'osac'
        || projectKey !== 'OSAC' || migration.projectKey !== 'OSAC'
        || !migration.resultsArtifactKey || !migration.configArtifactKey) return null;

    let resultsContract;
    let configContract;
    try {
      resultsContract = storage.readFromStorage(migration.resultsArtifactKey);
      configContract = storage.readFromStorage(migration.configArtifactKey);
    } catch (error) {
      throw new Error(`Legacy OSAC Jira Hygiene artifacts could not be read: ${error.message}`, { cause: error });
    }
    const project = resultsContract && resultsContract.results && resultsContract.results.OSAC;
    const sourceConfig = configContract && configContract.projects && configContract.projects.OSAC;
    if (!project || !sourceConfig || !Array.isArray(project.rules) || !Array.isArray(sourceConfig.rules)) return null;
    if (resultsContract.configVersion && configContract.configVersion
        && resultsContract.configVersion !== configContract.configVersion) {
      throw new Error('Legacy OSAC Jira Hygiene configuration and results do not match');
    }
    const configuredIds = sourceConfig.rules.map(rule => rule.id);
    const resultIds = project.rules.map(rule => rule.id);
    if (JSON.stringify(configuredIds) !== JSON.stringify(resultIds)) {
      throw new Error('Legacy OSAC Jira Hygiene rule scope does not match its results');
    }
    if (new Set(configuredIds).size !== configuredIds.length
        || project.rules.some(rule => (rule.issues || []).some(issue => !issue.key || !issue.key.startsWith('OSAC-')))) {
      throw new Error('Legacy OSAC Jira Hygiene artifacts contain an invalid rule or foreign issue');
    }

    const configuration = {
      ...sourceConfig,
      projectId: 'osac',
      profileRevision: profile.profileRevision,
      projectKey: 'OSAC',
      enabledRuleIds: configuredIds,
      configRevision: configContract.configVersion || resultsContract.configVersion || 'legacy-osac-hygiene',
      rules: sourceConfig.rules.map(rule => ({ ...rule, enabled: true, disabledReason: null }))
    };
    const dataProject = {
      ...project,
      projectId: 'osac',
      profileRevision: profile.profileRevision,
      artifactKey: capability.artifactKey,
      configuration,
      configRevision: configuration.configRevision,
      configuredRuleIds: configuredIds,
      evaluatedRuleIds: configuredIds,
      successfulRuleIds: project.rules.filter(rule => Number.isInteger(rule.count) && rule.count >= 0).map(rule => rule.id),
      generatedAt: project.summary?.generatedAt || resultsContract.generatedAt || null
    };
    const collectionFailure = status && status.state === 'error' ? status.error || null : null;
    const hasFailedRule = project.rules.some(rule => Number.isInteger(rule.count) && rule.count < 0);
    const partial = Boolean(project.partial || collectionFailure || hasFailedRule);
    return {
      schemaVersion: resultsContract.schemaVersion || 1,
      projectId: 'osac',
      profileRevision: profile.profileRevision,
      artifactKey: capability.artifactKey,
      generatedAt: dataProject.generatedAt,
      fetchedAt: resultsContract.generatedAt || null,
      source: resultsContract.source || 'legacy-osac-hygiene',
      freshness: collectionFailure ? 'stale' : 'unknown',
      state: !partial && project.summary?.totalRuleMatches === 0 ? 'empty' : 'supported',
      partial,
      collectionFailure,
      legacyMigration: true,
      results: { OSAC: dataProject },
      configuration
    };
  }

  function readSelectedProjectHygiene(selection) {
    const profile = selection.profile;
    const capability = profile && profile.capabilities && profile.capabilities.jiraHygiene;
    if (!capability) {
      return { contract: projectHygieneUnavailable(selection, 'Jira Hygiene is not configured for {project}.', 'capability-not-configured') };
    }
    if (capability.state === 'inapplicable') {
      return { contract: { ...projectHygieneUnavailable(selection, capability.reason || 'Jira Hygiene is not applicable to {project}.', 'inapplicable'), state: 'inapplicable' } };
    }
    if (capability.state !== 'supported' || typeof capability.artifactKey !== 'string' || typeof capability.sourceId !== 'string') {
      return { contract: projectHygieneUnavailable(selection, 'Jira Hygiene publication is unavailable for {project}.', 'capability-invalid'), status: 503 };
    }
    if (!projects || typeof projects.readArtifact !== 'function') {
      return { contract: projectHygieneUnavailable(selection, 'Project-qualified Jira Hygiene storage is unavailable for {project}.', 'project-storage-unavailable'), status: 503 };
    }

    let artifact;
    let status;
    try {
      artifact = projects.readArtifact(selection.projectId, capability.artifactKey);
      status = readProjectHygieneStatus(selection, capability.artifactKey);
    } catch (error) {
      return {
        contract: projectHygieneUnavailable(selection, 'Published Jira Hygiene data is invalid or temporarily unavailable for {project}.', 'publication-unavailable', { error: error.message }),
        status: 503
      };
    }
    const statusMatches = status && status.projectId === selection.projectId
      && status.profileRevision === profile.profileRevision
      && status.artifactKey === capability.artifactKey
      && status.state === 'error';

    if (!artifact || artifact.value === null || artifact.value === undefined) {
      try {
        const legacy = readLegacyOsacHygiene(selection, capability, statusMatches ? status : null);
        if (legacy) return { contract: legacy };
      } catch (error) {
        return { contract: projectHygieneUnavailable(selection, 'Legacy OSAC Jira Hygiene data is invalid for {project}.', 'invalid-legacy-publication', { error: error.message }), status: 503 };
      }
      if (statusMatches) {
        return {
          contract: projectHygieneUnavailable(selection, 'The latest Jira Hygiene collection failed for {project}; no result snapshot for the current profile is available.', 'collection-failed', {
          collectionFailure: status.error || null,
          attemptedAt: status.generatedAt || status.attemptedAt || null,
          error: status.error && status.error.message,
          lastKnownGood: status.lastKnownGood || null
          }),
          status: 503
        };
      }
      return { contract: projectHygieneUnavailable(selection, 'Jira Hygiene results have not been collected for {project}.', 'not-collected') };
    }

    let data;
    try {
      data = validateProjectHygieneEnvelope(selection, capability, artifact.value);
    } catch (error) {
      return { contract: projectHygieneUnavailable(selection, 'Published Jira Hygiene data is invalid for {project}.', 'invalid-publication', { error: error.message }), status: 503 };
    }
    const collectionFailure = statusMatches ? status.error || null : null;
    const result = {
      ...data,
      partial: data.partial || Boolean(collectionFailure),
      collectionFailure
    };
    return {
      contract: {
        schemaVersion: artifact.value.schemaVersion,
        projectId: selection.projectId,
        profileRevision: artifact.value.profileRevision,
        artifactKey: capability.artifactKey,
        generatedAt: artifact.value.generatedAt,
        fetchedAt: artifact.value.fetchedAt || null,
        observedAt: artifact.value.observedAt || null,
        attemptedAt: statusMatches ? status.generatedAt || status.attemptedAt || null : artifact.value.attemptedAt || null,
        source: artifact.value.source,
        freshness: collectionFailure ? 'stale' : artifact.value.freshness,
        state: artifact.value.state,
        partial: result.partial,
        collectionFailure,
        results: { [result.projectKey]: result },
        configuration: result.configuration
      }
    };
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

  // GET /project-hygiene — selected-project Jira hygiene results (read-only, data-side owned)
  router.get('/project-hygiene', requireAuth, requireScope('releases:read'), function(req, res) {
    const selection = selectedHygieneProject(req, res);
    if (!selection) return;
    const selected = readSelectedProjectHygiene(selection);
    const contract = selected.contract;
    // The Execute Hygiene tab keeps the established release feature board
    // when the selected profile declares the legacy migration contract.
    if (selection.profile?.capabilities?.jiraHygiene?.legacyMigration && contract && typeof contract === 'object') {
      contract.legacyMigration = true;
    }
    return res.status(selected.status || 200).json(contract);
  });

  // GET /project-hygiene/config — selected-project Jira hygiene rules (read-only, data-side owned)
  router.get('/project-hygiene/config', requireAuth, requireScope('releases:read'), function(req, res) {
    const selection = selectedHygieneProject(req, res);
    if (!selection) return;
    const selected = readSelectedProjectHygiene(selection);
    const contract = selected.contract;
    const configuration = contract && contract.configuration;
    const projectsByKey = configuration && configuration.projectKey
      ? { [configuration.projectKey]: configuration }
      : {};
    return res.status(selected.status || 200).json({ ...contract, projects: projectsByKey });
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

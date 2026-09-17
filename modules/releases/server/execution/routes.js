/**
 * Execution domain routes for the releases module.
 *
 * Migrated from modules/feature-traffic/server/index.js.
 * Storage paths migrated to releases/execution/ (Phase 5).
 */

const express = require('express');
const scheduler = require('./scheduler');
const {
  getToken,
  getTokenSource,
  loadConfig,
  manualRefresh,
  onConfigSave,
  setOnCadenceChange
} = scheduler;
const { logAudit } = require('../planning/audit-log');
const { mergeAiReview } = require('./ai-review-merge');
const { writeFeatures } = require('./feature-store');
const { getInvalidPullRequestUrlFields } = require('../../../../shared/server/feature-links');

const DATA_PREFIX = 'releases/execution';
const jsonLimit = express.json({ limit: '10mb' });

function stripZStream(value) {
  if (!value) return value
  return String(value).replace(/\.z\b/gi, '')
}

function matchesVersion(feature, normalizedFilter) {
  return !!(feature.fixVersions && feature.fixVersions.some(v => stripZStream(v) === normalizedFilter));
}

// An Epic can carry its own Fix Version independent of its parent Feature's (a Feature
// scopes the overall release; its Epics may be spread across that release's milestones).
// Only a directly-versioned Epic (never one merely displaying an inherited value) qualifies
// a Feature as context under a milestone its own Fix Version doesn't match.
function isDirectEpic(epic) {
  return epic.fixVersionSource === 'direct';
}

function epicDirectlyMatchesVersion(epic, normalizedFilter) {
  return isDirectEpic(epic) &&
    !!(epic.fixVersions && epic.fixVersions.some(v => stripZStream(v) === normalizedFilter));
}

/**
 * @openapi
 * /api/modules/releases/execution/features:
 *   get:
 *     summary: List all features with summary metrics
 *     tags: [Releases - Execution]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: version
 *         schema: { type: string }
 *       - in: query
 *         name: health
 *         schema: { type: string }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string }
 *       - in: query
 *         name: sortDir
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Feature list
 */

/**
 * @openapi
 * /api/modules/releases/execution/features/{key}:
 *   get:
 *     summary: Full feature detail
 *     tags: [Releases - Execution]
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Feature detail
 *       400:
 *         description: Invalid key format
 *       404:
 *         description: Feature not found
 */

/**
 * @openapi
 * /api/modules/releases/execution/status:
 *   get:
 *     summary: Data freshness and sync info
 *     tags: [Releases - Execution]
 *     responses:
 *       200:
 *         description: Status info
 */

/**
 * @openapi
 * /api/modules/releases/execution/versions:
 *   get:
 *     summary: List unique fix versions. By default, only Feature-level versions (what
 *       GET /features?version= can actually filter on). Pass scope=epics to also include
 *       versions that appear only on a directly-versioned Epic — used by Epics by Release,
 *       whose tree can surface a Feature as context via such an Epic (see GET /epics).
 *     tags: [Releases - Execution]
 *     parameters:
 *       - in: query
 *         name: scope
 *         schema: { type: string, enum: [epics] }
 *         description: Pass "epics" to union in directly-versioned-Epic-only versions.
 *     responses:
 *       200:
 *         description: Version list
 */

/**
 * @openapi
 * /api/modules/releases/execution/epics:
 *   get:
 *     summary: Feature → Epics tree for a release. Includes Features whose own Fix Version
 *       matches (full epics array), plus non-matching "context" Features that are surfaced
 *       solely because they have a directly-versioned Epic matching the given version (only
 *       that Epic is included for those, and the Feature's true Fix Version is preserved,
 *       never relabeled). Each returned feature carries isContext to distinguish the two.
 *     tags: [Releases - Execution]
 *     parameters:
 *       - in: query
 *         name: version
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Features matching the release or included as context, each with its
 *           applicable epics array, its own Jira Components (array, may be empty), and its
 *           Jira Team (string name, or null when unset — Epics carry no Team of their own).
 *           featureCount is the total number of features returned, including context features.
 *       400:
 *         description: Missing version query parameter
 */

/**
 * @openapi
 * /api/modules/releases/execution/refresh:
 *   post:
 *     summary: Trigger manual data refresh (admin only)
 *     tags: [Releases - Execution]
 *     responses:
 *       200:
 *         description: Refresh result
 *       429:
 *         description: Cooldown active
 */

/**
 * @openapi
 * /api/modules/releases/execution/config:
 *   get:
 *     summary: Get current fetch configuration (admin only)
 *     tags: [Releases - Execution]
 *     responses:
 *       200:
 *         description: Config data
 *   post:
 *     summary: Save fetch configuration (admin only)
 *     tags: [Releases - Execution]
 *     responses:
 *       200:
 *         description: Save result
 */

/**
 * @openapi
 * /api/modules/releases/execution/features/{key}/refresh:
 *   post:
 *     summary: On-demand single-feature refresh from Jira
 *     tags: [Releases - Execution]
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Refreshed feature
 *       400:
 *         description: Invalid key format
 *       404:
 *         description: Feature not found
 *       429:
 *         description: Per-key cooldown active
 */

module.exports = function registerExecutionRoutes(router, context) {
  // Initialize scheduler with secrets and jira client
  const jira = context.jira || null;
  if (context.secrets) scheduler.init(context.secrets, jira);

  const { storage, requireAuth, requireScope } = context;

  function readDataFile(relativePath) {
    return storage.readFromStorage(`${DATA_PREFIX}/${relativePath}`);
  }

  // GET /features — list all features with summary metrics
  router.get('/features', requireAuth, requireScope('releases:read'), function(req, res) {
    const index = readDataFile('index.json');
    if (!index || !index.features) {
      return res.json({
        fetchedAt: null,
        featureCount: 0,
        features: [],
        message: 'No data available. Configure GitLab CI integration in Settings to fetch feature traffic data.'
      });
    }

    // Optional filters
    let features = index.features;

    const statusFilter = req.query.status;
    if (statusFilter) {
      const statuses = statusFilter.split(',');
      features = features.filter(f => statuses.includes(f.status));
    }

    const versionFilter = req.query.version;
    if (versionFilter) {
      const normalizedFilter = stripZStream(versionFilter);
      features = features.filter(f => matchesVersion(f, normalizedFilter));
    }

    const healthFilter = req.query.health;
    if (healthFilter) {
      const healths = healthFilter.split(',');
      features = features.filter(f => healths.includes(f.health));
    }

    // Sort
    const SORTABLE_FIELDS = ['key', 'summary', 'status', 'health', 'completionPct', 'epicCount', 'issueCount', 'blockerCount'];
    const sortBy = SORTABLE_FIELDS.includes(req.query.sortBy) ? req.query.sortBy : 'key';
    const sortDir = req.query.sortDir === 'desc' ? -1 : 1;
    features.sort(function(a, b) {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return (aVal - bVal) * sortDir;
      }
      return String(aVal || '').localeCompare(String(bVal || '')) * sortDir;
    });

    res.json({
      fetchedAt: index.fetchedAt,
      featureCount: features.length,
      features
    });
  });

  // GET /features/:key — full feature detail
  router.get('/features/:key', requireAuth, requireScope('releases:read'), function(req, res) {
    const key = req.params.key.toUpperCase();

    // Validate key format (RHAISTRAT in production, TEST* in demo mode)
    if (!/^[A-Z][A-Z0-9]+-\d+$/.test(key)) {
      return res.status(400).json({ error: 'Invalid feature key format' });
    }

    const feature = readDataFile(`features/${key}.json`);
    if (!feature) {
      return res.status(404).json({ error: `Feature ${key} not found` });
    }

    res.json(feature);
  });

  // POST /features/:key/refresh — on-demand single-feature refresh from Jira
  const perKeyLastRefresh = new Map();
  const PER_KEY_COOLDOWN_MS = 60 * 1000;

  router.post('/features/:key/refresh', requireAuth, requireScope('releases:read'), async function(req, res) {
    const key = req.params.key.toUpperCase();

    if (!/^[A-Z][A-Z0-9]+-\d+$/.test(key)) {
      return res.status(400).json({ error: 'Invalid feature key format' });
    }

    const existing = readDataFile(`features/${key}.json`);
    if (!existing) {
      return res.status(404).json({ error: `Feature ${key} not found` });
    }

    // Per-key cooldown
    const lastRefresh = perKeyLastRefresh.get(key) || 0;
    const elapsed = Date.now() - lastRefresh;
    if (lastRefresh > 0 && elapsed < PER_KEY_COOLDOWN_MS) {
      const retryAfter = Math.ceil((PER_KEY_COOLDOWN_MS - elapsed) / 1000);
      return res.status(429).json({ status: 'cooldown', retryAfter });
    }

    if (!jira) {
      return res.status(503).json({ error: 'Jira client not configured' });
    }

    try {
      const { enrichFeatures } = require('./jira-enrich');
      const { mergeFeatureData, writeFeatures } = require('./feature-store');

      const enrichmentMap = await enrichFeatures([key], jira.jiraRequest, jira.fetchAllJqlResults);
      const jiraData = enrichmentMap.get(key) || null;
      const merged = mergeFeatureData(existing, null, jiraData);

      await writeFeatures(storage, [merged]);
      perKeyLastRefresh.set(key, Date.now());

      res.json(merged);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /status — data freshness and sync info
  router.get('/status', requireAuth, requireScope('releases:read'), function(req, res) {
    const index = readDataFile('index.json');
    const lastFetch = readDataFile('last-fetch.json');
    const config = loadConfig(storage);
    const token = getToken();

    const result = {
      dataAvailable: !!index,
      fetchedAt: index?.fetchedAt || null,
      schemaVersion: index?.schemaVersion || null,
      featureCount: index?.featureCount || 0,
      dataSource: config.projectPath
        ? `gitlab-ci (${config.projectPath})`
        : 'gitlab-ci',
      configured: config.enabled && !!token,
      tokenSource: getTokenSource()
    };

    if (lastFetch) {
      result.lastFetch = lastFetch;
    }

    // Staleness warning: data >48h old
    if (lastFetch?.timestamp) {
      const ageMs = Date.now() - new Date(lastFetch.timestamp).getTime();
      const ageHours = ageMs / (1000 * 60 * 60);
      if (ageHours > 48) {
        result.staleWarning = true;
        const ageDays = Math.floor(ageHours / 24);
        result.dataAge = ageDays === 1 ? '1 day' : `${ageDays} days`;
      }
    }

    // Next scheduled fetch estimate
    if (config.enabled && token && config.refreshIntervalHours > 0) {
      const lastTs = lastFetch?.timestamp ? new Date(lastFetch.timestamp).getTime() : Date.now();
      const nextFetch = new Date(lastTs + config.refreshIntervalHours * 60 * 60 * 1000);
      result.nextScheduledFetch = nextFetch.toISOString();
    }

    // Jira enrichment status
    const jiraEnrichConfig = config.jiraEnrichment || {};
    const lastEnrichment = readDataFile('last-enrichment.json');
    result.jiraEnrichment = {
      enabled: jiraEnrichConfig.enabled !== false,
      jiraConfigured: !!jira,
      lastSync: lastEnrichment || null
    };
    // Warn if Jira enrichment hasn't run in >24h (2x the default 6h cadence)
    if (result.jiraEnrichment.enabled && jira) {
      const enrichTs = lastEnrichment?.timestamp ? new Date(lastEnrichment.timestamp).getTime() : 0;
      const enrichAgeMs = enrichTs ? Date.now() - enrichTs : Infinity;
      const enrichAgeHours = enrichAgeMs / (1000 * 60 * 60);
      if (enrichAgeHours > 24) {
        result.jiraEnrichment.stale = true;
        if (enrichTs === 0) {
          result.jiraEnrichment.warning = 'Jira enrichment has never run';
        } else {
          const ageDays = Math.floor(enrichAgeHours / 24);
          result.jiraEnrichment.warning = 'Last Jira sync was ' + (ageDays === 1 ? '1 day' : ageDays + ' days') + ' ago';
        }
      }
    } else if (!jira) {
      result.jiraEnrichment.warning = 'Jira client not configured — enrichment cannot run';
    }

    res.json(result);
  });

  // GET /versions — by default, unique fix versions across Feature-level data only
  // (what GET /features?version= can actually filter on). With scope=epics, also
  // includes any version that only appears on a directly-versioned Epic (a Feature
  // scopes the overall release; its Epics may be spread across that release's
  // milestones — see /epics), for consumers like Epics by Release that understand
  // Epic-level context membership.
  router.get('/versions', requireAuth, requireScope('releases:read'), function(req, res) {
    const index = readDataFile('index.json');
    if (!index || !index.features) {
      return res.json({ versions: [] });
    }

    const includeEpicVersions = req.query.scope === 'epics';

    const versions = new Set();
    for (const f of index.features) {
      for (const v of (f.fixVersions || [])) {
        versions.add(stripZStream(v));
      }
      if (!includeEpicVersions) continue;
      const detail = readDataFile(`features/${f.key}.json`);
      for (const e of ((detail && detail.epics) || [])) {
        if (isDirectEpic(e)) {
          for (const v of (e.fixVersions || [])) {
            versions.add(stripZStream(v));
          }
        }
      }
    }

    res.json({ versions: [...versions].sort() });
  });

  // GET /epics — Release → Feature → Epics tree.
  // Primary membership is by Feature Fix Version: every epic under a matching Feature is
  // included, even one whose own fixVersions names a different version (rendered as-is,
  // not hidden or recategorized). Secondarily, a Feature whose own Fix Version does not
  // match is still surfaced as context when it has a directly-versioned Epic assigned to
  // the selected version — its true Fix Version is preserved (never relabeled), and only
  // the directly-matching Epic(s) are shown under it, not its full Epic list.
  router.get('/epics', requireAuth, requireScope('releases:read'), function(req, res) {
    const version = req.query.version;
    if (!version) {
      return res.status(400).json({ error: 'version query parameter is required' });
    }

    const index = readDataFile('index.json');
    if (!index || !index.features) {
      return res.json({ version, fetchedAt: null, featureCount: 0, features: [] });
    }

    const normalizedFilter = stripZStream(version);
    const matching = index.features.filter(f => matchesVersion(f, normalizedFilter));
    const matchedKeys = new Set(matching.map(f => f.key));

    const features = matching.map(function(entry) {
      const detail = readDataFile(`features/${entry.key}.json`);
      const epics = (detail && detail.epics) || [];
      return {
        key: entry.key,
        summary: entry.summary,
        status: entry.status,
        statusCategory: entry.statusCategory,
        fixVersions: entry.fixVersions || [],
        components: entry.components || [],
        team: entry.team || null,
        isContext: false,
        totalEpicCount: epics.length,
        epics
      };
    });

    index.features.forEach(function(entry) {
      if (matchedKeys.has(entry.key)) return;
      const detail = readDataFile(`features/${entry.key}.json`);
      const allEpics = (detail && detail.epics) || [];
      const directEpics = allEpics.filter(e => epicDirectlyMatchesVersion(e, normalizedFilter));
      if (directEpics.length === 0) return;
      features.push({
        key: entry.key,
        summary: entry.summary,
        status: entry.status,
        statusCategory: entry.statusCategory,
        fixVersions: entry.fixVersions || [],
        components: entry.components || [],
        team: entry.team || null,
        isContext: true,
        totalEpicCount: allEpics.length,
        epics: directEpics
      });
    });

    // featureCount is the total number of features returned above, including context
    // features surfaced solely via a directly-versioned child Epic — not just Features
    // whose own Fix Version matched. See isContext on each feature to distinguish them.
    res.json({
      version,
      fetchedAt: index.fetchedAt,
      featureCount: features.length,
      features
    });
  });

  // POST /refresh — trigger manual data refresh (admin only)
  router.post('/refresh', context.requireAdmin, requireScope('releases:write'), async function(req, res) {
    if (context.isRefreshRunning && context.isRefreshRunning()) {
      return res.status(409).json({ status: 'error', message: 'A global refresh is already in progress' });
    }
    try {
      const result = await manualRefresh(storage);
      if (result.httpStatus === 429) {
        return res.status(429).json({ status: result.status, retryAfter: result.retryAfter });
      }
      logAudit(storage.readFromStorage, storage.writeToStorage, {
        domain: 'execution',
        action: 'manual_refresh',
        user: req.userEmail || 'unknown',
        summary: 'Manual execution data refresh: ' + (result.status || 'unknown'),
        details: { status: result.status, fileCount: result.fileCount }
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // GET /config — get current fetch configuration (admin only)
  router.get('/config', context.requireAdmin, requireScope('releases:write'), function(req, res) {
    const config = loadConfig(storage);
    res.json({
      ...config,
      tokenConfigured: !!getToken(),
      tokenSource: getTokenSource()
    });
  });

  // POST /config — save fetch configuration (admin only)
  router.post('/config', context.requireAdmin, requireScope('releases:write'), async function(req, res) {
    try {
      const result = await onConfigSave(storage, req.body);
      logAudit(storage.readFromStorage, storage.writeToStorage, {
        domain: 'execution',
        action: 'config_save',
        user: req.userEmail || 'unknown',
        summary: 'Updated execution fetch configuration',
        details: { enabled: req.body.enabled, projectPath: req.body.projectPath }
      });
      res.json(result);
    } catch (err) {
      const status = err.message && (
        err.message.includes('must be') || err.message.includes('must start')
      ) ? 400 : 500;
      res.status(status).json({ status: 'error', message: err.message });
    }
  });

  // ─── AI Review internal API ───

  /**
   * @openapi
   * /api/modules/releases/execution/ai-review/bulk:
   *   post:
   *     summary: Bulk upsert AI review data into unified feature store
   *     tags: [Releases - Execution]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               features:
   *                 type: array
   *                 items:
   *                   type: object
   *                   properties:
   *                     key: { type: string }
   *                     aiReview: { type: object }
   *     responses:
   *       200:
   *         description: Upsert results with created/updated/unchanged counts
   */
  router.post('/ai-review/bulk', context.requireAdmin, requireScope('releases:write'), jsonLimit, async function(req, res) {
    const { features } = req.body;
    if (!Array.isArray(features)) {
      return res.status(400).json({ error: 'features must be an array' });
    }
    if (features.length > 5000) {
      return res.status(400).json({ error: 'Bulk payload exceeds maximum of 5000 entries' });
    }

    try {
      const counts = { created: 0, updated: 0, unchanged: 0, skipped: 0 };
      const toWrite = [];

      const KEY_RE = /^[A-Z][A-Z0-9]+-\d+$/;

      for (let i = 0; i < features.length; i++) {
        const entry = features[i];
        if (!entry || !entry.key || !entry.aiReview) {
          counts.skipped++;
          continue;
        }
        if (!KEY_RE.test(entry.key)) {
          counts.skipped++;
          continue;
        }

        const invalidLinkFields = getInvalidPullRequestUrlFields(entry.aiReview);
        if (invalidLinkFields.length > 0) {
          return res.status(400).json({
            error: `${invalidLinkFields.join(', ')} must be canonical HTTPS GitHub pull-request URLs`
          });
        }

        const existing = readDataFile('features/' + entry.key + '.json');
        const { aiReview, status } = mergeAiReview(
          existing ? existing.aiReview : null,
          entry.aiReview
        );

        counts[status]++;

        if (status !== 'unchanged') {
          const feature = existing || { key: entry.key, summary: entry.aiReview.title || '' };
          feature.aiReview = aiReview;
          feature._sources = feature._sources || {};
          feature._sources.aiReview = new Date().toISOString();
          toWrite.push(feature);
        }
      }

      if (toWrite.length > 0) {
        await writeFeatures(storage, toWrite);
      }

      res.json(counts);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * @openapi
   * /api/modules/releases/execution/ai-review:
   *   delete:
   *     summary: Remove AI review data from all features (async)
   *     tags: [Releases - Execution]
   *     responses:
   *       200:
   *         description: Deletion started
   */
  router.delete('/ai-review', context.requireAdmin, requireScope('releases:write'), function(req, res) {
    res.json({ status: 'started', message: 'AI review data removal started' });

    // Process in background
    (async function() {
      try {
        const fileNames = storage.listStorageFiles(DATA_PREFIX + '/features');
        if (!fileNames || fileNames.length === 0) return;

        const toWrite = [];
        for (let i = 0; i < fileNames.length; i++) {
          if (!fileNames[i].endsWith('.json')) continue;
          const feature = storage.readFromStorage(DATA_PREFIX + '/features/' + fileNames[i]);
          if (feature && feature.aiReview) {
            delete feature.aiReview;
            if (feature._sources) {
              delete feature._sources.aiReview;
            }
            toWrite.push(feature);
          }
        }

        if (toWrite.length > 0) {
          await writeFeatures(storage, toWrite);
        }
        console.log('[execution] Removed AI review data from ' + toWrite.length + ' features');
      } catch (err) {
        console.error('[execution] AI review data removal failed:', err.message);
      }
    })();
  });

  // Diagnostics
  if (context.registerDiagnostics) {
    context.registerDiagnostics(async function() {
      const index = readDataFile('index.json');
      const lastFetch = readDataFile('last-fetch.json');
      const lastEnrichment = readDataFile('last-enrichment.json');
      const config = loadConfig(storage);
      const jiraEnrichConfig = config.jiraEnrichment || {};
      return {
        dataAvailable: !!index,
        featureCount: index?.featureCount || 0,
        fetchedAt: index?.fetchedAt || null,
        schemaVersion: index?.schemaVersion || null,
        lastFetchStatus: lastFetch?.status || null,
        configured: config.enabled && !!getToken(),
        jiraEnrichment: {
          enabled: jiraEnrichConfig.enabled !== false,
          jiraConfigured: !!jira,
          lastSyncStatus: lastEnrichment?.status || null,
          lastSyncTimestamp: lastEnrichment?.timestamp || null,
          enrichedCount: lastEnrichment?.enrichedCount || 0
        }
      };
    });
  }

  // Handler config defined once — single source of truth
  const handlerConfig = {
    order: 70,
    timeout: 600000,
    description: 'Fetches execution pipeline data from GitLab CI artifacts for release tracking.',
    handler: async function(options) {
      options = options || {};
      if (options.skipCooldown) {
        const { runFetch } = require('./scheduler');
        return runFetch(storage);
      }
      return manualRefresh(storage);
    }
  };

  if (context.registerRefresh) {
    const initialConfig = loadConfig(storage);
    context.registerRefresh('execution', {
      ...handlerConfig,
      cadence: initialConfig.refreshIntervalHours + 'h'
    });

    // Wire config save to re-register with updated cadence
    setOnCadenceChange(function(newCadenceStr) {
      context.registerRefresh('execution', {
        ...handlerConfig,
        cadence: newCadenceStr
      });
    });

    // Register Jira enrichment periodic sync (Phase 3)
    if (jira) {
      const { syncAllFeatures, discoverFromJira, reconcileTrackingData } = require('./jira-sync');

      const enrichmentConfig = initialConfig.jiraEnrichment || {};
      const syncIntervalHours = enrichmentConfig.syncIntervalHours || 6;

      const enrichmentHandler = async function() {
        const config = loadConfig(storage);
        const jiraEnrichConfig = config.jiraEnrichment || {};
        // Default to enabled — Jira enrichment should run unless explicitly disabled
        if (jiraEnrichConfig.enabled === false) {
          return { status: 'skipped', message: 'Jira enrichment disabled in config (jiraEnrichment.enabled = false)' };
        }

        const result = await syncAllFeatures(storage, jira.jiraRequest, jira.fetchAllJqlResults);

        // Feature discovery (Phase 4)
        if (jiraEnrichConfig.discoveryEnabled) {
          try {
            const discovery = await discoverFromJira(
              storage, jira.jiraRequest, jira.fetchAllJqlResults, jiraEnrichConfig
            );
            result.discovery = discovery;
          } catch (err) {
            console.warn('[execution] Feature discovery failed:', err.message);
          }
        }

        // Tracking data reconciliation
        try {
          const reconciliation = await reconcileTrackingData(storage);
          result.reconciliation = reconciliation;
        } catch (err) {
          console.warn('[execution] Tracking reconciliation failed:', err.message);
        }

        return result;
      };

      context.registerRefresh('jira-enrichment', {
        order: 75,
        cadence: syncIntervalHours + 'h',
        timeout: 120000,
        description: 'Enriches execution data with Jira issue details, status transitions, and tracking reconciliation.',
        handler: enrichmentHandler
      });
    }
  }
};

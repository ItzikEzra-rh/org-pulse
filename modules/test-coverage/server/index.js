/**
 * Test Coverage module server.
 *
 * Serves the nightly OSAC coverage report (`overview` rows) and its compact
 * history snapshots. The reporter does the computation; this only reads and
 * reshapes what it published.
 */

const LATEST_KEY = 'coverage/latest.json';
const HISTORY_DIR = 'coverage/history';
const HISTORY_LIMIT = 8;
const VERDICTS = new Set(['ready', 'not ready', 'insufficient evidence']);
const KEY_PATTERN = /^[A-Za-z0-9._-]+$/;

function cell(value, detail, pending) {
  const state = (value && value.state) || 'unavailable';
  return {
    state,
    display: (value && value.display) || (state === 'none' ? 'no cases' : state),
    detail: (value && value.detail) || detail || '',
    pending: pending || 0
  };
}

function gaps(value) {
  const gap = value || {};
  return { critical: gap.critical || 0, high: gap.high || 0, total: gap.total || 0 };
}

/** Inferred mappings are drafted, unreviewed links; their tier comes from behaviors[]. */
function pendingByTier(feature) {
  const tiers = {};
  for (const behavior of feature.behaviors || []) tiers[behavior.id] = behavior.tier;
  const pending = { unit: 0, integration: 0, e2e: 0 };
  for (const mapping of feature.inferred || []) {
    if (tiers[mapping.behavior] in pending) pending[tiers[mapping.behavior]] += 1;
  }
  return pending;
}

function featureInfo(report) {
  const info = {};
  for (const feature of (report && report.features) || []) {
    const key = feature && feature.feature && feature.feature.key;
    if (key) info[key] = { metrics: feature.metrics || {}, pending: pendingByTier(feature) };
  }
  return info;
}

function normalizeOverview(report) {
  if (!report || !Array.isArray(report.overview)) return [];
  const info = featureInfo(report);
  const rows = [];
  for (const row of report.overview) {
    if (!row || typeof row.key !== 'string' || !KEY_PATTERN.test(row.key)) {
      console.warn('[test-coverage] Dropping overview row with invalid key:', row && row.key);
      continue;
    }
    const feature = info[row.key] || {};
    const metrics = feature.metrics || {};
    const pending = feature.pending || {};
    rows.push({
      key: row.key,
      name: row.area,
      group: row.group,
      verdict: VERDICTS.has(row.verdict) ? row.verdict : 'insufficient evidence',
      reason: typeof row.verdict_reason === 'string' ? row.verdict_reason : '',
      unit: cell(row.unit, metrics.unit && metrics.unit.detail, pending.unit),
      integration: cell(row.integration, metrics.integration && metrics.integration.detail, pending.integration),
      e2e: cell(row.e2e, metrics.e2e && metrics.e2e.detail, pending.e2e),
      gaps: gaps(row.gaps)
    });
  }
  return rows;
}

function readJson(storage, key) {
  try {
    return storage.readFromStorage(key);
  } catch {
    return null; // missing or invalid JSON: treat as unavailable
  }
}
function historyDates(storage) {
  let files;
  try {
    files = storage.listStorageFiles(HISTORY_DIR) || [];
  } catch {
    files = [];
  }
  return files
    .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort().reverse().slice(0, HISTORY_LIMIT)
    .map((file) => file.slice(0, 10));
}
function readHistory(storage) {
  const snapshots = [];
  for (const date of historyDates(storage)) {
    const snapshot = readJson(storage, `${HISTORY_DIR}/${date}.json`);
    const overview = normalizeOverview(snapshot);
    if (!overview.length) continue;
    snapshots.push({ date, commit: snapshot.commit || null, overview });
  }
  return snapshots;
}
/** Working groups from the report's `groups`, else the distinct overview groups. */
function extractGroups(report, overview) {
  const declared = (report && report.groups) || [];
  if (declared.length) {
    return declared
      .filter((group) => group && typeof group.key === 'string')
      .map((group) => ({ key: group.key, name: group.name || group.key }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }
  return [...new Set(overview.map((row) => row.group))].sort().map((key) => ({ key, name: key }));
}
function readLatest(storage) {
  const report = readJson(storage, LATEST_KEY);
  const overview = normalizeOverview(report);
  let lastRunAt = historyDates(storage)[0] || null;
  if (!lastRunAt && typeof storage.getFileMtime === 'function') {
    try {
      const mtime = storage.getFileMtime(LATEST_KEY);
      if (mtime) lastRunAt = new Date(mtime).toISOString();
    } catch {
      lastRunAt = null;
    }
  }

  return { available: overview.length > 0, commit: (report && report.commit) || null, lastRunAt, groups: extractGroups(report, overview), overview };
}

module.exports = function registerRoutes(router, context) {
  const { storage, requireScope } = context;
  const { resolveProjectSelection } = require('../../../shared/server/project-profile');

  context.registerScopes([
    { key: 'test-coverage:read', label: 'Test Coverage (Read)', description: 'Read OSAC coverage reports', category: 'Test Coverage' }
  ]);

  // The coverage reporter is an OSAC-only data source: a non-OSAC project never
  // receives OSAC coverage data.
  function osacOnlyDataGuard(req, res) {
    const selection = resolveProjectSelection(context.projects, req.query);
    if (!selection.provided) return false;
    if (selection.status) {
      res.status(selection.status).json({ error: selection.error });
      return true;
    }
    if (selection.projectId !== 'osac') {
      res.status(200).json({
        projectId: selection.projectId,
        state: 'unavailable',
        reason: 'osac-only-data-source',
        data: null
      });
      return true;
    }
    return false;
  }

  /**
   * @openapi
   * /api/modules/test-coverage/latest:
   *   get:
   *     tags: [Test Coverage]
   *     summary: Latest coverage report with per-area verdicts
   *     parameters:
   *       - in: query
   *         name: projectId
   *         required: false
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Latest report, or available=false when none exists
   */
  router.get('/latest', requireScope('test-coverage:read'), (req, res) => {
    if (osacOnlyDataGuard(req, res)) return;
    return res.json(readLatest(storage));
  });

  /**
   * @openapi
   * /api/modules/test-coverage/history:
   *   get:
   *     tags: [Test Coverage]
   *     summary: Recent nightly coverage snapshots, newest first
   *     parameters:
   *       - in: query
   *         name: projectId
   *         required: false
   *         schema: { type: string }
   *     responses:
   *       200: { description: Up to 8 snapshots sorted by date descending }
   */
  router.get('/history', requireScope('test-coverage:read'), (req, res) => {
    if (osacOnlyDataGuard(req, res)) return;
    return res.json({ snapshots: readHistory(storage) });
  });
};

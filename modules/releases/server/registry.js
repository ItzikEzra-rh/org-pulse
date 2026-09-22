/**
 * Unified Release Registry — CRUD + auto-discover.
 *
 * Canonical source of truth for release identity. Eliminates brittle
 * version-string matching across planning, execution, and delivery domains.
 *
 * Storage: releases/registry.json
 */

const { logAudit } = require('./planning/audit-log');
const { loadRegistryConfig, saveRegistryConfig } = require('./registry-config');

const REGISTRY_FILE = 'releases/registry.json';
const SCHEMA_VERSION = 1;

const VALID_STATES = ['active', 'archived'];

function stripZStream(value) {
  if (!value) return value;
  return String(value).replace(/\.z\b/gi, '');
}

/**
 * Read the registry from storage, returning a normalized object.
 */
function readRegistry(readFromStorage) {
  const data = readFromStorage(REGISTRY_FILE);
  if (data && Array.isArray(data.releases)) return data;
  return { schemaVersion: SCHEMA_VERSION, releases: [] };
}

/**
 * Read one published project registry through the data-backed profile reader.
 * An unknown or unavailable project never falls back to the legacy OSAC file.
 */
function readProjectRegistry(projects, projectId, artifactKey = 'releases/registry.json') {
  if (!projects || typeof projects.get !== 'function' || typeof projects.readArtifact !== 'function') {
    return { status: 503, error: 'Project publication reader is unavailable' };
  }

  let profile;
  try {
    profile = projects.get(projectId);
  } catch (error) {
    return { status: 400, error: error.message };
  }
  if (!profile) return { status: 404, error: 'Unknown project' };

  let artifact;
  try {
    artifact = projects.readArtifact(projectId, artifactKey);
  } catch (error) {
    return { status: 502, error: error.message };
  }
  if (!artifact) return { status: 404, error: 'Project registry is unavailable' };

  const envelope = artifact.value;
  if (envelope.schemaVersion !== undefined && envelope.schemaVersion !== 1) {
    return { status: 502, error: 'Unsupported project registry publication schema' };
  }
  if (envelope.projectId && envelope.projectId !== projectId) {
    return { status: 502, error: 'Project registry identity mismatch' };
  }
  const registry = envelope.data && Array.isArray(envelope.data.releases)
    ? envelope.data
    : envelope;
  if (!Array.isArray(registry.releases)) return { status: 502, error: 'Invalid project registry publication' };
  if (registry.projectId && registry.projectId !== projectId) {
    return { status: 502, error: 'Project registry payload identity mismatch' };
  }

  return {
    status: 200,
    registry: {
      ...registry,
      projectId,
      profileRevision: envelope.profileRevision || registry.profileRevision || profile.profileRevision,
      publication: {
        state: envelope.state || 'supported',
        freshness: envelope.freshness || 'unknown',
        partial: envelope.partial === true,
        error: envelope.error || null,
        generatedAt: envelope.generatedAt || null,
        fetchedAt: envelope.fetchedAt || null,
        publishedAt: envelope.publishedAt || null,
        source: envelope.source || null,
        lastKnownGood: envelope.lastKnownGood || null,
        generationId: artifact.generationId
      }
    }
  };
}

/**
 * Write the registry to storage.
 */
function writeRegistry(writeToStorage, registry) {
  writeToStorage(REGISTRY_FILE, registry);
}

/**
 * Validate a release object. Returns an error string or null if valid.
 */
function validateRelease(release) {
  if (!release) return 'Release object is required';
  if (!release.id || typeof release.id !== 'string') return 'id is required and must be a string';
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(release.id)) {
    return 'id must be lowercase alphanumeric with dots, hyphens, or underscores (must start with alphanumeric)';
  }
  if (!release.displayName || typeof release.displayName !== 'string') {
    return 'displayName is required and must be a string';
  }
  if (release.fixVersions && !Array.isArray(release.fixVersions)) {
    return 'fixVersions must be an array';
  }
  if (release.milestones && typeof release.milestones !== 'object') {
    return 'milestones must be an object';
  }
  if (release.state && !VALID_STATES.includes(release.state)) {
    return `state must be one of: ${VALID_STATES.join(', ')}`;
  }
  return null;
}

/**
 * Normalize a release object for storage.
 */
function normalizeRelease(input) {
  const now = new Date().toISOString();
  return {
    id: stripZStream(input.id.trim()).toLowerCase(),
    displayName: stripZStream(input.displayName.trim()),
    fixVersions: Array.isArray(input.fixVersions) ? input.fixVersions : [],
    productPagesShortname: input.productPagesShortname || null,
    productPagesVersion: input.productPagesVersion || null,
    milestones: input.milestones || {},
    state: input.state || 'active',
    source: input.source || 'manual',
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}

/**
 * Normalize a version name for fuzzy matching.
 * Lowercases, strips ".z" suffixes (Product Pages z-stream convention),
 * collapses separators (hyphens, dots) to spaces, and handles the
 * RHAISTRAT naming convention ("3.5 GA RHOAI RELEASE" → "rhoai 3 5").
 * @param {string} name
 * @returns {string}
 */
function normalizeVersionName(name) {
  var s = String(name).toLowerCase();
  // Strip ".z" suffix (but not ".z." — only terminal .z)
  s = s.replace(/\.z(?=$|\.)/g, '');
  // Collapse hyphens and dots to spaces
  s = s.replace(/[-._]+/g, ' ');
  // Collapse multiple spaces
  s = s.replace(/\s+/g, ' ');
  s = s.trim();
  // RHAISTRAT uses "3.5 GA RHOAI RELEASE" / "3.5 EA1 RHOAI RELEASE" format.
  // Rearrange to canonical "rhoai 3 5" / "rhoai 3 5 ea1" form.
  var rhaistrat = /^(\d+\s+\d+)\s+(ga|ea\d+)\s+(rhoai|rhaii|rhelai)\s+release$/.exec(s);
  if (rhaistrat) {
    s = rhaistrat[2] === 'ga'
      ? rhaistrat[3] + ' ' + rhaistrat[1]
      : rhaistrat[3] + ' ' + rhaistrat[1] + ' ' + rhaistrat[2];
  }
  return s;
}

/**
 * Match Jira project versions against registry releases.
 * @param {Array<{ name: string, id: string, project: string }>} jiraVersions
 * @param {Array<{ id: string, displayName: string, fixVersions: string[], state: string }>} registryReleases
 * @returns {{ matches: Array<{ releaseId: string, releaseName: string, currentFixVersions: string[], proposedFixVersions: string[], jiraMatches: Array<{ name: string, id: string, project: string }> }>, unmatched: Array<{ name: string, id: string, project: string }> }}
 */
function matchVersionsToReleases(jiraVersions, registryReleases) {
  // Build normalized lookup for active releases
  var releasesByNormalized = {};
  for (var ri = 0; ri < registryReleases.length; ri++) {
    var rel = registryReleases[ri];
    if (rel.state === 'archived') continue;

    // Normalize displayName and all existing fixVersions as candidate keys
    var keys = [normalizeVersionName(rel.displayName)];
    var fvs = rel.fixVersions || [];
    for (var fi = 0; fi < fvs.length; fi++) {
      var nfv = normalizeVersionName(fvs[fi]);
      if (keys.indexOf(nfv) === -1) keys.push(nfv);
    }

    for (var ki = 0; ki < keys.length; ki++) {
      if (!releasesByNormalized[keys[ki]]) {
        releasesByNormalized[keys[ki]] = rel;
      }
    }
  }

  // Match each Jira version
  var matchMap = {}; // releaseId -> { release, jiraMatches[], proposedVersionNames Set }
  var unmatched = [];

  for (var ji = 0; ji < jiraVersions.length; ji++) {
    var jv = jiraVersions[ji];
    var normalized = normalizeVersionName(jv.name);
    var release = releasesByNormalized[normalized];

    if (release) {
      if (!matchMap[release.id]) {
        matchMap[release.id] = {
          release: release,
          jiraMatches: [],
          proposedNames: {}
        };
      }
      matchMap[release.id].jiraMatches.push({
        name: jv.name,
        id: jv.id,
        project: jv.project
      });
      matchMap[release.id].proposedNames[jv.name] = true;
    } else {
      unmatched.push({ name: jv.name, id: jv.id, project: jv.project });
    }
  }

  // Build matches array
  var matches = [];
  var matchIds = Object.keys(matchMap);
  for (var mi = 0; mi < matchIds.length; mi++) {
    var entry = matchMap[matchIds[mi]];
    var currentFvs = entry.release.fixVersions || [];
    // Proposed = current + any new Jira version names not already present
    var proposed = currentFvs.slice();
    var proposedNames = Object.keys(entry.proposedNames);
    for (var pi = 0; pi < proposedNames.length; pi++) {
      if (proposed.indexOf(proposedNames[pi]) === -1) {
        proposed.push(proposedNames[pi]);
      }
    }

    matches.push({
      releaseId: entry.release.id,
      releaseName: entry.release.displayName,
      currentFixVersions: currentFvs,
      proposedFixVersions: proposed,
      jiraMatches: entry.jiraMatches
    });
  }

  return { matches: matches, unmatched: unmatched };
}

/**
 * Migrate registry entries with stale .z-suffixed IDs to their normalized form.
 * Merges fixVersions when both old (.z) and new (clean) entries exist for the
 * same logical release. Idempotent — safe to run on every sync.
 *
 * Background: Product Pages used to include ".z" in release numbers (e.g.
 * "rhoai-3.5.z"). stripZStream normalises these to "rhoai-3.5", but the
 * registry lookup used raw IDs, so sync created duplicate entries — the old
 * one (with fixVersions) got archived, the new one was born empty.
 *
 * @param {object} registry - Registry object (mutated in place)
 * @returns {number} Number of entries merged or renamed
 */
function migrateNormalizedIds(registry) {
  // Group entries by their normalized (stripped) ID
  const groups = {};
  for (const r of registry.releases) {
    const normId = stripZStream(r.id).toLowerCase();
    if (!groups[normId]) groups[normId] = [];
    groups[normId].push(r);
  }

  let migrated = 0;
  const toRemove = new Set();

  for (const [normId, entries] of Object.entries(groups)) {
    if (entries.length === 1) {
      // Single entry — just normalise its ID if needed
      if (entries[0].id !== normId) {
        entries[0].id = normId;
        entries[0].updatedAt = new Date().toISOString();
        migrated++;
      }
      continue;
    }

    // Multiple entries share the same normalised ID — merge into one.
    // Prefer the active entry; if multiple active, prefer the one with the
    // clean (non-.z) ID; if still tied, prefer the one with more fixVersions.
    entries.sort(function (a, b) {
      // active before archived
      if (a.state !== b.state) return a.state === 'active' ? -1 : 1;
      // clean ID before .z ID
      var aClean = stripZStream(a.id).toLowerCase() === a.id ? 1 : 0;
      var bClean = stripZStream(b.id).toLowerCase() === b.id ? 1 : 0;
      if (aClean !== bClean) return bClean - aClean;
      // more fixVersions first
      return (b.fixVersions || []).length - (a.fixVersions || []).length;
    });

    const winner = entries[0];

    // Union all fixVersions from every duplicate, excluding .z-suffixed names.
    // Z-stream Jira fixVersions (e.g. "rhoai-3.5.z") track patch work and
    // shouldn't be queried as TV/FV delta releases.
    const allFvs = new Set();
    for (let i = 0; i < entries.length; i++) {
      for (const fv of (entries[i].fixVersions || [])) {
        if (!/\.z$/i.test(fv)) allFvs.add(fv);
      }
      if (i > 0) toRemove.add(entries[i]);
    }

    winner.id = normId;
    winner.fixVersions = [...allFvs];
    winner.updatedAt = new Date().toISOString();
    migrated++;
  }

  if (toRemove.size > 0) {
    registry.releases = registry.releases.filter(function (r) { return !toRemove.has(r); });
  }

  return migrated;
}

/**
 * Auto-resolve Jira fixVersions for registry releases.
 * Uses the existing matchVersionsToReleases fuzzy matcher against all Jira
 * project versions. Additive only — adds newly-discovered Jira version names
 * to existing fixVersions but never removes manually-curated mappings.
 *
 * @param {object} storage - Storage module
 * @param {object} [deps] - Optional dependency injection for testing
 * @param {function} [deps.fetchProjectVersions] - Jira version fetcher
 * @param {function} [deps.jiraRequest] - Jira request function
 * @returns {Promise<object>} Resolution results
 */
async function autoResolveFixVersions(storage, deps) {
  const { readFromStorage, writeToStorage } = storage;
  const registry = readRegistry(readFromStorage);

  const activeReleases = registry.releases.filter(function (r) {
    return r.state === 'active';
  });

  if (activeReleases.length === 0) {
    return { status: 'skipped', message: 'No active releases in registry' };
  }

  const config = loadRegistryConfig(storage);
  const projects = config.jiraProjects || [];
  if (projects.length === 0) {
    return { status: 'skipped', message: 'No Jira projects configured for version resolution' };
  }

  const jira = deps || require('../../../shared/server/jira');
  const jiraVersions = await jira.fetchProjectVersions(jira.jiraRequest, projects);

  if (!Array.isArray(jiraVersions) || jiraVersions.length === 0) {
    return { status: 'skipped', message: 'No Jira versions found' };
  }

  // Run fuzzy matching against ALL active releases (matcher needs full context)
  const result = matchVersionsToReleases(jiraVersions, registry.releases);

  const applied = [];

  for (const match of result.matches) {
    if (!match.proposedFixVersions || match.proposedFixVersions.length === 0) continue;

    // Find the release in the registry
    const release = registry.releases.find(function (r) { return r.id === match.releaseId; });
    if (!release || release.state !== 'active') continue;

    // Only add new versions not already present (additive only)
    var currentFvs = release.fixVersions || [];
    var newVersions = match.proposedFixVersions.filter(function (fv) {
      return currentFvs.indexOf(fv) === -1;
    });

    if (newVersions.length === 0) continue;

    release.fixVersions = currentFvs.concat(newVersions);
    release.updatedAt = new Date().toISOString();
    applied.push({ releaseId: release.id, fixVersions: release.fixVersions, added: newVersions });
  }

  if (applied.length > 0) {
    writeRegistry(writeToStorage, registry);
    logAudit(readFromStorage, writeToStorage, {
      domain: 'registry',
      action: 'registry_auto_resolve_versions',
      user: 'system',
      summary: 'Auto-resolved Jira fixVersions for ' + applied.length + ' releases',
      details: { applied: applied }
    });
  }

  return {
    status: applied.length > 0 ? 'ok' : 'skipped',
    resolved: applied.length,
    message: applied.length > 0 ? undefined : 'No new fixVersions to add',
    applied: applied
  };
}

/**
 * Run Product Pages registry sync (discover + update).
 * Extracted from the POST /registry/discover route handler for reuse
 * by the refresh registry.
 *
 * @param {object} storage - Storage module
 * @param {object} [options={}] - Options
 * @param {string} [options.user='system'] - User for audit log
 * @returns {Promise<object>} Discovery results
 */
async function runRegistrySync(storage, options) {
  options = options || {};
  const { readFromStorage, writeToStorage } = storage;
  const { getConfig } = require('./delivery/config');
  const { fetchProductsByShortname, getAuthStatus } = require('./delivery/product-pages');

  const authStatus = getAuthStatus();
  if (authStatus === 'none') {
    return { status: 'skipped', message: 'Product Pages auth not configured' };
  }

  const deliveryConfig = getConfig(readFromStorage);
  const shortnames = deliveryConfig.productPagesProductShortnames || [];
  if (shortnames.length === 0) {
    return { status: 'skipped', message: 'No product shortnames configured' };
  }

  const ppReleases = await fetchProductsByShortname(shortnames, deliveryConfig);
  if (ppReleases.length === 0) {
    return { status: 'empty', discovered: 0, created: 0, message: 'No releases found from Product Pages' };
  }

  const registry = readRegistry(readFromStorage);

  // Merge stale .z-suffixed entries into their clean counterparts before lookup.
  // This fixes the split caused by stripZStream normalising IDs while the old
  // lookup used raw IDs, creating orphaned duplicates.
  const migrated = migrateNormalizedIds(registry);
  if (migrated > 0) {
    console.log('[releases/registry] Migrated ' + migrated + ' .z-suffixed registry entries');
  }

  // Build lookup using NORMALISED IDs so that both "rhoai-3.5.z" (old PP name)
  // and "rhoai-3.5" (current PP name) resolve to the same registry entry.
  const existingById = new Map();
  for (const r of registry.releases) {
    const normId = stripZStream(r.id).toLowerCase();
    const prev = existingById.get(normId);
    // Prefer active over archived when there's a collision
    if (!prev || (prev.state === 'archived' && r.state !== 'archived')) {
      existingById.set(normId, r);
    }
  }
  let created = 0;
  let updated = 0;
  let archived = 0;
  const discovered = [];
  const discoveredIds = new Set();

  for (const ppRelease of ppReleases) {
    const releaseNumber = ppRelease.releaseNumber || '';
    if (!releaseNumber) continue;

    const id = stripZStream(releaseNumber).toLowerCase().replace(/\s+/g, '-');
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(id)) continue;

    discoveredIds.add(id);
    discovered.push({
      id,
      displayName: stripZStream(releaseNumber),
      productName: ppRelease.productName,
      dueDate: ppRelease.dueDate,
      codeFreezeDate: ppRelease.codeFreezeDate,
      planningFreezeDate: ppRelease.planningFreezeDate
    });

    const existing = existingById.get(id);

    if (existing) {
      if (existing.state === 'archived') continue;

      if (existing.source === 'product-pages') {
        existing.displayName = stripZStream(releaseNumber);
        existing.productPagesShortname = releaseNumber.split('-')[0] || existing.productPagesShortname;
        existing.productPagesVersion = releaseNumber;
        existing.milestones = {
          ...(existing.milestones || {}),
          ga: ppRelease.dueDate || existing.milestones?.ga || null,
          codeFreeze: ppRelease.codeFreezeDate || existing.milestones?.codeFreeze || null,
          planningFreeze: ppRelease.planningFreezeDate || existing.milestones?.planningFreeze || null
        };
        existing.updatedAt = new Date().toISOString();
        updated++;
      }
    } else {
      const release = normalizeRelease({
        id,
        displayName: releaseNumber,
        productPagesShortname: releaseNumber.split('-')[0] || null,
        productPagesVersion: releaseNumber,
        milestones: {
          ga: ppRelease.dueDate || null,
          codeFreeze: ppRelease.codeFreezeDate || null,
          planningFreeze: ppRelease.planningFreezeDate || null
        },
        source: 'product-pages',
        state: 'active'
      });

      registry.releases.push(release);
      existingById.set(id, release);
      created++;
    }
  }

  for (const release of registry.releases) {
    // Use normalised ID for the archive check — discoveredIds contains stripped IDs
    const normReleaseId = stripZStream(release.id).toLowerCase();
    if (release.source === 'product-pages' && release.state === 'active' && !discoveredIds.has(normReleaseId)) {
      release.state = 'archived';
      release.updatedAt = new Date().toISOString();
      archived++;
    }
  }

  if (created > 0 || updated > 0 || archived > 0) {
    writeRegistry(writeToStorage, registry);
    logAudit(readFromStorage, writeToStorage, {
      domain: 'registry',
      action: 'registry_discover',
      user: options.user || 'system',
      summary: `Synced with Product Pages: ${created} created, ${updated} updated, ${archived} archived`,
      details: { discovered: discovered.length, created, updated, archived, shortnames }
    });
  }

  return { status: 'ok', discovered: discovered.length, created, updated, archived, releases: discovered };
}

/**
 * Register release registry routes on the provided router.
 */
function registerRegistryRoutes(router, context) {
  const { storage, requireAuth, requirePlanningManager, requireScope, projects } = context;
  const { readFromStorage } = storage;

  /**
   * @openapi
   * /api/modules/releases/registry:
   *   get:
   *     tags: [Releases]
   *     summary: List all releases in the registry
   *     parameters:
   *       - in: query
   *         name: projectId
   *         required: false
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Release registry
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 schemaVersion:
   *                   type: integer
   *                 releases:
   *                   type: array
   *                   items:
   *                     type: object
   */
  router.get('/registry', requireAuth, requireScope('releases:read'), function(req, res) {
    if (req.query?.projectId) {
      const result = readProjectRegistry(projects, req.query.projectId);
      if (result.status !== 200) return res.status(result.status).json({ error: result.error });
      return res.json(result.registry);
    }
    const registry = readRegistry(readFromStorage);
    res.json(registry);
  });

  /**
   * @openapi
   * /api/modules/releases/registry/config:
   *   get:
   *     tags: [Releases]
   *     summary: Get registry configuration (Jira projects for version resolution)
   *     responses:
   *       200:
   *         description: Registry config
   */
  router.get('/registry/config', requirePlanningManager, requireScope('releases:read'), function(req, res) {
    var config = loadRegistryConfig(storage);
    res.json(config);
  });

  /**
   * @openapi
   * /api/modules/releases/registry/config:
   *   post:
   *     tags: [Releases]
   *     summary: Save registry configuration
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               jiraProjects:
   *                 type: array
   *                 items:
   *                   type: string
   *     responses:
   *       200:
   *         description: Config saved
   *       400:
   *         description: Validation error
   */
  router.post('/registry/config', requirePlanningManager, requireScope('releases:write'), function(req, res) {
    try {
      saveRegistryConfig(storage, req.body);
      res.json({ status: 'saved' });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /**
   * @openapi
   * /api/modules/releases/registry/{id}:
   *   get:
   *     tags: [Releases]
   *     summary: Get a single release by ID
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: projectId
   *         required: false
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Release object
   *       404:
   *         description: Release not found
   */
  router.get('/registry/:id', requireAuth, requireScope('releases:read'), function(req, res) {
    const projectResult = req.query?.projectId
      ? readProjectRegistry(projects, req.query.projectId)
      : null;
    if (projectResult && projectResult.status !== 200) {
      return res.status(projectResult.status).json({ error: projectResult.error });
    }
    const registry = projectResult ? projectResult.registry : readRegistry(readFromStorage);
    const release = registry.releases.find(r => r.id === req.params.id);
    if (!release) {
      return res.status(404).json({ error: 'Release not found' });
    }
    res.json(release);
  });

  // Create/Edit/Archive/Restore/Discover/Resolve-Jira-Versions write routes, and the
  // registry-sync/registry-resolve-versions scheduled-refresh registrations that used
  // to live here, have been removed. The canonical Registry producer is org-pulse-data
  // + its data-sync sidecar; app-side Product Pages/Jira collection and writes to
  // releases/registry.json are inherited pre-read-only-architecture behavior, not the
  // desired source-of-truth path. runRegistrySync, matchVersionsToReleases, and
  // autoResolveFixVersions are kept (still exported, still unit-tested) since removing
  // the scheduling alone isn't grounds to delete them.
}

module.exports = {
  registerRegistryRoutes, readRegistry, writeRegistry, validateRelease, normalizeRelease,
  normalizeVersionName, matchVersionsToReleases, runRegistrySync, migrateNormalizedIds,
  autoResolveFixVersions, REGISTRY_FILE, readProjectRegistry
};

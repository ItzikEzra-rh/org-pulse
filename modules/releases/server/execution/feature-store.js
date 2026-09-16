/**
 * Unified feature store — merge logic, writes, and index derivation.
 *
 * Merges data from pipeline (GitLab CI artifacts) and Jira enrichment
 * into canonical per-feature JSON files. Derives index.json from the
 * set of feature files.
 */

const DATA_PREFIX = 'releases/execution';

let storeWriteInProgress = false;

// Jira-owned fields — Jira always wins, preserve existing if jiraData is null.
// 'epics' is deliberately excluded: it is merged per-Epic in mergeEpics() below,
// not wholesale-owned by either source.
const JIRA_FIELDS = [
  'status', 'statusCategory', 'colorStatus', 'ownerStatusColor',
  'statusSummary', 'assignee', 'pm', 'labels', 'fixVersions',
  'targetVersions', 'components', 'priority', 'team', 'releaseType',
  'docsRequired', 'targetEnd', 'riceScore', 'riceStatus', 'isBlocked',
  'linkedRfeKey', 'issueLinks'
];

// Pipeline-owned fields — pipeline always wins
const PIPELINE_FIELDS = [
  'metrics', 'topology', 'trafficSignals', 'statusNotes'
];

// Pipeline-index-only fields — written from pipeline index during ingest
const PIPELINE_INDEX_FIELDS = [
  'architect', 'parentKey', 'targetVersions'
];

// AI-review-owned fields — preserved across pipeline/Jira merges
const AI_REVIEW_FIELDS = ['aiReview'];

// Epic status-completion override fields under detail.metrics. See rebuildIndex().
const EFFECTIVE_EXECUTION_FIELDS = [
  'effectiveExecutionIssueCount',
  'effectiveDoneExecutionIssueCount',
  'effectiveExecutionState',
  'effectiveExecutionCoverage',
  'effectiveExecutionCoverageReason'
];

function epicKeySet(epics) {
  return new Set((epics || []).map(function(e) { return e.key; }));
}

// Key-set equality, ignoring order and per-Epic summary/status changes.
function epicMembershipChanged(before, after) {
  const beforeKeys = epicKeySet(before);
  const afterKeys = epicKeySet(after);
  if (beforeKeys.size !== afterKeys.size) return true;
  for (const key of beforeKeys) {
    if (!afterKeys.has(key)) return true;
  }
  return false;
}

// True if any Epic present in both sets has a changed statusCategory — a
// reopened Epic invalidates completedViaStatus even with membership unchanged.
function epicClassificationChanged(before, after) {
  const beforeByKey = new Map((before || []).map(function(e) { return [e.key, e]; }));
  for (let i = 0; i < (after || []).length; i++) {
    const epic = after[i];
    const priorEpic = beforeByKey.get(epic.key);
    if (!priorEpic) continue;
    if (priorEpic.statusCategory !== epic.statusCategory) return true;
  }
  return false;
}

// Same shape rebuildIndex() falls back to for a missing/legacy payload.
// Returns a new object — never mutates the input metrics.
function invalidateExecutionProgress(metrics) {
  return Object.assign({}, metrics, {
    executionIssueCount: null,
    doneExecutionIssueCount: null,
    executionState: null,
    executionCoverage: 'insufficient-data',
    executionCoverageReason: null,
    effectiveExecutionIssueCount: null,
    effectiveDoneExecutionIssueCount: null,
    effectiveExecutionState: null,
    effectiveExecutionCoverage: 'insufficient-data',
    effectiveExecutionCoverageReason: null
  });
}

// Narrower than invalidateExecutionProgress: nulls only the effective fields, leaving
// raw execution* untouched — for a classification-only change where membership is still valid.
function invalidateEffectiveExecutionProgress(metrics) {
  return Object.assign({}, metrics, {
    effectiveExecutionIssueCount: null,
    effectiveDoneExecutionIssueCount: null,
    effectiveExecutionState: null,
    effectiveExecutionCoverage: 'insufficient-data',
    effectiveExecutionCoverageReason: null
  });
}

// Resets completedViaStatus to false for Epics whose statusCategory changed (stale until the
// next producer run); never fabricates the flag onto a sparse Jira-only Epic that never had it.
function invalidateChangedEpicFlags(before, after) {
  const beforeByKey = new Map((before || []).map(function(e) { return [e.key, e]; }));
  return (after || []).map(function(epic) {
    const priorEpic = beforeByKey.get(epic.key);
    if (!priorEpic || priorEpic.statusCategory === epic.statusCategory) return epic;
    if (!Object.prototype.hasOwnProperty.call(epic, 'completedViaStatus')) return epic;
    return Object.assign({}, epic, { completedViaStatus: false });
  });
}

// True when `stored.updated` is strictly newer than `incoming.updated`. Absent
// or unparsable timestamps can't establish staleness, so they're not flagged.
function isEpicStale(stored, incoming) {
  const storedTime = stored.updated ? Date.parse(stored.updated) : NaN;
  const incomingTime = incoming.updated ? Date.parse(incoming.updated) : NaN;
  if (Number.isNaN(storedTime) || Number.isNaN(incomingTime)) return false;
  return storedTime > incomingTime;
}

// With no Jira snapshot to arbitrate, pins a stale incoming Epic's statusCategory/`updated`/
// completedViaStatus to the stored values; `changed` is true only on an actual contradiction.
function reconcileEpicClassifications(storedEpics, incomingEpics) {
  const storedByKey = new Map((storedEpics || []).map(function(e) { return [e.key, e]; }));
  let changed = false;

  const epics = (incomingEpics || []).map(function(epic) {
    const stored = storedByKey.get(epic.key);
    if (!stored || !isEpicStale(stored, epic)) return epic;

    const reconciled = Object.assign({}, epic, { updated: stored.updated });
    if (Object.prototype.hasOwnProperty.call(stored, 'statusCategory')) reconciled.statusCategory = stored.statusCategory;
    // status is a display label paired with statusCategory — keep them consistent.
    if (Object.prototype.hasOwnProperty.call(stored, 'status')) reconciled.status = stored.status;

    // Prefer the stored flag; if absent, invalidate rather than trust a flag
    // the producer computed against incoming's now-overridden classification.
    const classificationChanged = reconciled.statusCategory !== epic.statusCategory;
    if (Object.prototype.hasOwnProperty.call(stored, 'completedViaStatus')) {
      reconciled.completedViaStatus = stored.completedViaStatus;
    } else if (classificationChanged && Object.prototype.hasOwnProperty.call(reconciled, 'completedViaStatus')) {
      reconciled.completedViaStatus = false;
    }

    if (classificationChanged || reconciled.completedViaStatus !== epic.completedViaStatus) {
      changed = true;
    }
    return reconciled;
  });

  return { epics: epics, changed: changed };
}

/**
 * Merge producer-owned Epics against Jira's current Epic membership snapshot.
 * A successful jiraEpics snapshot is authoritative for *membership* — an Epic
 * absent from it is no longer linked and is dropped (an empty array drops all).
 * For a key present in both, producer-owned fields (issues[], execution counts,
 * provenance) are preserved and only Jira-owned summary/status is refreshed.
 * A key Jira discovered that the producer doesn't know about yet is added sparse.
 *
 * @param {object[]|undefined} baseEpics - Producer-owned Epics (richer shape)
 * @param {object[]} jiraEpics - Jira's current Epic snapshot (key/summary/status only)
 * @returns {object[]}
 */
function mergeEpics(baseEpics, jiraEpics) {
  const jiraByKey = new Map(jiraEpics.map(function(e) { return [e.key, e]; }));
  const baseByKey = new Map((baseEpics || []).map(function(e) { return [e.key, e]; }));

  const merged = [];
  for (let i = 0; i < (baseEpics || []).length; i++) {
    const epic = baseEpics[i];
    const jiraEpic = jiraByKey.get(epic.key);
    if (!jiraEpic) continue; // no longer in Jira's snapshot — drop
    const refreshed = Object.assign({}, epic, { summary: jiraEpic.summary, status: jiraEpic.status });
    // Never overwrite with undefined — an older caller's snapshot must not erase a producer-known value.
    if (jiraEpic.statusCategory !== undefined) refreshed.statusCategory = jiraEpic.statusCategory;
    if (jiraEpic.updated !== undefined) refreshed.updated = jiraEpic.updated;
    merged.push(refreshed);
  }

  for (let i = 0; i < jiraEpics.length; i++) {
    if (!baseByKey.has(jiraEpics[i].key)) merged.push(jiraEpics[i]);
  }

  return merged;
}

/**
 * Merge data from existing store, pipeline ingest, and Jira enrichment.
 * All three inputs are optional (may be null).
 *
 * @param {object|null} existing - Current stored feature data
 * @param {object|null} pipelineData - New pipeline-delivered data
 * @param {object|null} jiraData - New Jira enrichment data
 * @returns {object} Merged feature object
 */
function mergeFeatureData(existing, pipelineData, jiraData) {
  const base = existing || {};
  const pipeline = pipelineData || {};
  const jira = jiraData || {};

  // Start with existing as base
  const merged = { ...base };

  // Key and summary: Jira wins, pipeline fallback
  merged.key = jira.key || pipeline.key || base.key;
  merged.summary = jira.summary || pipeline.summary || base.summary || '';

  // Pipeline-owned fields: pipeline wins when present
  for (let i = 0; i < PIPELINE_FIELDS.length; i++) {
    const field = PIPELINE_FIELDS[i];
    if (pipeline[field] !== undefined) {
      merged[field] = pipeline[field];
    }
  }

  // Pipeline-index-only fields: refreshed on pipeline ingest
  for (let i = 0; i < PIPELINE_INDEX_FIELDS.length; i++) {
    const field = PIPELINE_INDEX_FIELDS[i];
    if (pipeline[field] !== undefined) {
      merged[field] = pipeline[field];
    }
  }

  // Jira-owned fields: Jira wins when jiraData is provided
  if (jiraData) {
    for (let i = 0; i < JIRA_FIELDS.length; i++) {
      const field = JIRA_FIELDS[i];
      if (jira[field] !== undefined) {
        merged[field] = jira[field];
      }
    }
  }
  // If jiraData is null (enrichment failed/skipped), preserve existing Jira fields

  // Epics: this cycle's pipeline Epics if present, else whatever was already stored.
  const epicsBase = pipeline.epics !== undefined ? pipeline.epics : base.epics;
  if (jiraData && jira.epics !== undefined) {
    merged.epics = invalidateChangedEpicFlags(epicsBase, mergeEpics(epicsBase, jira.epics));

    // epicsBase is the Epic set merged.metrics was computed over: a membership change
    // invalidates it wholesale; a classification-only change invalidates just the effective fields.
    if (merged.metrics && epicMembershipChanged(epicsBase, merged.epics)) {
      merged.metrics = invalidateExecutionProgress(merged.metrics);
    } else if (merged.metrics && epicClassificationChanged(epicsBase, merged.epics)) {
      merged.metrics = invalidateEffectiveExecutionProgress(merged.metrics);
    }
  } else if (epicsBase !== undefined) {
    // No Jira snapshot to arbitrate this cycle — reconcile against what's
    // stored so a stale/replayed producer Epic can't undo a newer invalidation.
    const reconciled = reconcileEpicClassifications(base.epics, epicsBase);
    merged.epics = reconciled.epics;
    if (merged.metrics && reconciled.changed) {
      merged.metrics = invalidateEffectiveExecutionProgress(merged.metrics);
    }
  }

  // created: Jira is source of truth (issue creation date)
  if (jira.created) {
    merged.created = jira.created;
  } else if (pipeline.created) {
    merged.created = pipeline.created;
  }

  // updated: latest of Jira and pipeline
  const jiraUpdated = jira.updated ? new Date(jira.updated).getTime() : 0;
  const pipelineUpdated = pipeline.updated ? new Date(pipeline.updated).getTime() : 0;
  const existingUpdated = base.updated ? new Date(base.updated).getTime() : 0;
  const latestUpdated = Math.max(jiraUpdated, pipelineUpdated, existingUpdated);
  if (latestUpdated > 0) {
    if (jiraUpdated === latestUpdated) merged.updated = jira.updated;
    else if (pipelineUpdated === latestUpdated) merged.updated = pipeline.updated;
    // else keep existing
  }

  // AI-review-owned fields: preserve across pipeline/Jira merges.
  // Only update aiReview on features that already have it (pushed by the AI review bulk endpoint).
  // Without the base.aiReview guard, every Jira-enriched feature would get an empty aiReview
  // (since transformForEnrichment always returns humanReviewStatus), causing all features
  // to appear in the AI Impact view.
  if (jiraData && jiraData.aiReview && base.aiReview) {
    merged.aiReview = {
      ...base.aiReview,
      ...jiraData.aiReview
    };
  }

  // _sources metadata
  const sources = { ...(base._sources || {}) };
  if (pipelineData) {
    sources.pipeline = new Date().toISOString();
  }
  if (jiraData) {
    sources.jira = new Date().toISOString();
  }
  merged._sources = sources;

  return merged;
}

/**
 * Write a batch of features and rebuild the index.
 * Protected by a simple mutex to prevent interleaving.
 *
 * @param {object} storage - Storage abstraction
 * @param {object[]} features - Array of feature objects to write
 */
async function writeFeatures(storage, features) {
  // Wait for any in-progress write to complete
  while (storeWriteInProgress) {
    await new Promise(function(resolve) { setTimeout(resolve, 100); });
  }

  storeWriteInProgress = true;
  try {
    for (let i = 0; i < features.length; i++) {
      const feature = features[i];
      if (!feature.key) continue;
      storage.writeToStorage(
        DATA_PREFIX + '/features/' + feature.key + '.json',
        feature
      );
    }

    await rebuildIndex(storage);
  } finally {
    storeWriteInProgress = false;
  }
}

/**
 * Rebuild index.json by scanning all feature files in storage.
 * Maps detail fields to index summary fields.
 *
 * @param {object} storage - Storage abstraction
 */
async function rebuildIndex(storage) {
  const fileNames = storage.listStorageFiles(DATA_PREFIX + '/features');
  if (!fileNames || fileNames.length === 0) {
    storage.writeToStorage(DATA_PREFIX + '/index.json', {
      fetchedAt: new Date().toISOString(),
      schemaVersion: 'v2',
      featureCount: 0,
      features: []
    });
    return;
  }

  const features = [];

  for (let i = 0; i < fileNames.length; i++) {
    const fileName = fileNames[i];
    if (!fileName.endsWith('.json')) continue;

    const feature = storage.readFromStorage(DATA_PREFIX + '/features/' + fileName);
    if (!feature || !feature.key) continue;

    // Map detail fields to index summary fields
    const indexEntry = {
      key: feature.key,
      summary: feature.summary || '',
      status: feature.status || null,
      statusCategory: feature.statusCategory || null,
      priority: feature.priority || null,
      // Index uses string assignee (detail has object)
      assignee: feature.assignee
        ? (typeof feature.assignee === 'object' ? feature.assignee.displayName : feature.assignee)
        : null,
      fixVersions: feature.fixVersions || [],
      labels: feature.labels || [],
      // Derived from metrics
      completionPct: feature.metrics ? (feature.metrics.completionPct || 0) : 0,
      epicCount: feature.metrics ? (feature.metrics.totalEpics || 0) : 0,
      issueCount: feature.metrics ? (feature.metrics.totalIssues || 0) : 0,
      blockerCount: feature.metrics ? (feature.metrics.blockerCount || 0) : 0,
      health: feature.metrics ? (feature.metrics.health || null) : null,
      // Execution/preparation fields (pipeline-owned, nested under detail metrics).
      // Missing on an older/incompatible payload renders as unavailable — never
      // fabricate "empty" — while an explicit null or 0 from the producer passes through as-is.
      executionIssueCount: feature.metrics && feature.metrics.executionIssueCount !== undefined
        ? feature.metrics.executionIssueCount : null,
      doneExecutionIssueCount: feature.metrics && feature.metrics.doneExecutionIssueCount !== undefined
        ? feature.metrics.doneExecutionIssueCount : null,
      executionState: feature.metrics && feature.metrics.executionState !== undefined
        ? feature.metrics.executionState : null,
      executionCoverage: feature.metrics && feature.metrics.executionCoverage !== undefined
        ? feature.metrics.executionCoverage : 'insufficient-data',
      preparationReadiness: feature.metrics && feature.metrics.preparationReadiness !== undefined
        ? feature.metrics.preparationReadiness : 'unknown',
      // Explains a non-'available' executionCoverage; missing on an older
      // payload renders as unavailable in the UI, never a guessed reason.
      executionCoverageReason: feature.metrics && feature.metrics.executionCoverageReason !== undefined
        ? feature.metrics.executionCoverageReason : null,
      // Timestamps
      lastUpdated: feature.updated || null,
      // Pipeline-index-only fields
      targetVersions: feature.targetVersions || null,
      pm: feature.pm
        ? (typeof feature.pm === 'object' ? feature.pm.displayName : feature.pm)
        : null,
      architect: feature.architect || null,
      parentKey: feature.parentKey || null,
      // Jira-sourced fields for index filtering
      colorStatus: feature.colorStatus || null,
      ownerStatusColor: feature.colorStatus || null, // backward compat alias
      team: feature.team || null,
      components: feature.components || [],
      // AI review summary (slim — only fields needed for list/readiness views)
      aiReview: feature.aiReview ? {
        recommendation: feature.aiReview.recommendation,
        scores: feature.aiReview.scores,
        humanReviewStatus: feature.aiReview.humanReviewStatus,
        needsAttention: feature.aiReview.needsAttention,
        reviewedAt: feature.aiReview.reviewedAt
      } : null
    };

    // Copied only when present so the client (progress.js effectiveOrRaw) can
    // tell a legacy payload (key absent) from an invalidated value (key present, null).
    if (feature.metrics) {
      for (let j = 0; j < EFFECTIVE_EXECUTION_FIELDS.length; j++) {
        const field = EFFECTIVE_EXECUTION_FIELDS[j];
        if (Object.prototype.hasOwnProperty.call(feature.metrics, field)) {
          indexEntry[field] = feature.metrics[field];
        }
      }
    }

    features.push(indexEntry);
  }

  storage.writeToStorage(DATA_PREFIX + '/index.json', {
    fetchedAt: new Date().toISOString(),
    schemaVersion: 'v2',
    featureCount: features.length,
    features
  });
}

module.exports = {
  mergeFeatureData,
  mergeEpics,
  epicMembershipChanged,
  epicClassificationChanged,
  reconcileEpicClassifications,
  invalidateExecutionProgress,
  invalidateEffectiveExecutionProgress,
  invalidateChangedEpicFlags,
  writeFeatures,
  rebuildIndex,
  DATA_PREFIX,
  JIRA_FIELDS,
  PIPELINE_FIELDS,
  PIPELINE_INDEX_FIELDS,
  AI_REVIEW_FIELDS
};

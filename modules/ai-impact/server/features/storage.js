/**
 * AI Impact feature storage — response-shaping transforms.
 *
 * Reads from the unified releases execution store and reshapes data
 * for backward-compatible AI Impact API responses.
 *
 * The canonical feature store is owned by releases. AI Impact pushes
 * review data via the internal API (POST /api/modules/releases/execution/ai-review/bulk).
 */

const RELEASES_INDEX_KEY = 'releases/execution/index.json';
const RELEASES_FEATURE_PREFIX = 'releases/execution/features/';
const LEGACY_STORAGE_KEY = 'ai-impact/features.json';

/**
 * Backfill legacy records' fixVersions from the releases index by key.
 * The legacy schema predates fixVersions, but its keys are the same Jira
 * keys as the index, which already carries fixVersions for every entry
 * regardless of aiReview status. Preserves any fixVersions the legacy
 * record already has; does not mutate the input.
 * @param {object} legacy - The legacy features data object
 * @param {Array} indexFeatures - The releases index's features array
 * @returns {object} Legacy data with fixVersions backfilled where available
 */
function backfillFixVersionsFromIndex(legacy, indexFeatures) {
  const fixVersionsByKey = {};
  for (const entry of indexFeatures) {
    fixVersionsByKey[entry.key] = entry.fixVersions || [];
  }
  const features = {};
  for (const [key, record] of Object.entries(legacy.features)) {
    const existing = record.latest.fixVersions;
    features[key] = {
      ...record,
      latest: {
        ...record.latest,
        fixVersions: existing && existing.length > 0 ? existing : (fixVersionsByKey[key] || [])
      }
    };
  }
  return { ...legacy, features };
}

/**
 * Normalizes the observed assignee shapes (null, `{displayName}`, bare string) to a plain string.
 * @param {*} assignee - Raw assignee value from a feature detail file
 * @returns {string|null}
 */
function extractAssignee(assignee) {
  if (!assignee) return null;
  return typeof assignee === 'string' ? assignee : (assignee.displayName || null);
}

/**
 * Applies extractAssignee to every legacy record's assignee, matching the
 * normalization the main path applies. Does not mutate the input.
 * @param {object} legacy - The legacy features data object
 * @returns {object} Legacy data with normalized assignee values
 */
function normalizeLegacyAssignees(legacy) {
  const features = {};
  for (const [key, record] of Object.entries(legacy.features)) {
    features[key] = { ...record, latest: { ...record.latest, assignee: extractAssignee(record.latest.assignee) } };
  }
  return { ...legacy, features };
}

/**
 * Read features from the unified releases store and reshape into the
 * AI Impact format ({ features: { [key]: { latest, history } }, ... }).
 *
 * Falls back to the legacy ai-impact/features.json if no releases data
 * has aiReview entries yet (pre-migration).
 *
 * @param {Function} readFromStorage - The storage read function
 * @returns {object} Features data object (never null)
 */
function readFeatures(readFromStorage) {
  const index = readFromStorage(RELEASES_INDEX_KEY);
  if (!index || !Array.isArray(index.features)) {
    // Fallback to legacy store
    const legacy = readFromStorage(LEGACY_STORAGE_KEY);
    if (legacy && typeof legacy === 'object' && legacy.features) {
      return normalizeLegacyAssignees(legacy);
    }
    return { lastSyncedAt: null, totalFeatures: 0, features: {} };
  }

  // Filter to only features that have aiReview data
  const aiFeatures = index.features.filter(function(f) { return f.aiReview; });
  if (aiFeatures.length === 0) {
    // Check legacy store as fallback
    const legacy = readFromStorage(LEGACY_STORAGE_KEY);
    if (legacy && typeof legacy === 'object' && legacy.features && Object.keys(legacy.features).length > 0) {
      return normalizeLegacyAssignees(backfillFixVersionsFromIndex(legacy, index.features));
    }
    return { lastSyncedAt: null, totalFeatures: 0, features: {} };
  }

  const features = {};
  for (var i = 0; i < aiFeatures.length; i++) {
    var entry = aiFeatures[i];
    // Read the full feature file for history
    var featureFile = readFromStorage(RELEASES_FEATURE_PREFIX + entry.key + '.json');
    var aiReview = featureFile && featureFile.aiReview ? featureFile.aiReview : {};
    // The index entry's components come straight from Jira's Components field
    // with no transformation, so it's the canonical source. The per-feature
    // detail file's top-level components can be overridden by an unrelated
    // enhancement-proposal-derived value upstream, so it is not trusted here.
    // Only fall back to aiReview.components when the index entry has no
    // components field at all, i.e. legacy/unenriched record.
    var components = Array.isArray(entry.components)
      ? entry.components
      : (aiReview.components || []);

    features[entry.key] = {
      latest: {
        key: entry.key,
        title: aiReview.title || entry.summary || '',
        sourceRfe: aiReview.sourceRfe || null,
        priority: entry.priority || 'Undefined',
        status: entry.status || '',
        size: aiReview.size || null,
        recommendation: aiReview.recommendation || null,
        needsAttention: aiReview.needsAttention || false,
        humanReviewStatus: aiReview.humanReviewStatus || (entry.aiReview && entry.aiReview.humanReviewStatus) || 'awaiting-review',
        scores: aiReview.scores || (entry.aiReview && entry.aiReview.scores) || null,
        reviewers: aiReview.reviewers || null,
        labels: entry.labels || [],
        // From the per-feature detail file only — index.json's assignee is a different, unrelated field.
        assignee: extractAssignee(featureFile && featureFile.assignee),
        components: components,
        reviewedAt: aiReview.reviewedAt || (entry.aiReview && entry.aiReview.reviewedAt) || null,
        // aiInvolvement/provenanceKind are only present once the design-provenance pipeline
        // change lands (org-pulse-data); left null (not a fallback string) so the frontend
        // provenance badge stays hidden until real data exists.
        aiInvolvement: aiReview.aiInvolvement || (entry.aiReview && entry.aiReview.aiInvolvement) || null,
        provenanceKind: aiReview.provenanceKind || (entry.aiReview && entry.aiReview.provenanceKind) || null,
        created: (featureFile && featureFile.created) || entry.created || null,
        runId: aiReview.runId || undefined,
        approvedBy: aiReview.approvedBy || null,
        approvedAt: aiReview.approvedAt || null,
        verdict: aiReview.verdict || null,
        feedback: aiReview.feedback || null,
        criterionNotes: aiReview.criterionNotes || null,
        designPrUrl: aiReview.designPrUrl || null,
        designStatus: aiReview.designStatus || (entry.aiReview && entry.aiReview.designStatus) || null,
        designPrStatus: aiReview.designPrStatus || (entry.aiReview && entry.aiReview.designPrStatus) || null,
        prdPrStatus: aiReview.prdPrStatus || (entry.aiReview && entry.aiReview.prdPrStatus) || null,
        prdPrUrl: aiReview.prdPrUrl || (entry.aiReview && entry.aiReview.prdPrUrl) || null,
        prdRecommendation: aiReview.prdRecommendation || (entry.aiReview && entry.aiReview.prdRecommendation) || null,
        prdReviewState: aiReview.prdReviewState || (entry.aiReview && entry.aiReview.prdReviewState) || null,
        designReviewState: aiReview.designReviewState || (entry.aiReview && entry.aiReview.designReviewState) || null,
        fixVersions: entry.fixVersions || []
      },
      history: aiReview.history || []
    };
  }

  return {
    lastSyncedAt: index.fetchedAt || null,
    totalFeatures: aiFeatures.length,
    features
  };
}

/**
 * Get a slim projection of all latest features for list views.
 * Strips labels, runId, runTimestamp from each entry.
 * @param {object} data - The features data object (from readFeatures)
 * @returns {object} Projected data with slim feature entries
 */
function getLatestProjection(data) {
  const projected = {};
  for (const [key, entry] of Object.entries(data.features)) {
    projected[key] = {
      key: entry.latest.key,
      title: entry.latest.title,
      sourceRfe: entry.latest.sourceRfe,
      priority: entry.latest.priority,
      status: entry.latest.status,
      size: entry.latest.size,
      recommendation: entry.latest.recommendation,
      needsAttention: entry.latest.needsAttention,
      humanReviewStatus: entry.latest.humanReviewStatus,
      scores: entry.latest.scores,
      reviewers: entry.latest.reviewers,
      reviewedAt: entry.latest.reviewedAt,
      assignee: entry.latest.assignee || null,
      aiInvolvement: entry.latest.aiInvolvement || null,
      provenanceKind: entry.latest.provenanceKind || null,
      created: entry.latest.created || null,
      components: entry.latest.components || [],
      approvedBy: entry.latest.approvedBy || null,
      approvedAt: entry.latest.approvedAt || null,
      designStatus: entry.latest.designStatus || null,
      designPrUrl: entry.latest.designPrUrl || null,
      designPrStatus: entry.latest.designPrStatus || null,
      prdPrStatus: entry.latest.prdPrStatus || null,
      prdPrUrl: entry.latest.prdPrUrl || null,
      prdRecommendation: entry.latest.prdRecommendation || null,
      prdReviewState: entry.latest.prdReviewState || null,
      designReviewState: entry.latest.designReviewState || null,
      fixVersions: entry.latest.fixVersions || []
    };
  }
  return {
    lastSyncedAt: data.lastSyncedAt,
    totalFeatures: data.totalFeatures,
    features: projected
  };
}

/**
 * Count total history entries across all features.
 * @param {object} data - The features data object (from readFeatures)
 * @returns {number}
 */
function countHistoryEntries(data) {
  let count = 0;
  for (const entry of Object.values(data.features)) {
    count += (entry.history ? entry.history.length : 0);
  }
  return count;
}

module.exports = {
  RELEASES_INDEX_KEY,
  RELEASES_FEATURE_PREFIX,
  LEGACY_STORAGE_KEY,
  readFeatures,
  getLatestProjection,
  countHistoryEntries
};

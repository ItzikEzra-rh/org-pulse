/**
 * Releases module export hook.
 *
 * Handles exported files listed in module.json > export.files:
 * - releases/registry.json
 * - releases/execution/index.json
 * - releases/execution/features/*.json
 *
 * Storage reads and export paths both use releases/execution/.
 */

const DATA_PREFIX = 'releases';
const EXECUTION_STORAGE_PREFIX = 'releases/execution';
const EXECUTION_EXPORT_PREFIX = `${DATA_PREFIX}/execution`;
const PROJECT_EXECUTION_PREFIX = 'releases/execution';
const { createProjectProfileReader, normalizeArtifactKey } = require('../../../shared/server/project-profile');

module.exports = async function releasesExport(addFile, storage, mapping) {
  const { readFromStorage, listStorageFiles } = storage;

  // Registry (no sensitive data — export as-is)
  const registry = readFromStorage(`${DATA_PREFIX}/registry.json`);
  if (registry) {
    addFile(`${DATA_PREFIX}/registry.json`, registry);
  }

  // Execution data (feature-traffic storage -> releases/execution export)
  const index = readFromStorage(`${EXECUTION_STORAGE_PREFIX}/index.json`);
  if (index) {
    const anonymizedIndex = { ...index };
    if (Array.isArray(anonymizedIndex.features)) {
      anonymizedIndex.features = anonymizedIndex.features.map(f => anonymizeFeatureSummary(f, mapping));
    }
    addFile(`${EXECUTION_EXPORT_PREFIX}/index.json`, anonymizedIndex);

    // features/*.json
    let featureFiles;
    try { featureFiles = listStorageFiles(`${EXECUTION_STORAGE_PREFIX}/features`) || []; } catch { featureFiles = []; }
    for (const fileName of featureFiles) {
      const feature = readFromStorage(`${EXECUTION_STORAGE_PREFIX}/features/${fileName}`);
      if (!feature) continue;
      const anonymized = anonymizeFeatureDetail(feature, mapping);
      const anonymizedFileName = anonymized.key ? `${anonymized.key}.json` : fileName;
      addFile(`${EXECUTION_EXPORT_PREFIX}/features/${anonymizedFileName}`, anonymized);
    }
  }

  // Export project-qualified Execute publications under their original project
  // roots. Each project's index, details and tracking artifacts are read from
  // one pinned immutable root and must share one Execute generation.
  await exportProjectExecute(addFile, storage, mapping);
};

async function exportProjectExecute(addFile, storage, mapping) {
  const { readFromStorage } = storage;
  const projectIndex = readFromStorage('projects/index.json');
  if (!projectIndex) return;

  const reader = createProjectProfileReader(storage);
  const profiles = reader.list();
  addFile('projects/index.json', projectIndex);

  for (const profile of profiles) {
    const resolved = reader.resolve(profile.projectId);
    if (!resolved) continue;
    const projectRoot = resolved.rootKey;
    const profilePath = `${projectRoot}/profile.json`;
    const publishedProfile = readFromStorage(profilePath);
    if (!publishedProfile) throw new Error(`Project profile is missing during export: ${profile.projectId}`);

    addFile(`projects/${profile.projectId}/profile.json`, publishedProfile);
    const pointer = readFromStorage(`projects/${profile.projectId}/current.json`);
    if (pointer) addFile(`projects/${profile.projectId}/current.json`, pointer);
    if (resolved.generationId) {
      addFile(`${projectRoot}/profile.json`, publishedProfile);
    }

    const registryKey = 'releases/registry.json';
    const registry = readFromStorage(`${projectRoot}/${registryKey}`);
    if (registry) {
      if (registry.projectId !== profile.projectId || registry.profileRevision !== profile.profileRevision
          || registry.artifactKey !== registryKey) {
        throw new Error(`Project release registry identity mismatch during export: ${profile.projectId}`);
      }
      addFile(`${projectRoot}/${registryKey}`, registry);
    }

    const indexKey = `${PROJECT_EXECUTION_PREFIX}/index.json`;
    const index = readFromStorage(`${projectRoot}/${indexKey}`);
    if (!index) continue;
    validateProjectExecuteEnvelope(index, profile, indexKey);
    const executeGenerationId = index.generationId;
    addFile(`${projectRoot}/${indexKey}`, anonymizeProjectArtifact(index, mapping));

    const features = Array.isArray(index.data?.features) ? index.data.features : [];
    for (const feature of features) {
      if (!feature || typeof feature.key !== 'string' || !/^[A-Z][A-Z0-9]+-\d+$/.test(feature.key)) {
        throw new Error(`Invalid feature identity in ${profile.projectId} Execute index`);
      }
      const artifactKey = `${PROJECT_EXECUTION_PREFIX}/features/${feature.key}.json`;
      const detail = readFromStorage(`${projectRoot}/${artifactKey}`);
      if (!detail) continue;
      validateProjectExecuteEnvelope(detail, profile, artifactKey, executeGenerationId);
      addFile(`${projectRoot}/${artifactKey}`, anonymizeProjectArtifact(detail, mapping));
    }

    const trackingReleases = Array.isArray(index.data?.trackingReleases) ? index.data.trackingReleases : [];
    for (const release of trackingReleases) {
      if (!release || typeof release.artifactKey !== 'string') continue;
      const artifactKey = normalizeArtifactKey(release.artifactKey);
      if (!artifactKey.startsWith(`${PROJECT_EXECUTION_PREFIX}/tracking-data-`)) {
        throw new Error(`Invalid tracking artifact key in ${profile.projectId} Execute index`);
      }
      const tracking = readFromStorage(`${projectRoot}/${artifactKey}`);
      if (!tracking) continue;
      validateProjectExecuteEnvelope(tracking, profile, artifactKey, executeGenerationId);
      if (tracking.data?.releaseId !== release.releaseId) {
        throw new Error(`Tracking release identity mismatch during export: ${profile.projectId}/${release.releaseId}`);
      }
      addFile(`${projectRoot}/${artifactKey}`, anonymizeProjectArtifact(tracking, mapping));
    }
  }
}

function validateProjectExecuteEnvelope(envelope, profile, artifactKey, expectedGenerationId = null) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)
      || envelope.projectId !== profile.projectId
      || envelope.profileRevision !== profile.profileRevision
      || envelope.executeRevision !== profile.executeRevision
      || envelope.artifactKey !== artifactKey
      || typeof envelope.generationId !== 'string'
      || (expectedGenerationId && envelope.generationId !== expectedGenerationId)) {
    throw new Error(`Project Execute publication identity mismatch during export: ${profile.projectId}/${artifactKey}`);
  }
  if (envelope.data?.projectId && envelope.data.projectId !== profile.projectId) {
    throw new Error(`Project Execute payload identity mismatch during export: ${profile.projectId}/${artifactKey}`);
  }
}

function anonymizeProjectArtifact(envelope, mapping) {
  const copy = JSON.parse(JSON.stringify(envelope));
  copy.data = anonymizeProjectValue(copy.data, mapping);
  return copy;
}

function anonymizeProjectValue(value, mapping, fieldName = '', parent = null) {
  if (Array.isArray(value)) return value.map(item => anonymizeProjectValue(item, mapping, fieldName, parent));
  if (!value || typeof value !== 'object') {
    if (typeof value !== 'string') return value;
    if (['key', 'parentKey', 'parentFeatureKey', 'linkedRfeKey'].includes(fieldName)) {
      return mapping.anonymizeJiraKey(value);
    }
    if (fieldName === 'jiraUrl') {
      return value.replace(/\b[A-Z][A-Z0-9]+-\d+\b/g, key => mapping.anonymizeJiraKey(key));
    }
    if (fieldName === 'summary') {
      const key = parent?.key ? mapping.anonymizeJiraKey(parent.key) : value;
      return mapping.anonymizeIssueSummary(key);
    }
    if (fieldName === 'assignee' || fieldName === 'reporter') {
      return mapping.getOrCreateNameMapping(value);
    }
    if (fieldName === 'accountId') return mapping.getOrCreateAccountIdMapping(value);
    return value;
  }
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    result[key] = anonymizeProjectValue(child, mapping, key, value);
  }
  return result;
}

function anonymizeFeatureSummary(feature, mapping) {
  if (!feature) return feature;
  const result = { ...feature };

  if (result.key) result.key = mapping.anonymizeJiraKey(result.key);
  if (result.summary) result.summary = mapping.anonymizeIssueSummary(result.key || result.summary);

  return result;
}

function anonymizeFeatureDetail(feature, mapping) {
  if (!feature) return feature;
  const result = { ...feature };

  if (result.key) result.key = mapping.anonymizeJiraKey(result.key);
  if (result.summary) result.summary = mapping.anonymizeIssueSummary(result.key || result.summary);

  if (Array.isArray(result.epics)) {
    result.epics = result.epics.map(epic => {
      const e = { ...epic };
      if (e.key) e.key = mapping.anonymizeJiraKey(e.key);
      if (e.summary) e.summary = mapping.anonymizeIssueSummary(e.key || e.summary);
      if (e.assignee) e.assignee = mapping.getOrCreateNameMapping(e.assignee);
      if (e.accountId) e.accountId = mapping.getOrCreateAccountIdMapping(e.accountId);
      return e;
    });
  }

  return result;
}

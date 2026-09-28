/**
 * Project-qualified AI provenance reads for the AI module.
 *
 * Reads one published AI provenance artifact through the data-backed profile
 * reader. The OSAC autofix pipeline routes never fall back between projects.
 */

const ARTIFACT_KEY = 'sources/ai-provenance/registry.json'

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readProjectProvenance(projects, projectId) {
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
    artifact = projects.readArtifact(projectId, ARTIFACT_KEY);
  } catch (error) {
    return { status: 502, error: error.message };
  }
  if (!artifact || !isRecord(artifact.value)) {
    return { status: 404, error: 'Project AI provenance publication is unavailable' };
  }

  const envelope = artifact.value;
  const generatedAt = typeof envelope.generatedAt === 'string' ? envelope.generatedAt : null;
  if (envelope.schemaVersion !== 1
      || envelope.projectId !== projectId
      || envelope.artifactKey !== ARTIFACT_KEY
      || !isRecord(envelope.data)
      || envelope.data.projectId !== projectId) {
    return { status: 502, error: 'Project AI provenance publication identity mismatch' };
  }

  return {
    status: 200,
    provenance: {
      projectId,
      state: envelope.state,
      freshness: envelope.freshness,
      partial: envelope.partial === true,
      error: envelope.error || null,
      publication: {
        generatedAt,
        fetchedAt: envelope.fetchedAt || null,
        observedAt: envelope.observedAt || null,
        attemptedAt: envelope.attemptedAt || null,
        publishedAt: envelope.publishedAt || null,
        source: envelope.source || null,
        lastKnownGood: envelope.lastKnownGood || null
      },
      data: envelope.data
    }
  };
}

module.exports = { ARTIFACT_KEY, readProjectProvenance };

/**
 * Project-qualified build registry reads for Product Builds.
 *
 * The artifact key comes from the published profile's capabilities block, so
 * every project configures its own build evidence. A non-OSAC project never
 * receives AIPCC dashboard data.
 */

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function capabilityArtifactKey(profile, capability) {
  const entry = profile?.capabilities?.[capability];
  if (!isRecord(entry) || typeof entry.artifactKey !== 'string' || !entry.artifactKey) {
    return null;
  }
  return entry.artifactKey;
}

function readProjectPublication(projects, projectId, capability) {
  if (!projects || typeof projects.get !== 'function' || typeof projects.readArtifact !== 'function') {
    return { status: 503, error: 'Project publication reader is unavailable' };
  }

  let profile;
  try {
    profile = projects.get(projectId);
  } catch (error) {
    return { status: 500, error: error.message };
  }
  if (!profile) return { status: 404, error: 'Unknown project' };

  const capabilityEntry = profile.capabilities?.[capability];
  if (!isRecord(capabilityEntry) || capabilityEntry.state !== 'supported') {
    return { status: 200, publication: { projectId, state: 'unavailable', reason: 'capability-not-supported', data: null } };
  }

  const artifactKey = capabilityArtifactKey(profile, capability);
  if (!artifactKey) {
    return { status: 502, error: `Profile capability ${capability} is missing its artifactKey` };
  }

  let artifact;
  try {
    artifact = projects.readArtifact(projectId, artifactKey);
  } catch (error) {
    return { status: 502, error: error.message };
  }
  if (!artifact || !isRecord(artifact.value)) {
    return { status: 404, error: `Project publication ${artifactKey} is unavailable` };
  }

  const envelope = artifact.value;
  const generatedAt = typeof envelope.generatedAt === 'string' ? envelope.generatedAt : null;
  if (envelope.schemaVersion !== 1
      || envelope.projectId !== projectId
      || envelope.artifactKey !== artifactKey
      || !isRecord(envelope.data)
      || envelope.data.projectId !== projectId) {
    return { status: 502, error: 'Project publication identity mismatch' };
  }

  return {
    status: 200,
    publication: {
      projectId,
      state: envelope.state,
      freshness: envelope.freshness,
      partial: envelope.partial === true,
      error: envelope.error || null,
      artifactKey,
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

module.exports = { readProjectPublication, capabilityArtifactKey };

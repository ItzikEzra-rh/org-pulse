/**
 * Project design-docs presence for Documentation.
 *
 * Reads the project-qualified design-docs publication (feature presence,
 * artifact counts, design PRs) through the data-backed profile reader.
 */

const ARTIFACT_KEY = 'sources/design-docs/registry.json'

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * @param {object} projects - data-backed project publication reader
 * @param {string} projectId
 */
function readProjectDesignDocs(projects, projectId) {
  if (!projects || typeof projects.readArtifact !== 'function') {
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
    return { status: 404, error: 'Design-docs publication is unavailable' };
  }

  const envelope = artifact.value;
  if (envelope.schemaVersion !== 1
      || envelope.projectId !== projectId
      || !isRecord(envelope.data)) {
    return { status: 502, error: 'Design-docs publication identity mismatch' };
  }

  const generatedAt = typeof envelope.generatedAt === 'string' ? envelope.generatedAt : null;
  return {
    status: 200,
    designDocs: {
      projectId,
      state: envelope.state,
      freshness: envelope.freshness,
      partial: envelope.partial === true,
      publication: { state: envelope.state, freshness: envelope.freshness, generatedAt },
      data: envelope.data
    }
  };
}

module.exports = { ARTIFACT_KEY, readProjectDesignDocs };

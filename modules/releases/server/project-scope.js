const { resolveProjectSelection } = require('../../../shared/server/project-profile')

/**
 * Resolve release data scope while keeping legacy single-project installs working.
 * An unqualified request may use the legacy OSAC store when no profiles have
 * been published. Profile-aware deployments must identify their project.
 */
function resolveReleaseProject(projects, query) {
  const selection = resolveProjectSelection(projects, query)
  if (selection.status && !projects && query?.projectId === 'osac') {
    return { provided: true, projectId: 'osac', legacy: true }
  }
  if (selection.status) return selection

  // Explicit project selection is valid only when the project is part of the
  // published, revision-checked index. A loose profile file must not make an
  // unpublished project look selectable.
  if (selection.provided && projects && typeof projects.list === 'function') {
    try {
      const profiles = projects.list()
      if (!Array.isArray(profiles)) {
        return { provided: true, status: 503, error: 'Project profiles cannot be listed' }
      }
      const profile = profiles.find(item => item.projectId === selection.projectId)
      if (!profile) return { provided: true, status: 404, error: 'Unknown project' }
      return { ...selection, profile }
    } catch (error) {
      return { provided: true, status: 503, error: error.message || 'Project profiles are unavailable' }
    }
  }
  if (selection.status || selection.provided) return selection

  if (!projects) {
    return { provided: false, projectId: 'osac', legacy: true }
  }
  if (typeof projects.list !== 'function') {
    return { status: 503, error: 'Project profiles cannot be listed' }
  }

  let profiles
  try {
    profiles = projects.list()
  } catch (error) {
    return { status: 503, error: error.message || 'Project profiles are unavailable' }
  }
  if (!Array.isArray(profiles)) {
    return { status: 503, error: 'No project profiles are available' }
  }
  if (profiles.length === 0) {
    return { provided: false, projectId: 'osac', legacy: true }
  }
  if (profiles.length > 1) {
    return { status: 400, error: 'projectId is required' }
  }

  return {
    provided: false,
    projectId: profiles[0].projectId,
    profile: profiles[0],
    inferred: true
  }
}

function sendProjectScopeError(res, selection) {
  if (!selection || !selection.status) return false
  res.status(selection.status).json({
    projectId: null,
    state: 'unavailable',
    reason: selection.status === 400 ? 'project-selection-required' : 'project-profile-unavailable',
    error: selection.error
  })
  return true
}

function unavailableProjectData(projectId, capability, message) {
  return {
    projectId,
    state: 'unavailable',
    reason: 'not-collected',
    capability,
    freshness: 'unknown',
    fetchedAt: null,
    message
  }
}

module.exports = {
  resolveReleaseProject,
  sendProjectScopeError,
  unavailableProjectData
}

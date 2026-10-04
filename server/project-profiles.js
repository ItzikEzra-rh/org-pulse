/**
 * Published project-profile access for the server.
 *
 * Profile values are supplied by org-pulse-data under storage/projects. The
 * server deliberately has no project list or source configuration of its own.
 */

const { createProjectProfileReader } = require('../shared/server/project-profile')

function createServerProjectProfiles(storage) {
  return createProjectProfileReader(storage)
}

function createProjectListHandler(projectProfiles) {
  return function listPublishedProjects(_req, res) {
    try {
      const projects = projectProfiles.list().map(function (profile) {
        return { projectId: profile.projectId, displayName: profile.displayName }
      })
      return res.json({ projects })
    } catch (error) {
      console.error('[projects] Failed to list published projects:', error.message)
      const discoveryUnavailable = error.name === 'ProjectProfileIndexError'
      return res.status(discoveryUnavailable ? 503 : 500).json({
        error: 'Failed to list published projects',
        code: discoveryUnavailable ? error.code : 'PROJECT_LIST_FAILED'
      })
    }
  }
}

module.exports = { createServerProjectProfiles, createProjectListHandler }

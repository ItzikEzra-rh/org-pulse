/**
 * Published project-profile access for the server.
 *
 * Profile values are supplied by org-pulse-data under storage/projects. The
 * server deliberately has no project list or source configuration of its own.
 */

const { createProjectProfileReader } = require('../shared/server/project-profile')

module.exports = function createServerProjectProfiles(storage) {
  return createProjectProfileReader(storage)
}

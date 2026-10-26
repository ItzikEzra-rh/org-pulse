/**
 * Project scoping for built-in modules.
 *
 * A module that declares `client.projectIds` applies only to the listed shell
 * projects. An empty project ID is legacy single-project mode, where every
 * module keeps its today behavior and stays available.
 */
export function projectIdsAllow(projectIds, projectId) {
  if (!Array.isArray(projectIds) || projectIds.length === 0) return true
  if (!projectId) return true
  return projectIds.includes(projectId)
}

export function moduleAppliesToProject(manifest, projectId) {
  return projectIdsAllow(manifest?.client?.projectIds, projectId)
}

export function filterModulesForProject(manifests, projectId) {
  return (manifests || []).filter((manifest) => moduleAppliesToProject(manifest, projectId))
}

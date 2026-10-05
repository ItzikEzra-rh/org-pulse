const { resolveReleaseProject, sendProjectScopeError, unavailableProjectData } = require('../project-scope');


module.exports = function registerExecutionEvidenceRoutes(router, context) {
  /**
   * @openapi
   * /api/modules/releases/execution/evidence:
   *   get:
   *     summary: Read project-qualified bounded release execution evidence
   *     tags: [Releases]
   *     parameters:
   *       - in: query
   *         name: projectId
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Source envelope with releases, workflow runs, jobs and artifacts
   *       400:
   *         description: Project selection required or invalid
   *       404:
   *         description: Unknown project
   *       503:
   *         description: Publication reader or valid project evidence unavailable
   */
  router.get('/evidence', context.requireAuth, context.requireScope('releases:read'), (req, res) => {
    const selection = resolveReleaseProject(context.projects, req.query);
    if (sendProjectScopeError(res, selection)) return;
    const projectId = selection.projectId;
    if (!context.projects || typeof context.projects.readArtifact !== 'function') {
      return res.status(503).json({ error: 'Project publication reader is unavailable' });
    }
    try {
      const capability = selection.profile?.capabilities?.releaseExecution;
      if (!capability?.artifactKey || !['supported', 'empty'].includes(capability.state)) {
        return res.json({ ...unavailableProjectData(projectId, 'release-execution', capability?.reason || 'Release execution evidence is not configured for this project.'), state: capability?.state || 'unavailable' });
      }
      const artifact = context.projects.readArtifact(projectId, capability.artifactKey);
      const envelope = artifact?.value;
      if (!envelope) {
        return res.json(unavailableProjectData(projectId, 'release-execution', 'Release execution evidence has not been collected for this project.'));
      }
      if (envelope.projectId !== projectId || (envelope.data && envelope.data.projectId !== projectId)) {
        return res.status(503).json({ projectId, error: 'Release execution publication project identity mismatch' });
      }
      return res.json({ ...envelope, projectDisplayName: selection.profile?.displayName || projectId });
    } catch (error) {
      return res.status(503).json({ projectId, error: error.message || 'Release execution publication is unavailable' });
    }
  });
};

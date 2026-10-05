module.exports = function registerRoutes(router, context) {
  const { storage, requireAdmin, requireScope } = context;
  const { readFromStorage, writeToStorage } = storage;
  const { resolveProjectSelection } = require('../../../shared/server/project-profile');
  const { readProjectProvenance } = require('./project-provenance');
  const { readProjectDesignDocs } = require('./project-design-docs');
  const {
    resolveAiCommitsSource,
    transformAiCommitsHtml,
    renderAiCommitsStatePage
  } = require('./ai-commits-source');

  // The OSAC autofix/EP-review/doc pipeline routes are OSAC-only data sources
  // when a project has no project-qualified artifact: a non-OSAC project never
  // receives OSAC pipeline data. When the project's own pipeline published a
  // project-qualified artifact (e.g. the profile-driven autofix or EP-review
  // collectors), that data is served instead — never an OSAC fallback.
  function osacOnlyDataGuard(req, res) {
    const selection = resolveProjectSelection(context.projects, req.query);
    if (!selection.provided) return false;
    if (selection.status) {
      res.status(selection.status).json({ error: selection.error });
      return true;
    }
    if (selection.projectId !== 'osac') {
      res.status(200).json({
        projectId: selection.projectId,
        state: 'unavailable',
        reason: 'osac-only-data-source',
        data: null
      });
      return true;
    }
    return false;
  }

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  // Read one published project-qualified artifact for a non-OSAC project.
  // Returns the envelope only when the identity fully matches; never an
  // OSAC fallback, never a guess.
  function readProjectArtifactData(req, artifactKey) {
    const projectId = req.query?.projectId;
    if (!projectId || projectId === 'osac') return null;
    const projects = context.projects;
    if (!projects || typeof projects.readArtifact !== 'function') return null;
    let artifact;
    try {
      artifact = projects.readArtifact(projectId, artifactKey);
    } catch {
      return null;
    }
    if (!artifact || !isPlainObject(artifact.value)) return null;
    const envelope = artifact.value;
    if (envelope.schemaVersion !== 1
        || envelope.projectId !== projectId
        || envelope.artifactKey !== artifactKey
        || !isPlainObject(envelope.data)
        || envelope.data.projectId !== projectId) {
      return null;
    }
    return envelope;
  }

  // Register module scopes
  context.registerScopes([
    { key: 'ai-impact:read', label: 'AI Impact (Read)', description: 'Read AI impact data', category: 'AI Impact' },
    { key: 'ai-impact:write', label: 'AI Impact (Write)', description: 'Push/clear AI impact data', category: 'AI Impact' }
  ]);

  const DEMO_MODE = process.env.DEMO_MODE === 'true';

  // Jira helpers from shared package (no duplication)
  const https = require('https');
  const { createJiraClient } = require('../../../shared/server/jira');
  const jira = createJiraClient({
    email: (context.secrets && context.secrets.JIRA_EMAIL) || '',
    token: (context.secrets && context.secrets.JIRA_TOKEN) || '',
    host: process.env.JIRA_HOST
  });
  const { jiraRequest, JIRA_HOST } = jira;

  const { fetchRFEData } = require('./jira/rfe-fetcher');
  const { resolveLinkedFeatures } = require('./jira/link-resolver');
  const { getConfig, saveConfig } = require('./config');
  const { computeAllMetrics } = require('./metrics');
  const { fetchAutofixData, computeAutofixMetrics, buildTrendData: buildAutofixTrend } = require('./jira/autofix-fetcher');
  const { fetchDocData, fetchDocActivityEvents, fetchDocCumulativeStats, fetchDocCompletedData, computeDocMetrics, buildDocTrendData, resolveMRLinksFromKpiData } = require('./jira/doc-fetcher');
  const mrStatus = require('./mr-status');
  const { enrichMRStatuses } = mrStatus;

  // Initialize sub-modules with secrets
  mrStatus.init(context.secrets);
  const { fetchMrKpiData } = require('./gitlab/mr-kpi-fetcher');

  // Assessment routes (Phase 1: Storage + Ingest API)
  const registerAssessmentRoutes = require('./assessments/routes');
  registerAssessmentRoutes(router, context, osacOnlyDataGuard);

  // Feature review routes
  const registerFeatureRoutes = require('./features/routes');
  registerFeatureRoutes(router, context, osacOnlyDataGuard);

  // Test plan routes
  const registerTestPlanRoutes = require('./test-plans/routes');
  registerTestPlanRoutes(router, context, osacOnlyDataGuard);

  // Component onboarding routes
  const registerComponentOnboardingRoutes = require('./component-onboarding/routes');
  registerComponentOnboardingRoutes(router, context, osacOnlyDataGuard);

  // ─── Refresh state (in-memory) ───

  const refreshState = {
    running: false,
    startedAt: null,
    lastResult: null
  };

  // ─── Routes ───

  const VALID_TIME_WINDOWS = ['week', 'month', '3months'];

  /**
   * @openapi
   * /modules/ai-impact/rfe-data:
   *   get:
   *     summary: RFE data with computed metrics and pipeline friction
   *     tags: [ai-impact]
   *     parameters:
   *       - in: query
   *         name: timeWindow
   *         schema:
   *           type: string
   *           enum: [week, month, 3months]
   *           default: month
   *         description: Time window for metric computation
   *     responses:
   *       200:
   *         description: RFE dataset with metrics, trend data, breakdown, and pipeline friction
   */
  router.get('/rfe-data', requireScope('ai-impact:read'), function(req, res) {
    const projectEnvelope = readProjectArtifactData(req, 'sources/ep-review/rfe-data.json');
    if (projectEnvelope) {
      const projectTimeWindow = VALID_TIME_WINDOWS.includes(req.query.timeWindow)
        ? req.query.timeWindow
        : 'month';
      const config = getConfig(readFromStorage);
      const projectIssues = projectEnvelope.data.issues || [];
      // Keep unknown rows in the list, but out of PRD adoption and sign-off
      // metrics until the source can verify whether a linked PRD exists.
      const metricIssues = projectIssues.filter(issue => issue.status !== 'Unknown');
      const computed = computeAllMetrics(metricIssues, projectTimeWindow, config);
      return res.json({
        projectId: projectEnvelope.projectId,
        state: projectEnvelope.state,
        freshness: projectEnvelope.freshness,
        partial: projectEnvelope.partial === true,
        error: projectEnvelope.error || null,
        fetchedAt: projectEnvelope.generatedAt,
        jiraHost: JIRA_HOST,
        metrics: computed.metrics,
        trendData: computed.trendData,
        breakdown: computed.breakdown,
        pipelineFriction: computed.pipelineFriction,
        issues: projectIssues
      });
    }
    if (osacOnlyDataGuard(req, res)) return;
    const timeWindow = VALID_TIME_WINDOWS.includes(req.query.timeWindow)
      ? req.query.timeWindow
      : 'month';

    const data = readFromStorage('ai-impact/rfe-data.json');
    if (!data || !data.issues) {
      return res.json({
        fetchedAt: null,
        jiraHost: JIRA_HOST,
        metrics: { createdPct: 0, createdChange: 0, trend: 'stable', revisedCount: 0, priorRevisedCount: 0, windowTotal: 0, totalRFEs: 0 },
        trendData: [],
        breakdown: [],
        pipelineFriction: { needsAttentionPct: 0, needsAttentionChange: 0, needsAttentionTrend: 'stable', feasibilityBlockedPct: 0, feasibilityBlockedChange: 0, feasibilityBlockedTrend: 'stable' },
        issues: []
      });
    }

    // Compute metrics server-side from cached issues
    const config = getConfig(readFromStorage);
    const { metrics, trendData, breakdown, pipelineFriction } = computeAllMetrics(data.issues, timeWindow, config);

    res.json({
      fetchedAt: data.fetchedAt,
      jiraHost: JIRA_HOST,
      metrics,
      trendData,
      breakdown,
      pipelineFriction,
      issues: data.issues
    });
  });

  // ─── Autofix data ───

  const VALID_AUTOFIX_TIME_WINDOWS = ['week', 'lastWeek', 'month', '3months'];

  let autofixDataCache = null;

  function getAutofixData() {
    if (!autofixDataCache) {
      autofixDataCache = readFromStorage('ai-impact/autofix-data.json');
    }
    return autofixDataCache;
  }

  function invalidateAutofixCache() {
    autofixDataCache = null;
  }

  function stripIssueFields(issue) {
    return {
      key: issue.key,
      summary: issue.summary,
      status: issue.status,
      issueType: issue.issueType,
      priority: issue.priority,
      created: issue.created,
      updated: issue.updated,
      terminalAt: issue.terminalAt || null,
      components: issue.components,
      assignee: issue.assignee,
      pipelineState: issue.pipelineState
    };
  }

  /**
   * @openapi
   * /modules/ai-impact/autofix-data:
   *   get:
   *     summary: Autofix pipeline data with computed metrics and trend
   *     tags: [ai-impact]
   *     parameters:
   *       - in: query
   *         name: timeWindow
   *         schema:
   *           type: string
   *           enum: [week, lastWeek, month, 3months]
   *           default: month
   *         description: Time window for metric computation. lastWeek uses calendar week (Mon-Sun) with terminalAt for resolved issues.
   *       - in: query
   *         name: components
   *         schema:
   *           type: string
   *         description: Comma-separated Jira component names to filter issues by
   *     responses:
   *       200:
   *         description: Autofix dataset with metrics, trend data, and issues
   */
  router.get('/autofix-data', requireScope('ai-impact:read'), function(req, res) {
    const projectEnvelope = readProjectArtifactData(req, 'sources/autofix/issues.json');
    if (projectEnvelope) {
      const projectIssues = projectEnvelope.data.issues || [];
      const projectTimeWindow = VALID_AUTOFIX_TIME_WINDOWS.includes(req.query.timeWindow)
        ? req.query.timeWindow
        : 'month';
      return res.json({
        projectId: projectEnvelope.projectId,
        state: projectEnvelope.state,
        freshness: projectEnvelope.freshness,
        fetchedAt: projectEnvelope.generatedAt,
        jiraHost: JIRA_HOST,
        metrics: computeAutofixMetrics(projectIssues, projectTimeWindow),
        trendData: buildAutofixTrend(projectIssues, projectTimeWindow),
        issues: projectIssues
      });
    }
    if (osacOnlyDataGuard(req, res)) return;
    const timeWindow = VALID_AUTOFIX_TIME_WINDOWS.includes(req.query.timeWindow)
      ? req.query.timeWindow
      : 'month';

    const data = getAutofixData();
    if (!data || !data.issues) {
      return res.json({
        fetchedAt: null,
        jiraHost: JIRA_HOST,
        metrics: { triageTotal: 0, triageVerdicts: {}, autofixStates: {}, autofixTotal: 0, successRate: 0, windowTotal: 0, totalIssues: 0 },
        trendData: [],
        issues: []
      });
    }

    let issues = data.issues;
    if (req.query.components) {
      const componentSet = new Set(
        req.query.components.split(',').map(function(c) { return c.trim(); }).filter(Boolean)
      );
      if (componentSet.size > 0) {
        issues = issues.filter(function(issue) {
          return (issue.components || []).some(function(c) { return componentSet.has(c); });
        });
      }
    }

    const metrics = computeAutofixMetrics(issues, timeWindow);
    const trendData = buildAutofixTrend(issues, timeWindow);

    res.json({
      fetchedAt: data.fetchedAt,
      jiraHost: JIRA_HOST,
      metrics,
      trendData,
      issues: issues.map(stripIssueFields)
    });
  });

  // ─── Documentation data ───

  function shiftDocDates(data) {
    if (!data.fetchedAt) return data;
    const offset = Date.now() - new Date(data.fetchedAt).getTime();
    if (Math.abs(offset) < 60 * 60 * 1000) return data;

    function shift(iso) {
      if (!iso) return iso;
      return new Date(new Date(iso).getTime() + offset).toISOString();
    }

    return {
      ...data,
      fetchedAt: new Date().toISOString(),
      issues: data.issues.map(i => ({
        ...i,
        created: shift(i.created),
        updated: shift(i.updated),
        docContributedDate: shift(i.docContributedDate),
        docInvokedDate: shift(i.docInvokedDate)
      })),
      labelEvents: (data.labelEvents || []).map(e => ({
        ...e,
        date: shift(e.date)
      })),
      activityEvents: (data.activityEvents || []).map(e => ({
        ...e,
        date: shift(e.date)
      }))
    };
  }

  router.get('/doc-data', requireScope('ai-impact:read'), function(req, res) {
    if (osacOnlyDataGuard(req, res)) return;
    const rawData = readFromStorage('ai-impact/doc-data.json');
    if (!rawData || !rawData.issues) {
      return res.json({
        fetchedAt: null,
        jiraHost: JIRA_HOST,
        metrics: { demandCount: 0, coverageCount: 0, coverageRate: 0, invokedCount: 0, totalLabelEvents: 0 },
        trendData: [],
        issues: []
      });
    }

    const data = DEMO_MODE ? shiftDocDates(rawData) : rawData;
    const activity = data.activityEvents || data.labelEvents || [];
    const metrics = computeDocMetrics(data.issues, activity);
    const trendData = buildDocTrendData(data.issues, activity);

    res.json({
      fetchedAt: data.fetchedAt,
      jiraHost: JIRA_HOST,
      metrics,
      trendData,
      issues: data.issues,
      completedIssues: data.completedIssues || [],
      cumulativeStats: data.cumulativeStats || null
    });
  });

  /**
   * @openapi
   * /modules/ai-impact/doc-mr-kpi-data:
   *   get:
   *     summary: MR KPI data fetched directly from GitLab
   *     tags: [ai-impact]
   *     responses:
   *       200:
   *         description: MR KPI data with merge request metrics
   */
  router.get('/doc-mr-kpi-data', requireScope('ai-impact:read'), function(req, res) {
    if (osacOnlyDataGuard(req, res)) return;
    const data = readFromStorage('ai-impact/doc-mr-kpi-data.json');
    if (!data || !data.mergeRequests) {
      return res.json({ fetchedAt: null, mergeRequests: [] });
    }
    res.json(data);
  });

  router.get('/config', requireAdmin, requireScope('ai-impact:write'), function(req, res) {
    res.json(getConfig(readFromStorage));
  });

  router.post('/config', requireAdmin, requireScope('ai-impact:write'), function(req, res) {
    try {
      saveConfig(writeToStorage, req.body);
      res.json({ status: 'saved' });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/cache', requireAdmin, requireScope('ai-impact:write'), function(req, res) {
    writeToStorage('ai-impact/rfe-data.json', null);
    writeToStorage('ai-impact/autofix-data.json', null);
    invalidateAutofixCache();
    writeToStorage('ai-impact/doc-data.json', null);
    writeToStorage('ai-impact/doc-mr-kpi-data.json', null);
    res.json({ status: 'cleared' });
  });

  router.get('/refresh/status', requireScope('ai-impact:read'), function(req, res) {
    res.json(refreshState);
  });

  async function runAiImpactRefresh() {
    if (DEMO_MODE) return;

    const config = getConfig(readFromStorage);

    const issues = await fetchRFEData(jiraRequest, config);
    const withLinks = await resolveLinkedFeatures(jiraRequest, issues, config);
    writeToStorage('ai-impact/rfe-data.json', {
      fetchedAt: new Date().toISOString(),
      issues: withLinks
    });

    let autofixCount = 0;
    try {
      const autofixIssues = await fetchAutofixData(jiraRequest, config);
      writeToStorage('ai-impact/autofix-data.json', {
        fetchedAt: new Date().toISOString(),
        issues: autofixIssues
      });
      invalidateAutofixCache();
      autofixCount = autofixIssues.length;
    } catch (autofixErr) {
      console.error('[ai-impact] Autofix data refresh failed:', autofixErr.message);
    }

    let mrKpiCount = 0;
    let mrKpiData = null;
    try {
      const mrKpiResult = await fetchMrKpiData();
      mrKpiData = {
        fetchedAt: new Date().toISOString(),
        mergeRequests: mrKpiResult.mergeRequests
      };
      writeToStorage('ai-impact/doc-mr-kpi-data.json', mrKpiData);
      mrKpiCount = mrKpiResult.mergeRequests.length;
    } catch (mrKpiErr) {
      console.error('[ai-impact] MR KPI data refresh failed:', mrKpiErr.message);
    }

    let docCount = 0;
    try {
      const docResult = await fetchDocData(jiraRequest, config);
      let completedIssues = [];
      try {
        completedIssues = await fetchDocCompletedData(jiraRequest, config, { mrKpiData });
      } catch (compErr) {
        console.error('[ai-impact] Documentation completed data fetch failed:', compErr.message);
      }
      let activityEvents = [];
      try {
        activityEvents = await fetchDocActivityEvents(jiraRequest, config);
      } catch (actErr) {
        console.error('[ai-impact] Documentation activity events fetch failed:', actErr.message);
      }
      let cumulativeStats = null;
      try {
        cumulativeStats = await fetchDocCumulativeStats(jiraRequest, config);
      } catch (statsErr) {
        console.error('[ai-impact] Documentation cumulative stats fetch failed:', statsErr.message);
      }
      if (mrKpiData) {
        resolveMRLinksFromKpiData(docResult.issues, mrKpiData);
      }
      try {
        await enrichMRStatuses(docResult.issues);
        await enrichMRStatuses(completedIssues);
      } catch (mrErr) {
        console.error('[ai-impact] MR status enrichment failed:', mrErr.message);
      }
      writeToStorage('ai-impact/doc-data.json', {
        fetchedAt: new Date().toISOString(),
        issues: docResult.issues,
        labelEvents: docResult.labelEvents,
        activityEvents,
        completedIssues,
        cumulativeStats
      });
      docCount = docResult.issues.length;
    } catch (docErr) {
      console.error('[ai-impact] Documentation data refresh failed:', docErr.message);
    }

    refreshState.lastResult = {
      status: 'success',
      message: `Fetched ${withLinks.length} PRDs, ${autofixCount} autofix issues, ${docCount} doc issues, ${mrKpiCount} MR KPIs`,
      completedAt: new Date().toISOString()
    };
  }

  router.post('/refresh', requireAdmin, requireScope('ai-impact:write'), async function(req, res) {
    if (DEMO_MODE) {
      return res.json({ status: 'skipped', message: 'Refresh disabled in demo mode' });
    }
    if (refreshState.running || context.isRefreshRunning()) {
      return res.json({ status: 'already_running' });
    }
    refreshState.running = true;
    refreshState.startedAt = new Date().toISOString();
    res.json({ status: 'started' });

    try {
      await runAiImpactRefresh();
    } catch (err) {
      console.error('[ai-impact] Refresh failed:', err);
      refreshState.lastResult = {
        status: 'error',
        message: err.message,
        completedAt: new Date().toISOString()
      };
    } finally {
      refreshState.running = false;
    }
  });

  // ─── Diagnostics ───

  if (context.registerRefresh) {
    context.registerRefresh('refresh', {
      order: 50,
      timeout: 600000,
      description: 'Refreshes AI Impact component assessments and onboarding data from Jira.',
      handler: async function() {
        await runAiImpactRefresh();
      }
    });
  }

  if (context.registerExport) {
    context.registerExport(require('./export'));
  }

  if (context.registerDiagnostics) {
    context.registerDiagnostics(async function() {
      const rfeData = readFromStorage('ai-impact/rfe-data.json');
      const autofixData = readFromStorage('ai-impact/autofix-data.json');
      const docData = readFromStorage('ai-impact/doc-data.json');
      const coData = readFromStorage('ai-impact/component-onboarding-data.json');
      return {
        refreshState,
        rfe: {
          dataExists: !!rfeData,
          issueCount: rfeData?.issues?.length || 0,
          fetchedAt: rfeData?.fetchedAt || null
        },
        autofix: {
          dataExists: !!autofixData,
          issueCount: autofixData?.issues?.length || 0,
          fetchedAt: autofixData?.fetchedAt || null
        },
        documentation: {
          dataExists: !!docData,
          issueCount: docData?.issues?.length || 0,
          fetchedAt: docData?.fetchedAt || null
        },
        componentOnboarding: {
          dataExists: !!coData,
          componentCount: coData?.totalComponents || 0,
          fetchedAt: coData?.fetchedAt || null
        }
      };
    });
  }

  // --- AI Commits Scanner proxy ---

  const aiCommitsCache = new Map();
  const AI_COMMITS_TTL = 60 * 60 * 1000;
  const MAX_REDIRECTS = 5;
  const FETCH_TIMEOUT_MS = 15000;

  function fetchPage(url, redirectCount) {
    if (redirectCount === undefined) redirectCount = 0;
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line org-pulse/no-module-process-env -- NODE_EXTRA_CA_CERTS is Node.js runtime config, not a secret
      const tlsOptions = process.env.NODE_EXTRA_CA_CERTS ? {} : { rejectUnauthorized: false };
      const req = https.get(url, tlsOptions, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirectCount >= MAX_REDIRECTS) return reject(new Error('Too many redirects'));
          const nextUrl = new URL(res.headers.location, url).toString();
          res.resume();
          return resolve(fetchPage(nextUrl, redirectCount + 1));
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          return reject(new Error(`Upstream returned ${res.statusCode}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.setTimeout(FETCH_TIMEOUT_MS, () => {
        req.destroy(new Error('Upstream request timed out'));
      });
    });
  }

  /**
   * @openapi
   * /api/modules/ai-impact/ai-commits-proxy:
   *   get:
   *     summary: Proxy the selected project's AI Commits Scanner report
   *     tags: [ai-impact]
   *     parameters:
   *       - in: query
   *         name: projectId
   *         required: false
   *         description: Required in multi-project deployments.
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Project-qualified HTML report or explicit unavailable state
   *       404:
   *         description: Unknown project
   */
  // Project-qualified AI provenance: real evidence per published project
  // (scanner totals, source markers, provenance footers) from the data repo's
  // collectors. Never falls back between projects.
  router.get('/project-provenance', requireScope('ai-impact:read'), function(req, res) {
    const selection = resolveProjectSelection(context.projects, req.query);
    if (!selection.provided) return res.status(400).json({ error: 'projectId is required' });
    if (selection.status) return res.status(selection.status).json({ error: selection.error });
    try {
      const result = readProjectProvenance(context.projects, selection.projectId);
      if (result.status !== 200) return res.status(result.status).json({ error: result.error });
      return res.json(result.provenance);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  // Project-qualified design-docs presence: feature/artifact counts and
  // design PRs from the data repo's design-docs collector. Never falls back
  // between projects.
  /**
   * @openapi
   * /api/modules/ai-impact/project-design-docs:
   *   get:
   *     tags: [AI Impact]
   *     summary: Read published design-doc evidence for a project
   *     parameters:
   *       - in: query
   *         name: projectId
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Project-qualified design-doc presence and PR evidence
   *       400:
   *         description: Missing or invalid project ID
   *       404:
   *         description: Unknown project or publication
   */
  router.get('/project-design-docs', requireScope('ai-impact:read'), function(req, res) {
    const selection = resolveProjectSelection(context.projects, req.query);
    if (!selection.provided) return res.status(400).json({ error: 'projectId is required' });
    if (selection.status) return res.status(selection.status).json({ error: selection.error });
    try {
      const result = readProjectDesignDocs(context.projects, selection.projectId);
      if (result.status !== 200) return res.status(result.status).json({ error: result.error });
      return res.json(result.designDocs);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.get('/ai-commits-proxy', requireScope('ai-impact:read'), async function(req, res) {
    const source = resolveAiCommitsSource(context.projects, req.query);
    if (source.status !== 200 || source.state === 'unavailable') {
      const status = source.status === 200 ? 200 : source.status;
      const message = source.reason || source.error || 'No AI Commits scanner is configured for this project.';
      res.status(status);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      if (source.state) res.setHeader('X-OrgPulse-State', source.state);
      return res.send(renderAiCommitsStatePage({
        title: source.state === 'unavailable'
          ? `AI Commits unavailable for ${source.displayName}`
          : 'AI Commits project unavailable',
        message
      }));
    }

    const { url: aiCommitsUrl, projectId } = source;
    try {
      const now = Date.now();
      const cached = aiCommitsCache.get(aiCommitsUrl);
      if (!cached || now - cached.fetchedAt > AI_COMMITS_TTL) {
        const html = transformAiCommitsHtml(
          await fetchPage(aiCommitsUrl),
          aiCommitsUrl,
          projectId
        );
        aiCommitsCache.set(aiCommitsUrl, { html, fetchedAt: now });
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval' https:; frame-ancestors 'self'");
      res.setHeader('X-OrgPulse-Project-Id', projectId);
      res.send(aiCommitsCache.get(aiCommitsUrl).html);
    } catch (err) {
      console.error('[ai-commits-proxy]', err.message);
      res.redirect(aiCommitsUrl);
    }
  });
};

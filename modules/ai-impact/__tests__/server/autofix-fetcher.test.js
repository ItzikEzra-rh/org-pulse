import { describe, it, expect } from 'vitest'

const {
  classifyIssue,
  processIssue,
  extractTerminalAt,
  getLastWeekBounds,
  computeAutofixMetrics,
  buildTrendData,
  AUTOFIX_LABELS
} = require('../../server/jira/autofix-fetcher')

describe('classifyIssue', () => {
  it('returns autofix-merged for jira-autofix-merged', () => {
    expect(classifyIssue(['jira-autofix-merged', 'jira-autofix'])).toBe('autofix-merged')
  })

  it('returns autofix-rejected for jira-autofix-rejected', () => {
    expect(classifyIssue(['jira-autofix-rejected'])).toBe('autofix-rejected')
  })

  it('returns autofix-max-retries for jira-autofix-max-retries', () => {
    expect(classifyIssue(['jira-autofix-max-retries'])).toBe('autofix-max-retries')
  })

  it('returns autofix-ci-failing for jira-autofix-ci-failing', () => {
    expect(classifyIssue(['jira-autofix-ci-failing'])).toBe('autofix-ci-failing')
  })

  it('returns autofix-review when jira-autofix-review is present', () => {
    expect(classifyIssue(['jira-autofix-review'])).toBe('autofix-review')
  })

  it('returns autofix-pending when jira-autofix-pending is present', () => {
    expect(classifyIssue(['jira-autofix-pending'])).toBe('autofix-pending')
  })

  it('returns autofix-blocked for jira-autofix-blocked', () => {
    expect(classifyIssue(['jira-autofix-blocked'])).toBe('autofix-blocked')
  })

  it('returns autofix-ready when jira-autofix is present and status is New', () => {
    expect(classifyIssue(['jira-autofix'], 'New')).toBe('autofix-ready')
  })

  it('returns autofix-ready when jira-autofix-candidate is present and status is New', () => {
    expect(classifyIssue(['jira-autofix-candidate'], 'New')).toBe('autofix-ready')
  })

  it('treats jira-autofix-candidate the same as jira-autofix for human assignment', () => {
    expect(classifyIssue(['jira-autofix-candidate'], 'In Progress', 'Jane Doe'))
      .toBe('triage-human-assigned')
  })

  it('does not return human-assigned for a candidate assigned to the bot', () => {
    expect(classifyIssue(['jira-autofix-candidate'], 'In Progress', 'osac-dev-bot'))
      .toBe('unknown')
  })

  it('lets progress labels win over jira-autofix-candidate', () => {
    expect(classifyIssue(['jira-autofix-candidate', 'jira-autofix-review'], 'New'))
      .toBe('autofix-review')
  })

  it('returns unknown when jira-autofix is present but status is not New', () => {
    expect(classifyIssue(['jira-autofix'], 'In Progress')).toBe('unknown')
    expect(classifyIssue(['jira-autofix'])).toBe('unknown')
  })

  it('returns triage-not-fixable for jira-triage-not-fixable', () => {
    expect(classifyIssue(['jira-triage-not-fixable'])).toBe('triage-not-fixable')
  })

  it('returns triage-stale for jira-triage-stale', () => {
    expect(classifyIssue(['jira-triage-stale'])).toBe('triage-stale')
  })

  it('returns triage-missing-info for jira-triage-missing-info', () => {
    expect(classifyIssue(['jira-triage-missing-info'])).toBe('triage-missing-info')
  })

  it('returns triage-pending for jira-triage-pending', () => {
    expect(classifyIssue(['jira-triage-pending'])).toBe('triage-pending')
  })

  it('returns triage-external for jira-triage-external', () => {
    expect(classifyIssue(['jira-triage-external'])).toBe('triage-external')
  })

  it('returns triage-security-review for jira-triage-security-review', () => {
    expect(classifyIssue(['jira-triage-security-review'])).toBe('triage-security-review')
  })

  it('prioritizes triage-security-review over other triage states', () => {
    expect(classifyIssue(['jira-triage-not-fixable', 'jira-triage-security-review'])).toBe('triage-security-review')
  })

  it('returns unknown when no pipeline labels present', () => {
    expect(classifyIssue(['some-other-label'])).toBe('unknown')
  })

  it('prioritizes autofix-merged over other labels', () => {
    expect(classifyIssue(['jira-autofix-merged', 'jira-autofix-review', 'jira-autofix'])).toBe('autofix-merged')
  })

  it('prioritizes autofix-blocked over autofix-pending when both present', () => {
    expect(classifyIssue(['jira-autofix', 'jira-autofix-pending', 'jira-autofix-blocked'])).toBe('autofix-blocked')
  })

  it('returns triage-human-assigned for jira-autofix bug with human assignee', () => {
    expect(classifyIssue(['jira-autofix'], 'In Progress', 'Jane Doe')).toBe('triage-human-assigned')
  })

  it('does not return human-assigned for bot assignees', () => {
    expect(classifyIssue(['jira-autofix'], 'In Progress', 'osac-dev-bot')).toBe('unknown')
  })

  it('does not return human-assigned without jira-autofix label', () => {
    expect(classifyIssue([], 'Open', 'Jane Doe')).toBe('unknown')
    expect(classifyIssue(['jira-triage-stale'], 'Open', 'Jane Doe')).toBe('triage-stale')
  })

  it('autofix sub-state labels take priority over human assignee', () => {
    expect(classifyIssue(['jira-autofix-review'], 'In Progress', 'Jane Doe')).toBe('autofix-review')
  })

  it('returns unknown for unlabeled bug without assignee', () => {
    expect(classifyIssue([], 'Open', null)).toBe('unknown')
  })

  it('security-review takes precedence over human assignee', () => {
    expect(classifyIssue(['jira-autofix', 'jira-triage-security-review'], 'Open', 'Jane Doe')).toBe('triage-security-review')
  })
})

describe('AUTOFIX_LABELS', () => {
  it('includes jira-autofix-candidate so candidate tickets are fetched from Jira', () => {
    expect(AUTOFIX_LABELS).toContain('jira-autofix-candidate')
  })
})

describe('processIssue', () => {
  it('extracts fields from a Jira issue', () => {
    const issue = {
      key: 'AIPCC-123',
      fields: {
        summary: 'Fix the thing',
        status: { name: 'In Progress' },
        priority: { name: 'Major' },
        created: '2026-04-16T10:00:00.000Z',
        updated: '2026-04-17T10:00:00.000Z',
        labels: ['jira-autofix-review'],
        components: [{ name: 'Model Server' }],
        assignee: { displayName: 'Jane Doe' }
      }
    }

    const result = processIssue(issue)
    expect(result.key).toBe('AIPCC-123')
    expect(result.summary).toBe('Fix the thing')
    expect(result.status).toBe('In Progress')
    expect(result.components).toEqual(['Model Server'])
    expect(result.assignee).toBe('Jane Doe')
    expect(result.pipelineState).toBe('autofix-review')
    expect(result.terminalAt).toBeNull()
  })

  it('handles missing optional fields', () => {
    const issue = {
      key: 'AIPCC-999',
      fields: {
        summary: 'Minimal issue',
        status: null,
        priority: null,
        created: '2026-04-16T10:00:00.000Z',
        updated: null,
        labels: ['jira-triage-pending'],
        components: [],
        assignee: null
      }
    }

    const result = processIssue(issue)
    expect(result.status).toBe('Unknown')
    expect(result.priority).toBe('None')
    expect(result.components).toEqual([])
    expect(result.assignee).toBeNull()
    expect(result.pipelineState).toBe('triage-pending')
  })
})

describe('computeAutofixMetrics', () => {
  const now = new Date()
  const recent = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString()
  const old = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString()

  const issues = [
    { created: recent, pipelineState: 'autofix-merged', components: ['A'] },
    { created: recent, pipelineState: 'autofix-review', components: ['A'] },
    { created: recent, pipelineState: 'autofix-rejected', components: ['A'] },
    { created: recent, pipelineState: 'triage-missing-info', components: ['B'] },
    { created: recent, pipelineState: 'triage-not-fixable', components: ['B'] },
    { created: recent, pipelineState: 'triage-external', components: ['B'] },
    { created: recent, pipelineState: 'triage-security-review', components: ['B'] },
    { created: old, pipelineState: 'autofix-merged', components: ['A'] }
  ]

  it('computes metrics for a week window', () => {
    const m = computeAutofixMetrics(issues, 'week')
    expect(m.windowTotal).toBe(7)
    expect(m.triageVerdicts.ready).toBe(3)
    expect(m.triageVerdicts.missingInfo).toBe(1)
    expect(m.triageVerdicts.notFixable).toBe(1)
    expect(m.triageVerdicts.external).toBe(1)
    expect(m.triageVerdicts.securityReview).toBe(1)
    expect(m.autofixStates.merged).toBe(1)
    expect(m.autofixStates.review).toBe(1)
    expect(m.autofixStates.rejected).toBe(1)
    expect(m.totalIssues).toBe(8)
  })

  it('computes success rate from terminal states (merged / (merged + rejected + maxRetries))', () => {
    const m = computeAutofixMetrics(issues, 'week')
    // merged=1, rejected=1, maxRetries=0 → terminal=2, successRate = 1/2 = 50%
    expect(m.successRate).toBe(50)
  })

  it('returns zero success rate when no terminal autofix issues in window', () => {
    const m = computeAutofixMetrics([], 'week')
    expect(m.successRate).toBe(0)
  })

  describe('eligibility rate', () => {
    const now = new Date()
    const recent = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString()

    it('counts issues with autofix-* pipeline state as eligible', () => {
      const issues = [
        { created: recent, labels: ['jira-autofix-merged', 'other-label'], pipelineState: 'autofix-merged' },
        { created: recent, labels: ['jira-autofix-review'], pipelineState: 'autofix-review' },
        { created: recent, labels: ['jira-triage-not-fixable'], pipelineState: 'triage-not-fixable' }
      ]
      const m = computeAutofixMetrics(issues, 'week')
      expect(m.eligibleCount).toBe(2)
      expect(m.windowTotal).toBe(3)
      expect(m.eligibilityRate).toBe(67) // 2/3 = 66.666... rounds to 67
    })

    it('counts issues with autofix-* pipeline state regardless of labels', () => {
      const issues = [
        { created: recent, labels: ['jira-autofix-merged'], pipelineState: 'autofix-merged' },
        { created: recent, labels: ['jira-autofix'], pipelineState: 'autofix-ready' },
        { created: recent, labels: ['jira-triage-pending'], pipelineState: 'triage-pending' }
      ]
      const m = computeAutofixMetrics(issues, 'week')
      expect(m.eligibleCount).toBe(2) // Both autofix-merged and autofix-ready count
      expect(m.windowTotal).toBe(3)
      expect(m.eligibilityRate).toBe(67) // 2/3 = 66.666... rounds to 67
    })

    it('includes non-autofix issues in denominator but not numerator', () => {
      const issues = [
        { created: recent, labels: ['jira-autofix'], pipelineState: 'autofix-ready' },
        { created: recent, labels: ['other-label'], pipelineState: 'unknown' },
        { created: recent, labels: ['jira-triage-stale'], pipelineState: 'triage-stale' }
      ]
      const m = computeAutofixMetrics(issues, 'week')
      expect(m.eligibleCount).toBe(1)
      expect(m.windowTotal).toBe(3)
      expect(m.eligibilityRate).toBe(33)
    })

    it('counts jira-autofix-candidate issues as eligible', () => {
      const issues = [
        { created: recent, labels: ['jira-autofix-candidate'], pipelineState: 'triage-human-assigned' },
        { created: recent, labels: ['jira-triage-not-fixable'], pipelineState: 'triage-not-fixable' }
      ]
      const m = computeAutofixMetrics(issues, 'week')
      expect(m.eligibleCount).toBe(1)
    })

    it('returns 0% when window is empty', () => {
      const m = computeAutofixMetrics([], 'week')
      expect(m.eligibleCount).toBe(0)
      expect(m.windowTotal).toBe(0)
      expect(m.eligibilityRate).toBe(0)
    })

    it('returns 0% when no issues have autofix-* pipeline state', () => {
      const issues = [
        { created: recent, labels: ['jira-triage-not-fixable'], pipelineState: 'triage-not-fixable' },
        { created: recent, labels: ['other-label'], pipelineState: 'unknown' }
      ]
      const m = computeAutofixMetrics(issues, 'week')
      expect(m.eligibleCount).toBe(0)
      expect(m.windowTotal).toBe(2)
      expect(m.eligibilityRate).toBe(0)
    })

    it('handles issues with missing or null pipelineState', () => {
      const issues = [
        { created: recent, labels: ['jira-autofix'], pipelineState: 'autofix-ready' },
        { created: recent, labels: ['other'], pipelineState: null },
        { created: recent, labels: ['other'], pipelineState: undefined },
        { created: recent, labels: ['other'] }
      ]
      const m = computeAutofixMetrics(issues, 'week')
      expect(m.eligibleCount).toBe(1)
      expect(m.windowTotal).toBe(4)
      expect(m.eligibilityRate).toBe(25)
    })

    it('counts union of autofix-* state OR jira-autofix label', () => {
      const issues = [
        // Has autofix-* state but NOT label (bot removed label during processing)
        { created: recent, labels: ['jira-autofix-merged'], pipelineState: 'autofix-merged' },
        { created: recent, labels: ['jira-autofix-review'], pipelineState: 'autofix-review' },
        // Has jira-autofix label but NOT autofix-* state (queued, not yet processed or human took over)
        { created: recent, labels: ['jira-autofix'], pipelineState: 'triage-pending' },
        { created: recent, labels: ['jira-autofix'], pipelineState: 'unknown' },
        // Has BOTH state and label (rare but possible)
        { created: recent, labels: ['jira-autofix', 'jira-autofix-pending'], pipelineState: 'autofix-pending' },
        // Has NEITHER (not eligible)
        { created: recent, labels: ['jira-triage-not-fixable'], pipelineState: 'triage-not-fixable' },
        { created: recent, labels: ['other'], pipelineState: 'unknown' }
      ]
      const m = computeAutofixMetrics(issues, 'week')
      expect(m.eligibleCount).toBe(5) // Union: 2 state-only + 2 label-only + 1 both
      expect(m.windowTotal).toBe(7)
      expect(m.eligibilityRate).toBe(71) // 5/7 = 71.428... rounds to 71
    })

    it('eligibleCount can exceed autofixTotal when jira-autofix label exists without autofix-* state', () => {
      const issues = [
        // 3 issues with autofix-* state (counted in autofixTotal)
        { created: recent, labels: ['jira-autofix-merged'], pipelineState: 'autofix-merged' },
        { created: recent, labels: ['jira-autofix-review'], pipelineState: 'autofix-review' },
        { created: recent, labels: ['jira-autofix-pending'], pipelineState: 'autofix-pending' },
        // 2 issues with jira-autofix label but no autofix-* state (NOT in autofixTotal, but eligible)
        { created: recent, labels: ['jira-autofix'], pipelineState: 'triage-pending' },
        { created: recent, labels: ['jira-autofix'], pipelineState: 'unknown' }
      ]
      const m = computeAutofixMetrics(issues, 'week')
      expect(m.autofixTotal).toBe(3) // Only autofix-* states
      expect(m.eligibleCount).toBe(5) // Union includes label-only issues
      expect(m.eligibleCount).toBeGreaterThan(m.autofixTotal)
    })
  })

  it('does not change triage outcomes calculation', () => {
    const now = new Date()
    const recent = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString()
    const issues = [
      { created: recent, labels: ['jira-autofix'], pipelineState: 'autofix-merged' },
      { created: recent, labels: ['jira-triage-not-fixable'], pipelineState: 'triage-not-fixable' },
      { created: recent, labels: ['jira-triage-stale'], pipelineState: 'triage-stale' }
    ]
    const m = computeAutofixMetrics(issues, 'week')
    // Triage outcomes should remain unchanged
    expect(m.triageVerdicts.ready).toBe(1) // Still counts autofix states
    expect(m.triageVerdicts.notFixable).toBe(1)
    expect(m.triageVerdicts.stale).toBe(1)
    expect(m.triageTotal).toBe(3)
  })

  it('does not change success rate calculation', () => {
    const now = new Date()
    const recent = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString()
    const issues = [
      { created: recent, labels: ['jira-autofix'], pipelineState: 'autofix-merged' },
      { created: recent, labels: ['jira-autofix'], pipelineState: 'autofix-rejected' },
      { created: recent, labels: ['jira-autofix'], pipelineState: 'autofix-max-retries' }
    ]
    const m = computeAutofixMetrics(issues, 'week')
    // Success rate should still be merged / (merged + rejected + maxRetries)
    expect(m.successRate).toBe(33) // 1/3 = 33.333... rounds to 33
    expect(m.autofixStates.merged).toBe(1)
    expect(m.autofixStates.rejected).toBe(1)
    expect(m.autofixStates.maxRetries).toBe(1)
  })

  it('includes humanAssigned in triageVerdicts and triageTotal', () => {
    const issues = [
      { created: recent, pipelineState: 'triage-human-assigned', components: [] },
      { created: recent, pipelineState: 'autofix-merged', components: [] }
    ]
    const m = computeAutofixMetrics(issues, 'week')
    expect(m.triageVerdicts.humanAssigned).toBe(1)
    expect(m.triageTotal).toBe(2)
  })
})

describe('buildTrendData', () => {
  it('returns weekly data points with breakdown fields', () => {
    const issues = [
      { created: new Date().toISOString(), pipelineState: 'autofix-merged', components: [] }
    ]
    const trend = buildTrendData(issues, 'week')
    expect(trend).toHaveLength(4)
    expect(trend[0]).toHaveProperty('date')
    expect(trend[0]).toHaveProperty('triaged')
    expect(trend[0]).toHaveProperty('autofixed')
    expect(trend[0]).toHaveProperty('merged')
    expect(trend[0]).toHaveProperty('review')
    expect(trend[0]).toHaveProperty('ciFailing')
    expect(trend[0]).toHaveProperty('blocked')
    expect(trend[0]).toHaveProperty('maxRetries')
    expect(trend[0]).toHaveProperty('missingInfo')
    expect(trend[0]).toHaveProperty('stale')
    expect(trend[0]).toHaveProperty('external')
    expect(trend[0]).toHaveProperty('securityReview')
    expect(trend[0]).toHaveProperty('humanAssigned')
  })

  it('returns 13 points for 3months window', () => {
    const trend = buildTrendData([], '3months')
    expect(trend).toHaveLength(13)
  })

  it('counts waiting-on-humans breakdowns correctly', () => {
    const now = new Date()
    const recent = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()
    const issues = [
      { created: recent, pipelineState: 'autofix-review', components: [] },
      { created: recent, pipelineState: 'autofix-review', components: [] },
      { created: recent, pipelineState: 'autofix-ci-failing', components: [] },
      { created: recent, pipelineState: 'autofix-blocked', components: [] },
      { created: recent, pipelineState: 'autofix-max-retries', components: [] },
      { created: recent, pipelineState: 'autofix-merged', components: [] },
      { created: recent, pipelineState: 'triage-missing-info', components: [] },
      { created: recent, pipelineState: 'triage-stale', components: [] },
      { created: recent, pipelineState: 'triage-external', components: [] },
      { created: recent, pipelineState: 'triage-security-review', components: [] }
    ]
    const trend = buildTrendData(issues, 'week')
    const lastPoint = trend[trend.length - 1]
    expect(lastPoint.review).toBe(2)
    expect(lastPoint.ciFailing).toBe(1)
    expect(lastPoint.blocked).toBe(1)
    expect(lastPoint.maxRetries).toBe(1)
    expect(lastPoint.merged).toBe(1)
    expect(lastPoint.missingInfo).toBe(1)
    expect(lastPoint.stale).toBe(1)
    expect(lastPoint.external).toBe(1)
    expect(lastPoint.securityReview).toBe(1)
  })

  it('counts humanAssigned in trend data', () => {
    const now = new Date()
    const recent = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()
    const issues = [
      { created: recent, pipelineState: 'triage-human-assigned', components: [] }
    ]
    const trend = buildTrendData(issues, 'week')
    const lastPoint = trend[trend.length - 1]
    expect(lastPoint.humanAssigned).toBe(1)
  })

  it('returns 4 points for lastWeek window', () => {
    const trend = buildTrendData([], 'lastWeek')
    expect(trend).toHaveLength(4)
  })

  it('uses terminalAt for merged issues in lastWeek window', () => {
    const { start, end } = getLastWeekBounds()
    const midLastWeek = new Date(start + (end - start) / 2).toISOString()
    const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const issues = [
      { created: threeMonthsAgo, terminalAt: midLastWeek, pipelineState: 'autofix-merged' },
      { created: midLastWeek, terminalAt: null, pipelineState: 'autofix-review' }
    ]
    const trend = buildTrendData(issues, 'lastWeek')
    const lastBucket = trend[trend.length - 1]
    expect(lastBucket.merged).toBe(1)
    expect(lastBucket.review).toBe(1)
  })

  it('does not use terminalAt for existing time windows', () => {
    const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
    const issues = [
      { created: old, terminalAt: recent, pipelineState: 'autofix-merged' }
    ]
    const trend = buildTrendData(issues, 'week')
    const lastBucket = trend[trend.length - 1]
    expect(lastBucket.merged).toBe(0)
  })
})

describe('extractTerminalAt', () => {
  it('returns timestamp when terminal label appears in changelog', () => {
    const changelog = {
      histories: [
        {
          created: '2026-06-18T15:11:11.202+0000',
          items: [
            { field: 'labels', toString: 'jira-autofix jira-autofix-merged' }
          ]
        }
      ]
    }
    expect(extractTerminalAt(changelog, 'autofix-merged')).toBe('2026-06-18T15:11:11.202Z')
  })

  it('returns the latest timestamp when label was added multiple times', () => {
    const changelog = {
      histories: [
        {
          created: '2026-04-21T17:30:05.162+0000',
          items: [
            { field: 'labels', toString: 'jira-autofix jira-autofix-merged' }
          ]
        },
        {
          created: '2026-06-11T15:05:41.099+0000',
          items: [
            { field: 'labels', toString: 'jira-autofix jira-autofix-merged' }
          ]
        }
      ]
    }
    expect(extractTerminalAt(changelog, 'autofix-merged')).toBe('2026-06-11T15:05:41.099Z')
  })

  it('returns null when label is not found in changelog', () => {
    const changelog = {
      histories: [
        {
          created: '2026-06-18T15:11:11.202+0000',
          items: [
            { field: 'labels', toString: 'jira-autofix jira-autofix-review' }
          ]
        }
      ]
    }
    expect(extractTerminalAt(changelog, 'autofix-merged')).toBeNull()
  })

  it('returns null for empty changelog', () => {
    expect(extractTerminalAt(null, 'autofix-merged')).toBeNull()
    expect(extractTerminalAt({}, 'autofix-merged')).toBeNull()
  })

  it('ignores non-label changelog entries', () => {
    const changelog = {
      histories: [
        {
          created: '2026-06-18T15:11:11.202+0000',
          items: [
            { field: 'status', toString: 'Closed' }
          ]
        }
      ]
    }
    expect(extractTerminalAt(changelog, 'autofix-merged')).toBeNull()
  })
})

describe('computeAutofixMetrics with lastWeek', () => {
  it('uses terminalAt for terminal issues in lastWeek window', () => {
    const { start, end } = getLastWeekBounds()
    const midLastWeek = new Date(start + (end - start) / 2).toISOString()
    const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const issues = [
      { created: threeMonthsAgo, terminalAt: midLastWeek, pipelineState: 'autofix-merged' },
      { created: midLastWeek, terminalAt: null, pipelineState: 'autofix-review' },
      { created: threeMonthsAgo, terminalAt: null, pipelineState: 'autofix-merged' }
    ]
    const m = computeAutofixMetrics(issues, 'lastWeek')
    expect(m.autofixStates.merged).toBe(1)
    expect(m.autofixStates.review).toBe(1)
    expect(m.windowTotal).toBe(2)
  })

  it('does not include terminal issues outside lastWeek window', () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
    const issues = [
      { created: twoWeeksAgo, terminalAt: twoWeeksAgo, pipelineState: 'autofix-merged' }
    ]
    const m = computeAutofixMetrics(issues, 'lastWeek')
    expect(m.autofixStates.merged).toBe(0)
  })
})

describe('getLastWeekBounds', () => {
  it('returns Monday-to-Monday boundaries', () => {
    const { start, end } = getLastWeekBounds()
    const startDate = new Date(start)
    const endDate = new Date(end)
    expect(startDate.getUTCDay()).toBe(1)
    expect(endDate.getUTCDay()).toBe(1)
    expect(end - start).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('end is before now', () => {
    const { end } = getLastWeekBounds()
    expect(end).toBeLessThanOrEqual(Date.now())
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import OverviewView from '../../../client/execute/views/OverviewView.vue'

const mockApiRequest = vi.fn()

vi.mock('@shared/client/services/api', () => ({
  apiRequest: (...args) => mockApiRequest(...args),
  SESSION_CACHE_PREFIX: 'tt_cache:session:'
}))

const mockUser = ref({})
vi.mock('@shared/client/composables/useAuth.js', () => ({
  useAuth: () => ({ user: mockUser })
}))

// Index-entry shapes below mirror the producer contract (executionIssueCount /
// doneExecutionIssueCount / executionState / executionCoverage /
// executionCoverageReason / preparationReadiness), covering each of the four
// known execution states plus both unavailable causes (epics-with-no-issues
// vs. fully missing metrics).
const FEATURES = [
  {
    key: 'COMPLETE-1', summary: 'Complete feature', status: 'Release Pending', statusCategory: 'Done',
    fixVersions: ['1.0'], components: ['Comp A'], labels: [], epicCount: 1, issueCount: 2, blockerCount: 0,
    executionIssueCount: 2, doneExecutionIssueCount: 2, executionState: 'complete', executionCoverage: 'available',
    executionCoverageReason: null, preparationReadiness: 'ready'
  },
  {
    key: 'NS-1', summary: 'Not started feature', status: 'To Do', statusCategory: 'To Do',
    fixVersions: ['1.0'], components: [], labels: [], epicCount: 1, issueCount: 3, blockerCount: 0,
    executionIssueCount: 2, doneExecutionIssueCount: 0, executionState: 'not-started', executionCoverage: 'available',
    executionCoverageReason: null, preparationReadiness: 'pending'
  },
  {
    key: 'IP-1', summary: 'In progress feature', status: 'In Progress', statusCategory: 'In Progress',
    fixVersions: ['2.0'], components: ['Comp B'], labels: ['label-alpha', 'label-beta', 'label-gamma', 'label-delta'], epicCount: 1, issueCount: 2, blockerCount: 2,
    executionIssueCount: 2, doneExecutionIssueCount: 1, executionState: 'in-progress', executionCoverage: 'available',
    executionCoverageReason: null, preparationReadiness: 'unknown'
  },
  {
    key: 'EMPTY-1', summary: 'Genuinely empty feature', status: 'To Do', statusCategory: 'To Do',
    fixVersions: ['1.0'], components: [], labels: [], epicCount: 0, issueCount: 0, blockerCount: 0,
    executionIssueCount: 0, doneExecutionIssueCount: 0, executionState: 'no-tracked-work', executionCoverage: 'empty',
    executionCoverageReason: 'no-epics', preparationReadiness: 'not-applicable'
  },
  {
    key: 'EMPTY-2', summary: 'Preparation-only feature', status: 'To Do', statusCategory: 'To Do',
    fixVersions: ['1.0'], components: [], labels: [], epicCount: 1, issueCount: 1, blockerCount: 0,
    executionIssueCount: 0, doneExecutionIssueCount: 0, executionState: 'no-tracked-work', executionCoverage: 'empty',
    executionCoverageReason: 'preparation-only', preparationReadiness: 'not-applicable'
  },
  {
    key: 'NODATA-1', summary: 'Epics with no observed issues', status: 'In Progress', statusCategory: 'In Progress',
    fixVersions: ['2.0'], components: [], labels: [], epicCount: 9, issueCount: 0, blockerCount: 0,
    executionIssueCount: null, doneExecutionIssueCount: null, executionState: null, executionCoverage: 'insufficient-data',
    executionCoverageReason: 'epics-without-issue-detail', preparationReadiness: 'not-applicable'
  },
  {
    key: 'NODATA-2', summary: 'Missing metrics feature', status: 'New', statusCategory: null,
    fixVersions: [], components: [], labels: [], epicCount: 0, issueCount: 0, blockerCount: 0,
    executionIssueCount: null, doneExecutionIssueCount: null, executionState: null, executionCoverage: 'insufficient-data',
    executionCoverageReason: null, preparationReadiness: 'unknown'
  }
]

function mockNav() {
  return { navigateTo: vi.fn(), goBack: vi.fn(), updateParams: vi.fn(), params: ref({}) }
}

function setProjectId(projectId) {
  window.location.hash = `#/releases/execute?projectId=${projectId}`
  window.dispatchEvent(new Event('urlchange'))
}

async function mountWithData(detailsByKey = {}) {
  mockApiRequest.mockImplementation((url) => {
    if (url.indexOf('/versions') !== -1) return Promise.resolve({ versions: ['1.0', '2.0'] })
    const detailMatch = url.match(/\/execution\/features\/([^/?]+)(?:\?.*)?$/)
    if (detailMatch) {
      const detail = detailsByKey[detailMatch[1]]
      return detail ? Promise.resolve(detail) : Promise.reject(new Error(`Feature ${detailMatch[1]} not found`))
    }
    return Promise.resolve({ features: FEATURES, fetchedAt: '2026-09-10T00:00:00Z', featureCount: FEATURES.length })
  })
  const nav = mockNav()
  const wrapper = mount(OverviewView, {
    global: { provide: { moduleNav: nav }, stubs: { Teleport: true, Transition: true } }
  })
  await flushPromises()
  return { wrapper, nav }
}

describe('OverviewView (Feature List)', () => {
  beforeEach(() => {
    mockApiRequest.mockReset()
    sessionStorage.clear()
    setProjectId('osac')
    mockUser.value = {}
  })

  it('requests Flight Control execution data and shows unavailable instead of OSAC features', async () => {
    setProjectId('flightctl')
    mockApiRequest.mockImplementation((url) => {
      if (url.includes('/versions')) {
        return Promise.resolve({
          projectId: 'flightctl',
          state: 'unavailable',
          message: 'Release execution versions have not been collected for this project.',
          versions: []
        })
      }
      return Promise.resolve({
        projectId: 'flightctl',
        state: 'unavailable',
        message: 'Release execution features have not been collected for Flight Control.',
        featureCount: 0,
        features: []
      })
    })

    const wrapper = mount(OverviewView, {
      global: { provide: { moduleNav: mockNav() }, stubs: { Teleport: true, Transition: true } }
    })
    await flushPromises()

    expect(mockApiRequest).toHaveBeenCalledWith('/modules/releases/execution/features?projectId=flightctl')
    expect(mockApiRequest).toHaveBeenCalledWith('/modules/releases/execution/versions?projectId=flightctl')
    expect(wrapper.text()).toContain('Release execution features have not been collected for Flight Control.')
    expect(wrapper.text()).not.toMatch(/OSAC-\d+/)
  })

  it('shows Flight Control inventory and keeps unsupported metrics, readiness, and blocker filtering Unknown', async () => {
    setProjectId('flightctl')
    mockApiRequest.mockImplementation((url) => {
      if (url.includes('/versions')) return Promise.resolve({ projectId: 'flightctl', versions: [] })
      return Promise.resolve({
        projectId: 'flightctl',
        state: 'supported',
        partial: false,
        features: [{
          key: 'EDM-100', summary: 'Jira inventory item', status: 'Release Pending', statusCategory: 'Done',
          fixVersions: ['0.10.0'], components: ['FlightCtl-Core'], labels: [], epicCount: 2,
          issueCount: null, blockerCount: null, completionPct: null, health: null,
          executionIssueCount: null, doneExecutionIssueCount: null, executionState: 'unavailable',
          executionCoverage: 'unavailable', executionCoverageReason: 'no-compatible-feature-producer',
          preparationReadiness: 'unknown', team: null,
          coverage: { team: 'unknown', pipelineMetrics: 'unavailable', featureReadiness: 'unconfigured' }
        }],
        featureCount: 1
      })
    })

    const wrapper = mount(OverviewView, {
      global: { provide: { moduleNav: mockNav() }, stubs: { Teleport: true, Transition: true } }
    })
    await flushPromises()

    expect(wrapper.text()).toContain('No compatible pipeline execution producer is configured.')
    expect(wrapper.text()).toContain('does not establish execution progress or release readiness')
    expect(wrapper.text()).toContain('Blockers only (Unknown)')
    expect(wrapper.find('input[type="checkbox"]').element.disabled).toBe(true)
    expect(wrapper.text()).toContain('Without progress data:')

    const coverageButton = wrapper.findAll('button').find(button => button.text().includes('Without progress data'))
    await coverageButton.trigger('click')
    expect(wrapper.text()).toContain('EDM-100')
    expect(wrapper.text()).toContain('Total issues')
    expect(wrapper.text()).toContain('Unknown')
    expect(wrapper.text()).toContain('No compatible execution producer')
  })

  it('shows Jira child status progress separately from pipeline execution and readiness', async () => {
    setProjectId('flightctl')
    const features = [
      {
        key: 'EDM-DONE', summary: 'All child issues done', status: 'In Progress', statusCategory: 'In Progress',
        fixVersions: ['0.10.0'], components: [], labels: [], epicCount: 1, issueCount: null, blockerCount: null,
        executionIssueCount: null, doneExecutionIssueCount: null, executionState: 'unavailable',
        executionCoverage: 'unavailable', executionCoverageReason: 'no-compatible-feature-producer',
        effectiveExecutionIssueCount: null, effectiveDoneExecutionIssueCount: null,
        effectiveExecutionState: 'unavailable', effectiveExecutionCoverage: 'unavailable',
        effectiveExecutionCoverageReason: 'no-compatible-feature-producer', preparationReadiness: 'unknown',
        jiraChildProgress: {
          source: 'jira-child-status-rollup', state: 'supported', coverage: 'complete', issueCount: 2,
          knownStatusIssueCount: 2, statusCounts: { done: 2, inProgress: 0, toDo: 0, unknown: 0 }, reason: null
        },
        coverage: { team: 'unknown', pipelineMetrics: 'unavailable', featureReadiness: 'unconfigured' }
      },
      {
        key: 'EDM-EMPTY', summary: 'No eligible child issues', status: 'To Do', statusCategory: 'To Do',
        fixVersions: ['0.10.0'], components: [], labels: [], epicCount: 0, issueCount: null, blockerCount: null,
        executionIssueCount: null, doneExecutionIssueCount: null, executionState: 'unavailable',
        executionCoverage: 'unavailable', executionCoverageReason: 'no-compatible-feature-producer',
        preparationReadiness: 'unknown',
        jiraChildProgress: {
          source: 'jira-child-status-rollup', state: 'empty', coverage: 'complete', issueCount: 0,
          knownStatusIssueCount: 0, statusCounts: { done: 0, inProgress: 0, toDo: 0, unknown: 0 },
          reason: 'no-matching-jira-children'
        },
        coverage: { team: 'unknown', pipelineMetrics: 'unavailable', featureReadiness: 'unconfigured' }
      },
      {
        key: 'EDM-NA', summary: 'Child status not applicable', status: 'To Do', statusCategory: 'To Do',
        fixVersions: ['0.10.0'], components: [], labels: [], epicCount: 0, issueCount: null, blockerCount: null,
        executionIssueCount: null, doneExecutionIssueCount: null, executionState: 'unavailable',
        executionCoverage: 'unavailable', executionCoverageReason: 'no-compatible-feature-producer',
        preparationReadiness: 'unknown',
        jiraChildProgress: {
          source: 'jira-child-status-rollup', state: 'inapplicable', coverage: 'inapplicable',
          issueCount: null, knownStatusIssueCount: null,
          statusCounts: { done: null, inProgress: null, toDo: null, unknown: null },
          reason: 'project-does-not-track-feature-child-status'
        },
        coverage: { team: 'unknown', pipelineMetrics: 'unavailable', featureReadiness: 'unconfigured' }
      }
    ]
    mockApiRequest.mockImplementation(url => {
      if (url.includes('/versions')) return Promise.resolve({ projectId: 'flightctl', versions: ['0.10.0'] })
      return Promise.resolve({ projectId: 'flightctl', state: 'supported', partial: false, features, featureCount: features.length })
    })

    const wrapper = mount(OverviewView, {
      global: { provide: { moduleNav: mockNav() }, stubs: { Teleport: true, Transition: true } }
    })
    await flushPromises()

    expect(wrapper.text()).toContain('With Jira child status progress:')
    expect(wrapper.text()).toContain('Without complete Jira child status progress:')
    expect(wrapper.text()).toContain('Jira Children: Done')
    expect(wrapper.text()).toContain('2/2 Jira Done')
    expect(wrapper.text()).toContain('does not establish Feature completion, pipeline success, or release readiness')
    expect(wrapper.text()).toContain('Planning')
    expect(wrapper.text()).toContain('Unknown')

    const withoutProgress = wrapper.findAll('button').find(button => button.text().includes('Without complete Jira child status progress'))
    await withoutProgress.trigger('click')
    expect(wrapper.text()).toContain('EDM-EMPTY')
    expect(wrapper.text()).toContain('No eligible Jira child issues')
    expect(wrapper.text()).toContain('EDM-NA')
    expect(wrapper.text()).toContain('Jira child status is not applicable')
  })

  it('keeps filter state project-qualified and discards a late OSAC response after switching projects', async () => {
    const filterState = (searchQuery) => JSON.stringify({
      selectedVersions: [], selectedExecutionStates: [], selectedComponents: [], selectedStatuses: [],
      selectedAssignees: [], attentionBlockersOnly: false, searchQuery, viewMode: 'list'
    })
    sessionStorage.setItem('releases:feature-list-filters', filterState('OSAC'))
    sessionStorage.setItem('releases:feature-list-filters:flightctl', filterState('Flight'))

    let resolveOsac
    mockApiRequest.mockImplementation((url) => {
      if (url.includes('/versions')) return Promise.resolve({ versions: [] })
      if (url.includes('projectId=osac')) {
        return new Promise(resolve => { resolveOsac = resolve })
      }
      return Promise.resolve({
        projectId: 'flightctl',
        state: 'supported',
        features: [{
          key: 'EDM-1', summary: 'Flightctl feature', status: 'To Do', statusCategory: 'To Do',
          fixVersions: [], components: [], labels: [], epicCount: 0, issueCount: null, blockerCount: null,
          executionState: 'unavailable', executionCoverage: 'unavailable',
          executionCoverageReason: 'no-compatible-feature-producer', preparationReadiness: 'unknown',
          coverage: { team: 'unknown', pipelineMetrics: 'unavailable' }
        }],
        featureCount: 1
      })
    })

    setProjectId('osac')
    const wrapper = mount(OverviewView, {
      global: { provide: { moduleNav: mockNav() }, stubs: { Teleport: true, Transition: true } }
    })
    await flushPromises()
    expect(wrapper.get('#feature-search').element.value).toBe('OSAC')

    setProjectId('flightctl')
    await flushPromises()
    expect(wrapper.get('#feature-search').element.value).toBe('Flight')
    expect(JSON.parse(sessionStorage.getItem('releases:feature-list-filters')).searchQuery).toBe('OSAC')
    expect(wrapper.text()).toContain('EDM-1')
    expect(wrapper.text()).not.toContain('OSAC-1')
    expect(mockApiRequest).toHaveBeenCalledWith(expect.stringContaining('projectId=flightctl'))

    resolveOsac({ features: [{ key: 'OSAC-1', summary: 'Late OSAC result' }], featureCount: 1 })
    await flushPromises()
    expect(wrapper.text()).toContain('EDM-1')
    expect(wrapper.text()).not.toContain('OSAC-1')
  })

  it('defaults to Board view with three execution columns plus a separate coverage total, losing no features', async () => {
    const { wrapper } = await mountWithData()

    const columnTitles = wrapper.findAll('h3').map(h => h.text())
    expect(columnTitles).toEqual(['Not Started', 'In Progress', 'Observed Work Done'])

    // 3 with progress data (COMPLETE-1, NS-1, IP-1) + 4 without
    // (EMPTY-1, EMPTY-2, NODATA-1, NODATA-2) = all 7 filtered features.
    expect(wrapper.text()).toContain('Features:')
    expect(wrapper.text()).toContain('7')
    expect(wrapper.text()).toContain('With progress data:')
    expect(wrapper.text()).toContain('3')
    expect(wrapper.text()).toContain('Without progress data:')
    expect(wrapper.text()).toContain('4')

    for (const key of ['COMPLETE-1', 'NS-1', 'IP-1']) {
      expect(wrapper.text()).toContain(key)
    }
    // Coverage-group features aren't rendered until the coverage panel opens
    for (const key of ['EMPTY-1', 'EMPTY-2', 'NODATA-1', 'NODATA-2']) {
      expect(wrapper.text()).not.toContain(key)
    }

    const coverageButton = wrapper.findAll('button').find(b => b.text().includes('Without progress data'))
    await coverageButton.trigger('click')
    for (const key of ['EMPTY-1', 'EMPTY-2', 'NODATA-1', 'NODATA-2']) {
      expect(wrapper.text()).toContain(key)
    }
  })

  it('distinguishes real 0%, empty scope (with and without preparation-only issues), and insufficient data, all inside the coverage panel', async () => {
    const { wrapper } = await mountWithData()

    // Real nonzero all-To-Do scope shows 0%, not blank/unavailable, directly on the board
    expect(wrapper.text()).toContain('0/2')

    const coverageButton = wrapper.findAll('button').find(b => b.text().includes('Without progress data'))
    await coverageButton.trigger('click')
    const text = wrapper.text()

    expect(text).toContain('No linked epics found')
    expect(text).toContain('Only planning issues found')
    expect(text).toContain('Issue details missing')
    expect(text).toContain('Execution data unavailable')
  })

  it('paginates each column independently while keeping the full column count visible', async () => {
    const manyFeatures = Array.from({ length: 13 }, (_, i) => ({
      key: `PAGED-${i}`, summary: `Paged feature ${i}`, status: 'In Progress', statusCategory: 'In Progress',
      fixVersions: [], components: [], labels: [], epicCount: 1, issueCount: 2, blockerCount: 0,
      executionIssueCount: 2, doneExecutionIssueCount: 0, executionState: 'not-started', executionCoverage: 'available',
      executionCoverageReason: null, preparationReadiness: 'unknown'
    }))
    mockApiRequest.mockImplementation((url) => {
      if (url.indexOf('/versions') !== -1) return Promise.resolve({ versions: [] })
      return Promise.resolve({ features: manyFeatures, fetchedAt: '2026-09-10T00:00:00Z', featureCount: manyFeatures.length })
    })
    const wrapper = mount(OverviewView, { global: { provide: { moduleNav: mockNav() } } })
    await flushPromises()

    // Column count badge always reflects the full 13, independent of the 12-per-page slice
    expect(wrapper.text()).toContain('Not Started')
    expect(wrapper.text()).toContain('13')
    expect(wrapper.text()).toContain('PAGED-11')
    expect(wrapper.text()).not.toContain('PAGED-12')
    expect(wrapper.text()).toContain('Page 1 of 2')

    const nextButton = wrapper.findAll('button').find(b => b.text() === 'Next')
    await nextButton.trigger('click')
    expect(wrapper.text()).toContain('PAGED-12')
    expect(wrapper.text()).toContain('Page 2 of 2')
    // Pagination is presentation-only; the filtered population is unchanged
    expect(wrapper.text()).toContain('Features:')
    expect(wrapper.text()).toContain('13')
  })

  it('collapses and expands each execution column without changing its pagination', async () => {
    const { wrapper } = await mountWithData()
    const header = wrapper.find('button[aria-controls="execution-section-not-started"]')
    const section = wrapper.find('#execution-section-not-started')

    expect(header.attributes('aria-expanded')).toBe('true')
    expect(section.isVisible()).toBe(true)

    await header.trigger('click')
    expect(header.attributes('aria-expanded')).toBe('false')
    expect(section.attributes('style')).toContain('display: none')

    await header.trigger('click')
    expect(header.attributes('aria-expanded')).toBe('true')
    expect(section.attributes('style')).not.toContain('display: none')
  })

  it('expands and collapses Jira labels beyond the accessible +N pill', async () => {
    const { wrapper } = await mountWithData()

    const card = wrapper.findAll('.cursor-pointer').find(el => el.text().includes('IP-1'))
    expect(card.text()).toContain('label-alpha')
    expect(card.text()).toContain('+1')
    expect(card.text()).not.toContain('label-delta')

    const expandButton = card.findAll('button').find(b => b.attributes('aria-expanded') === 'false')
    expect(expandButton.attributes('aria-label')).toMatch(/1 more label/)
    await expandButton.trigger('click')
    expect(card.text()).toContain('label-delta')
    expect(card.text()).toContain('Less')

    const collapseButton = card.findAll('button').find(b => b.attributes('aria-expanded') === 'true')
    await collapseButton.trigger('click')
    expect(card.text()).not.toContain('label-delta')
  })

  it('renders "available" coverage with invalid counts as unavailable, never a fabricated/NaN/clamped percentage', async () => {
    const badFeatures = [
      { key: 'BAD-ZERO', summary: 'Zero total', status: 'In Progress', statusCategory: 'In Progress',
        fixVersions: [], components: [], epicCount: 1, issueCount: 1, blockerCount: 0,
        executionIssueCount: 0, doneExecutionIssueCount: 0, executionState: 'in-progress', executionCoverage: 'available',
        preparationReadiness: 'unknown' },
      { key: 'BAD-NULL', summary: 'Null counts', status: 'In Progress', statusCategory: 'In Progress',
        fixVersions: [], components: [], epicCount: 1, issueCount: 1, blockerCount: 0,
        executionIssueCount: null, doneExecutionIssueCount: null, executionState: 'in-progress', executionCoverage: 'available',
        preparationReadiness: 'unknown' },
      { key: 'BAD-OVERFLOW', summary: 'Done exceeds total', status: 'In Progress', statusCategory: 'In Progress',
        fixVersions: [], components: [], epicCount: 1, issueCount: 1, blockerCount: 0,
        executionIssueCount: 3, doneExecutionIssueCount: 5, executionState: 'in-progress', executionCoverage: 'available',
        preparationReadiness: 'unknown' },
      { key: 'BAD-FLOAT', summary: 'Non-integer counts', status: 'In Progress', statusCategory: 'In Progress',
        fixVersions: [], components: [], epicCount: 1, issueCount: 1, blockerCount: 0,
        executionIssueCount: 4.5, doneExecutionIssueCount: 1, executionState: 'in-progress', executionCoverage: 'available',
        preparationReadiness: 'unknown' }
    ]
    mockApiRequest.mockImplementation((url) => {
      if (url.indexOf('/versions') !== -1) return Promise.resolve({ versions: [] })
      return Promise.resolve({ features: badFeatures, fetchedAt: '2026-09-10T00:00:00Z', featureCount: badFeatures.length })
    })
    const wrapper = mount(OverviewView, { global: { provide: { moduleNav: mockNav() } } })
    await flushPromises()

    // Invalid counts fail the board's validated-progress check, so these land
    // in the coverage panel (collapsed by default) rather than on the board.
    const coverageButton = wrapper.findAll('button').find(b => b.text().includes('Without progress data'))
    await coverageButton.trigger('click')

    const text = wrapper.text()
    expect(text).not.toMatch(/NaN/)
    expect(text).not.toContain('0%')
    const unavailableCount = (text.match(/Execution data unavailable/g) || []).length
    expect(unavailableCount).toBe(badFeatures.length)
  })

  it('shows preparation readiness independent of execution progress, including for coverage-group features', async () => {
    const { wrapper } = await mountWithData()
    expect(wrapper.text()).toContain('Ready')
    expect(wrapper.text()).toContain('Pending')
    expect(wrapper.text()).toContain('Unknown')

    const coverageButton = wrapper.findAll('button').find(b => b.text().includes('Without progress data'))
    await coverageButton.trigger('click')
    expect(wrapper.text()).toContain('N/A')
  })

  it('renders neutral progress without health/status-color badges', async () => {
    const { wrapper } = await mountWithData()
    const html = wrapper.html()
    expect(html).not.toMatch(/Status color missing/)
    expect(wrapper.findComponent({ name: 'SignoffBadge' }).exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/\bRED\b|\bYELLOW\b|\bGREEN\b/)
  })

  it('switches to List view exposing the same filtered population with the specified columns', async () => {
    const { wrapper } = await mountWithData()
    await wrapper.findAll('button').find(b => b.text() === 'List').trigger('click')

    const headers = wrapper.findAll('th').map(h => h.text())
    expect(headers).toEqual([
      'Key', 'Summary', 'Jira Status', 'Execution State', 'Progress',
      'Planning', 'Epics', 'Total issues', 'Attention', 'Components', 'Version'
    ])

    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(FEATURES.length)
    expect(wrapper.text()).toContain('2/2')
    expect(wrapper.text()).toContain('100%')
  })

  it('filters by Execution State including the unavailable option', async () => {
    const { wrapper } = await mountWithData()
    await wrapper.findAll('button').find(b => b.text() === 'List').trigger('click')

    const executionStateButton = wrapper.findAll('button').find(b => b.text().includes('All Execution States'))
    await executionStateButton.trigger('click')
    const option = wrapper.findAll('label').find(l => l.text() === 'Execution Data Unavailable')
    await option.find('input[type="checkbox"]').setValue(true)

    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(wrapper.text()).toContain('NODATA-1')
    expect(wrapper.text()).toContain('NODATA-2')
    expect(wrapper.text()).not.toContain('COMPLETE-1')
  })

  it('filters by multi-component selection including Unassigned', async () => {
    const { wrapper } = await mountWithData()
    await wrapper.findAll('button').find(b => b.text() === 'List').trigger('click')

    const componentButton = wrapper.findAll('button').find(b => b.text().includes('All components'))
    await componentButton.trigger('click')
    const option = wrapper.findAll('label').find(l => l.text() === 'Comp A')
    await option.find('input[type="checkbox"]').setValue(true)

    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    expect(wrapper.text()).toContain('COMPLETE-1')
  })

  it('filters by Jira Status (statusCategory), preserving Unknown for missing values', async () => {
    const { wrapper } = await mountWithData()
    await wrapper.findAll('button').find(b => b.text() === 'List').trigger('click')

    const statusButton = wrapper.findAll('button').find(b => b.text().includes('All statuses'))
    await statusButton.trigger('click')
    const option = wrapper.findAll('label').find(l => l.text() === 'Unknown')
    await option.find('input[type="checkbox"]').setValue(true)

    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    expect(wrapper.text()).toContain('NODATA-2')
  })

  it('filters to Blockers-only attention', async () => {
    const { wrapper } = await mountWithData()
    await wrapper.findAll('button').find(b => b.text() === 'List').trigger('click')

    const attentionToggle = wrapper.findAll('label').find(l => l.text() === 'Blockers only').find('input[type="checkbox"]')
    await attentionToggle.setValue(true)

    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    expect(wrapper.text()).toContain('IP-1')
  })

  it('opens the execution drawer on card click instead of navigating to the legacy detail page', async () => {
    const { wrapper, nav } = await mountWithData({ 'COMPLETE-1': { key: 'COMPLETE-1', epics: [] } })
    const card = wrapper.findAll('.cursor-pointer').find(el => el.text().includes('COMPLETE-1'))
    await card.trigger('click')
    await flushPromises()

    expect(nav.navigateTo).not.toHaveBeenCalled()
    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('COMPLETE-1')
    expect(dialog.text()).toContain('Complete feature')
  })

  it('closes the drawer via its close button and restores focus to the triggering key button', async () => {
    // Real focus/activeElement behavior requires the tree to be attached to the document.
    mockApiRequest.mockImplementation((url) => {
      if (url.indexOf('/versions') !== -1) return Promise.resolve({ versions: ['1.0', '2.0'] })
      if (url.includes('/features/COMPLETE-1')) return Promise.resolve({ key: 'COMPLETE-1', epics: [] })
      return Promise.resolve({ features: FEATURES, fetchedAt: '2026-09-10T00:00:00Z', featureCount: FEATURES.length })
    })
    const wrapper = mount(OverviewView, {
      global: { provide: { moduleNav: mockNav() }, stubs: { Teleport: true, Transition: true } },
      attachTo: document.body
    })
    await flushPromises()

    try {
      const triggerButton = wrapper.findAll('button').find(b => b.attributes('aria-label') === 'Open details for COMPLETE-1')
      await triggerButton.trigger('click')
      await flushPromises()

      expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
      const closeButton = wrapper.findAll('button').find(b => b.attributes('aria-label') === 'Close detail panel')
      await closeButton.trigger('click')
      await flushPromises()

      expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
      expect(document.activeElement).toBe(triggerButton.element)
    } finally {
      wrapper.unmount()
    }
  })

  it('does not open the drawer when a nested label-expansion control is activated', async () => {
    const { wrapper } = await mountWithData()
    const card = wrapper.findAll('.cursor-pointer').find(el => el.text().includes('IP-1'))
    const expandButton = card.findAll('button').find(b => b.attributes('aria-expanded') === 'false')

    await expandButton.trigger('click')

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(card.text()).toContain('label-delta')
  })

  it('preserves selected filters, view mode, and pagination across opening and closing the drawer', async () => {
    const { wrapper } = await mountWithData({ 'COMPLETE-1': { key: 'COMPLETE-1', epics: [] } })
    await wrapper.findAll('button').find(b => b.text() === 'List').trigger('click')

    const versionButton = wrapper.findAll('button').find(b => b.text().includes('All Versions'))
    await versionButton.trigger('click')
    const versionOption = wrapper.findAll('label').find(l => l.text() === '1.0')
    await versionOption.find('input[type="checkbox"]').setValue(true)

    const rowCountBefore = wrapper.findAll('tbody tr').length
    expect(rowCountBefore).toBeGreaterThan(0)

    const row = wrapper.findAll('tbody tr').find(r => r.text().includes('COMPLETE-1'))
    await row.trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)

    const closeButton = wrapper.findAll('button').find(b => b.attributes('aria-label') === 'Close detail panel')
    await closeButton.trigger('click')

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.findAll('button').find(b => b.text() === 'List').classes().join(' ')).toContain('bg-white')
    expect(wrapper.findAll('tbody tr')).toHaveLength(rowCountBefore)
    expect(wrapper.findAll('button').find(b => b.text().includes('All Versions'))).toBeUndefined() // filter button now shows the selected version, not the "All" label
    expect(wrapper.text()).toContain('1.0')
  })

  it('shows a cached selection immediately while a different selection is still pending, unaffected by its late response', async () => {
    let resolveNs
    const detailsByKey = {
      'COMPLETE-1': { key: 'COMPLETE-1', epics: [{ key: 'EP-COMPLETE', summary: 'Complete epic', status: 'Done', issues: [] }] }
    }
    mockApiRequest.mockImplementation((url) => {
      if (url.indexOf('/versions') !== -1) return Promise.resolve({ versions: ['1.0', '2.0'] })
      if (url.includes('/features/COMPLETE-1')) return Promise.resolve(detailsByKey['COMPLETE-1'])
      if (url.includes('/features/NS-1')) return new Promise(resolve => { resolveNs = resolve })
      return Promise.resolve({ features: FEATURES, fetchedAt: '2026-09-10T00:00:00Z', featureCount: FEATURES.length })
    })
    const wrapper = mount(OverviewView, {
      global: { provide: { moduleNav: mockNav() }, stubs: { Teleport: true, Transition: true } }
    })
    await flushPromises()

    const completeTrigger = wrapper.findAll('button').find(b => b.attributes('aria-label') === 'Open details for COMPLETE-1')
    await completeTrigger.trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="dialog"]').text()).toContain('EP-COMPLETE')

    const nsTrigger = wrapper.findAll('button').find(b => b.attributes('aria-label') === 'Open details for NS-1')
    await nsTrigger.trigger('click') // NS-1 fetch now pending, unresolved
    expect(wrapper.find('[role="dialog"]').text()).not.toContain('EP-COMPLETE')

    await completeTrigger.trigger('click') // reselect the cached COMPLETE-1
    await flushPromises()
    expect(wrapper.find('[role="dialog"]').text()).toContain('EP-COMPLETE')

    resolveNs({ key: 'NS-1', epics: [{ key: 'EP-NS', summary: 'NS epic', status: 'New', issues: [] }] })
    await flushPromises()

    // The late NS-1 response must not clobber the reselected COMPLETE-1 detail.
    expect(wrapper.find('[role="dialog"]').text()).toContain('EP-COMPLETE')
    expect(wrapper.find('[role="dialog"]').text()).not.toContain('EP-NS')
  })

  describe('effective execution fields (Epic status-completion override)', () => {
    async function mountFeatures(features) {
      mockApiRequest.mockImplementation((url) => {
        if (url.indexOf('/versions') !== -1) return Promise.resolve({ versions: [] })
        return Promise.resolve({ features, fetchedAt: '2026-09-10T00:00:00Z', featureCount: features.length })
      })
      const wrapper = mount(OverviewView, { global: { provide: { moduleNav: mockNav() } } })
      await flushPromises()
      return wrapper
    }

    it('uses effective fields over raw for lane placement, landing an Epic-status-completed feature in Observed Work Done', async () => {
      const wrapper = await mountFeatures([{
        key: 'EFF-COMPLETE', summary: 'Completed via Epic status override', status: 'Release Pending', statusCategory: 'Done',
        fixVersions: [], components: [], labels: [], epicCount: 1, issueCount: 3, blockerCount: 0,
        // Raw says in-progress/1-of-3; effective credits the Epic as fully complete.
        executionIssueCount: 3, doneExecutionIssueCount: 1, executionState: 'in-progress', executionCoverage: 'available',
        executionCoverageReason: null, preparationReadiness: 'unknown',
        effectiveExecutionIssueCount: 3, effectiveDoneExecutionIssueCount: 3, effectiveExecutionState: 'complete',
        effectiveExecutionCoverage: 'available', effectiveExecutionCoverageReason: null
      }])

      const columns = wrapper.findAll('.rounded-lg.border.overflow-hidden').filter(el => el.find('h3').exists())
      expect(columns).toHaveLength(3)
      expect(columns[0].text()).not.toContain('EFF-COMPLETE')
      expect(columns[1].text()).not.toContain('EFF-COMPLETE')
      expect(columns[2].text()).toContain('EFF-COMPLETE')
      expect(columns[2].text()).toContain('3/3')
      expect(columns[2].text()).toContain('100%')
    })

    it('falls back to raw execution fields when effective keys are absent entirely (pre-contract payload)', async () => {
      const wrapper = await mountFeatures([{
        key: 'LEGACY-1', summary: 'Legacy in-progress feature', status: 'In Progress', statusCategory: 'In Progress',
        fixVersions: [], components: [], labels: [], epicCount: 1, issueCount: 2, blockerCount: 0,
        executionIssueCount: 2, doneExecutionIssueCount: 1, executionState: 'in-progress', executionCoverage: 'available',
        executionCoverageReason: null, preparationReadiness: 'unknown'
        // No effective* keys at all.
      }])

      const columns = wrapper.findAll('.rounded-lg.border.overflow-hidden').filter(el => el.find('h3').exists())
      expect(columns[1].text()).toContain('LEGACY-1')
      expect(columns[1].text()).toContain('1/2')
      expect(columns[1].text()).toContain('50%')
    })

    it('treats an explicit effectiveExecutionState: null as insufficient data, never a silent fallback to raw', async () => {
      const wrapper = await mountFeatures([{
        key: 'NULLEFF-1', summary: 'Explicit null effective', status: 'In Progress', statusCategory: 'In Progress',
        fixVersions: [], components: [], labels: [], epicCount: 2, issueCount: 4, blockerCount: 0,
        executionIssueCount: 4, doneExecutionIssueCount: 2, executionState: 'in-progress', executionCoverage: 'available',
        executionCoverageReason: null, preparationReadiness: 'unknown',
        effectiveExecutionIssueCount: null, effectiveDoneExecutionIssueCount: null, effectiveExecutionState: null,
        effectiveExecutionCoverage: 'insufficient-data', effectiveExecutionCoverageReason: 'epics-without-issue-detail'
      }])

      // Hidden until the coverage panel is opened — never placed on the board despite raw being in-progress/available.
      expect(wrapper.text()).not.toContain('NULLEFF-1')
      const coverageButton = wrapper.findAll('button').find(b => b.text().includes('Without progress data'))
      await coverageButton.trigger('click')
      expect(wrapper.text()).toContain('NULLEFF-1')
      expect(wrapper.text()).toContain('Issue details missing')
    })

    it('renders a producer-confirmed complete state with zero issue counts as 100%, not 0% or unavailable', async () => {
      const wrapper = await mountFeatures([{
        key: 'ZEROCOMPLETE-1', summary: 'Zero-child completed Epic', status: 'Release Pending', statusCategory: 'Done',
        fixVersions: [], components: [], labels: [], epicCount: 1, issueCount: 0, blockerCount: 0,
        // Raw is insufficient-data (zero observed children); effective is a confirmed 0/0 complete.
        executionIssueCount: null, doneExecutionIssueCount: null, executionState: null, executionCoverage: 'insufficient-data',
        executionCoverageReason: 'epics-without-issue-detail', preparationReadiness: 'not-applicable',
        effectiveExecutionIssueCount: 0, effectiveDoneExecutionIssueCount: 0, effectiveExecutionState: 'complete',
        effectiveExecutionCoverage: 'available', effectiveExecutionCoverageReason: null
      }])

      const columns = wrapper.findAll('.rounded-lg.border.overflow-hidden').filter(el => el.find('h3').exists())
      expect(columns[2].text()).toContain('ZEROCOMPLETE-1')
      expect(columns[2].text()).toContain('0/0')
      expect(columns[2].text()).toContain('100%')
    })
  })

  describe('Assignee filter', () => {
    // The Feature's own direct assignee only — index.json already flattens it
    // to a display-name string (or null), same shape as other Assignee filters.
    const ASSIGNEE_FEATURES = [
      { key: 'ASG-ALICE', summary: 'Alice feature', status: 'In Progress', statusCategory: 'In Progress',
        fixVersions: [], components: ['Comp A'], labels: [], epicCount: 1, issueCount: 2, blockerCount: 0,
        executionIssueCount: 2, doneExecutionIssueCount: 1, executionState: 'in-progress', executionCoverage: 'available',
        executionCoverageReason: null, preparationReadiness: 'unknown', assignee: 'Alice' },
      { key: 'ASG-BOB', summary: 'Bob feature', status: 'In Progress', statusCategory: 'In Progress',
        fixVersions: [], components: ['Comp B'], labels: [], epicCount: 1, issueCount: 2, blockerCount: 0,
        executionIssueCount: 2, doneExecutionIssueCount: 1, executionState: 'in-progress', executionCoverage: 'available',
        executionCoverageReason: null, preparationReadiness: 'unknown', assignee: 'Bob' },
      { key: 'ASG-UNASSIGNED', summary: 'Unassigned feature', status: 'In Progress', statusCategory: 'In Progress',
        fixVersions: [], components: ['Comp A'], labels: [], epicCount: 1, issueCount: 2, blockerCount: 0,
        executionIssueCount: 2, doneExecutionIssueCount: 1, executionState: 'in-progress', executionCoverage: 'available',
        executionCoverageReason: null, preparationReadiness: 'unknown', assignee: null }
    ]

    async function mountWithAssigneeFeatures(features = ASSIGNEE_FEATURES) {
      mockApiRequest.mockImplementation((url) => {
        if (url.indexOf('/versions') !== -1) return Promise.resolve({ versions: [] })
        return Promise.resolve({ features, fetchedAt: '2026-09-10T00:00:00Z', featureCount: features.length })
      })
      const wrapper = mount(OverviewView, { global: { provide: { moduleNav: mockNav() } } })
      await flushPromises()
      await wrapper.findAll('button').find(b => b.text() === 'List').trigger('click')
      return wrapper
    }

    async function openAssigneeDropdown(wrapper) {
      const button = wrapper.findAll('button').find(b => b.text().includes('All assignees'))
      await button.trigger('click')
    }

    async function checkAssignee(wrapper, name) {
      const option = wrapper.findAll('label').find(l => l.text() === name)
      await option.find('input[type="checkbox"]').setValue(true)
    }

    it('builds Assignee options from feature.assignee, including Unassigned', async () => {
      const wrapper = await mountWithAssigneeFeatures()
      await openAssigneeDropdown(wrapper)

      const optionLabels = wrapper.findAll('label').map(l => l.text())
      expect(optionLabels).toContain('Alice')
      expect(optionLabels).toContain('Bob')
      expect(optionLabels).toContain('Unassigned')
    })

    it('shows every feature when no Assignee is selected (All)', async () => {
      const wrapper = await mountWithAssigneeFeatures()
      expect(wrapper.findAll('tbody tr')).toHaveLength(3)
    })

    it('filters to a single selected Assignee', async () => {
      const wrapper = await mountWithAssigneeFeatures()
      await openAssigneeDropdown(wrapper)
      await checkAssignee(wrapper, 'Alice')

      expect(wrapper.findAll('tbody tr')).toHaveLength(1)
      expect(wrapper.text()).toContain('ASG-ALICE')
    })

    it('matches multiple selected Assignees (OR semantics)', async () => {
      const wrapper = await mountWithAssigneeFeatures()
      await openAssigneeDropdown(wrapper)
      await checkAssignee(wrapper, 'Alice')
      await checkAssignee(wrapper, 'Bob')

      const rows = wrapper.findAll('tbody tr')
      expect(rows).toHaveLength(2)
      expect(wrapper.text()).toContain('ASG-ALICE')
      expect(wrapper.text()).toContain('ASG-BOB')
      expect(wrapper.text()).not.toContain('ASG-UNASSIGNED')
    })

    it('treats a missing assignee as Unassigned', async () => {
      const wrapper = await mountWithAssigneeFeatures()
      await openAssigneeDropdown(wrapper)
      await checkAssignee(wrapper, 'Unassigned')

      expect(wrapper.findAll('tbody tr')).toHaveLength(1)
      expect(wrapper.text()).toContain('ASG-UNASSIGNED')
    })

    it('combines Assignee with an active Component filter (AND)', async () => {
      const wrapper = await mountWithAssigneeFeatures()
      await openAssigneeDropdown(wrapper)
      await checkAssignee(wrapper, 'Bob')

      const componentButton = wrapper.findAll('button').find(b => b.text().includes('All components'))
      await componentButton.trigger('click')
      const compOption = wrapper.findAll('label').find(l => l.text() === 'Comp A')
      await compOption.find('input[type="checkbox"]').setValue(true)

      // Bob's feature is Comp B, not Comp A — fails the AND, leaving only the empty-state row.
      expect(wrapper.text()).toContain('No features found matching the current filters.')
      expect(wrapper.text()).not.toContain('ASG-')
    })

    it('search narrows the visible Assignee options without altering the selection', async () => {
      const wrapper = await mountWithAssigneeFeatures()
      await openAssigneeDropdown(wrapper)
      await checkAssignee(wrapper, 'Alice')
      await wrapper.find('input[placeholder="Search assignees..."]').setValue('bob')

      expect(wrapper.findAll('label').some(l => l.text() === 'Alice')).toBe(false)
      expect(wrapper.findAll('label').some(l => l.text() === 'Bob')).toBe(true)
      // Alice stays selected even though search hides her from the option list.
      expect(wrapper.findAll('tbody tr')).toHaveLength(1)
      expect(wrapper.text()).toContain('ASG-ALICE')
    })

    it('shows a no-matches message when the Assignee search matches nothing', async () => {
      const wrapper = await mountWithAssigneeFeatures()
      await openAssigneeDropdown(wrapper)
      await wrapper.find('input[placeholder="Search assignees..."]').setValue('zzz')

      expect(wrapper.text()).toContain('No matches for "zzz"')
    })

    it('hides "Assigned to me" when no jiraDisplayName is resolved', async () => {
      mockUser.value = {}
      const wrapper = await mountWithAssigneeFeatures()
      await openAssigneeDropdown(wrapper)

      expect(wrapper.text()).not.toContain('Assigned to me')
    })

    it('"Assigned to me" sets the Assignee filter to exactly the current user\'s Jira display name', async () => {
      mockUser.value = { jiraDisplayName: 'Bob' }
      const wrapper = await mountWithAssigneeFeatures()
      await openAssigneeDropdown(wrapper)
      const meButton = wrapper.findAll('button').find(b => b.text() === 'Assigned to me')
      await meButton.trigger('click')

      expect(wrapper.findAll('tbody tr')).toHaveLength(1)
      expect(wrapper.text()).toContain('ASG-BOB')
    })

    it('clears the Assignee selection via Clear filters', async () => {
      const wrapper = await mountWithAssigneeFeatures()
      await openAssigneeDropdown(wrapper)
      await checkAssignee(wrapper, 'Alice')
      expect(wrapper.findAll('tbody tr')).toHaveLength(1)

      const clearButton = wrapper.findAll('button').find(b => b.text() === 'Clear filters')
      await clearButton.trigger('click')

      expect(wrapper.findAll('tbody tr')).toHaveLength(3)
    })

    it('persists the Assignee selection across a remount via sessionStorage', async () => {
      const wrapper = await mountWithAssigneeFeatures()
      await openAssigneeDropdown(wrapper)
      await checkAssignee(wrapper, 'Alice')
      expect(wrapper.findAll('tbody tr')).toHaveLength(1)

      const wrapper2 = await mountWithAssigneeFeatures()
      expect(wrapper2.findAll('tbody tr')).toHaveLength(1)
      expect(wrapper2.text()).toContain('ASG-ALICE')
    })
  })

  describe('Labels filter', () => {
    const UIUX_FEATURES = [
      { key: 'UX-1', summary: 'Feature with UI/UX evidence', status: 'In Progress', statusCategory: 'In Progress',
        fixVersions: ['0.3'], components: ['Dashboard'], labels: [], epicCount: 1, issueCount: 2, blockerCount: 0,
        executionIssueCount: 2, doneExecutionIssueCount: 1, executionState: 'in-progress', executionCoverage: 'available',
        executionCoverageReason: null, preparationReadiness: 'unknown',
        uiEvidence: {
          status: 'in-progress', conflict: false,
          scopes: [
            { fixVersions: ['0.3'], components: ['Dashboard'], status: 'completed', conflict: false, sourceKeys: ['UIX-1'] },
            { fixVersions: ['0.4'], components: ['Dashboard'], status: 'not-started', conflict: false, sourceKeys: ['BOOT-1'] }
          ],
          sources: [
            { epicKey: 'UIX-1', epicType: 'uix', fixVersions: ['0.3'], components: ['Dashboard'], localStatus: 'completed', stageLabels: ['ui-completed'], routingLabels: [] },
            { epicKey: 'BOOT-1', epicType: 'bootstrap', fixVersions: ['0.4'], components: ['Dashboard'], localStatus: 'not-started', stageLabels: [], routingLabels: [] }
          ]
        },
        uxEvidence: { status: 'unknown', conflict: false, scopes: [], sources: [] },
        workflowLabelSources: [
          { epicKey: 'BOOT-1', labels: ['design-approved'], fixVersions: ['0.4'], components: ['Dashboard'] }
        ] },
      { key: 'UX-2', summary: 'Feature with no UI/UX evidence', status: 'In Progress', statusCategory: 'In Progress',
        fixVersions: ['0.3'], components: ['Dashboard'], labels: [], epicCount: 1, issueCount: 2, blockerCount: 0,
        executionIssueCount: 2, doneExecutionIssueCount: 1, executionState: 'in-progress', executionCoverage: 'available',
        executionCoverageReason: null, preparationReadiness: 'unknown' }
    ]

    async function mountWithUiUxFeatures(features = UIUX_FEATURES) {
      mockApiRequest.mockImplementation((url) => {
        if (url.indexOf('/versions') !== -1) return Promise.resolve({ versions: ['0.3', '0.4'] })
        return Promise.resolve({ features, fetchedAt: '2026-09-10T00:00:00Z', featureCount: features.length })
      })
      const wrapper = mount(OverviewView, { global: { provide: { moduleNav: mockNav() } } })
      await flushPromises()
      await wrapper.findAll('button').find(b => b.text() === 'List').trigger('click')
      return wrapper
    }

    async function selectLabel(wrapper, label) {
      const button = wrapper.findAll('button').find(b => b.text().includes('All labels'))
      await button.trigger('click')
      const option = wrapper.findAll('label').find(l => l.text() === label)
      await option.find('input[type="checkbox"]').setValue(true)
    }

    it('renders one unified Labels dropdown listing Epic stage and workflow labels', async () => {
      const wrapper = await mountWithUiUxFeatures()
      await wrapper.findAll('button').find(b => b.text().includes('All labels')).trigger('click')
      const options = wrapper.findAll('label').map(l => l.text())
      expect(options).toEqual(expect.arrayContaining(['ui-completed', 'design-approved']))
    })

    it('hides the Labels dropdown for a dataset with no labels/evidence at all (backward compat)', async () => {
      const wrapper = await mountWithUiUxFeatures([{ ...UIUX_FEATURES[1] }])
      expect(wrapper.findAll('button').some(b => b.text().includes('All labels'))).toBe(false)
    })

    it('filters to Features carrying an Epic stage label when no Release is selected', async () => {
      const wrapper = await mountWithUiUxFeatures()
      await selectLabel(wrapper, 'ui-completed')

      expect(wrapper.findAll('tbody tr')).toHaveLength(1)
      expect(wrapper.text()).toContain('UX-1')
    })

    // ui-completed lives only on UIX-1, scoped to 0.3 — the single-source-Epic safeguard.
    it('honors the single-source-Epic safeguard once a Release is also selected', async () => {
      const wrapper = await mountWithUiUxFeatures()

      const versionButton = wrapper.findAll('button').find(b => b.text().includes('All Versions'))
      await versionButton.trigger('click')
      const versionOption = wrapper.findAll('label').find(l => l.text() === '0.3')
      await versionOption.find('input[type="checkbox"]').setValue(true)

      await selectLabel(wrapper, 'ui-completed')
      expect(wrapper.findAll('tbody tr')).toHaveLength(1)
      expect(wrapper.text()).toContain('UX-1')
    })

    it('filters by an Epic workflow label (design-approved) via workflowLabelSources', async () => {
      const wrapper = await mountWithUiUxFeatures()
      await selectLabel(wrapper, 'design-approved')

      expect(wrapper.findAll('tbody tr')).toHaveLength(1)
      expect(wrapper.text()).toContain('UX-1')
    })

    it('clears the Labels filter via Clear filters', async () => {
      const wrapper = await mountWithUiUxFeatures()
      await selectLabel(wrapper, 'ui-completed')
      expect(wrapper.findAll('tbody tr')).toHaveLength(1)

      const clearButton = wrapper.findAll('button').find(b => b.text() === 'Clear filters')
      await clearButton.trigger('click')
      expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    })

    it('shows one compact, scope-aware Labels row on the Board card, prioritizing workflow/UI-UX labels', async () => {
      mockApiRequest.mockImplementation((url) => {
        if (url.indexOf('/versions') !== -1) return Promise.resolve({ versions: ['0.3', '0.4'] })
        return Promise.resolve({ features: UIUX_FEATURES, fetchedAt: '2026-09-10T00:00:00Z', featureCount: UIUX_FEATURES.length })
      })
      const wrapper = mount(OverviewView, { global: { provide: { moduleNav: mockNav() } } })
      await flushPromises()

      const card = wrapper.findAll('[class*="border-gray-200/80"]').find(el => el.text().includes('UX-1'))
      expect(card.text()).toContain('ui-completed')

      // design-approved is scoped to 0.4 on BOOT-1 — not visible when 0.3 is selected.
      const versionButton = wrapper.findAll('button').find(b => b.text().includes('All Versions'))
      await versionButton.trigger('click')
      const versionOption = wrapper.findAll('label').find(l => l.text() === '0.3')
      await versionOption.find('input[type="checkbox"]').setValue(true)

      const cardAfter = wrapper.findAll('[class*="border-gray-200/80"]').find(el => el.text().includes('UX-1'))
      expect(cardAfter.text()).not.toContain('design-approved')
    })

    it('collapses Customer and Other label groups by default, independently expandable via their heading', async () => {
      const features = [{ ...UIUX_FEATURES[0], labels: ['customer:acme', 'random-tag'] }, UIUX_FEATURES[1]]
      const wrapper = await mountWithUiUxFeatures(features)
      const button = wrapper.findAll('button').find(b => b.text().includes('All labels'))
      await button.trigger('click')

      // UI/UX Workflow is never collapsed.
      expect(wrapper.findAll('label').some(l => l.text() === 'ui-completed')).toBe(true)
      expect(wrapper.findAll('label').some(l => l.text() === 'customer:acme')).toBe(false)
      expect(wrapper.findAll('label').some(l => l.text() === 'random-tag')).toBe(false)

      const customerHeading = wrapper.findAll('button').find(b => b.text() === 'Customer')
      await customerHeading.trigger('click')
      expect(wrapper.findAll('label').some(l => l.text() === 'customer:acme')).toBe(true)
      expect(wrapper.findAll('label').some(l => l.text() === 'random-tag')).toBe(false)
    })

    it('search reveals matches inside collapsed Customer/Other groups without requiring them to be expanded', async () => {
      const features = [{ ...UIUX_FEATURES[0], labels: ['customer:acme'] }, UIUX_FEATURES[1]]
      const wrapper = await mountWithUiUxFeatures(features)
      const button = wrapper.findAll('button').find(b => b.text().includes('All labels'))
      await button.trigger('click')

      const search = wrapper.find('input[placeholder="Search labels..."]')
      await search.setValue('acme')

      expect(wrapper.findAll('label').some(l => l.text() === 'customer:acme')).toBe(true)
    })

    it('keeps category headings non-interactive while a label search is active', async () => {
      const features = [{ ...UIUX_FEATURES[0], labels: ['customer:acme'] }, UIUX_FEATURES[1]]
      const wrapper = await mountWithUiUxFeatures(features)
      await wrapper.findAll('button').find(b => b.text().includes('All labels')).trigger('click')
      expect(wrapper.findAll('button').some(b => b.text() === 'Customer')).toBe(true)

      await wrapper.find('input[placeholder="Search labels..."]').setValue('acme')
      expect(wrapper.text()).toContain('Customer')
      expect(wrapper.findAll('button').some(b => b.text() === 'Customer')).toBe(false)
    })

    it('lists UX routing labels as options and shows them on the card', async () => {
      const features = [{
        ...UIUX_FEATURES[1],
        uxEvidence: { status: 'unknown', conflict: false, scopes: [],
          sources: [{ epicKey: 'UX-E1', epicType: 'uix', fixVersions: ['0.3'], components: ['Dashboard'], localStatus: 'unknown', stageLabels: [], routingLabels: ['no-ux'] }] }
      }]
      const wrapper = await mountWithUiUxFeatures(features)
      await selectLabel(wrapper, 'no-ux')
      expect(wrapper.findAll('tbody tr')).toHaveLength(1)
      expect(wrapper.text()).toContain('no-ux')
    })

    describe('readiness category configuration', () => {
      function featureWithLabels(key, labels) {
        return { ...UIUX_FEATURES[1], key, labels }
      }

      async function openLabelsAndExpandOther(wrapper) {
        await wrapper.findAll('button').find(b => b.text().includes('All labels')).trigger('click')
        const other = wrapper.findAll('button').find(b => b.text() === 'Other')
        if (other) await other.trigger('click')
      }

      // Text of the group heading each option sits under, in render order.
      function groupOf(wrapper, label) {
        const nodes = wrapper.findAll('button, label')
        let heading = null
        for (const node of nodes) {
          if (node.element.tagName === 'BUTTON' && ['UI/UX Workflow', 'Readiness & Tracking', 'Customer', 'Other'].includes(node.text())) heading = node.text()
          if (node.element.tagName === 'LABEL' && node.text() === label) return heading
        }
        return undefined
      }

      it('groups osac-ui / osac-ux under Readiness & Tracking for OSAC features, keeping osac-ui-0.1 distinct', async () => {
        const wrapper = await mountWithUiUxFeatures([featureWithLabels('OSAC-1', ['osac-ui', 'osac-ux', 'osac-ui-0.1'])])
        await openLabelsAndExpandOther(wrapper)
        expect(groupOf(wrapper, 'osac-ui')).toBe('Readiness & Tracking')
        expect(groupOf(wrapper, 'osac-ux')).toBe('Readiness & Tracking')
        expect(groupOf(wrapper, 'osac-ui-0.1')).toBe('Other')
      })

      it('leaves osac-ui in Other for a project without that configuration', async () => {
        const wrapper = await mountWithUiUxFeatures([featureWithLabels('ZZZ-1', ['osac-ui'])])
        await openLabelsAndExpandOther(wrapper)
        expect(groupOf(wrapper, 'osac-ui')).toBe('Other')
      })
    })
  })

  describe('Filter options and header', () => {
    const OPTION_FEATURES = [
      { key: 'OPT-OPEN', summary: 'Open feature', status: 'In Progress', statusCategory: 'In Progress',
        fixVersions: ['0.3'], components: ['Alpha'], assignee: 'Ann Open', labels: ['ready-for-open'],
        epicCount: 1, issueCount: 1, blockerCount: 0, executionState: 'in-progress', executionCoverage: 'available', preparationReadiness: 'unknown' },
      { key: 'OPT-DONE', summary: 'Done feature', status: 'Done', statusCategory: 'Done',
        fixVersions: ['0.2'], epicReleaseVersions: ['0.4'], components: ['Beta'], assignee: 'Bob Done', labels: ['ready-for-done'],
        epicCount: 1, issueCount: 1, blockerCount: 0, executionState: 'complete', executionCoverage: 'available', preparationReadiness: 'unknown' }
    ]

    async function mountOptions() {
      mockApiRequest.mockImplementation((url) => {
        if (url.indexOf('/versions') !== -1) return Promise.resolve({ versions: ['0.2', '0.3', '0.4'] })
        return Promise.resolve({ features: OPTION_FEATURES, fetchedAt: '2026-09-10T00:00:00Z', featureCount: OPTION_FEATURES.length })
      })
      const wrapper = mount(OverviewView, { global: { provide: { moduleNav: mockNav() } } })
      await flushPromises()
      return wrapper
    }

    async function openDropdown(wrapper, buttonText) {
      await wrapper.findAll('button').find(b => b.text().includes(buttonText)).trigger('click')
    }

    function optionTexts(wrapper) {
      return wrapper.findAll('label').map(l => l.text())
    }

    async function toggleOption(wrapper, text) {
      await wrapper.findAll('label').find(l => l.text() === text).find('input[type="checkbox"]').setValue(true)
    }

    it('omits options that only hidden Closed Features carry, while still offering every Release', async () => {
      const wrapper = await mountOptions()
      await openDropdown(wrapper, 'All components')
      expect(optionTexts(wrapper)).toContain('Alpha')
      expect(optionTexts(wrapper)).not.toContain('Beta')

      await openDropdown(wrapper, 'All statuses')
      expect(optionTexts(wrapper)).not.toContain('Done')

      await openDropdown(wrapper, 'All assignees')
      expect(optionTexts(wrapper)).not.toContain('Bob Done')

      await openDropdown(wrapper, 'All labels')
      expect(optionTexts(wrapper)).not.toContain('ready-for-done')

      await openDropdown(wrapper, 'All Versions')
      expect(optionTexts(wrapper)).toEqual(expect.arrayContaining(['0.2', '0.3', '0.4']))
    })

    it('offers Closed Feature options once a Release reveals them (via epicReleaseVersions)', async () => {
      const wrapper = await mountOptions()
      await openDropdown(wrapper, 'All Versions')
      await toggleOption(wrapper, '0.4')

      await openDropdown(wrapper, 'All components')
      expect(optionTexts(wrapper)).toContain('Beta')
      await openDropdown(wrapper, 'All statuses')
      expect(optionTexts(wrapper)).toContain('Done')
      await openDropdown(wrapper, 'All assignees')
      expect(optionTexts(wrapper)).toContain('Bob Done')
      await openDropdown(wrapper, 'All labels')
      expect(optionTexts(wrapper)).toContain('ready-for-done')
    })

    it('keeps an active selection listed after the Release that revealed it is cleared', async () => {
      const wrapper = await mountOptions()
      await openDropdown(wrapper, 'All Versions')
      await toggleOption(wrapper, '0.4')
      await openDropdown(wrapper, 'All components')
      await toggleOption(wrapper, 'Beta')

      await openDropdown(wrapper, '0.4')
      await wrapper.findAll('label').find(l => l.text() === '0.4').find('input[type="checkbox"]').setValue(false)

      await openDropdown(wrapper, 'Beta')
      expect(optionTexts(wrapper)).toContain('Beta')
    })

    it('shows (filtered) only when a user filter is active', async () => {
      const wrapper = await mountOptions()
      expect(wrapper.text()).toContain('1 feature')
      expect(wrapper.text()).not.toContain('(filtered)')

      await openDropdown(wrapper, 'All components')
      await toggleOption(wrapper, 'Alpha')
      expect(wrapper.text()).toContain('(filtered)')
    })
  })

  describe('Closed Feature visibility', () => {
    it.each(['Done', 'Resolved', 'Cancelled'])('treats %s as terminal, revealing it via epicReleaseVersions only', async (status) => {
      const features = [
        { key: 'T-OPEN', summary: 'Open', status: 'In Progress', statusCategory: 'In Progress', fixVersions: ['0.3'], components: [], labels: [],
          epicCount: 1, issueCount: 1, blockerCount: 0, executionState: 'in-progress', executionCoverage: 'available', preparationReadiness: 'unknown' },
        { key: 'T-TERMINAL', summary: 'Terminal', status, statusCategory: 'Done', fixVersions: ['0.2'], epicReleaseVersions: ['0.3'], components: [], labels: [],
          epicCount: 1, issueCount: 1, blockerCount: 0, executionState: 'complete', executionCoverage: 'available', preparationReadiness: 'unknown' }
      ]
      mockApiRequest.mockImplementation((url) => {
        if (url.indexOf('/versions') !== -1) return Promise.resolve({ versions: ['0.2', '0.3'] })
        return Promise.resolve({ features, fetchedAt: '2026-09-10T00:00:00Z', featureCount: features.length })
      })
      const wrapper = mount(OverviewView, { global: { provide: { moduleNav: mockNav() } } })
      await flushPromises()
      await wrapper.findAll('button').find(b => b.text() === 'List').trigger('click')
      expect(wrapper.findAll('tbody tr').map(r => r.text()).some(t => t.includes('T-TERMINAL'))).toBe(false)

      await wrapper.findAll('button').find(b => b.text().includes('Version')).trigger('click')
      await wrapper.findAll('label').find(l => l.text() === '0.3').find('input[type="checkbox"]').setValue(true)
      expect(wrapper.findAll('tbody tr').map(r => r.text()).some(t => t.includes('T-TERMINAL'))).toBe(true)
    })

    const CLOSED_FEATURES = [
      { key: 'OPEN-1', summary: 'Open feature', status: 'In Progress', statusCategory: 'In Progress',
        fixVersions: ['0.3'], components: [], labels: [], epicCount: 1, issueCount: 2, blockerCount: 0,
        executionState: 'in-progress', executionCoverage: 'available', preparationReadiness: 'unknown',
        uiEvidence: { status: 'in-progress', conflict: false, scopes: [],
          sources: [
            { epicKey: 'UI-0', epicType: 'ui-impl', fixVersions: ['0.3'], components: [], localStatus: 'in-progress', stageLabels: ['ui-completed'], routingLabels: [] }
          ] } },
      { key: 'CLOSED-FV', summary: 'Closed feature matching via fixVersions', status: 'Closed', statusCategory: 'Done',
        fixVersions: ['0.3'], components: [], labels: [], epicCount: 1, issueCount: 2, blockerCount: 0,
        executionState: 'complete', executionCoverage: 'available', preparationReadiness: 'unknown' },
      { key: 'CLOSED-EPIC', summary: 'Closed feature matching via epicReleaseVersions only', status: 'Closed', statusCategory: 'Done',
        fixVersions: ['0.2'], epicReleaseVersions: ['0.3'], components: [], labels: [], epicCount: 1, issueCount: 2, blockerCount: 0,
        executionState: 'complete', executionCoverage: 'available', preparationReadiness: 'unknown' },
      { key: 'CLOSED-UNRELATED', summary: 'Closed feature matching neither', status: 'Closed', statusCategory: 'Done',
        fixVersions: ['0.1'], epicReleaseVersions: ['0.15'], components: [], labels: [], epicCount: 1, issueCount: 2, blockerCount: 0,
        executionState: 'complete', executionCoverage: 'available', preparationReadiness: 'unknown' },
      { key: 'CLOSED-UIUX', summary: 'Closed feature with UI/UX evidence', status: 'Closed', statusCategory: 'Done',
        fixVersions: ['0.3'], components: [], labels: [], epicCount: 1, issueCount: 2, blockerCount: 0,
        executionState: 'complete', executionCoverage: 'available', preparationReadiness: 'unknown',
        uiEvidence: { status: 'completed', conflict: false,
          scopes: [{ fixVersions: ['0.3'], components: [], status: 'completed', conflict: false, sourceKeys: ['UI-1'] }],
          sources: [
            { epicKey: 'UI-1', epicType: 'ui-impl', fixVersions: ['0.3'], components: [], localStatus: 'completed', stageLabels: ['ui-completed'], routingLabels: [] }
          ] } }
    ]

    async function mountWithClosedFeatures(features = CLOSED_FEATURES) {
      mockApiRequest.mockImplementation((url) => {
        if (url.indexOf('/versions') !== -1) return Promise.resolve({ versions: ['0.2', '0.3'] })
        return Promise.resolve({ features, fetchedAt: '2026-09-10T00:00:00Z', featureCount: features.length })
      })
      const wrapper = mount(OverviewView, { global: { provide: { moduleNav: mockNav() } } })
      await flushPromises()
      await wrapper.findAll('button').find(b => b.text() === 'List').trigger('click')
      return wrapper
    }

    async function selectVersion(wrapper, version) {
      const versionButton = wrapper.findAll('button').find(b => b.text().includes('Version'))
      await versionButton.trigger('click')
      const versionOption = wrapper.findAll('label').find(l => l.text() === version)
      await versionOption.find('input[type="checkbox"]').setValue(true)
    }

    it('hides Closed features by default and keeps non-Closed features visible', async () => {
      const wrapper = await mountWithClosedFeatures()
      expect(wrapper.findAll('tbody tr')).toHaveLength(1)
      expect(wrapper.text()).toContain('OPEN-1')
    })

    it('reveals a Closed feature matching the selected Release via fixVersions', async () => {
      const wrapper = await mountWithClosedFeatures()
      await selectVersion(wrapper, '0.3')
      const keys = wrapper.findAll('tbody tr').map(r => r.text())
      expect(keys.some(t => t.includes('OPEN-1'))).toBe(true)
      expect(keys.some(t => t.includes('CLOSED-FV'))).toBe(true)
      expect(keys.some(t => t.includes('CLOSED-EPIC'))).toBe(true)
      expect(keys.some(t => t.includes('CLOSED-UIUX'))).toBe(true)
      expect(keys.some(t => t.includes('CLOSED-UNRELATED'))).toBe(false)
    })

    it('still hides a Closed feature under an active Labels query when no Release is selected', async () => {
      const wrapper = await mountWithClosedFeatures()
      const labelButton = wrapper.findAll('button').find(b => b.text().includes('All labels'))
      await labelButton.trigger('click')
      const option = wrapper.findAll('label').find(l => l.text() === 'ui-completed')
      await option.find('input[type="checkbox"]').setValue(true)

      const rows = wrapper.findAll('tbody tr').map(r => r.text())
      expect(rows.some(t => t.includes('OPEN-1'))).toBe(true)
      expect(rows.some(t => t.includes('CLOSED-UIUX'))).toBe(false)
    })

    it('reveals a Closed feature under an active Labels query once its Release is also selected', async () => {
      const wrapper = await mountWithClosedFeatures()
      await selectVersion(wrapper, '0.3')
      const labelButton = wrapper.findAll('button').find(b => b.text().includes('All labels'))
      await labelButton.trigger('click')
      const option = wrapper.findAll('label').find(l => l.text() === 'ui-completed')
      await option.find('input[type="checkbox"]').setValue(true)

      expect(wrapper.text()).toContain('CLOSED-UIUX')
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import OverviewView from '../../../client/execute/views/OverviewView.vue'

const mockApiRequest = vi.fn()

vi.mock('@shared/client/services/api', () => ({
  apiRequest: (...args) => mockApiRequest(...args),
  SESSION_CACHE_PREFIX: 'tt_cache:session:'
}))

// Index-entry shapes below mirror the producer contract (executionIssueCount /
// doneExecutionIssueCount / executionState / executionCoverage /
// executionCoverageReason / preparationReadiness), covering each of the four
// known execution states plus both unavailable causes (epics-with-no-issues
// vs. fully missing metrics).
const FEATURES = [
  {
    key: 'COMPLETE-1', summary: 'Complete feature', status: 'Done', statusCategory: 'Done',
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

async function mountWithData(detailsByKey = {}) {
  mockApiRequest.mockImplementation((url) => {
    if (url.indexOf('/versions') !== -1) return Promise.resolve({ versions: ['1.0', '2.0'] })
    const detailMatch = url.match(/\/execution\/features\/([^/?]+)$/)
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
    expect(text).toContain('Only preparation issues found')
    expect(text).toContain('Issue details missing')
    expect(text).toContain('Execution data unavailable')
  })

  it('paginates each column independently while keeping the full column count visible', async () => {
    const manyFeatures = Array.from({ length: 8 }, (_, i) => ({
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

    // Column count badge always reflects the full 8, independent of the 6-per-page slice
    expect(wrapper.text()).toContain('Not Started')
    expect(wrapper.text()).toContain('8')
    expect(wrapper.text()).not.toContain('PAGED-7')
    expect(wrapper.text()).toContain('Page 1 of 2')

    const nextButton = wrapper.findAll('button').find(b => b.text() === 'Next')
    await nextButton.trigger('click')
    expect(wrapper.text()).toContain('PAGED-7')
    expect(wrapper.text()).toContain('Page 2 of 2')
    // Pagination is presentation-only; the filtered population is unchanged
    expect(wrapper.text()).toContain('Features:')
    expect(wrapper.text()).toContain('8')
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
      'Preparation', 'Epics', 'Total issues', 'Attention', 'Components', 'Version'
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
      if (url.endsWith('/features/COMPLETE-1')) return Promise.resolve({ key: 'COMPLETE-1', epics: [] })
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
      if (url.endsWith('/features/COMPLETE-1')) return Promise.resolve(detailsByKey['COMPLETE-1'])
      if (url.endsWith('/features/NS-1')) return new Promise(resolve => { resolveNs = resolve })
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
})

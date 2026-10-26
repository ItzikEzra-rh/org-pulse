import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CoverageView from '../../client/views/CoverageView.vue'
import report from '../fixtures/report.json'

const { apiRequest, mockProjectId } = vi.hoisted(() => ({ apiRequest: vi.fn(), mockProjectId: { value: '' } }))
vi.mock('@shared/client/services/api.js', () => ({ apiRequest }))
vi.mock('@shared/client/composables/useProjectId.js', () => ({
  useProjectId: () => mockProjectId,
  projectQuery: (projectId) => projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
}))
function latest(overrides = {}) {
  return {
    available: true,
    commit: report.commit,
    lastRunAt: new Date().toISOString(),
    groups: [{ key: 'core', name: 'core' }],
    // Mirrors the server: `pending` counts inferred mappings per tier.
    overview: report.overview.map((row) => ({
      ...row, name: row.area, reason: row.verdict_reason || '',
      unit: { ...row.unit, pending: 0 }, integration: { ...row.integration, pending: 0 },
      e2e: { ...row.e2e, pending: row.key === 'tenancy' ? 1 : 0 }
    })),
    ...overrides
  }
}
function mockResponses({ latestData = latest(), snapshots = [] } = {}) {
  apiRequest.mockImplementation((path) => Promise.resolve(path.includes('/latest') ? latestData : { snapshots }))
}
async function mountView() {
  const wrapper = mount(CoverageView)
  await flushPromises()
  return wrapper
}
function snap(date, unitDisplay, integrationState) {
  return {
    date,
    overview: [{
      key: 'iam',
      unit: { state: 'value', display: unitDisplay },
      integration: { state: integrationState, display: integrationState === 'blocked' ? 'blocked' : '70.0% (7/10)' },
      e2e: { state: 'na', display: 'na' }
    }]
  }
}
function multiGroupLatest() {
  const data = latest()
  data.groups = [{ key: 'core', name: 'core' }, { key: 'platform', name: 'platform' }]
  data.overview = data.overview.map((row) => row.key === 'tenancy' ? { ...row, group: 'platform' } : row)
  return data
}
beforeEach(() => {
  apiRequest.mockReset()
  localStorage.clear()
  mockProjectId.value = ''
  mockResponses()
})

describe('CoverageView', () => {
  it('renders the table with verdicts, state chips, and developer commands', async () => {
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('Identity & Access Management')
    expect(wrapper.text()).toContain('65.9% (2820/4278)')
    expect(wrapper.text()).toContain('make coverage-report FEATURE=iam')
    expect(wrapper.text()).toContain('4 critical and 8 high gaps')
    expect(wrapper.find('[data-testid="row-iam"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="row-iam"] [data-state="blocked"]').classes()).toContain('bg-amber-50')
    const pending = wrapper.find('[data-testid="row-tenancy"] [data-state="zero"]')
    expect(pending.classes()).toContain('bg-amber-50')
    expect(pending.text()).toContain('1 pending review')
    expect(pending.attributes('title')).toContain('waiting for review')
  })
  it('keeps a zero cell red when no mappings are pending', async () => {
    const data = latest()
    data.overview = data.overview.map((row) => row.key === 'tenancy' ? { ...row, e2e: { ...row.e2e, pending: 0 } } : row)
    mockResponses({ latestData: data })
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="row-tenancy"] [data-state="zero"]').classes()).toContain('bg-red-50')
  })
  it('toggles the how-to panel and remembers it', async () => {
    const wrapper = await mountView()
    const panel = wrapper.find('[data-testid="help-panel"]')
    expect(panel.element.open).toBe(false)
    expect(panel.text()).toContain('What moves a verdict')
    panel.element.open = true
    await panel.trigger('toggle')
    expect(panel.element.open).toBe(true)
    expect(localStorage.getItem('test_coverage_help_open')).toBe('1')
  })
  it('renders working groups and filters rows to the selection', async () => {
    mockResponses({ latestData: multiGroupLatest() })
    const wrapper = await mountView()
    const select = wrapper.find('[data-testid="wg-selector"]')
    expect(select.findAll('option').map((option) => option.attributes('value'))).toEqual(['core', 'platform'])
    expect(wrapper.text()).toContain('Identity & Access Management')
    await select.setValue('platform')
    expect(wrapper.text()).toContain('Tenancy')
    expect(wrapper.text()).not.toContain('Identity & Access Management')
  })
  it('defaults to core, else the first group alphabetically', async () => {
    mockResponses({ latestData: multiGroupLatest() })
    expect((await mountView()).find('[data-testid="wg-selector"]').element.value).toBe('core')
    const data = multiGroupLatest()
    data.groups = [{ key: 'alpha', name: 'alpha' }, { key: 'zeta', name: 'zeta' }]
    data.overview = data.overview.map((row) => ({ ...row, group: 'alpha' }))
    mockResponses({ latestData: data })
    expect((await mountView()).find('[data-testid="wg-selector"]').element.value).toBe('alpha')
  })
  it('never renders blocked or na as a percentage', async () => {
    const wrapper = await mountView()
    for (const state of ['blocked', 'na']) {
      const cells = wrapper.findAll(`[data-state="${state}"]`)
      expect(cells.length).toBeGreaterThan(0)
      for (const cell of cells) expect(cell.text()).not.toContain('%')
    }
  })

  it('shows a trend only when both endpoints are comparable', async () => {
    mockResponses({
      snapshots: [
        snap('2026-10-25', '65.9% (1/2)', 'blocked'),
        snap('2026-10-24', '60.0% (1/2)', 'value'),
        snap('2026-10-23', '55.0% (1/2)', 'value'),
        snap('2026-10-22', '50.0% (1/2)', 'value')
      ]
    })
    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="trend-unit-iam"]').attributes('data-trend')).toBe('up')
    expect(wrapper.find('[data-testid="trend-integration-iam"]').attributes('data-trend')).toBe('none')
  })

  it('flags data older than 48 hours as stale', async () => {
    mockResponses({ latestData: latest({ lastRunAt: '2000-01-01' }) })
    const wrapper = await mountView()

    const banner = wrapper.find('[data-testid="stale-banner"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('may be stale')
  })

  it('qualifies its requests with the selected project', async () => {
    mockProjectId.value = 'osac'
    await mountView()

    expect(apiRequest).toHaveBeenCalledWith('/modules/test-coverage/latest?projectId=osac')
    expect(apiRequest).toHaveBeenCalledWith('/modules/test-coverage/history?projectId=osac')
  })

  it('shows the empty state when no coverage data exists', async () => {
    mockResponses({ latestData: { available: false, commit: null, lastRunAt: null, overview: [] } })
    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="empty-state"]').text()).toContain('No coverage run has been synced yet')
  })
})

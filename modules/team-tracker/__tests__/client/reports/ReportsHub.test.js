import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, readonly } from 'vue'
import ReportsHub from '../../../client/reports/ReportsHub.vue'

vi.mock('@/platform-loader', () => ({
  loadAllocationStrategy: () => ({
    id: 'ai-eng-40-40-20',
    name: '40/40/20 Allocation',
    categories: []
  })
}))

const mockIsNormalizedModel = ref(false)
const mockRosterTeams = ref([])

// Mock dependencies
vi.mock('@shared/client/composables/useRoster', () => ({
  useRoster: () => ({
    orgs: ref([]),
    teams: mockRosterTeams,
    isNormalizedModel: mockIsNormalizedModel,
    selectedOrgKey: ref(null),
    selectOrg: vi.fn(),
    loadRoster: vi.fn(),
  })
}))

const mockNavigateTo = vi.fn()
const mockParams = ref({})

describe('ReportsHub', () => {
  beforeEach(() => {
    mockIsNormalizedModel.value = false
    mockRosterTeams.value = []
  })

  function createWrapper(params = {}) {
    mockParams.value = params
    mockNavigateTo.mockClear()
    return mount(ReportsHub, {
      global: {
        provide: {
          moduleNav: {
            navigateTo: mockNavigateTo,
            goBack: vi.fn(),
            params: readonly(mockParams),
            moduleSlug: readonly(ref('team-tracker')),
          }
        },
        stubs: {
          // Stub out async components that would fail to load in tests
          TrendsReport: { template: '<div data-testid="trends-report">Trends</div>' },
          TeamComparisonReport: { template: '<div>Comparison</div>' },
          AllocationReport: { template: '<div>Allocation</div>' },
        }
      }
    })
  }

  it('renders catalog with report cards when no report param', () => {
    const wrapper = createWrapper()
    const cards = wrapper.findAll('[data-testid="report-card"]')
    // Allocation is configured by the mocked strategy but hidden from the catalog.
    expect(cards.length).toBe(2)
  })

  it('shows catalog title', () => {
    const wrapper = createWrapper()
    expect(wrapper.text()).toContain('Reports')
    expect(wrapper.text()).toContain('Explore team metrics and trends')
  })

  it('calls navigateTo when a card is clicked', async () => {
    const wrapper = createWrapper()
    const cards = wrapper.findAll('[data-testid="report-card"]')
    await cards[0].trigger('click')
    expect(mockNavigateTo).toHaveBeenCalledWith('reports', { report: 'trends' })
  })

  it('renders report shell when report param is present', () => {
    const wrapper = createWrapper({ report: 'trends' })
    expect(wrapper.find('[data-testid="report-shell-back"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Productivity Trends')
  })

  it('still renders a hidden report directly via its report param', () => {
    // Allocation is hidden from the catalog, but its route stays functional.
    const wrapper = createWrapper({ report: 'allocation' })
    expect(wrapper.find('[data-testid="report-shell-back"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Work Allocation')
  })

  it('renders catalog when report param does not match any report', () => {
    const wrapper = createWrapper({ report: 'nonexistent' })
    const cards = wrapper.findAll('[data-testid="report-card"]')
    expect(cards.length).toBe(2)
  })

  it('hides the org filter and shows the team filter for Trends in project mode, with no org selected', async () => {
    mockIsNormalizedModel.value = true
    mockRosterTeams.value = [{ key: 'flightctl::team-1', displayName: 'Flight Team', members: [] }]
    const wrapper = createWrapper({ report: 'trends' })
    await flushPromises()
    expect(wrapper.find('[aria-label="Organization filter"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Team filter"]').exists()).toBe(true)
  })

  it('keeps the org filter and the org-gated team filter for Trends in OSAC (legacy) mode', async () => {
    const wrapper = createWrapper({ report: 'trends' })
    await flushPromises()
    expect(wrapper.find('[aria-label="Organization filter"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Team filter"]').exists()).toBe(false)
  })
})

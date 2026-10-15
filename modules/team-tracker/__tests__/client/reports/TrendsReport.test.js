import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, readonly, nextTick } from 'vue'
import TrendsReport from '../../../client/reports/TrendsReport.vue'

const mockOrgs = ref([
  {
    key: 'org1',
    displayName: 'Org One',
    teams: {
      'Team A': {
        displayName: 'Team A',
        members: [
          { name: 'Alice', githubUsername: 'alice-gh', gitlabUsername: 'alice-gl' },
        ]
      }
    }
  }
])
const mockIsNormalizedModel = ref(false)
const mockRosterTeams = ref([])

vi.mock('@shared/client/composables/useRoster', () => ({
  useRoster: () => ({
    orgs: mockOrgs,
    teams: mockRosterTeams,
    isNormalizedModel: mockIsNormalizedModel,
    selectedOrgKey: ref(null),
    selectOrg: vi.fn(),
    loadRoster: vi.fn(),
  })
}))

const mockProjectId = ref('')
vi.mock('@shared/client/composables/useProjectId.js', () => ({
  useProjectId: () => mockProjectId,
}))

const mockTrendsData = {
  jira: {
    '2025-01': { resolved: 10, avgCycleTimeDays: 5, byOrg: {}, byTeam: {} },
    '2025-02': { resolved: 15, avgCycleTimeDays: 4, byOrg: {}, byTeam: {} },
  },
  github: { users: {} },
  gitlab: { users: {} },
}

vi.mock('@shared/client/services/api', () => ({
  getTrends: vi.fn(async () => mockTrendsData),
}))

describe('TrendsReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockProjectId.value = ''
    mockIsNormalizedModel.value = false
    mockRosterTeams.value = []
  })

  function createWrapper() {
    return mount(TrendsReport, {
      global: {
        provide: {
          moduleNav: {
            navigateTo: vi.fn(),
            goBack: vi.fn(),
            params: readonly(ref({})),
            moduleSlug: readonly(ref('team-tracker')),
          }
        },
        stubs: {
          TrendChart: {
            template: '<div data-testid="trend-chart">{{ title }}</div>',
            props: ['labels', 'datasets', 'title', 'unit'],
          }
        }
      }
    })
  }

  it('renders 4 TrendChart components after loading', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await nextTick()
    const charts = wrapper.findAll('[data-testid="trend-chart"]')
    expect(charts.length).toBe(4)
  })

  it('shows no data message when trends data is null', async () => {
    const { getTrends } = await import('@shared/client/services/api')
    getTrends.mockImplementationOnce(async () => null)
    const wrapper = createWrapper()
    await nextTick()
    await nextTick()
    expect(wrapper.text()).toContain('No trend data available')
  })

  it('renders chart titles correctly', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await nextTick()
    const text = wrapper.text()
    expect(text).toContain('Issues Resolved')
    expect(text).toContain('GitHub Contributions')
    expect(text).toContain('GitLab Contributions')
    expect(text).toContain('Avg Cycle Time')
  })

  it('does not show mode toggle when only one org/team selected', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await nextTick()
    // No orgs selected by default, so mode toggle should be hidden
    expect(wrapper.text()).not.toContain('Aggregate')
    expect(wrapper.text()).not.toContain('Compare')
  })

  describe('project mode', () => {
    beforeEach(() => {
      mockProjectId.value = 'flightctl'
      mockIsNormalizedModel.value = true
    })

    it('communicates that GitHub/GitLab are not published, instead of charting a fabricated zero', async () => {
      const { getTrends } = await import('@shared/client/services/api')
      getTrends.mockImplementationOnce(async () => ({
        jira: { '2025-01': { resolved: 3, avgCycleTimeDays: 2, byTeam: {} } },
        github: null,
        gitlab: null,
      }))
      const wrapper = createWrapper()
      await nextTick()
      await nextTick()
      expect(wrapper.text()).toContain('GitHub Contributions: not published for this project.')
      expect(wrapper.text()).toContain('GitLab Contributions: not published for this project.')
      expect(wrapper.findAll('[data-testid="trend-chart"]').map(c => c.text())).not.toContain('GitHub Contributions')
    })

    it.each([
      ['missing-publication', 'Jira metrics have not been published for this project yet.'],
      ['disabled', 'Jira metrics are disabled for this project.'],
    ])('shows the publication-specific unavailable reason: %s', async (reason, message) => {
      const { getTrends } = await import('@shared/client/services/api')
      getTrends.mockImplementationOnce(async () => ({
        projectId: 'flightctl', availability: 'unavailable', reason, jira: null, github: null, gitlab: null,
      }))
      const wrapper = createWrapper()
      await nextTick()
      await nextTick()
      expect(wrapper.text()).toContain(message)
    })

    it('reloads when the project changes', async () => {
      const { getTrends } = await import('@shared/client/services/api')
      createWrapper()
      await nextTick()
      await nextTick()
      expect(getTrends).toHaveBeenCalledWith('flightctl')

      mockProjectId.value = 'osac'
      await nextTick()
      await nextTick()
      expect(getTrends).toHaveBeenCalledWith('osac')
    })

    it('ignores a stale response that resolves after a newer project request', async () => {
      const { getTrends } = await import('@shared/client/services/api')
      let resolveStale
      getTrends.mockImplementationOnce(() => new Promise(resolve => { resolveStale = resolve }))

      const wrapper = createWrapper()
      await nextTick()

      getTrends.mockImplementationOnce(async () => ({
        jira: { '2025-03': { resolved: 7, avgCycleTimeDays: 1, byTeam: {} } },
        github: null,
        gitlab: null,
      }))
      mockProjectId.value = 'osac'
      await nextTick()
      await nextTick()
      await nextTick()
      expect(wrapper.findAll('[data-testid="trend-chart"]').length).toBe(4)

      resolveStale({ jira: null, github: null, gitlab: null })
      await nextTick()
      await nextTick()

      expect(wrapper.findAll('[data-testid="trend-chart"]').length).toBe(4)
      expect(wrapper.text()).not.toContain('No trend data available')
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, readonly, nextTick } from 'vue'
import TrendsReport from '../../../client/reports/TrendsReport.vue'
import TrendChart from '../../../client/components/TrendChart.vue'
import { useReportFilters } from '../../../client/composables/useReportFilters'

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

// The chart only displays months within its rolling 12-month window, so
// fixtures that assert a specific month's value must use a month guaranteed
// to fall inside that window -- the current month always does.
function currentMonthKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
const MONTH = currentMonthKey()

vi.mock('@shared/client/services/api', () => ({
  getTrends: vi.fn(async () => mockTrendsData),
}))

describe('TrendsReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockProjectId.value = ''
    mockIsNormalizedModel.value = false
    mockRosterTeams.value = []
    useReportFilters().selectedTeamKeys.value = []
    useReportFilters().selectedOrgKeys.value = []
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
            name: 'TrendChart',
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
      expect(wrapper.text()).toContain('GitLab Contributions: Unsupported for this project.')
      expect(wrapper.findAll('[data-testid="trend-chart"]').map(c => c.text())).not.toContain('GitHub Contributions')
    })

    it('charts the connected GitHub contributions publication by its own monthly series, keyed by team not username', async () => {
      const { getTrends } = await import('@shared/client/services/api')
      getTrends.mockImplementationOnce(async () => ({
        jira: { [MONTH]: { resolved: 3, avgCycleTimeDays: 2, byTeam: {} } },
        github: {
          availability: 'available',
          partial: false,
          overall: { [MONTH]: 50 },
          byTeam: { 'flightctl::team-1': { [MONTH]: 30 } }
        },
        gitlab: null,
      }))
      const wrapper = createWrapper()
      await nextTick()
      await nextTick()
      expect(wrapper.text()).not.toContain('GitHub Contributions: not published for this project.')
      const githubChart = wrapper.findAllComponents(TrendChart).find(c => c.props('title') === 'GitHub Contributions')
      expect(githubChart).toBeTruthy()
      // No team/org selected -> overall series, not the per-team bucket.
      expect(githubChart.props('datasets')).toEqual([{ label: 'Overall', data: [50] }])
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

    it('charts the GitHub chart even when Jira is unavailable, instead of suppressing it entirely', async () => {
      const { getTrends } = await import('@shared/client/services/api')
      getTrends.mockImplementationOnce(async () => ({
        projectId: 'flightctl', availability: 'unavailable', reason: 'missing-publication',
        jira: null,
        github: { availability: 'available', partial: false, overall: { [MONTH]: 20 }, byTeam: {} },
        gitlab: null,
      }))
      const wrapper = createWrapper()
      await nextTick()
      await nextTick()
      expect(wrapper.text()).not.toContain('No trend data available')
      const githubChart = wrapper.findAllComponents(TrendChart).find(c => c.props('title') === 'GitHub Contributions')
      expect(githubChart).toBeTruthy()
      expect(githubChart.props('datasets')).toEqual([{ label: 'Overall', data: [20] }])
    })

    it('omits a selected team\'s GitHub series rather than charting a fabricated zero, even while another selected team has real data', async () => {
      mockRosterTeams.value = [
        { key: 'flightctl::team-1', displayName: 'Team One', members: [] },
        { key: 'flightctl::team-2', displayName: 'Team Two', members: [] },
      ]
      useReportFilters().selectedTeamKeys.value = ['flightctl::team-1', 'flightctl::team-2']
      const { getTrends } = await import('@shared/client/services/api')
      getTrends.mockImplementationOnce(async () => ({
        jira: { [MONTH]: { resolved: 3, avgCycleTimeDays: 2, byTeam: {} } },
        // Only team-1 has a published GitHub measurement; team-2 never appears.
        github: { availability: 'available', partial: true, overall: { [MONTH]: 10 }, byTeam: { 'flightctl::team-1': { [MONTH]: 10 } } },
        gitlab: null,
      }))
      const wrapper = createWrapper()
      await nextTick()
      await nextTick()
      const githubChart = wrapper.findAllComponents(TrendChart).find(c => c.props('title') === 'GitHub Contributions')
      const labels = githubChart.props('datasets').map(d => d.label)
      expect(labels).toEqual(['Team One'])
    })

    it('preserves a genuine zero-valued month in a team\'s GitHub series, instead of treating it as missing', async () => {
      mockRosterTeams.value = [{ key: 'flightctl::team-1', displayName: 'Team One', members: [] }]
      useReportFilters().selectedTeamKeys.value = ['flightctl::team-1']
      const { getTrends } = await import('@shared/client/services/api')
      getTrends.mockImplementationOnce(async () => ({
        jira: { [MONTH]: { resolved: 3, avgCycleTimeDays: 2, byTeam: {} } },
        github: { availability: 'available', partial: false, overall: { [MONTH]: 0 }, byTeam: { 'flightctl::team-1': { [MONTH]: 0 } } },
        gitlab: null,
      }))
      const wrapper = createWrapper()
      await nextTick()
      await nextTick()
      const githubChart = wrapper.findAllComponents(TrendChart).find(c => c.props('title') === 'GitHub Contributions')
      expect(githubChart.props('datasets')).toEqual([{ label: 'Team One', data: [0] }])
    })

    describe('publication with people but no monthly GitHub measurements ({ overall: {}, byTeam: {} })', () => {
      const emptyGithub = { availability: 'available', partial: false, overall: {}, byTeam: {} }

      async function mountWithEmptyGithub(trends = {}) {
        const { getTrends } = await import('@shared/client/services/api')
        getTrends.mockImplementationOnce(async () => ({
          jira: { [MONTH]: { resolved: 3, avgCycleTimeDays: 2, byTeam: {} } },
          github: emptyGithub,
          gitlab: null,
          ...trends,
        }))
        const wrapper = createWrapper()
        await nextTick()
        await nextTick()
        return wrapper
      }

      const githubChartOf = wrapper =>
        wrapper.findAllComponents(TrendChart).find(c => c.props('title') === 'GitHub Contributions')

      it('does not chart a fabricated zero Overall series when Jira supplies the month labels', async () => {
        const wrapper = await mountWithEmptyGithub()
        expect(githubChartOf(wrapper)).toBeUndefined()
        expect(wrapper.text()).toContain('GitHub Contributions: not published for this project.')
      })

      it('does not chart fabricated zero team or aggregate series for the selected teams', async () => {
        mockRosterTeams.value = [
          { key: 'flightctl::team-1', displayName: 'Team One', members: [] },
          { key: 'flightctl::team-2', displayName: 'Team Two', members: [] },
        ]
        useReportFilters().selectedTeamKeys.value = ['flightctl::team-1', 'flightctl::team-2']
        const wrapper = await mountWithEmptyGithub()
        expect(githubChartOf(wrapper)).toBeUndefined()

        await wrapper.findAll('button').find(b => b.text() === 'Aggregate').trigger('click')
        await nextTick()
        await nextTick()
        expect(githubChartOf(wrapper)).toBeUndefined()
      })

      it('reports no trend data when Jira is unavailable too', async () => {
        const wrapper = await mountWithEmptyGithub({ jira: null })
        expect(wrapper.text()).toContain('No trend data available')
      })

      it('still charts a published all-zero month as a genuine zero', async () => {
        const wrapper = await mountWithEmptyGithub({
          github: { ...emptyGithub, overall: { [MONTH]: 0 } },
        })
        expect(githubChartOf(wrapper).props('datasets')).toEqual([{ label: 'Overall', data: [0] }])
      })
    })

    it('omits the "Selected Teams" aggregate rather than labeling a partial sum as the full selection', async () => {
      mockRosterTeams.value = [
        { key: 'flightctl::team-1', displayName: 'Team One', members: [] },
        { key: 'flightctl::team-2', displayName: 'Team Two', members: [] },
      ]
      useReportFilters().selectedTeamKeys.value = ['flightctl::team-1', 'flightctl::team-2']
      const { getTrends } = await import('@shared/client/services/api')
      getTrends.mockImplementationOnce(async () => ({
        jira: { [MONTH]: { resolved: 3, avgCycleTimeDays: 2, byTeam: {} } },
        // Only team-1 has a published GitHub measurement; team-2 never appears.
        github: { availability: 'available', partial: true, overall: { [MONTH]: 10 }, byTeam: { 'flightctl::team-1': { [MONTH]: 10 } } },
        gitlab: null,
      }))
      const wrapper = createWrapper()
      await nextTick()
      await nextTick()
      const aggregateButton = wrapper.findAll('button').find(b => b.text() === 'Aggregate')
      await aggregateButton.trigger('click')
      await nextTick()
      await nextTick()
      // team-2 has no published measurement, so the "Selected Teams" total
      // must be omitted rather than summing only team-1 under the full label.
      expect(wrapper.findAllComponents(TrendChart).find(c => c.props('title') === 'GitHub Contributions')).toBeUndefined()
      expect(wrapper.text()).toContain('GitHub Contributions: not published for the selected team(s).')
    })

    it('shows the team-level unavailable message when the only selected team has no GitHub measurement', async () => {
      mockRosterTeams.value = [
        { key: 'flightctl::team-1', displayName: 'Team One', members: [] },
        { key: 'flightctl::team-2', displayName: 'Team Two', members: [] },
      ]
      useReportFilters().selectedTeamKeys.value = ['flightctl::team-2']
      const { getTrends } = await import('@shared/client/services/api')
      getTrends.mockImplementationOnce(async () => ({
        jira: { [MONTH]: { resolved: 3, avgCycleTimeDays: 2, byTeam: {} } },
        github: { availability: 'available', partial: true, overall: { [MONTH]: 10 }, byTeam: { 'flightctl::team-1': { [MONTH]: 10 } } },
        gitlab: null,
      }))
      const wrapper = createWrapper()
      await nextTick()
      await nextTick()
      expect(wrapper.findAllComponents(TrendChart).find(c => c.props('title') === 'GitHub Contributions')).toBeUndefined()
      expect(wrapper.text()).toContain('GitHub Contributions: not published for the selected team(s).')
      expect(wrapper.text()).not.toContain('not published for this project.')
    })

    it('ignores a stale organization-filter selection left over from legacy OSAC mode, instead of charting a fabricated-zero org series', async () => {
      useReportFilters().selectedOrgKeys.value = ['org1']
      const { getTrends } = await import('@shared/client/services/api')
      getTrends.mockImplementationOnce(async () => ({
        jira: { [MONTH]: { resolved: 3, avgCycleTimeDays: 2, byTeam: {} } },
        github: { availability: 'available', partial: false, overall: { [MONTH]: 20 }, byTeam: {} },
        gitlab: null,
      }))
      const wrapper = createWrapper()
      await nextTick()
      await nextTick()
      // Project mode has no org concept; the stale selection must not route
      // the series into the (non-existent) org bucket, which would silently
      // produce a fabricated zero instead of the real overall total.
      const githubChart = wrapper.findAllComponents(TrendChart).find(c => c.props('title') === 'GitHub Contributions')
      expect(githubChart.props('datasets')).toEqual([{ label: 'Overall', data: [20] }])
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

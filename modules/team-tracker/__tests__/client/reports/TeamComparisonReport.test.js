import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, readonly, nextTick } from 'vue'
import TeamComparisonReport from '../../../client/reports/TeamComparisonReport.vue'
import ReportChart from '../../../client/components/ReportChart.vue'
import { useReportFilters } from '../../../client/composables/useReportFilters'

const mockIsNormalizedModel = ref(false)
const mockRosterTeams = ref([])

vi.mock('@shared/client/composables/useRoster', () => ({
  useRoster: () => ({
    orgs: ref([
      {
        key: 'org1',
        displayName: 'Org One',
        teams: {
          'Team A': {
            displayName: 'Team A',
            members: [{ name: 'Alice', githubUsername: 'alice-gh' }]
          }
        }
      }
    ]),
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

vi.mock('@shared/client/composables/useGithubStats', () => ({
  useGithubStats: () => ({
    getContributions: vi.fn(() => ({ totalContributions: 100 })),
    loadGithubStats: vi.fn(),
  })
}))

vi.mock('@shared/client/composables/useGitlabStats', () => ({
  useGitlabStats: () => ({
    getContributions: vi.fn(() => ({ totalContributions: 50 })),
    loadGitlabStats: vi.fn(),
  })
}))

vi.mock('@shared/client/services/api', () => ({
  getTeamMetrics: vi.fn(async () => ({
    memberCount: 5,
    aggregate: { resolvedCount: 20, avgCycleTimeDays: 3.5 }
  }))
}))

describe('TeamComparisonReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockProjectId.value = ''
    mockIsNormalizedModel.value = false
    mockRosterTeams.value = []
    useReportFilters().selectedTeamKeys.value = []
    useReportFilters().selectedOrgKeys.value = []
  })

  function createWrapper() {
    return mount(TeamComparisonReport, {
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
          ReportChart: {
            template: '<div data-testid="report-chart">{{ title }}</div>',
            props: ['type', 'labels', 'data', 'title', 'unit'],
          }
        }
      }
    })
  }

  it('renders metric checkboxes', () => {
    const wrapper = createWrapper()
    expect(wrapper.text()).toContain('Team Size')
    expect(wrapper.text()).toContain('Issues Resolved')
    expect(wrapper.text()).toContain('GitHub Contributions (1yr)')
  })

  it('renders chart type toggle', () => {
    const wrapper = createWrapper()
    expect(wrapper.text()).toContain('Bar')
    expect(wrapper.text()).toContain('Horizontal')
    expect(wrapper.text()).toContain('Doughnut')
  })

  it('renders Run button', () => {
    const wrapper = createWrapper()
    expect(wrapper.text()).toContain('Run')
  })

  it('shows empty state initially', () => {
    const wrapper = createWrapper()
    expect(wrapper.text()).toContain('Select teams and metrics, then click Run')
  })

  it('Run button is disabled when no teams or metrics selected', () => {
    const wrapper = createWrapper()
    const buttons = wrapper.findAll('button')
    const runButton = buttons.find(b => b.text().includes('Run'))
    expect(runButton.attributes('disabled')).toBeDefined()
  })

  describe('project mode', () => {
    beforeEach(() => {
      mockProjectId.value = 'flightctl'
      mockIsNormalizedModel.value = true
      mockRosterTeams.value = [
        { key: 'flightctl::team-1', displayName: 'Flight Team', members: [{ name: 'Bob', githubUsername: null, gitlabUsername: null }] }
      ]
      useReportFilters().selectedTeamKeys.value = ['flightctl::team-1']
    })

    it('enables the GitHub checkboxes in project mode (contributions are connected)', () => {
      const wrapper = createWrapper()
      const checkbox = wrapper.find('input[value="githubContributions"]')
      expect(checkbox.exists()).toBe(true)
      expect(checkbox.attributes('disabled')).toBeUndefined()
    })

    it('keeps GitLab checkboxes visible but disabled as Unsupported, with an inline reason', () => {
      const wrapper = createWrapper()
      const checkbox = wrapper.find('input[value="gitlabContributions"]')
      expect(checkbox.exists()).toBe(true)
      expect(checkbox.attributes('disabled')).toBeDefined()
      expect(wrapper.text()).toContain('GitLab Contributions (1yr)')
      expect(wrapper.text()).toContain('(Unsupported for this project)')
    })

    it('calls getTeamMetrics with the project id', async () => {
      const { getTeamMetrics } = await import('@shared/client/services/api')
      const wrapper = createWrapper()
      await wrapper.find('input[value="teamSize"]').setValue(true)
      await wrapper.findAll('button').find(b => b.text() === 'Run').trigger('click')
      await nextTick()
      await nextTick()
      expect(getTeamMetrics).toHaveBeenCalledWith('flightctl::team-1', 'flightctl')
    })

    it('reads GitHub totals from the connected contributions publication, not a username join', async () => {
      const { getTeamMetrics } = await import('@shared/client/services/api')
      getTeamMetrics.mockImplementationOnce(async () => ({
        teamKey: 'flightctl::team-1', available: true, memberCount: 2,
        aggregate: { resolvedCount: 5, avgCycleTimeDays: 2, github: { total: 88, memberCount: 2, contributorCount: 2 } }
      }))
      const wrapper = createWrapper()
      await wrapper.find('input[value="githubContributions"]').setValue(true)
      await wrapper.findAll('button').find(b => b.text() === 'Run').trigger('click')
      await nextTick()
      await nextTick()
      const chart = wrapper.findComponent(ReportChart)
      expect(chart.exists()).toBe(true)
      // The default useGithubStats mock returns totalContributions: 100 per username
      // lookup; asserting 88 proves the chart used aggregate.github, not that path.
      expect(chart.props('data')).toEqual([88])
    })

    describe('GitHub coverage', () => {
      const github = (total, memberCount, contributorCount) => ({
        teamKey: 'flightctl::team-1', available: true, memberCount: 5,
        aggregate: { resolvedCount: 5, avgCycleTimeDays: 2, github: { total, memberCount, contributorCount } }
      })

      async function runMetric(metric, data) {
        const { getTeamMetrics } = await import('@shared/client/services/api')
        getTeamMetrics.mockImplementationOnce(async () => data)
        const wrapper = createWrapper()
        await wrapper.find(`input[value="${metric}"]`).setValue(true)
        await wrapper.findAll('button').find(b => b.text() === 'Run').trigger('click')
        await nextTick()
        await nextTick()
        return wrapper
      }

      it('averages over the contributions publication\'s contributors, not the Jira roster size', async () => {
        const wrapper = await runMetric('githubPerMember', github(90, 2, 2))
        expect(wrapper.findComponent(ReportChart).props('data')).toEqual([45])
        expect(wrapper.text()).not.toContain('Partial coverage')
      })

      it('averages over measured contributors only, and labels the partial coverage', async () => {
        // 90 contributions from 2 of 5 members: 45 per measured member, never 18.
        const wrapper = await runMetric('githubPerMember', github(90, 5, 2))
        expect(wrapper.findComponent(ReportChart).props('data')).toEqual([45])
        expect(wrapper.text()).toContain('Partial coverage, averaged over measured members only: Flight Team (2 of 5 members)')
      })

      it('labels a partial total without altering its value', async () => {
        const wrapper = await runMetric('githubContributions', github(90, 5, 2))
        expect(wrapper.findComponent(ReportChart).props('data')).toEqual([90])
        expect(wrapper.text()).toContain('Partial coverage, totals cover measured members only: Flight Team (2 of 5 members)')
      })

      it('does not flag a complete total as partial', async () => {
        const wrapper = await runMetric('githubContributions', github(90, 5, 5))
        expect(wrapper.findComponent(ReportChart).props('data')).toEqual([90])
        expect(wrapper.text()).not.toContain('Partial coverage')
      })

      it('keeps a genuine measured zero, flagging it as partial only when members are unmeasured', async () => {
        const complete = await runMetric('githubPerMember', github(0, 2, 2))
        expect(complete.findComponent(ReportChart).props('data')).toEqual([0])
        expect(complete.text()).not.toContain('Partial coverage')

        const partial = await runMetric('githubPerMember', github(0, 3, 1))
        expect(partial.findComponent(ReportChart).props('data')).toEqual([0])
        expect(partial.text()).toContain('Flight Team (1 of 3 members)')
      })

      it('flags only the partial team when several teams are compared', async () => {
        mockRosterTeams.value = [
          { key: 'flightctl::team-1', displayName: 'Flight Team', members: [] },
          { key: 'flightctl::team-2', displayName: 'Flight Team 2', members: [] }
        ]
        useReportFilters().selectedTeamKeys.value = ['flightctl::team-1', 'flightctl::team-2']
        const { getTeamMetrics } = await import('@shared/client/services/api')
        getTeamMetrics.mockImplementation(async teamKey => ({
          ...github(teamKey === 'flightctl::team-1' ? 90 : 40, 5, teamKey === 'flightctl::team-1' ? 2 : 5),
          teamKey
        }))
        const wrapper = createWrapper()
        await wrapper.find('input[value="githubPerMember"]').setValue(true)
        await wrapper.findAll('button').find(b => b.text() === 'Run').trigger('click')
        await nextTick()
        await nextTick()
        expect(wrapper.findComponent(ReportChart).props('data')).toEqual([45, 8])
        expect(wrapper.text()).toContain('Flight Team (2 of 5 members)')
        expect(wrapper.text()).not.toContain('Flight Team 2 (')
      })
    })

    it('shows the team as unavailable, not a fabricated zero, when the contributions publication has nothing for it', async () => {
      const { getTeamMetrics } = await import('@shared/client/services/api')
      getTeamMetrics.mockImplementationOnce(async () => ({
        teamKey: 'flightctl::team-1', available: true, memberCount: 2,
        aggregate: { resolvedCount: 5, avgCycleTimeDays: 2, github: null }
      }))
      const wrapper = createWrapper()
      await wrapper.find('input[value="githubContributions"]').setValue(true)
      await wrapper.findAll('button').find(b => b.text() === 'Run').trigger('click')
      await nextTick()
      await nextTick()
      expect(wrapper.text()).toContain('not published for the selected team(s)')
      expect(wrapper.find('[data-testid="report-chart"]').exists()).toBe(false)
    })

    it('labels Issues Resolved with the publication\'s real lookback window instead of a fabricated 90d', async () => {
      const { getTeamMetrics } = await import('@shared/client/services/api')
      getTeamMetrics.mockImplementationOnce(async () => ({
        teamKey: 'flightctl::team-1', available: true, memberCount: 2,
        aggregate: { resolvedCount: 5, avgCycleTimeDays: 2, lookbackDays: 365 }
      }))
      const wrapper = createWrapper()
      await wrapper.find('input[value="resolvedCount"]').setValue(true)
      await wrapper.findAll('button').find(b => b.text() === 'Run').trigger('click')
      await nextTick()
      await nextTick()
      expect(wrapper.find('[data-testid="report-chart"]').text()).toBe('Issues Resolved (365d)')
    })

    it('omits the lookback suffix when it is unknown, rather than asserting a wrong window', async () => {
      const { getTeamMetrics } = await import('@shared/client/services/api')
      getTeamMetrics.mockImplementationOnce(async () => ({
        teamKey: 'flightctl::team-1', available: true, memberCount: 2,
        aggregate: { resolvedCount: 5, avgCycleTimeDays: 2, lookbackDays: null }
      }))
      const wrapper = createWrapper()
      await wrapper.find('input[value="resolvedCount"]').setValue(true)
      await wrapper.findAll('button').find(b => b.text() === 'Run').trigger('click')
      await nextTick()
      await nextTick()
      expect(wrapper.find('[data-testid="report-chart"]').text()).toBe('Issues Resolved')
    })

    it('omits the lookback suffix when one of several active teams has an unknown window, even though the rest agree', async () => {
      mockRosterTeams.value = [
        { key: 'flightctl::team-1', displayName: 'Flight Team', members: [{ name: 'Bob', githubUsername: null, gitlabUsername: null }] },
        { key: 'flightctl::team-2', displayName: 'Flight Team 2', members: [{ name: 'Carol', githubUsername: null, gitlabUsername: null }] }
      ]
      useReportFilters().selectedTeamKeys.value = ['flightctl::team-1', 'flightctl::team-2']
      const { getTeamMetrics } = await import('@shared/client/services/api')
      getTeamMetrics.mockImplementation(async teamKey => (
        teamKey === 'flightctl::team-1'
          ? { teamKey, available: true, memberCount: 2, aggregate: { resolvedCount: 5, avgCycleTimeDays: 2, lookbackDays: 365 } }
          : { teamKey, available: true, memberCount: 2, aggregate: { resolvedCount: 3, avgCycleTimeDays: 1, lookbackDays: null } }
      ))
      const wrapper = createWrapper()
      await wrapper.find('input[value="resolvedCount"]').setValue(true)
      await wrapper.findAll('button').find(b => b.text() === 'Run').trigger('click')
      await nextTick()
      await nextTick()
      expect(wrapper.find('[data-testid="report-chart"]').text()).toBe('Issues Resolved')
    })

    it('shows the unavailable banner instead of a fabricated zero when Jira metrics are unpublished', async () => {
      const { getTeamMetrics } = await import('@shared/client/services/api')
      getTeamMetrics.mockImplementationOnce(async () => ({
        teamKey: 'flightctl::team-1', available: false, reason: 'missing-publication'
      }))
      const wrapper = createWrapper()
      await wrapper.find('input[value="teamSize"]').setValue(true)
      await wrapper.findAll('button').find(b => b.text() === 'Run').trigger('click')
      await nextTick()
      await nextTick()
      expect(wrapper.text()).toContain('Jira metrics are not available for this project')
      expect(wrapper.text()).toContain('Jira metrics have not been published for this project yet.')
    })

    it('retries fetching on a subsequent Run after an unavailable result, instead of treating it as cached', async () => {
      const { getTeamMetrics } = await import('@shared/client/services/api')
      getTeamMetrics.mockImplementationOnce(async () => ({
        teamKey: 'flightctl::team-1', available: false, reason: 'missing-publication'
      }))
      const wrapper = createWrapper()
      await wrapper.find('input[value="teamSize"]').setValue(true)
      await wrapper.findAll('button').find(b => b.text() === 'Run').trigger('click')
      await nextTick()
      await nextTick()
      expect(wrapper.text()).toContain('Jira metrics are not available for this project')

      getTeamMetrics.mockImplementationOnce(async () => ({
        teamKey: 'flightctl::team-1', available: true, memberCount: 5, aggregate: { resolvedCount: 20, avgCycleTimeDays: 3.5 }
      }))
      await wrapper.findAll('button').find(b => b.text() === 'Run').trigger('click')
      await nextTick()
      await nextTick()

      expect(getTeamMetrics).toHaveBeenCalledTimes(2)
      expect(wrapper.text()).not.toContain('Jira metrics are not available for this project')
      expect(wrapper.find('[data-testid="report-chart"]').exists()).toBe(true)
    })

    it('clears stale charts and the unavailable banner on project switch', async () => {
      const { getTeamMetrics } = await import('@shared/client/services/api')
      getTeamMetrics.mockImplementationOnce(async () => ({
        teamKey: 'flightctl::team-1', available: false, reason: 'missing-publication'
      }))
      const wrapper = createWrapper()
      await wrapper.find('input[value="teamSize"]').setValue(true)
      await wrapper.findAll('button').find(b => b.text() === 'Run').trigger('click')
      await nextTick()
      await nextTick()
      expect(wrapper.text()).toContain('Jira metrics are not available for this project')

      mockProjectId.value = 'osac'
      await nextTick()
      expect(wrapper.text()).not.toContain('Jira metrics are not available for this project')
    })

    it('ignores a stale run result that resolves after a project switch', async () => {
      const { getTeamMetrics } = await import('@shared/client/services/api')
      let resolveStale
      getTeamMetrics.mockImplementationOnce(() => new Promise(resolve => { resolveStale = resolve }))

      const wrapper = createWrapper()
      await wrapper.find('input[value="teamSize"]').setValue(true)
      await wrapper.findAll('button').find(b => b.text() === 'Run').trigger('click')
      await nextTick()

      mockProjectId.value = 'osac'
      await nextTick()

      resolveStale({ teamKey: 'flightctl::team-1', available: true, memberCount: 5, aggregate: { resolvedCount: 20, avgCycleTimeDays: 3.5 } })
      await nextTick()
      await nextTick()

      expect(wrapper.text()).toContain('Select teams and metrics, then click Run')
      expect(wrapper.find('[data-testid="report-chart"]').exists()).toBe(false)
    })
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import OrgDashboardView from '../../client/views/OrgDashboardView.vue'

vi.mock('vue-chartjs', () => ({
  Doughnut: { name: 'Doughnut', props: ['data', 'options'], template: '<canvas></canvas>' }
}))
vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  ArcElement: 'ArcElement',
  Tooltip: 'Tooltip',
  Legend: 'Legend'
}))

const projectId = ref('')
vi.mock('@shared/client/composables/useProjectId.js', () => ({
  useProjectId: () => projectId
}))

const rosterData = ref(null)
const rosterPeople = ref([])
const rosterTeams = ref([])
const rosterLoading = ref(false)
const rosterError = ref(null)
const mockLoadRoster = vi.fn()

vi.mock('@shared/client/composables/useRoster.js', () => ({
  useRoster: () => ({
    rosterData,
    people: rosterPeople,
    teams: rosterTeams,
    loading: rosterLoading,
    error: rosterError,
    loadRoster: mockLoadRoster
  })
}))

const mockLoadOrgSummary = vi.fn()
const mockLoadOrgs = vi.fn()
const orgRosterOrgs = ref([])

vi.mock('../../client/composables/useOrgRoster', () => ({
  useOrgRoster: () => ({
    loadOrgSummary: mockLoadOrgSummary,
    loadOrgs: mockLoadOrgs,
    orgs: orgRosterOrgs
  })
}))

const navigateTo = vi.fn()
let currentWrapper = null

// Keeps each test's instance watchers from leaking into later tests, since
// projectId is a shared ref and an un-unmounted watch(projectId, ...) keeps firing.
function mountView(params = {}) {
  currentWrapper = mount(OrgDashboardView, {
    global: {
      provide: {
        moduleNav: {
          params: ref(params),
          navigateTo,
          goBack: vi.fn(),
          updateParams: vi.fn()
        }
      }
    }
  })
  return currentWrapper
}

// Member shared across two teams, plus one unassigned active member and one inactive member.
function flightctlRoster() {
  return {
    projectId: 'flightctl',
    availability: 'available',
    reason: null,
    teams: [
      { key: 'flightctl::team-1', displayName: 'Core', id: 'team-1', memberAccountIds: ['acc-1', 'acc-2'] },
      { key: 'flightctl::team-2', displayName: 'Platform', id: 'team-2', memberAccountIds: ['acc-1'] }
    ],
    people: [
      { accountId: 'acc-1', displayName: 'Ada Lovelace', active: true, title: 'Senior Engineer', teamIds: ['team-1', 'team-2'] },
      { accountId: 'acc-2', displayName: 'Grace Hopper', active: true, title: 'Engineering Manager', teamIds: ['team-1'] },
      { accountId: 'acc-3', displayName: 'Unassigned Person', active: true, title: null, teamIds: [] },
      { accountId: 'acc-4', displayName: 'Former Engineer', active: false, title: 'Engineer', teamIds: [] }
    ]
  }
}

describe('OrgDashboardView', () => {
  afterEach(() => {
    currentWrapper?.unmount()
    currentWrapper = null
  })

  beforeEach(() => {
    vi.clearAllMocks()
    projectId.value = ''
    rosterData.value = null
    rosterPeople.value = []
    rosterTeams.value = []
    rosterLoading.value = false
    rosterError.value = null
    orgRosterOrgs.value = []
    mockLoadOrgSummary.mockResolvedValue({
      org: 'Legacy Org',
      teamCount: 2,
      headcount: 5,
      roleBreakdown: { Engineer: 5 },
      teams: [{ name: 'Team A', memberCount: 5, rfeCount: 1 }],
      components: ['comp-a'],
      totalRfeCount: 1
    })
  })

  it('legacy OSAC mode loads the org-summary endpoint and never touches the canonical roster', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(mockLoadOrgSummary).toHaveBeenCalledWith('_all')
    expect(mockLoadRoster).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Legacy Org Dashboard')
    expect(wrapper.text()).toContain('Components')
    expect(wrapper.text()).toContain('Open PRDs')
  })

  it('canonical project mode never calls the legacy org-summary endpoint', async () => {
    projectId.value = 'flightctl'
    rosterData.value = flightctlRoster()
    rosterPeople.value = rosterData.value.people
    rosterTeams.value = [
      { key: 'flightctl::team-1', displayName: 'Core', members: [{ accountId: 'acc-1' }, { accountId: 'acc-2' }] },
      { key: 'flightctl::team-2', displayName: 'Platform', members: [{ accountId: 'acc-1' }] }
    ]

    const wrapper = mountView()
    await flushPromises()

    expect(mockLoadRoster).toHaveBeenCalled()
    expect(mockLoadOrgSummary).not.toHaveBeenCalled()
    expect(mockLoadOrgs).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('flightctl Dashboard')
  })

  it('computes unique active headcount across teams and includes unassigned active people, excluding inactive ones', async () => {
    projectId.value = 'flightctl'
    rosterData.value = flightctlRoster()
    rosterPeople.value = rosterData.value.people
    rosterTeams.value = [
      { key: 'flightctl::team-1', displayName: 'Core', members: [{ accountId: 'acc-1' }, { accountId: 'acc-2' }] },
      { key: 'flightctl::team-2', displayName: 'Platform', members: [{ accountId: 'acc-1' }] }
    ]

    const wrapper = mountView()
    await flushPromises()

    // acc-1, acc-2, acc-3 (unassigned) are active; acc-4 is inactive and excluded.
    expect(wrapper.findAll('button p.text-3xl')[1].text()).toBe('3')
  })

  it('reports the actual number of published teams and does not fabricate PRD/component metrics', async () => {
    projectId.value = 'flightctl'
    rosterData.value = flightctlRoster()
    rosterPeople.value = rosterData.value.people
    rosterTeams.value = [
      { key: 'flightctl::team-1', displayName: 'Core', members: [{ accountId: 'acc-1' }, { accountId: 'acc-2' }] },
      { key: 'flightctl::team-2', displayName: 'Platform', members: [{ accountId: 'acc-1' }] }
    ]

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.findAll('button p.text-3xl')[0].text()).toBe('2')
    expect(wrapper.text()).not.toContain('Components')
    expect(wrapper.text()).not.toContain('Open PRDs')
    expect(wrapper.text()).not.toContain('PRD Backlog')
  })

  it('role breakdown total reconciles with the headcount stat tile', async () => {
    projectId.value = 'flightctl'
    rosterData.value = flightctlRoster()
    rosterPeople.value = rosterData.value.people
    rosterTeams.value = []

    const wrapper = mountView()
    await flushPromises()

    const headcountStat = wrapper.findAll('button p.text-3xl')[1].text()
    const totalRow = wrapper.findAll('tr').find(r => r.text().startsWith('Total'))
    expect(totalRow.findAll('td')[1].text()).toBe(headcountStat)
  })

  it('navigates to the canonical team-detail route using team.key', async () => {
    projectId.value = 'flightctl'
    rosterData.value = flightctlRoster()
    rosterPeople.value = rosterData.value.people
    rosterTeams.value = [
      { key: 'flightctl::team-1', displayName: 'Core', members: [{ accountId: 'acc-1' }, { accountId: 'acc-2' }] }
    ]

    const wrapper = mountView()
    await flushPromises()

    const teamRow = wrapper.findAll('tbody tr').find(r => r.text().includes('Core'))
    await teamRow.trigger('click')
    expect(navigateTo).toHaveBeenCalledWith('team-detail', { teamKey: 'flightctl::team-1' })
  })

  it('shows an unavailable state without calling the legacy endpoint', async () => {
    projectId.value = 'flightctl'
    rosterData.value = { projectId: 'flightctl', availability: 'unavailable', reason: 'not-collected', teams: [], people: [] }
    rosterPeople.value = []
    rosterTeams.value = []

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('No current roster publication is available')
    expect(mockLoadOrgSummary).not.toHaveBeenCalled()
  })

  it('shows an empty state when the roster has no active people', async () => {
    projectId.value = 'flightctl'
    rosterData.value = { projectId: 'flightctl', availability: 'empty', reason: null, teams: [], people: [] }
    rosterPeople.value = []
    rosterTeams.value = []

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('No Active People Published')
  })

  it('does not retain stale project data when switching Flight Control -> OSAC -> Flight Control', async () => {
    projectId.value = 'flightctl'
    rosterData.value = flightctlRoster()
    rosterPeople.value = rosterData.value.people
    rosterTeams.value = [
      { key: 'flightctl::team-1', displayName: 'Core', members: [{ accountId: 'acc-1' }, { accountId: 'acc-2' }] }
    ]

    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('flightctl Dashboard')

    // Switch to OSAC: canonical state is cleared immediately (useRoster's own
    // contract), the legacy summary loads, and no project panel remains.
    projectId.value = ''
    rosterData.value = null
    rosterPeople.value = []
    rosterTeams.value = []
    await flushPromises()

    expect(wrapper.text()).toContain('Legacy Org Dashboard')
    expect(wrapper.text()).not.toContain('flightctl Dashboard')

    // Switch back with a different headcount and confirm the old roster's
    // count (3) never reappears alongside the new one (1).
    projectId.value = 'flightctl'
    rosterData.value = flightctlRoster()
    rosterData.value.people = [
      { accountId: 'acc-9', displayName: 'New Hire', active: true, title: 'Engineer', teamIds: [] }
    ]
    rosterPeople.value = rosterData.value.people
    rosterTeams.value = []
    await flushPromises()

    expect(wrapper.text()).toContain('flightctl Dashboard')
    expect(wrapper.findAll('button p.text-3xl')[1].text()).toBe('1')
  })
})

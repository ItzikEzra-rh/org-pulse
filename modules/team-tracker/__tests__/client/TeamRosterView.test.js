import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import TeamRosterView from '../../client/views/TeamRosterView.vue'
import { getTeamMetrics } from '@shared/client/services/api'

// Mock all external dependencies
const legacyTeam = {
  key: 'crobson::Model Serving',
  displayKey: 'AAET::Model Serving',
  displayName: 'Model Serving',
  org: 'AI Platform',
  members: [
    { name: 'Alice', jiraDisplayName: 'Alice', githubUsername: 'alice', gitlabUsername: 'alice' },
    { name: 'Bob', jiraDisplayName: 'Bob', githubUsername: 'bob', gitlabUsername: null },
  ]
}
const rosterTeams = ref([legacyTeam])
const rosterDataValue = ref({ teamDataSource: 'sheets' })
const isNormalizedModelValue = ref(false)
const rosterLoadingValue = ref(false)

vi.mock('@shared/client/composables/useRoster', () => ({
  useRoster: () => ({
    teams: rosterTeams,
    rosterData: rosterDataValue,
    loading: rosterLoadingValue,
    multiTeamMembers: ref(new Set()),
    getTeamsForPerson: () => ['Model Serving'],
    visibleFields: ref([]),
    primaryDisplayField: ref(null),
    reloadRoster: vi.fn(),
    isNormalizedModel: isNormalizedModelValue
  })
}))

vi.mock('@shared/client/composables/useGitlabStats', () => ({
  useGitlabStats: () => ({
    loadGitlabStats: vi.fn(),
    getContributions: () => null
  })
}))

vi.mock('@shared/client/composables/useAuth', () => ({
  useAuth: () => ({ isAdmin: ref(false) })
}))

vi.mock('@shared/client/composables/usePermissions', () => ({
  usePermissions: () => ({
    canEditTeam: () => false,
    canEdit: () => false,
    isAdmin: ref(false),
    isManager: ref(false),
    tier: ref('user'),
    managedUids: ref(new Set()),
    userUid: ref(null),
    loading: ref(false),
    refresh: vi.fn()
  })
}))

vi.mock('@shared/client/composables/useFieldDefinitions', () => ({
  useFieldDefinitions: () => ({
    definitions: ref({ personFields: [], teamFields: [] }),
    loading: ref(false),
    fetchDefinitions: vi.fn()
  })
}))

const mockLoadTeamDetail = vi.fn()
const mockLoadRfeConfig = vi.fn()

function setupMockLoadTeamDetail(data) {
  mockLoadTeamDetail.mockImplementation((_key, onData) => {
    if (onData) onData(data)
    return Promise.resolve(data)
  })
}

vi.mock('../../client/composables/useOrgRoster', () => ({
  useOrgRoster: () => ({
    loadTeamDetail: mockLoadTeamDetail,
    loadRfeConfig: mockLoadRfeConfig
  })
}))

vi.mock('@shared/client/services/api', () => ({
  refreshMetrics: vi.fn(),
  getTeamMetrics: vi.fn(),
  apiRequest: vi.fn().mockResolvedValue({})
}))

vi.mock('@shared/client/composables/useGithubStats', () => ({
  useGithubStats: () => ({ getContributions: () => null })
}))

vi.mock('../../client/composables/useViewPreference', () => ({
  useViewPreference: () => ({ viewPreference: ref('table') })
}))

vi.mock('@shared/client/composables/useModuleLink', () => ({
  useModuleLink: () => ({
    linkTo: (moduleSlug, viewId, params = {}) => {
      const qs = Object.entries(params)
        .filter(([, v]) => v != null)
        .map(([k, v]) => `${k}=${v}`)
        .join('&')
      return `#/${moduleSlug}/${viewId}${qs ? '?' + qs : ''}`
    }
  })
}))

vi.mock('../../../../src/composables/useModules', () => ({
  useModules: () => ({
    enabledBuiltInSlugs: ref(['ai-impact', 'team-tracker'])
  })
}))

vi.mock('../../client/services/autofix-api.js', () => ({
  fetchAutofixData: vi.fn().mockResolvedValue({ issues: [], fetchedAt: null })
}))

vi.mock('../../client/composables/useAllocationStrategy', () => ({
  useAllocationStrategy: () => ({
    configured: { value: true },
    strategyId: { value: 'ai-eng-40-40-20' },
    name: { value: '40/40/20 Allocation' },
    description: { value: '' },
    categories: {
      value: [
        { key: 'tech-debt-quality', name: 'Tech Debt & Quality', color: 'amber', target: 40 },
        { key: 'new-features', name: 'New Features', color: 'blue', target: 40 },
        { key: 'learning-enablement', name: 'Learning & Enablement', color: 'green', target: 20 }
      ]
    },
    settingsComponent: { value: null }
  })
}))

// Mock chart dependencies
vi.mock('vue-chartjs', () => ({
  Doughnut: { template: '<div></div>', props: ['data', 'options'] },
  Bar: { template: '<div></div>', props: ['data', 'options'] },
  Line: { template: '<div></div>', props: ['data', 'options'] }
}))
vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  ArcElement: {}, Tooltip: {}, Legend: {}, BarElement: {}, BarController: {},
  CategoryScale: {}, LinearScale: {}, PointElement: {}, LineElement: {}, Filler: {}, Title: {}
}))

function mountView(teamKey = 'AAET::Model Serving', extraParams = {}) {
  return mount(TeamRosterView, {
    global: {
      provide: {
        moduleNav: {
          params: ref({ teamKey, ...extraParams }),
          goBack: vi.fn(),
          navigateTo: vi.fn(),
          updateParams: vi.fn()
        }
      }
    }
  })
}

describe('TeamRosterView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rosterTeams.value = [legacyTeam]
    isNormalizedModelValue.value = false
    rosterLoadingValue.value = false
    rosterDataValue.value = { teamDataSource: 'sheets' }
    setupMockLoadTeamDetail({
      name: 'Model Serving',
      org: 'AI Platform',
      productManagers: ['Jane Doe'],
      engLeads: ['Alice B.'],
      boards: [{ url: 'https://jira.example.com/boards/123', name: 'MS Board' }],
      rfeCount: 5,
      rfeIssues: [],
      components: ['KServe'],
      headcount: { totalHeadcount: 10, byRole: { SE: 7, QE: 3 } }
    })
    mockLoadRfeConfig.mockResolvedValue({ jiraHost: 'https://redhat.atlassian.net' })
  })

  it('renders team header with name and member count', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('Model Serving')
    expect(wrapper.text()).toContain('2 members')
  })

  it('shows enriched header details from org-teams', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('PM:')
    expect(wrapper.text()).toContain('Jane Doe')
    expect(wrapper.text()).toContain('Eng Lead:')
    expect(wrapper.text()).toContain('Alice B.')
    expect(wrapper.text()).toContain('5 open PRDs')
  })

  it('renders the visible tabs', async () => {
    const wrapper = mountView()
    await flushPromises()
    const tabButtons = wrapper.findAll('nav button')
    const tabLabels = tabButtons.map(b => b.text())
    expect(tabLabels).toContain('Overview')
    expect(tabLabels).toContain('Delivery')
  })

  // PRD Backlog, Allocation, and Autofix are temporarily hidden (HIDDEN_TAB_IDS in TeamRosterView.vue).
  it('does not render the temporarily hidden tabs', async () => {
    const wrapper = mountView()
    await flushPromises()
    const tabLabels = wrapper.findAll('nav button').map(b => b.text())
    expect(tabLabels).not.toContain('PRD Backlog')
    expect(tabLabels).not.toContain('Allocation')
    expect(tabLabels).not.toContain('Autofix')
    expect(tabLabels).toHaveLength(2)
  })

  it('switches tabs when tab buttons are clicked', async () => {
    const wrapper = mountView()
    await flushPromises()

    // Default tab is Delivery
    const overviewTab = wrapper.findAll('nav button').find(b => b.text() === 'Overview')
    await overviewTab.trigger('click')

    // Overview content should be visible
    expect(wrapper.text()).toContain('Team Members')
  })

  it('falls back to Overview when a hidden tab is requested via a stale URL param', async () => {
    const wrapper = mountView('AAET::Model Serving', { tab: 'backlog' })
    await flushPromises()

    // Overview content renders instead of leaving the view empty
    expect(wrapper.text()).toContain('Team Members')
    const activeLabel = wrapper.findAll('nav button').find(b => b.classes().some(c => c.includes('primary')))
    expect(activeLabel.text()).toBe('Overview')
  })

  it('degrades gracefully when loadTeamDetail fails', async () => {
    mockLoadTeamDetail.mockImplementation((_key, _onData) => {
      return Promise.reject(new Error('Not found'))
    })
    const wrapper = mountView()
    await flushPromises()

    // Header still shows roster data
    expect(wrapper.text()).toContain('Model Serving')
    expect(wrapper.text()).toContain('2 members')

    // Enriched details not shown
    expect(wrapper.text()).not.toContain('PM:')
    expect(wrapper.text()).not.toContain('Eng Lead:')
  })

  it('renders board links in header', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('Board:')
    expect(wrapper.text()).toContain('MS Board')
    const boardLink = wrapper.find('a[target="_blank"]')
    expect(boardLink.attributes('href')).toContain('boards/123')
  })

  it('fetches team metrics and detail only once when team resolution and roster-loading both settle in the same tick', async () => {
    // A key unused by any other test in this file: earlier tests' mounted
    // instances are never unmounted and share these module-level refs, so a
    // key already in use would let their watchers answer too.
    const raceTeam = {
      key: 'race::Team',
      displayKey: 'RACE::Team',
      displayName: 'Race Team',
      members: [{ name: 'Casey', jiraDisplayName: 'Casey' }]
    }
    rosterTeams.value = []
    rosterLoadingValue.value = true
    mountView('race::Team')
    await flushPromises()

    expect(getTeamMetrics).not.toHaveBeenCalled()
    expect(mockLoadTeamDetail).not.toHaveBeenCalled()

    // Mirrors useRoster's fetchRoster(): rosterData/teams and loading flip
    // in the same synchronous turn, so both reactive effects land in one flush.
    rosterTeams.value = [raceTeam]
    rosterLoadingValue.value = false
    await flushPromises()

    expect(getTeamMetrics).toHaveBeenCalledTimes(1)
    expect(mockLoadTeamDetail).toHaveBeenCalledTimes(1)
  })
})

describe('TeamRosterView — project-qualified team (normalized model)', () => {
  const projectTeam = {
    key: 'flightctl::team-1',
    displayKey: null,
    displayName: 'Core',
    members: [
      { accountId: 'acc-1', name: 'Ada Lovelace', jiraDisplayName: 'Ada Lovelace', customFields: {} }
    ],
    teamId: 'team-1',
    metadata: {},
    description: null
  }

  beforeEach(() => {
    vi.clearAllMocks()
    rosterTeams.value = [projectTeam]
    isNormalizedModelValue.value = true
    rosterLoadingValue.value = false
    rosterDataValue.value = { projectId: 'flightctl', teams: [], people: [] }
  })

  function mountProjectView() {
    return mount(TeamRosterView, {
      global: {
        provide: {
          moduleNav: {
            params: ref({ teamKey: 'flightctl::team-1' }),
            goBack: vi.fn(),
            navigateTo: vi.fn(),
            updateParams: vi.fn()
          }
        }
      }
    })
  }

  it('renders the project team and its members without calling legacy team detail/RFE endpoints', async () => {
    const wrapper = mountProjectView()
    await flushPromises()

    expect(wrapper.text()).toContain('Core')
    expect(wrapper.text()).toContain('Ada Lovelace')

    expect(mockLoadTeamDetail).not.toHaveBeenCalled()
    expect(mockLoadRfeConfig).not.toHaveBeenCalled()
    // Delivery metrics are canonical here, not legacy: fetched via the same
    // endpoint, scoped by projectId rather than skipped.
    expect(getTeamMetrics).toHaveBeenCalledWith('flightctl::team-1', 'flightctl')
  })

  it('renders canonical delivery metrics via the project-qualified endpoint', async () => {
    getTeamMetrics.mockResolvedValue({
      available: true,
      memberCount: 1,
      aggregate: { resolvedCount: 5, resolvedPoints: 13, inProgressCount: 2, avgCycleTimeDays: 2.5 }
    })
    const wrapper = mountProjectView()
    await flushPromises()

    const deliveryTab = wrapper.findAll('nav button').find(b => b.text() === 'Delivery')
    await deliveryTab.trigger('click')

    expect(getTeamMetrics).toHaveBeenCalledWith('flightctl::team-1', 'flightctl')
    expect(wrapper.text()).toContain('5')
  })

  it('links a project-qualified member by accountId, not by display name', async () => {
    const wrapper = mountProjectView()
    await flushPromises()

    const memberLink = wrapper.find('tbody a')
    expect(memberLink.attributes('href')).toContain('accountId=acc-1')
    expect(memberLink.attributes('href')).not.toContain('person=')
  })

  it('does not collapse two normalized members that share a displayName but have different accountIds', async () => {
    rosterTeams.value = [{
      ...projectTeam,
      members: [
        { accountId: 'acc-1', name: 'Ada Lovelace', jiraDisplayName: 'Ada Lovelace', customFields: {} },
        { accountId: 'acc-2', name: 'Ada Lovelace', jiraDisplayName: 'Ada Lovelace', customFields: {} }
      ]
    }]
    const wrapper = mountProjectView()
    await flushPromises()

    expect(wrapper.text()).toContain('2 members')
    const memberLinks = wrapper.findAll('tbody a')
    expect(memberLinks.map(a => a.attributes('href'))).toEqual([
      expect.stringContaining('accountId=acc-1'),
      expect.stringContaining('accountId=acc-2')
    ])
  })

  it('does not call legacy endpoints while the roster is still resolving mid project-switch', async () => {
    // isNormalizedModel is still false (shape-based, ambiguous) while the roster clears.
    isNormalizedModelValue.value = false
    rosterLoadingValue.value = true
    rosterDataValue.value = null
    rosterTeams.value = []

    const wrapper = mountProjectView()
    await flushPromises()

    expect(mockLoadTeamDetail).not.toHaveBeenCalled()
    expect(mockLoadRfeConfig).not.toHaveBeenCalled()
    expect(getTeamMetrics).not.toHaveBeenCalled()

    // The project's roster resolves as normalized.
    rosterLoadingValue.value = false
    rosterDataValue.value = { projectId: 'flightctl', teams: [], people: [] }
    rosterTeams.value = [projectTeam]
    isNormalizedModelValue.value = true
    await flushPromises()

    expect(wrapper.text()).toContain('Core')
    expect(mockLoadTeamDetail).not.toHaveBeenCalled()
    expect(mockLoadRfeConfig).not.toHaveBeenCalled()
    // Canonical delivery metrics are now fetched, scoped to the resolved project.
    expect(getTeamMetrics).toHaveBeenCalledWith('flightctl::team-1', 'flightctl')
  })
})

// An older in-flight request can resolve after a newer one; the stale
// response must never overwrite the newer, already-committed result.
describe('TeamRosterView — stale team metrics requests (OSAC-6322)', () => {
  function deferred() {
    let resolve
    const promise = new Promise(r => { resolve = r })
    return { promise, resolve }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('drops a stale response from the previously selected team when a newer team-switch request resolves first', async () => {
    const teamA = { key: 'org::TeamA', displayKey: 'ORG::TeamA', displayName: 'Team A', members: [{ name: 'P1', jiraDisplayName: 'P1' }] }
    const teamB = { key: 'org::TeamB', displayKey: 'ORG::TeamB', displayName: 'Team B', members: [{ name: 'P2', jiraDisplayName: 'P2' }] }
    rosterTeams.value = [teamA, teamB]
    isNormalizedModelValue.value = false
    rosterLoadingValue.value = false
    rosterDataValue.value = { teamDataSource: 'sheets' }

    const deferredA = deferred()
    const deferredB = deferred()
    getTeamMetrics.mockImplementationOnce(() => deferredA.promise)
    getTeamMetrics.mockImplementationOnce(() => deferredB.promise)

    const params = ref({ teamKey: 'ORG::TeamA' })
    const wrapper = mount(TeamRosterView, {
      global: { provide: { moduleNav: { params, goBack: vi.fn(), navigateTo: vi.fn(), updateParams: vi.fn() } } }
    })
    await flushPromises()

    // Switch to Team B before Team A's (older) request has resolved.
    params.value = { teamKey: 'ORG::TeamB' }
    await flushPromises()
    expect(getTeamMetrics).toHaveBeenCalledTimes(2)

    // The newer (Team B) request resolves first.
    deferredB.resolve({ available: true, memberCount: 1, aggregate: { resolvedCount: 20, resolvedPoints: 0, inProgressCount: 0, avgCycleTimeDays: null } })
    await flushPromises()

    // The older (Team A) request resolves after -- must be dropped, not applied.
    deferredA.resolve({ available: true, memberCount: 1, aggregate: { resolvedCount: 999, resolvedPoints: 0, inProgressCount: 0, avgCycleTimeDays: null } })
    await flushPromises()

    const deliveryTab = wrapper.findAll('nav button').find(b => b.text() === 'Delivery')
    await deliveryTab.trigger('click')

    expect(wrapper.text()).toContain('20')
    expect(wrapper.text()).not.toContain('999')
  })

  it('drops a stale response from the previously selected project when a newer project-switch request resolves first', async () => {
    const projectTeam = {
      key: 'projswitch::core',
      displayKey: null,
      displayName: 'Core',
      members: [{ accountId: 'acc-1', name: 'Ada Lovelace', jiraDisplayName: 'Ada Lovelace', customFields: {} }],
      teamId: 'team-1',
      metadata: {},
      description: null
    }
    rosterTeams.value = [projectTeam]
    isNormalizedModelValue.value = true
    rosterLoadingValue.value = false
    rosterDataValue.value = { projectId: 'flightctl', teams: [], people: [] }

    const deferredFlightctl = deferred()
    const deferredSippy = deferred()
    getTeamMetrics.mockImplementationOnce(() => deferredFlightctl.promise)
    getTeamMetrics.mockImplementationOnce(() => deferredSippy.promise)

    const params = ref({ teamKey: 'projswitch::core' })
    const wrapper = mount(TeamRosterView, {
      global: { provide: { moduleNav: { params, goBack: vi.fn(), navigateTo: vi.fn(), updateParams: vi.fn() } } }
    })
    await flushPromises()
    expect(getTeamMetrics).toHaveBeenCalledWith('projswitch::core', 'flightctl')

    // Mirror useRoster's project-switch sequence while the old request is
    // still in flight; same team key, different projectId.
    rosterTeams.value = []
    rosterLoadingValue.value = true
    rosterDataValue.value = null
    await flushPromises()

    rosterDataValue.value = { projectId: 'sippy', teams: [], people: [] }
    rosterTeams.value = [{ ...projectTeam }]
    rosterLoadingValue.value = false
    await flushPromises()
    expect(getTeamMetrics).toHaveBeenCalledTimes(2)
    expect(getTeamMetrics).toHaveBeenLastCalledWith('projswitch::core', 'sippy')

    // The newer (sippy) request resolves first.
    deferredSippy.resolve({ available: true, memberCount: 1, aggregate: { resolvedCount: 20, resolvedPoints: 0, inProgressCount: 0, avgCycleTimeDays: null } })
    await flushPromises()

    // The older (flightctl) request resolves after -- must be dropped, not applied.
    deferredFlightctl.resolve({ available: true, memberCount: 1, aggregate: { resolvedCount: 999, resolvedPoints: 0, inProgressCount: 0, avgCycleTimeDays: null } })
    await flushPromises()

    const deliveryTab = wrapper.findAll('nav button').find(b => b.text() === 'Delivery')
    await deliveryTab.trigger('click')

    expect(wrapper.text()).toContain('20')
    expect(wrapper.text()).not.toContain('999')
  })

  it('retries after a failed fetch once a later trigger fires for the same team/project', async () => {
    const team = { key: 'org::TeamA', displayKey: 'ORG::TeamA', displayName: 'Team A', members: [{ name: 'P1', jiraDisplayName: 'P1' }] }
    rosterTeams.value = [team]
    isNormalizedModelValue.value = false
    rosterLoadingValue.value = false
    rosterDataValue.value = { teamDataSource: 'sheets' }

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    getTeamMetrics.mockRejectedValueOnce(new Error('network error'))
    getTeamMetrics.mockResolvedValueOnce({ available: true, memberCount: 1, aggregate: { resolvedCount: 42, resolvedPoints: 0, inProgressCount: 0, avgCycleTimeDays: null } })

    const params = ref({ teamKey: 'ORG::TeamA' })
    const wrapper = mount(TeamRosterView, {
      global: { provide: { moduleNav: { params, goBack: vi.fn(), navigateTo: vi.fn(), updateParams: vi.fn() } } }
    })
    await flushPromises()
    expect(getTeamMetrics).toHaveBeenCalledTimes(1)

    // Simulate a later roster reload for the same team/project (e.g. an explicit
    // refresh) -- the earlier failure must not block this retry.
    rosterLoadingValue.value = true
    await flushPromises()
    rosterLoadingValue.value = false
    await flushPromises()

    expect(getTeamMetrics).toHaveBeenCalledTimes(2)

    const deliveryTab = wrapper.findAll('nav button').find(b => b.text() === 'Delivery')
    await deliveryTab.trigger('click')
    expect(wrapper.text()).toContain('42')

    consoleErrorSpy.mockRestore()
  })
})

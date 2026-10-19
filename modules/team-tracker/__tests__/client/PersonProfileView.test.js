import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import PersonProfileView from '../../client/views/PersonProfileView.vue'

const rosterPeople = ref([])
const rosterTeamsValue = ref([])
const rosterDataValue = ref(null)
const rosterLoadingValue = ref(false)
const isAdminValue = ref(false)
const mockLoadGitlabStats = vi.fn()

// useProjectContributions calls useProjectId() at import time, so this ref must be
// hoisted to exist before that eager call runs.
const { projectIdValue } = vi.hoisted(() => {
  const { ref } = require('vue')
  return { projectIdValue: ref('flightctl') }
})

vi.mock('@shared/client/composables/useRoster.js', () => ({
  useRoster: () => ({
    getTeamsForPerson: () => [],
    teams: rosterTeamsValue,
    rosterData: rosterDataValue,
    loading: rosterLoadingValue,
    getPersonByAccountId: (accountId) => rosterPeople.value.find(p => p.accountId === accountId) || null
  })
}))

vi.mock('@shared/client/composables/useProjectId.js', () => ({
  useProjectId: () => projectIdValue
}))

vi.mock('@shared/client/composables/useAuth.js', () => ({
  useAuth: () => ({ isAdmin: isAdminValue, refresh: vi.fn() })
}))

vi.mock('@shared/client/composables/useGithubStats.js', () => ({
  useGithubStats: () => ({ getContributions: () => null })
}))

vi.mock('@shared/client/composables/useGitlabStats.js', () => ({
  useGitlabStats: () => ({ getContributions: () => null, loadGitlabStats: mockLoadGitlabStats })
}))

vi.mock('@shared/client/composables/usePermissions.js', () => ({
  usePermissions: () => ({ canEdit: () => false, refresh: vi.fn() })
}))

vi.mock('@shared/client/composables/useImpersonation.js', () => ({
  useImpersonation: () => ({ startImpersonating: vi.fn() })
}))

vi.mock('@shared/client/composables/useFieldDefinitions.js', () => ({
  useFieldDefinitions: () => ({
    definitions: ref({ personFields: [] }),
    fetchDefinitions: vi.fn().mockResolvedValue({})
  })
}))

vi.mock('../../client/composables/useManagerTutorial', () => ({
  useManagerTutorial: () => ({ resumeTourIfActive: vi.fn(), destroyTour: vi.fn() })
}))

const UNAVAILABLE_JIRA_METRICS = {
  projectId: 'flightctl',
  accountId: null,
  availability: 'unavailable',
  reason: 'missing-publication',
  publicationState: null,
  generatedAt: null,
  partial: false,
  metrics: null
}

vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: vi.fn(),
  getProjectPersonMetrics: vi.fn(),
  getProjectContributions: vi.fn()
}))

import { apiRequest, getProjectPersonMetrics, getProjectContributions } from '@shared/client/services/api.js'

function availableJiraMetrics(overrides = {}) {
  return {
    projectId: 'flightctl',
    accountId: 'acc-1',
    availability: 'available',
    reason: null,
    publicationState: 'supported',
    generatedAt: '2026-10-14T00:00:00Z',
    partial: false,
    metrics: {
      lookbackDays: 365,
      resolved: { count: 0, storyPoints: 0, issues: [] },
      inProgress: { count: 0, storyPoints: 0, issues: [] },
      cycleTime: { avgDays: null, medianDays: null }
    },
    ...overrides
  }
}

// Reads a tile's value by label; wrapper.text() digit matches can be
// satisfied incidentally by unrelated tiles (e.g. "365 days").
function metricTileValue(wrapper, label) {
  const labelEl = wrapper.findAll('div').find(d => d.text() === label)
  return labelEl ? labelEl.element.previousElementSibling.textContent.trim() : null
}

const mountedWrappers = []

function mountView(params) {
  const navParams = ref(params)
  const wrapper = mount(PersonProfileView, {
    global: {
      provide: {
        moduleNav: {
          params: navParams,
          goBack: vi.fn(),
          navigateTo: vi.fn(),
          updateParams: vi.fn()
        }
      }
    }
  })
  wrapper.navParams = navParams
  mountedWrappers.push(wrapper)
  return wrapper
}

describe('PersonProfileView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getProjectContributions.mockReset()
    projectIdValue.value = 'flightctl'
    rosterPeople.value = []
    rosterTeamsValue.value = []
    rosterDataValue.value = null
    rosterLoadingValue.value = false
    isAdminValue.value = false
    getProjectPersonMetrics.mockResolvedValue(UNAVAILABLE_JIRA_METRICS)
  })

  // Mounted instances share module-level composable mocks (rosterData,
  // projectId, ...); leaving a prior test's wrapper mounted makes it react to
  // a later test's state changes and pollute shared mock call history.
  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  })

  it('resolves a project-qualified person by accountId without calling the legacy registry endpoint', async () => {
    rosterPeople.value = [
      {
        key: 'flightctl::acc-1',
        projectId: 'flightctl',
        accountId: 'acc-1',
        displayName: 'Ada Lovelace',
        active: true,
        email: 'ada@example.com',
        teamIds: [],
        title: null,
        manager: null,
        geo: null,
        identities: {}
      }
    ]
    rosterDataValue.value = { projectId: 'flightctl', teams: [], people: rosterPeople.value }

    const wrapper = mountView({ accountId: 'acc-1' })
    await flushPromises()

    expect(wrapper.text()).toContain('Ada Lovelace')
    expect(wrapper.text()).toContain('ada@example.com')

    for (const call of apiRequest.mock.calls) {
      expect(call[0]).not.toContain('/registry/people/')
    }
  })

  it('does not fall back to a display-name lookup when accountId is present', async () => {
    rosterPeople.value = [
      {
        key: 'flightctl::acc-1',
        projectId: 'flightctl',
        accountId: 'acc-1',
        displayName: 'Ada Lovelace',
        active: true,
        email: null,
        teamIds: [],
        title: null,
        manager: null,
        geo: null,
        identities: {}
      }
    ]
    rosterDataValue.value = { projectId: 'flightctl', teams: [], people: rosterPeople.value }

    // An OSAC person happens to share a display name; accountId must win.
    const wrapper = mountView({ accountId: 'acc-1', person: 'Ada Lovelace' })
    await flushPromises()

    expect(apiRequest).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Ada Lovelace')
  })

  it('hides admin mutation actions (impersonate/reactivate/purge) for a project-qualified person', async () => {
    isAdminValue.value = true
    rosterPeople.value = [
      {
        key: 'flightctl::acc-2',
        projectId: 'flightctl',
        accountId: 'acc-2',
        displayName: 'Inactive Person',
        active: false,
        email: null,
        teamIds: [],
        title: null,
        manager: null,
        geo: null,
        identities: {}
      }
    ]
    rosterDataValue.value = { projectId: 'flightctl', teams: [], people: rosterPeople.value }

    const wrapper = mountView({ accountId: 'acc-2' })
    await flushPromises()

    expect(wrapper.text()).not.toContain('Impersonate')
    expect(wrapper.text()).not.toContain('Reactivate')
    expect(wrapper.text()).not.toContain('Purge')
  })

  it('re-resolves instead of showing a stale person when the roster changes underneath the view (project switch)', async () => {
    rosterPeople.value = [
      {
        key: 'flightctl::acc-1',
        projectId: 'flightctl',
        accountId: 'acc-1',
        displayName: 'Ada Lovelace',
        active: true,
        email: null,
        teamIds: [],
        title: null,
        manager: null,
        geo: null,
        identities: {}
      }
    ]
    rosterDataValue.value = { projectId: 'flightctl', teams: [], people: rosterPeople.value }

    const wrapper = mountView({ accountId: 'acc-1' })
    await flushPromises()
    expect(wrapper.text()).toContain('Ada Lovelace')

    // Simulate a project switch: roster no longer contains this accountId.
    projectIdValue.value = 'other-project'
    rosterPeople.value = []
    rosterDataValue.value = { projectId: 'other-project', teams: [], people: [] }
    await flushPromises()

    expect(wrapper.text()).not.toContain('Ada Lovelace')
    expect(wrapper.text()).toContain('Person not found')
  })

  it('stays loading (not "Person not found") while useRoster clears rosterData mid project-switch', async () => {
    rosterPeople.value = [
      {
        key: 'flightctl::acc-1',
        projectId: 'flightctl',
        accountId: 'acc-1',
        displayName: 'Ada Lovelace',
        active: true,
        email: null,
        teamIds: [],
        title: null,
        manager: null,
        geo: null,
        identities: {}
      }
    ]
    rosterDataValue.value = { projectId: 'flightctl', teams: [], people: rosterPeople.value }

    const wrapper = mountView({ accountId: 'acc-1' })
    await flushPromises()
    expect(wrapper.text()).toContain('Ada Lovelace')

    // useRoster clears rosterData synchronously before the new project's fetch resolves.
    projectIdValue.value = 'other-project'
    rosterDataValue.value = null
    rosterLoadingValue.value = true
    await flushPromises()

    expect(wrapper.text()).not.toContain('Ada Lovelace')
    expect(wrapper.text()).not.toContain('Person not found')

    // The new project's roster finishes loading without this accountId.
    rosterPeople.value = []
    rosterDataValue.value = { projectId: 'other-project', teams: [], people: [] }
    rosterLoadingValue.value = false
    await flushPromises()

    expect(wrapper.text()).toContain('Person not found')
  })

  it('surfaces enriched github/gitlab identities for a project-qualified person', async () => {
    isAdminValue.value = true
    rosterPeople.value = [
      {
        key: 'flightctl::acc-3',
        projectId: 'flightctl',
        accountId: 'acc-3',
        displayName: 'Grace Hopper',
        active: true,
        email: null,
        teamIds: [],
        title: null,
        manager: null,
        geo: null,
        identities: {
          github: { username: 'ghopper', source: 'ldap' },
          gitlab: { username: 'ghopper-gl', source: 'ldap' }
        }
      }
    ]
    rosterDataValue.value = { projectId: 'flightctl', teams: [], people: rosterPeople.value }

    const wrapper = mountView({ accountId: 'acc-3' })
    await flushPromises()

    expect(wrapper.text()).toContain('ghopper')
    expect(wrapper.text()).toContain('ghopper-gl')
    // Edit/remove controls stay OSAC-only even for an admin viewing a project person.
    expect(wrapper.find('button[title="Edit"]').exists()).toBe(false)
    expect(wrapper.find('button[title="Set"]').exists()).toBe(false)
  })

  it('shows "Not set" for a project-qualified person with no published identities', async () => {
    rosterPeople.value = [
      {
        key: 'flightctl::acc-4',
        projectId: 'flightctl',
        accountId: 'acc-4',
        displayName: 'No Identities',
        active: true,
        email: null,
        teamIds: [],
        title: null,
        manager: null,
        geo: null,
        identities: {}
      }
    ]
    rosterDataValue.value = { projectId: 'flightctl', teams: [], people: rosterPeople.value }

    const wrapper = mountView({ accountId: 'acc-4' })
    await flushPromises()

    const notSet = wrapper.findAll('span').filter(s => s.text() === 'Not set')
    expect(notSet.length).toBe(2)
  })

  it('shows the GitHub Contributions tile from the canonical artifact even when roster enrichment has no GitHub identity', async () => {
    rosterPeople.value = [
      {
        key: 'flightctl::acc-5',
        projectId: 'flightctl',
        accountId: 'acc-5',
        displayName: 'Katherine Johnson',
        active: true,
        email: null,
        teamIds: [],
        title: null,
        manager: null,
        geo: null,
        identities: {}
      }
    ]
    rosterDataValue.value = { projectId: 'flightctl', teams: [], people: rosterPeople.value }
    getProjectContributions.mockResolvedValue({
      projectId: 'flightctl',
      availability: 'available',
      people: [
        { accountId: 'acc-5', github: { username: 'kjohnson-gh', totalContributions: 42, months: {}, fetchedAt: null }, gitlab: null }
      ]
    })

    const wrapper = mountView({ accountId: 'acc-5' })
    await flushPromises()

    expect(wrapper.text()).toContain('GitHub Contributions')
    expect(wrapper.text()).toContain('42')
  })

  it('badges a carried-forward GitHub count instead of presenting it as current', async () => {
    // A distinct projectId forces a fresh fetch instead of reusing another test's cached response.
    projectIdValue.value = 'flightctl-carried-forward'
    rosterPeople.value = [
      {
        key: 'flightctl::acc-6',
        projectId: 'flightctl',
        accountId: 'acc-6',
        displayName: 'Ada Carry',
        active: true,
        email: null,
        teamIds: [],
        title: null,
        manager: null,
        geo: null,
        identities: {}
      }
    ]
    rosterDataValue.value = { projectId: 'flightctl-carried-forward', teams: [], people: rosterPeople.value }
    getProjectContributions.mockResolvedValue({
      projectId: 'flightctl-carried-forward',
      availability: 'available',
      freshness: 'stale',
      partial: true,
      people: [
        {
          accountId: 'acc-6',
          github: { username: 'acarry-gh', totalContributions: 10, months: {}, fetchedAt: null },
          gitlab: null,
          contributionStatus: 'carried-forward'
        }
      ]
    })

    const wrapper = mountView({ accountId: 'acc-6' })
    await flushPromises()

    expect(wrapper.text()).toContain('10')
    expect(wrapper.text()).toContain('Carried forward')
  })

  it('badges a stale publication even when this person\'s own GitHub record was collected cleanly', async () => {
    projectIdValue.value = 'flightctl-stale-publication'
    rosterPeople.value = [
      {
        key: 'flightctl::acc-7',
        projectId: 'flightctl',
        accountId: 'acc-7',
        displayName: 'Stale Publication',
        active: true,
        email: null,
        teamIds: [],
        title: null,
        manager: null,
        geo: null,
        identities: {}
      }
    ]
    rosterDataValue.value = { projectId: 'flightctl-stale-publication', teams: [], people: rosterPeople.value }
    getProjectContributions.mockResolvedValue({
      projectId: 'flightctl-stale-publication',
      availability: 'available',
      freshness: 'stale',
      partial: true,
      people: [
        {
          accountId: 'acc-7',
          github: { username: 'sp-gh', totalContributions: 25, months: {}, fetchedAt: null },
          gitlab: null,
          contributionStatus: 'collected'
        }
      ]
    })

    const wrapper = mountView({ accountId: 'acc-7' })
    await flushPromises()

    expect(wrapper.text()).toContain('25')
    expect(wrapper.text()).toContain('Stale')
  })

  it('shows no freshness badge for a fresh, non-partial project publication', async () => {
    projectIdValue.value = 'flightctl-fresh'
    rosterPeople.value = [
      {
        key: 'flightctl::acc-8',
        projectId: 'flightctl',
        accountId: 'acc-8',
        displayName: 'Fresh Person',
        active: true,
        email: null,
        teamIds: [],
        title: null,
        manager: null,
        geo: null,
        identities: {}
      }
    ]
    rosterDataValue.value = { projectId: 'flightctl-fresh', teams: [], people: rosterPeople.value }
    getProjectContributions.mockResolvedValue({
      projectId: 'flightctl-fresh',
      availability: 'available',
      freshness: 'fresh',
      partial: false,
      people: [
        {
          accountId: 'acc-8',
          github: { username: 'fresh-gh', totalContributions: 5, months: {}, fetchedAt: null },
          gitlab: null,
          contributionStatus: 'collected'
        }
      ]
    })

    const wrapper = mountView({ accountId: 'acc-8' })
    await flushPromises()

    expect(wrapper.text()).toContain('5')
    expect(wrapper.text()).not.toContain('Carried forward')
    expect(wrapper.text()).not.toContain('Stale')
  })

  it('leaves OSAC legacy behavior unchanged (resolves by uid via the registry endpoint)', async () => {
    apiRequest.mockImplementation((url) => {
      if (url.includes('/registry/people/u1')) {
        return Promise.resolve({
          person: {
            uid: 'u1',
            name: 'Bob Builder',
            status: 'active',
            email: 'bob@example.com',
            orgType: 'engineering'
          },
          managerChain: [],
          directReports: [],
          associatedTeams: []
        })
      }
      if (url.includes('/person/')) {
        return Promise.resolve({ resolved: { issues: [] }, inProgress: { issues: [] } })
      }
      return Promise.resolve({})
    })

    const wrapper = mountView({ uid: 'u1' })
    await flushPromises()

    expect(wrapper.text()).toContain('Bob Builder')
    expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining('/registry/people/u1'))
    // OSAC profiles never call the project-qualified endpoint.
    expect(getProjectPersonMetrics).not.toHaveBeenCalled()
  })

  describe('project-qualified Jira metrics', () => {
    function setRoster(people) {
      rosterPeople.value = people
      rosterDataValue.value = { projectId: 'flightctl', teams: [], people }
    }

    function rosterPersonFixture(accountId, displayName) {
      return {
        key: `flightctl::${accountId}`,
        projectId: 'flightctl',
        accountId,
        displayName,
        active: true,
        email: null,
        teamIds: [],
        title: null,
        manager: null,
        geo: null,
        identities: {}
      }
    }

    it('ignores a stale legacy response after navigating to a project-qualified person (cross-mode race)', async () => {
      setRoster([rosterPersonFixture('acc-1', 'Ada Lovelace')])
      getProjectPersonMetrics.mockResolvedValue(availableJiraMetrics())

      let resolveLegacy
      apiRequest.mockImplementation((url) => {
        if (url.includes('/registry/people/u1')) {
          return new Promise(resolve => { resolveLegacy = resolve })
        }
        return Promise.resolve({})
      })

      const wrapper = mountView({ uid: 'u1' })
      await flushPromises()

      // Navigate to a project-qualified person before the legacy lookup resolves.
      wrapper.navParams.value = { accountId: 'acc-1' }
      await flushPromises()
      expect(wrapper.text()).toContain('Ada Lovelace')

      resolveLegacy({
        person: { uid: 'u1', name: 'Bob Builder', status: 'active', email: 'bob@example.com', orgType: 'engineering' },
        managerChain: [],
        directReports: [],
        associatedTeams: []
      })
      await flushPromises()

      expect(wrapper.text()).toContain('Ada Lovelace')
      expect(wrapper.text()).not.toContain('Bob Builder')
    })

    it('fetches metrics for the correct accountId and renders resolved/in-progress issues with working sort/links', async () => {
      setRoster([rosterPersonFixture('acc-1', 'Ada Lovelace')])
      getProjectPersonMetrics.mockResolvedValue(availableJiraMetrics({
        metrics: {
          lookbackDays: 365,
          resolved: {
            count: 1, storyPoints: 5,
            issues: [{ key: 'FLPATH-1', summary: 'Fix thing', issueType: 'Bug', status: 'Closed', storyPoints: 5, resolutionDate: '2026-09-15T00:00:00Z', cycleTimeDays: 3 }]
          },
          inProgress: {
            count: 1, storyPoints: 2,
            issues: [{ key: 'FLPATH-2', summary: 'Do thing', issueType: 'Story', status: 'In Progress', storyPoints: 2 }]
          },
          cycleTime: { avgDays: 3, medianDays: 3 }
        }
      }))

      const wrapper = mountView({ accountId: 'acc-1' })
      await flushPromises()

      expect(getProjectPersonMetrics).toHaveBeenCalledWith('flightctl', 'acc-1')
      expect(wrapper.text()).toContain('FLPATH-1')
      expect(wrapper.text()).toContain('FLPATH-2')
      expect(wrapper.find(`a[href="https://redhat.atlassian.net/browse/FLPATH-1"]`).exists()).toBe(true)
    })

    it('renders the Jira metrics and GitHub contributions tiles together when both are configured', async () => {
      // Jira metrics and contributions are fetched independently; both tiles render once each resolves.
      setRoster([{ ...rosterPersonFixture('acc-1', 'Ada Lovelace'), identities: { github: { username: 'ada' } } }])
      getProjectPersonMetrics.mockResolvedValue(availableJiraMetrics({
        metrics: { lookbackDays: 365, resolved: { count: 3, storyPoints: 8, issues: [] }, inProgress: { count: 0, storyPoints: 0, issues: [] }, cycleTime: { avgDays: 2, medianDays: 2 } }
      }))
      getProjectContributions.mockResolvedValue({
        projectId: 'flightctl',
        availability: 'available',
        people: [
          { accountId: 'acc-1', github: { username: 'ada', totalContributions: 42, months: {}, fetchedAt: null }, gitlab: null }
        ]
      })

      const wrapper = mountView({ accountId: 'acc-1' })
      await flushPromises()

      expect(metricTileValue(wrapper, 'Resolved Issues')).toBe('3')
      expect(wrapper.text()).toContain('GitHub Contributions')
      expect(wrapper.text()).toContain('42')
    })

    it('shows resolved.count in the Resolved Issues tile when resolved.issues is empty (partial/truncated issues list)', async () => {
      setRoster([rosterPersonFixture('acc-1', 'Ada Lovelace')])
      getProjectPersonMetrics.mockResolvedValue(availableJiraMetrics({
        metrics: { lookbackDays: 365, resolved: { count: 7, storyPoints: 0, issues: [] }, inProgress: { count: 0, storyPoints: 0, issues: [] }, cycleTime: { avgDays: null, medianDays: null } }
      }))

      const wrapper = mountView({ accountId: 'acc-1' })
      await flushPromises()

      expect(metricTileValue(wrapper, 'Resolved Issues')).toBe('7')
    })

    it('resolves distinct metrics for two people sharing a display name', async () => {
      setRoster([rosterPersonFixture('acc-1', 'J. Smith'), rosterPersonFixture('acc-2', 'J. Smith')])
      getProjectPersonMetrics.mockImplementation((projectId, accountId) => Promise.resolve(
        availableJiraMetrics({
          accountId,
          metrics: {
            lookbackDays: 365,
            resolved: { count: accountId === 'acc-1' ? 1 : 9, storyPoints: 0, issues: [] },
            inProgress: { count: 0, storyPoints: 0, issues: [] },
            cycleTime: { avgDays: null, medianDays: null }
          }
        })
      ))

      const wrapper = mountView({ accountId: 'acc-1' })
      await flushPromises()

      expect(getProjectPersonMetrics).toHaveBeenCalledWith('flightctl', 'acc-1')
      expect(getProjectPersonMetrics).not.toHaveBeenCalledWith('flightctl', 'acc-2')
      expect(metricTileValue(wrapper, 'Resolved Issues')).toBe('1')

      wrapper.navParams.value = { accountId: 'acc-2' }
      await flushPromises()

      expect(getProjectPersonMetrics).toHaveBeenCalledWith('flightctl', 'acc-2')
      expect(metricTileValue(wrapper, 'Resolved Issues')).toBe('9')
    })

    it('shows no Jira metrics tile for a missing publication or a missing person, without a fabricated zero', async () => {
      setRoster([rosterPersonFixture('acc-1', 'Ada Lovelace')])
      getProjectPersonMetrics.mockResolvedValue({ ...UNAVAILABLE_JIRA_METRICS, reason: 'missing-person' })

      const wrapper = mountView({ accountId: 'acc-1' })
      await flushPromises()

      expect(wrapper.text()).not.toContain('Resolved Issues')
      expect(wrapper.text()).not.toContain('Story Points')
    })

    it('shows a genuine zero-activity person with explicit zero counts, not an absent metrics block', async () => {
      setRoster([rosterPersonFixture('acc-1', 'Ada Lovelace')])
      getProjectPersonMetrics.mockResolvedValue(availableJiraMetrics())

      const wrapper = mountView({ accountId: 'acc-1' })
      await flushPromises()

      expect(wrapper.text()).toContain('Resolved Issues')
      expect(wrapper.text()).toContain('Avg Cycle Time')
      expect(wrapper.text()).toContain('—')
    })

    it('surfaces a partial publication without hiding otherwise-valid metrics', async () => {
      setRoster([rosterPersonFixture('acc-1', 'Ada Lovelace')])
      getProjectPersonMetrics.mockResolvedValue(availableJiraMetrics({
        partial: true,
        metrics: { lookbackDays: 365, resolved: { count: 1, storyPoints: 10, issues: [{ key: 'FLPATH-1', summary: 'x', issueType: 'Bug', status: 'Closed', storyPoints: 10, resolutionDate: '2026-09-15T00:00:00Z', cycleTimeDays: 2 }] }, inProgress: { count: 0, storyPoints: 0, issues: [] }, cycleTime: { avgDays: 2, medianDays: 2 } }
      }))

      const wrapper = mountView({ accountId: 'acc-1' })
      await flushPromises()

      expect(wrapper.text()).toContain('Jira: partial')
      expect(wrapper.text()).toContain('10')
      expect(wrapper.text()).toContain('FLPATH-1')
    })

    it('uses the publication lookbackDays for the timeframe label instead of hardcoding 365 days', async () => {
      setRoster([rosterPersonFixture('acc-1', 'Ada Lovelace')])
      getProjectPersonMetrics.mockResolvedValue(availableJiraMetrics({
        metrics: { lookbackDays: 180, resolved: { count: 1, storyPoints: 1, issues: [] }, inProgress: { count: 0, storyPoints: 0, issues: [] }, cycleTime: { avgDays: 1, medianDays: 1 } }
      }))

      const wrapper = mountView({ accountId: 'acc-1' })
      await flushPromises()

      expect(wrapper.text()).toContain('180 days')
      expect(wrapper.text()).not.toContain('365 days')
    })

    it('ignores a stale response after the project changes mid-fetch', async () => {
      setRoster([rosterPersonFixture('acc-1', 'Ada Lovelace')])
      let resolveFirst
      getProjectPersonMetrics.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve }))

      const wrapper = mountView({ accountId: 'acc-1' })
      await flushPromises()

      // Switch projects before the first fetch resolves.
      getProjectPersonMetrics.mockResolvedValue(UNAVAILABLE_JIRA_METRICS)
      projectIdValue.value = 'other-project'
      rosterDataValue.value = { projectId: 'other-project', teams: [], people: [] }
      await flushPromises()

      resolveFirst(availableJiraMetrics({
        metrics: { lookbackDays: 365, resolved: { count: 99, storyPoints: 99, issues: [] }, inProgress: { count: 0, storyPoints: 0, issues: [] }, cycleTime: { avgDays: 1, medianDays: 1 } }
      }))
      await flushPromises()

      expect(wrapper.text()).not.toContain('99')
    })

    it('ignores a stale response after the person changes mid-fetch', async () => {
      setRoster([rosterPersonFixture('acc-1', 'Ada Lovelace'), rosterPersonFixture('acc-2', 'Grace Hopper')])
      let resolveFirst
      getProjectPersonMetrics.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve }))

      const wrapper = mountView({ accountId: 'acc-1' })
      await flushPromises()

      // Switch to a different person before the first (acc-1) fetch resolves.
      getProjectPersonMetrics.mockResolvedValue(availableJiraMetrics({
        accountId: 'acc-2',
        metrics: { lookbackDays: 365, resolved: { count: 2, storyPoints: 2, issues: [] }, inProgress: { count: 0, storyPoints: 0, issues: [] }, cycleTime: { avgDays: 1, medianDays: 1 } }
      }))
      wrapper.navParams.value = { accountId: 'acc-2' }
      await flushPromises()

      resolveFirst(availableJiraMetrics({
        accountId: 'acc-1',
        metrics: { lookbackDays: 365, resolved: { count: 99, storyPoints: 99, issues: [] }, inProgress: { count: 0, storyPoints: 0, issues: [] }, cycleTime: { avgDays: 1, medianDays: 1 } }
      }))
      await flushPromises()

      expect(wrapper.text()).toContain('2')
      expect(wrapper.text()).not.toContain('99')
    })
  })
})

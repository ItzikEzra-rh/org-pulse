import { describe, it, expect, vi, beforeEach } from 'vitest'
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

vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: vi.fn()
}))

import { apiRequest } from '@shared/client/services/api.js'

function mountView(params) {
  return mount(PersonProfileView, {
    global: {
      provide: {
        moduleNav: {
          params: ref(params),
          goBack: vi.fn(),
          navigateTo: vi.fn(),
          updateParams: vi.fn()
        }
      }
    }
  })
}

describe('PersonProfileView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    projectIdValue.value = 'flightctl'
    rosterPeople.value = []
    rosterTeamsValue.value = []
    rosterDataValue.value = null
    rosterLoadingValue.value = false
    isAdminValue.value = false
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
  })
})

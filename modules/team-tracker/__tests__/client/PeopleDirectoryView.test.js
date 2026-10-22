import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import PeopleDirectoryView from '../../client/views/PeopleDirectoryView.vue'

const projectId = ref('')

vi.mock('@shared/client/composables/useProjectId.js', () => ({
  useProjectId: () => projectId
}))

const mockLoadRoster = vi.fn()
const rosterData = ref(null)
const rosterError = ref(null)
const rosterPeople = ref([])
const rosterTeams = ref([])

vi.mock('@shared/client/composables/useRoster.js', () => ({
  useRoster: () => ({
    rosterData,
    error: rosterError,
    loadRoster: mockLoadRoster,
    people: rosterPeople,
    teams: rosterTeams
  })
}))

vi.mock('@shared/client/composables/useFieldDefinitions', () => ({
  useFieldDefinitions: () => ({
    definitions: ref({ personFields: [] }),
    fetchDefinitions: vi.fn().mockResolvedValue({})
  })
}))

vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: vi.fn()
}))

import { apiRequest } from '@shared/client/services/api.js'

const navigateTo = vi.fn()

function captureCsvExport() {
  let csv = null
  vi.spyOn(global, 'Blob').mockImplementation(function (parts) {
    csv = parts.join('')
  })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  return () => csv
}

function mountView() {
  return mount(PeopleDirectoryView, {
    global: {
      provide: {
        moduleNav: {
          params: ref({}),
          navigateTo,
          goBack: vi.fn(),
          updateParams: vi.fn()
        }
      }
    }
  })
}

describe('PeopleDirectoryView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    projectId.value = ''
    rosterData.value = null
    rosterError.value = null
    rosterPeople.value = []
    rosterTeams.value = []
  })

  it('renders a project-qualified (Flight Control) person by displayName and navigates by accountId', async () => {
    projectId.value = 'flightctl'
    rosterData.value = {
      projectId: 'flightctl',
      availability: 'available',
      reason: null,
      teams: [],
      people: []
    }
    mockLoadRoster.mockResolvedValue(rosterData.value)
    rosterTeams.value = [
      { key: 'flightctl::team-1', displayName: 'Core', teamId: 'team-1', members: [], description: null }
    ]
    rosterPeople.value = [
      {
        key: 'flightctl::acc-1',
        projectId: 'flightctl',
        accountId: 'acc-1',
        displayName: 'Ada Lovelace',
        active: true,
        email: null,
        teamIds: ['team-1'],
        title: null,
        manager: null,
        geo: null,
        identities: {}
      }
    ]

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Ada Lovelace')
    expect(wrapper.text()).toContain('Core')

    await wrapper.find('tbody tr').trigger('click')

    expect(navigateTo).toHaveBeenCalledWith('person-detail', { accountId: 'acc-1' })
  })

  it('surfaces published GitHub/GitLab identities and hides managerRef from the UI', async () => {
    projectId.value = 'flightctl'
    rosterData.value = {
      projectId: 'flightctl',
      availability: 'available',
      reason: null,
      enrichment: { state: 'fresh', partial: false, generatedAt: '2026-10-14T00:00:00Z' },
      teams: [],
      people: []
    }
    mockLoadRoster.mockResolvedValue(rosterData.value)
    rosterTeams.value = [
      { key: 'flightctl::team-1', displayName: 'Core', teamId: 'team-1', members: [], description: null }
    ]
    rosterPeople.value = [
      {
        key: 'flightctl::acc-1',
        accountId: 'acc-1',
        displayName: 'Ada Lovelace',
        active: true,
        email: null,
        teamIds: ['team-1'],
        title: null,
        geo: null,
        identities: { github: { username: 'ada-gh', source: 'ldap' }, gitlab: null },
        managerRef: { kind: 'roster', accountId: 'acc-mgr' }
      }
    ]

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('GitHub IDs')
    expect(wrapper.text()).toContain('1')
    expect(wrapper.text()).not.toContain('acc-mgr')
  })

  it('hides identity stats when enrichment is unpublished, to avoid showing a false zero', async () => {
    projectId.value = 'flightctl'
    rosterData.value = {
      projectId: 'flightctl',
      availability: 'available',
      reason: null,
      teams: [],
      people: []
    }
    mockLoadRoster.mockResolvedValue(rosterData.value)
    rosterTeams.value = [
      { key: 'flightctl::team-1', displayName: 'Core', teamId: 'team-1', members: [], description: null }
    ]
    rosterPeople.value = [
      {
        key: 'flightctl::acc-1',
        accountId: 'acc-1',
        displayName: 'Ada Lovelace',
        active: true,
        email: null,
        teamIds: ['team-1'],
        title: null,
        geo: null,
        identities: {},
        managerRef: null
      }
    ]

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Ada Lovelace')
    expect(wrapper.text()).not.toContain('GitHub IDs')
    expect(wrapper.text()).not.toContain('GitLab IDs')
  })

  it('hides identity stats when enrichment state is absent (distrusted)', async () => {
    projectId.value = 'flightctl'
    rosterData.value = {
      projectId: 'flightctl',
      availability: 'available',
      reason: null,
      enrichment: { state: 'absent', generatedAt: '2026-10-14T00:00:00Z' },
      teams: [],
      people: []
    }
    mockLoadRoster.mockResolvedValue(rosterData.value)
    rosterTeams.value = [
      { key: 'flightctl::team-1', displayName: 'Core', teamId: 'team-1', members: [], description: null }
    ]
    rosterPeople.value = [
      {
        key: 'flightctl::acc-1',
        accountId: 'acc-1',
        displayName: 'Ada Lovelace',
        active: true,
        email: null,
        teamIds: ['team-1'],
        title: null,
        geo: null,
        identities: {},
        managerRef: null
      }
    ]

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).not.toContain('GitHub IDs')
    expect(wrapper.text()).not.toContain('GitLab IDs')
  })

  it('surfaces a stale badge for stale enrichment without claiming the data is fresh', async () => {
    projectId.value = 'flightctl'
    rosterData.value = {
      projectId: 'flightctl',
      availability: 'available',
      reason: null,
      enrichment: { state: 'stale', partial: false, generatedAt: '2026-10-14T00:00:00Z' },
      teams: [],
      people: []
    }
    mockLoadRoster.mockResolvedValue(rosterData.value)
    rosterTeams.value = []
    rosterPeople.value = [
      {
        key: 'flightctl::acc-1',
        accountId: 'acc-1',
        displayName: 'Ada Lovelace',
        active: true,
        email: null,
        teamIds: [],
        title: null,
        geo: null,
        identities: { github: { username: 'ada-gh', source: 'ldap' }, gitlab: null },
        managerRef: null
      }
    ]

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Profiles: stale')
    expect(wrapper.text()).toContain('GitHub IDs')
  })

  it('includes GitHub/GitLab columns in CSV export when enrichment is published', async () => {
    projectId.value = 'flightctl'
    rosterData.value = {
      projectId: 'flightctl',
      availability: 'available',
      reason: null,
      enrichment: { state: 'fresh', partial: false, generatedAt: '2026-10-14T00:00:00Z' },
      teams: [],
      people: []
    }
    mockLoadRoster.mockResolvedValue(rosterData.value)
    rosterTeams.value = []
    rosterPeople.value = [
      {
        key: 'flightctl::acc-1',
        accountId: 'acc-1',
        displayName: 'Ada Lovelace',
        active: true,
        email: null,
        teamIds: [],
        title: null,
        geo: null,
        identities: { github: { username: 'ada-gh', source: 'ldap' }, gitlab: null },
        managerRef: null
      }
    ]
    const getCsv = captureCsvExport()

    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('button').find(b => b.text() === 'Export CSV').trigger('click')

    const csv = getCsv()
    expect(csv.split('\n')[0]).toContain('GitHub')
    expect(csv.split('\n')[0]).toContain('GitLab')
    expect(csv).toContain('ada-gh')
  })

  it('omits GitHub/GitLab CSV columns entirely (not blank values) when enrichment is unavailable', async () => {
    projectId.value = 'flightctl'
    rosterData.value = {
      projectId: 'flightctl',
      availability: 'available',
      reason: null,
      enrichment: { state: 'absent', generatedAt: '2026-10-14T00:00:00Z' },
      teams: [],
      people: []
    }
    mockLoadRoster.mockResolvedValue(rosterData.value)
    rosterTeams.value = []
    rosterPeople.value = [
      {
        key: 'flightctl::acc-1',
        accountId: 'acc-1',
        displayName: 'Ada Lovelace',
        active: true,
        email: null,
        teamIds: [],
        title: null,
        geo: null,
        identities: {},
        managerRef: null
      }
    ]
    const getCsv = captureCsvExport()

    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('button').find(b => b.text() === 'Export CSV').trigger('click')

    const csv = getCsv()
    expect(csv.split('\n')[0]).not.toContain('GitHub')
    expect(csv.split('\n')[0]).not.toContain('GitLab')
  })

  it('leaves OSAC legacy behavior unchanged (navigates by uid)', async () => {
    projectId.value = ''
    apiRequest.mockImplementation((url) => {
      if (url.includes('registry/people')) {
        return Promise.resolve({
          people: [
            {
              uid: 'u1',
              name: 'Bob Builder',
              status: 'active',
              orgRoot: 'org1',
              orgDisplayName: 'Org One',
              teams: ['Team A']
            }
          ]
        })
      }
      if (url.includes('registry/stats')) {
        return Promise.resolve({ orgDisplayNames: { org1: 'Org One' } })
      }
      if (url.includes('ipa/sync/status')) {
        return Promise.resolve({})
      }
      return Promise.resolve({})
    })

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Bob Builder')
    expect(mockLoadRoster).not.toHaveBeenCalled()

    await wrapper.find('tbody tr').trigger('click')

    expect(navigateTo).toHaveBeenCalledWith('person-detail', { uid: 'u1' })
  })

  it('displays canonical Location distinct from Geo and includes it in CSV export', async () => {
    projectId.value = 'flightctl'
    rosterData.value = {
      projectId: 'flightctl',
      availability: 'available',
      reason: null,
      teams: [],
      people: []
    }
    mockLoadRoster.mockResolvedValue(rosterData.value)
    rosterTeams.value = []
    rosterPeople.value = [
      {
        key: 'flightctl::acc-1',
        accountId: 'acc-1',
        displayName: 'Ada Lovelace',
        active: true,
        email: null,
        teamIds: [],
        title: null,
        geo: 'EMEA',
        city: null,
        country: null,
        location: 'Cork, Ireland',
        identities: {}
      }
    ]
    const getCsv = captureCsvExport()

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('EMEA')
    expect(wrapper.text()).toContain('Cork, Ireland')

    await wrapper.findAll('button').find(b => b.text() === 'Export CSV').trigger('click')
    const csv = getCsv()
    expect(csv.split('\n')[0]).toContain('Location')
    expect(csv).toContain('Cork, Ireland')
  })

  it('enables the Geo filter for canonical projects', async () => {
    projectId.value = 'flightctl'
    rosterData.value = {
      projectId: 'flightctl',
      availability: 'available',
      reason: null,
      teams: [],
      people: []
    }
    mockLoadRoster.mockResolvedValue(rosterData.value)
    rosterTeams.value = []
    rosterPeople.value = [
      { key: 'flightctl::acc-1', accountId: 'acc-1', displayName: 'Ada Lovelace', active: true, email: null, teamIds: [], title: null, geo: 'EMEA', identities: {} },
      { key: 'flightctl::acc-2', accountId: 'acc-2', displayName: 'Grace Hopper', active: true, email: null, teamIds: [], title: null, geo: 'AMER', identities: {} }
    ]

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Geo')
    const emeaCheckbox = wrapper.findAll('input[type="checkbox"]').find(c => c.element.value === 'EMEA')
    expect(emeaCheckbox).toBeTruthy()

    await emeaCheckbox.setValue(true)
    expect(wrapper.text()).toContain('Ada Lovelace')
    expect(wrapper.text()).not.toContain('Grace Hopper')
  })

  it('clears stale people when the project changes', async () => {
    projectId.value = 'flightctl'
    rosterTeams.value = []
    rosterPeople.value = [
      {
        key: 'flightctl::acc-1',
        accountId: 'acc-1',
        displayName: 'Ada Lovelace',
        active: true,
        email: null,
        teamIds: [],
        title: null,
        geo: null
      }
    ]
    rosterData.value = { projectId: 'flightctl', availability: 'available', reason: null, teams: [], people: rosterPeople.value }
    mockLoadRoster.mockResolvedValue(rosterData.value)

    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('Ada Lovelace')

    rosterPeople.value = [
      {
        key: 'other-project::acc-2',
        accountId: 'acc-2',
        displayName: 'Grace Hopper',
        active: true,
        email: null,
        teamIds: [],
        title: null,
        geo: null
      }
    ]
    rosterData.value = { projectId: 'other-project', availability: 'available', reason: null, teams: [], people: rosterPeople.value }
    mockLoadRoster.mockResolvedValue(rosterData.value)
    projectId.value = 'other-project'
    await flushPromises()

    expect(wrapper.text()).not.toContain('Ada Lovelace')
    expect(wrapper.text()).toContain('Grace Hopper')
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount as vtuMount, flushPromises } from '@vue/test-utils'
import { ref, computed } from 'vue'
import ManagedTeamsWidget from '../../../client/widgets/ManagedTeamsWidget.vue'

// mockProjectId is shared module state, so a leftover mounted wrapper's watcher
// would keep firing in later tests — track and unmount in afterEach.
let mountedWrappers = []
function mount(...args) {
  const wrapper = vtuMount(...args)
  mountedWrappers.push(wrapper)
  return wrapper
}

const mockNavigateTo = vi.fn()

vi.mock('@shared/client/composables/useModuleLink', () => ({
  useModuleLink: () => ({
    navigateTo: mockNavigateTo,
    linkTo: vi.fn()
  })
}))

const mockUser = ref({ email: 'jsmith@redhat.com', isManager: false })
const mockIsManager = computed(() => mockUser.value?.isManager === true)

vi.mock('@shared/client/composables/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    isManager: mockIsManager,
    isAdmin: ref(false)
  })
}))

const mockProjectIsManager = ref(false)
const mockPermissionsLoading = ref(false)
const mockHierarchyAvailable = ref(true)

vi.mock('@shared/client/composables/usePermissions', () => ({
  usePermissions: () => ({
    isManager: mockProjectIsManager,
    loading: mockPermissionsLoading,
    hierarchyAvailable: mockHierarchyAvailable
  })
}))

const mockDefinitions = ref({ personFields: [], teamFields: [] })
vi.mock('@shared/client/composables/useFieldDefinitions', () => ({
  useFieldDefinitions: () => ({
    definitions: mockDefinitions,
    loading: ref(false),
    fetchDefinitions: vi.fn()
  })
}))

const mockManagedTeams = ref([])
const mockManagerLoading = ref(false)
const mockIncludeIndirect = ref(false)
const mockProjectId = ref(null)
const mockIsProjectMode = computed(() => Boolean(mockProjectId.value) && mockProjectId.value !== 'osac')
const mockLoadManagerDashboard = vi.fn(() => Promise.resolve())
const mockResetState = vi.fn(() => {
  mockManagedTeams.value = []
})

vi.mock('../../../client/composables/useManagerDashboard', () => ({
  useManagerDashboard: () => ({
    teams: mockManagedTeams,
    loading: mockManagerLoading,
    error: ref(null),
    includeIndirect: mockIncludeIndirect,
    projectId: mockProjectId,
    isProjectMode: mockIsProjectMode,
    load: mockLoadManagerDashboard,
    resetState: mockResetState
  })
}))

beforeEach(() => {
  mockUser.value = { email: 'jsmith@redhat.com', isManager: false }
  mockDefinitions.value = { personFields: [], teamFields: [] }
  mockManagedTeams.value = []
  mockManagerLoading.value = false
  mockIncludeIndirect.value = false
  mockProjectId.value = null
  mockProjectIsManager.value = false
  mockPermissionsLoading.value = false
  mockHierarchyAvailable.value = true
  mockNavigateTo.mockClear()
  mockLoadManagerDashboard.mockClear()
  mockLoadManagerDashboard.mockImplementation(() => Promise.resolve())
  mockResetState.mockClear()
})

afterEach(() => {
  mountedWrappers.forEach(w => w.unmount())
  mountedWrappers = []
})

describe('ManagedTeamsWidget', () => {
  it('mounts with size prop and renders header', async () => {
    const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
    await flushPromises()
    expect(wrapper.text()).toContain('Managed Teams')
  })

  it('accepts half size prop', async () => {
    const wrapper = mount(ManagedTeamsWidget, { props: { size: 'half' } })
    await flushPromises()
    expect(wrapper.text()).toContain('Managed Teams')
  })

  it('shows non-manager message for ICs', async () => {
    const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
    await flushPromises()
    expect(wrapper.text()).toContain('This widget is for managers')
  })

  describe('manager view', () => {
    beforeEach(() => {
      mockUser.value = { email: 'manager@redhat.com', isManager: true }
      mockProjectIsManager.value = true
    })

    it('renders managed team cards', async () => {
      mockManagedTeams.value = [
        { id: 'team_1', name: 'Platform', orgKey: 'eng', directReportUids: ['a', 'b'], totalMemberCount: 5, metadata: {} }
      ]
      const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
      await flushPromises()
      expect(wrapper.text()).toContain('Platform')
      expect(wrapper.text()).toContain('2 direct reports')
      expect(wrapper.text()).toContain('5 total')
    })

    it('shows loading skeleton while loading', async () => {
      mockManagerLoading.value = true
      const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
      await flushPromises()
      expect(wrapper.findAll('.animate-pulse').length).toBeGreaterThan(0)
    })

    it('navigates to team-detail on card click', async () => {
      mockManagedTeams.value = [
        { id: 'team_1', name: 'Platform', orgKey: 'eng', directReportUids: ['a'], totalMemberCount: 3, metadata: {} }
      ]
      const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
      await flushPromises()
      const card = wrapper.findAll('button').find(b => b.text().includes('Platform'))
      await card.trigger('click')
      expect(mockNavigateTo).toHaveBeenCalledWith('team-tracker', 'team-detail', { teamKey: 'eng::Platform', from: 'sotu' })
    })

    it('shows error state when manager dashboard fails', async () => {
      mockLoadManagerDashboard.mockImplementation(() => Promise.reject(new Error('403')))
      const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
      await flushPromises()
      expect(wrapper.text()).toContain('Unable to load managed teams')
    })

    it('shows empty state when no managed teams', async () => {
      mockManagedTeams.value = []
      const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
      await flushPromises()
      expect(wrapper.text()).toContain('No managed teams found')
    })

    it('shows components on managed team cards', async () => {
      mockDefinitions.value = {
        personFields: [],
        teamFields: [{ id: 'field_comp', label: 'Component', optionsRef: 'component', deleted: false }]
      }
      mockManagedTeams.value = [
        { id: 'team_1', name: 'Platform', orgKey: 'eng', directReportUids: ['a'], totalMemberCount: 3, metadata: { field_comp: ['API', 'Auth'] } }
      ]
      const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
      await flushPromises()
      expect(wrapper.text()).toContain('API')
      expect(wrapper.text()).toContain('Auth')
    })

    describe('project mode', () => {
      beforeEach(() => {
        mockProjectId.value = 'flight-control'
      })

      it('renders project-mode team cards using directReportCount and no component badges', async () => {
        mockDefinitions.value = {
          personFields: [],
          teamFields: [{ id: 'field_comp', label: 'Component', optionsRef: 'component', deleted: false }]
        }
        mockManagedTeams.value = [
          { id: 't_core', name: 'Core', orgKey: 'flight-control', directReportCount: 2, directReportAccountIds: ['a', 'b'], totalMemberCount: 5, metadata: { field_comp: ['API'] } }
        ]
        const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
        await flushPromises()
        expect(wrapper.text()).toContain('2 direct reports')
        expect(wrapper.text()).toContain('5 total')
        expect(wrapper.text()).not.toContain('API')
      })

      it('falls back to directReportAccountIds length when directReportCount is absent', async () => {
        mockManagedTeams.value = [
          { id: 't_core', name: 'Core', orgKey: 'flight-control', directReportAccountIds: ['a', 'b', 'c'], totalMemberCount: 5, metadata: {} }
        ]
        const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
        await flushPromises()
        expect(wrapper.text()).toContain('3 direct reports')
      })

      it('navigates using a projectId::teamId key on card click', async () => {
        mockManagedTeams.value = [
          { id: 't_core', name: 'Core', orgKey: 'flight-control', directReportCount: 1, totalMemberCount: 3, metadata: {} }
        ]
        const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
        await flushPromises()
        const card = wrapper.findAll('button').find(b => b.text().includes('Core'))
        await card.trigger('click')
        expect(mockNavigateTo).toHaveBeenCalledWith('team-tracker', 'team-detail', { teamKey: 'flight-control::t_core', from: 'sotu' })
      })

      it('reloads against the new project when the selected project changes', async () => {
        const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
        await flushPromises()
        expect(mockLoadManagerDashboard).toHaveBeenCalledTimes(1)

        mockProjectId.value = 'other-project'
        await wrapper.vm.$nextTick()
        await flushPromises()

        expect(mockResetState).toHaveBeenCalled()
        expect(mockLoadManagerDashboard).toHaveBeenCalledTimes(2)
      })

      it('does not reload on project change for a non-manager', async () => {
        mockUser.value = { email: 'ic@redhat.com', isManager: false }
        mockProjectIsManager.value = false
        const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
        await flushPromises()
        expect(mockLoadManagerDashboard).not.toHaveBeenCalled()

        mockProjectId.value = 'other-project'
        await wrapper.vm.$nextTick()
        await flushPromises()

        expect(mockLoadManagerDashboard).not.toHaveBeenCalled()
      })
    })

    describe('project-scoped manager permission', () => {
      it('loads for a project-only manager with no legacy OSAC manager flag', async () => {
        mockUser.value = { email: 'pm@redhat.com', isManager: false }
        mockProjectId.value = 'flight-control'
        mockProjectIsManager.value = true
        mockManagedTeams.value = [
          { id: 't_core', name: 'Core', orgKey: 'flight-control', directReportCount: 1, totalMemberCount: 2, metadata: {} }
        ]
        const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
        await flushPromises()
        expect(mockLoadManagerDashboard).toHaveBeenCalledTimes(1)
        expect(wrapper.text()).toContain('Core')
      })

      it('does not grant project access from a legacy OSAC manager flag alone', async () => {
        mockUser.value = { email: 'osac-mgr@redhat.com', isManager: true }
        mockProjectId.value = 'flight-control'
        mockProjectIsManager.value = false
        const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
        await flushPromises()
        expect(mockLoadManagerDashboard).not.toHaveBeenCalled()
        expect(wrapper.text()).toContain('This widget is for managers')
      })

      it('shows the loading skeleton, not the non-manager message, while project permission is resolving', async () => {
        mockUser.value = { email: 'pm@redhat.com', isManager: false }
        mockProjectId.value = 'flight-control'
        mockProjectIsManager.value = false
        mockPermissionsLoading.value = true
        const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
        await flushPromises()
        expect(mockLoadManagerDashboard).not.toHaveBeenCalled()
        expect(wrapper.text()).not.toContain('This widget is for managers')
        expect(wrapper.findAll('.animate-pulse').length).toBeGreaterThan(0)
      })

      it('explains an unavailable project hierarchy instead of claiming the viewer is not a manager', async () => {
        mockUser.value = { email: 'pm@redhat.com', isManager: false }
        mockProjectId.value = 'flight-control'
        mockProjectIsManager.value = false
        mockHierarchyAvailable.value = false
        const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
        await flushPromises()
        expect(wrapper.text()).toContain("manager hierarchy isn't published")
        expect(wrapper.text()).not.toContain('This widget is for managers')
        expect(mockLoadManagerDashboard).not.toHaveBeenCalled()
      })

      it('shows managed team cards for a verified manager even when the project hierarchy is only partially available', async () => {
        mockUser.value = { email: 'pm@redhat.com', isManager: false }
        mockProjectId.value = 'flight-control'
        mockProjectIsManager.value = true
        mockHierarchyAvailable.value = false
        mockManagedTeams.value = [
          { id: 't_core', name: 'Core', orgKey: 'flight-control', directReportCount: 1, totalMemberCount: 2, metadata: {} }
        ]
        const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
        await flushPromises()
        expect(mockLoadManagerDashboard).toHaveBeenCalledTimes(1)
        expect(wrapper.text()).toContain('Core')
        expect(wrapper.text()).not.toContain("manager hierarchy isn't published")
      })

      it('loads once project permission resolves after mounting mid-load', async () => {
        mockUser.value = { email: 'pm@redhat.com', isManager: false }
        mockProjectId.value = 'flight-control'
        mockProjectIsManager.value = false
        mockPermissionsLoading.value = true
        const wrapper = mount(ManagedTeamsWidget, { props: { size: 'full' } })
        await flushPromises()
        expect(mockLoadManagerDashboard).not.toHaveBeenCalled()

        mockProjectIsManager.value = true
        mockPermissionsLoading.value = false
        await wrapper.vm.$nextTick()
        await flushPromises()

        expect(mockLoadManagerDashboard).toHaveBeenCalledTimes(1)
      })
    })
  })
})

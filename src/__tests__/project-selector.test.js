/**
 * Shell project selector: the only visible UI addition for multi-project
 * support. Selecting a project sets the projectId hash param; single-project
 * deployments render nothing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, ref } from 'vue'

vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: vi.fn()
}))

import { apiRequest } from '@shared/client/services/api.js'
import ProjectSelector from '../components/ProjectSelector.vue'

function mountSelector(initialParams = {}) {
  const updateParams = vi.fn()
  const routeParams = ref(initialParams)
  const wrapper = mount(ProjectSelector, {
    global: {
      provide: {
        moduleNav: {
          updateParams,
          navigateTo: vi.fn(),
          goBack: vi.fn(),
          params: routeParams
        }
      }
    }
  })
  return { wrapper, updateParams, routeParams }
}

const twoProjects = { projects: [{ projectId: 'osac', displayName: 'OSAC' }, { projectId: 'flightctl', displayName: 'Flight Control' }] }

function lastContextState(wrapper) {
  return wrapper.emitted('context-state')?.at(-1)?.[0]
}

describe('ProjectSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders a selector only for multi-project deployments', async () => {
    apiRequest.mockResolvedValueOnce(twoProjects)
    const { wrapper } = mountSelector()
    await flushPromises()
    expect(wrapper.find('select#project-selector').exists()).toBe(true)

    apiRequest.mockResolvedValueOnce({ projects: [twoProjects.projects[0]] })
    const single = mountSelector()
    await flushPromises()
    expect(single.wrapper.find('select#project-selector').exists()).toBe(false)
    expect(lastContextState(single.wrapper)).toMatchObject({ state: 'ready', projectId: null })
  })

  it.each([
    ['a missing projects array', {}],
    ['an empty project list', { projects: [] }],
    ['an invalid project entry', { projects: [{ projectId: 'Flight Control', displayName: 'Flight Control' }] }],
    ['a project without a display name', { projects: [{ projectId: 'flightctl' }] }],
    ['duplicate project IDs', { projects: [{ projectId: 'osac', displayName: 'OSAC' }, { projectId: 'osac', displayName: 'OSAC 2' }] }]
  ])('shows unavailable for %s instead of accepting an empty or incomplete discovery response', async (_caseName, response) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    apiRequest.mockResolvedValueOnce(response)
    const { wrapper } = mountSelector()
    await flushPromises()

    expect(lastContextState(wrapper)).toMatchObject({ state: 'unavailable', projectId: null })
    expect(wrapper.find('select#project-selector').exists()).toBe(false)
    expect(wrapper.emitted('context-state').some(([state]) => state.state === 'ready')).toBe(false)
  })

  it('shows unavailable when project discovery fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    apiRequest.mockRejectedValueOnce(new Error('Project storage is unavailable'))
    const { wrapper } = mountSelector()
    await flushPromises()

    expect(lastContextState(wrapper)).toMatchObject({ state: 'unavailable', projectId: null })
    expect(wrapper.emitted('context-state').some(([state]) => state.state === 'ready')).toBe(false)
  })

  it('defaults to the first published project when no projectId param exists', async () => {
    apiRequest.mockResolvedValueOnce(twoProjects)
    const { wrapper } = mountSelector()
    await flushPromises()
    expect(wrapper.find('select#project-selector').element.value).toBe('osac')
  })

  it('keeps the explicit current projectId param as the selection', async () => {
    apiRequest.mockResolvedValueOnce(twoProjects)
    const { wrapper } = mountSelector({ projectId: 'flightctl' })
    await flushPromises()
    expect(wrapper.find('select#project-selector').element.value).toBe('flightctl')
  })

  it('sets the projectId param through moduleNav.updateParams on change', async () => {
    apiRequest.mockResolvedValueOnce(twoProjects)
    const { wrapper, updateParams } = mountSelector()
    await flushPromises()
    await wrapper.find('select#project-selector').setValue('flightctl')
    expect(updateParams).toHaveBeenCalledWith({ projectId: 'flightctl' })
    expect(wrapper.find('select#project-selector').element.value).toBe('flightctl')
  })

  it('keeps an unknown projectId visible for 404 handling', async () => {
    apiRequest.mockResolvedValueOnce(twoProjects)
    const { wrapper } = mountSelector({ projectId: 'nonexistent' })
    await flushPromises()
    expect(wrapper.find('select#project-selector').element.value).toBe('nonexistent')
    expect(lastContextState(wrapper)).toMatchObject({ state: 'not-found', projectId: 'nonexistent' })
  })

  it('uses the latest route project after asynchronous discovery completes', async () => {
    let resolveProjects
    apiRequest.mockReturnValueOnce(new Promise(resolve => { resolveProjects = resolve }))
    const { wrapper, routeParams, updateParams } = mountSelector()
    routeParams.value = { projectId: 'flightctl' }
    await nextTick()
    resolveProjects(twoProjects)
    await flushPromises()

    expect(wrapper.find('select#project-selector').element.value).toBe('flightctl')
    expect(updateParams).not.toHaveBeenCalled()
    expect(lastContextState(wrapper)).toMatchObject({ state: 'ready', projectId: 'flightctl' })
  })
})

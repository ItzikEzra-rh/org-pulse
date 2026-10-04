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
  const onContextState = vi.fn()
  const routeParams = ref(initialParams)
  const wrapper = mount(ProjectSelector, {
    attrs: { 'onContext-state': onContextState },
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
  return { wrapper, updateParams, routeParams, onContextState }
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
    vi.useRealTimers()
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

  it('retries transient 503 discovery and resolves the latest project navigation', async () => {
    vi.useFakeTimers()
    apiRequest
      .mockRejectedValueOnce(Object.assign(new Error('Publication is being updated'), { status: 503 }))
      .mockResolvedValueOnce(twoProjects)
    const { wrapper, routeParams, updateParams } = mountSelector()

    await vi.advanceTimersByTimeAsync(0)
    expect(apiRequest).toHaveBeenCalledTimes(1)
    expect(lastContextState(wrapper)).toMatchObject({ state: 'loading', projectId: null })

    routeParams.value = { projectId: 'flightctl' }
    await nextTick()
    await vi.advanceTimersByTimeAsync(1000)

    expect(apiRequest).toHaveBeenCalledTimes(2)
    expect(wrapper.find('select#project-selector').element.value).toBe('flightctl')
    expect(lastContextState(wrapper)).toMatchObject({ state: 'ready', projectId: 'flightctl' })
    expect(wrapper.emitted('context-state').some(([state]) => state.state === 'unavailable')).toBe(false)
    expect(updateParams).not.toHaveBeenCalled()
  })

  it('stays loading during five 503 attempts, then reports unavailable', async () => {
    vi.useFakeTimers()
    apiRequest.mockRejectedValue(Object.assign(new Error('Project storage is unavailable'), { status: 503 }))
    const { wrapper } = mountSelector()

    await vi.advanceTimersByTimeAsync(15_000)

    expect(apiRequest).toHaveBeenCalledTimes(5)
    expect(lastContextState(wrapper)).toMatchObject({ state: 'unavailable', projectId: null })
    expect(wrapper.emitted('context-state').filter(([state]) => state.state === 'loading')).toHaveLength(1)
  })

  it.each([
    ['401', Object.assign(new Error('Authentication failed'), { status: 401 })],
    ['network failure', new TypeError('Failed to fetch')]
  ])('does not retry a %s', async (_caseName, error) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    apiRequest.mockRejectedValueOnce(error)
    const { wrapper } = mountSelector()
    await flushPromises()

    expect(apiRequest).toHaveBeenCalledTimes(1)
    expect(lastContextState(wrapper)).toMatchObject({ state: 'unavailable', projectId: null })
  })

  it('aborts pending discovery and ignores a late response after unmount', async () => {
    let resolveProjects
    apiRequest.mockReturnValueOnce(new Promise(resolve => { resolveProjects = resolve }))
    const { wrapper, onContextState } = mountSelector()
    await nextTick()
    const requestSignal = apiRequest.mock.calls[0][1].signal

    wrapper.unmount()
    resolveProjects(twoProjects)
    await Promise.resolve()

    expect(requestSignal.aborted).toBe(true)
    expect(onContextState.mock.calls.some(([state]) => state.state === 'ready')).toBe(false)
    expect(onContextState.mock.calls.some(([state]) => state.state === 'unavailable')).toBe(false)
  })

  it('cancels a scheduled retry when unmounted', async () => {
    vi.useFakeTimers()
    apiRequest.mockRejectedValueOnce(Object.assign(new Error('Project publication is changing'), { status: 503 }))
    const { wrapper, onContextState } = mountSelector()
    await vi.advanceTimersByTimeAsync(0)
    expect(apiRequest).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    await vi.runAllTimersAsync()

    expect(apiRequest).toHaveBeenCalledTimes(1)
    expect(onContextState.mock.calls.some(([state]) => state.state === 'unavailable')).toBe(false)
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

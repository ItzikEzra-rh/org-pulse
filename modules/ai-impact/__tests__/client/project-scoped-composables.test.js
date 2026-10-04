import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: vi.fn(),
  getRoster: vi.fn(projectId => Promise.resolve({ projectId, orgs: [], people: [] }))
}))

import { apiRequest } from '@shared/client/services/api.js'
import { useComponentOnboarding } from '../../client/composables/useComponentOnboarding.js'
import { useDocMrKpi } from '../../client/composables/useDocMrKpi.js'
import { useTestPlans } from '../../client/composables/useTestPlans.js'

function setProjectId(projectId) {
  window.location.hash = projectId ? `#/ai-impact?projectId=${projectId}` : '#/'
  window.dispatchEvent(new Event('hashchange'))
}

function mountWith(setup) {
  let state
  const wrapper = mount(defineComponent({
    setup() {
      state = setup()
      return () => h('div')
    }
  }))
  return { wrapper, state: () => state }
}

describe('project-scoped AI Impact composables', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setProjectId('')
  })

  it('reloads component onboarding on project changes and ignores a late response', async () => {
    setProjectId('flightctl')
    let resolveFlightctl
    apiRequest.mockImplementation(path => {
      if (path.endsWith('projectId=flightctl')) return new Promise(resolve => { resolveFlightctl = resolve })
      if (path.endsWith('projectId=osac')) return Promise.resolve({ projectId: 'osac', components: [{ name: 'OSAC component' }] })
      return Promise.reject(new Error(`unexpected path: ${path}`))
    })
    const { wrapper, state } = mountWith(() => useComponentOnboarding())

    setProjectId('osac')
    await flushPromises()
    resolveFlightctl({ projectId: 'flightctl', components: [{ name: 'Flight Control component' }] })
    await flushPromises()

    expect(apiRequest).toHaveBeenCalledWith('/modules/ai-impact/component-onboarding?projectId=flightctl')
    expect(apiRequest).toHaveBeenCalledWith('/modules/ai-impact/component-onboarding?projectId=osac')
    expect(state().data.value).toMatchObject({ projectId: 'osac' })
    expect(state().data.value.components[0].name).toBe('OSAC component')
    wrapper.unmount()
  })

  it('reloads documentation KPI when switching back to OSAC', async () => {
    setProjectId('flightctl')
    apiRequest.mockImplementation(path => {
      if (path.endsWith('projectId=flightctl')) return Promise.resolve({ state: 'unavailable', projectId: 'flightctl', data: null })
      if (path.endsWith('projectId=osac')) return Promise.resolve({ total: 42, projectId: 'osac' })
      return Promise.reject(new Error(`unexpected path: ${path}`))
    })
    const { wrapper, state } = mountWith(() => useDocMrKpi())
    await flushPromises()
    expect(state().mrKpiData.value.state).toBe('unavailable')

    setProjectId('osac')
    await flushPromises()

    expect(apiRequest).toHaveBeenCalledWith('/modules/ai-impact/doc-mr-kpi-data?projectId=flightctl')
    expect(apiRequest).toHaveBeenCalledWith('/modules/ai-impact/doc-mr-kpi-data?projectId=osac')
    expect(state().mrKpiData.value).toMatchObject({ projectId: 'osac', total: 42 })
    wrapper.unmount()
  })

  it('reloads test-plan state on project changes and discards stale list responses', async () => {
    setProjectId('flightctl')
    let resolveFlightctl
    apiRequest.mockImplementation(path => {
      if (path.endsWith('projectId=flightctl')) return new Promise(resolve => { resolveFlightctl = resolve })
      if (path.endsWith('projectId=osac')) return Promise.resolve({ projectId: 'osac', testPlans: { OSAC: { title: 'OSAC plan' } }, totalTestPlans: 1 })
      return Promise.reject(new Error(`unexpected path: ${path}`))
    })
    const { wrapper, state } = mountWith(() => useTestPlans())
    state().loadTestPlans()

    setProjectId('osac')
    await flushPromises()
    resolveFlightctl({ projectId: 'flightctl', testPlans: { FLIGHT: { title: 'Flight Control plan' } }, totalTestPlans: 1 })
    await flushPromises()

    expect(apiRequest).toHaveBeenCalledWith('/modules/ai-impact/test-plans?projectId=flightctl')
    expect(apiRequest).toHaveBeenCalledWith('/modules/ai-impact/test-plans?projectId=osac')
    expect(state().testPlans.value).toEqual({ OSAC: { title: 'OSAC plan' } })
    wrapper.unmount()
  })
})

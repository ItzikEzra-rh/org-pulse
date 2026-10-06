import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'

vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: vi.fn()
}))

import { apiRequest } from '@shared/client/services/api.js'
import HygieneView from '../../../client/execute/views/HygieneView.vue'

function setProjectId(projectId) {
  window.location.hash = `#/releases/execute?tab=feature-status&projectId=${projectId}`
  window.dispatchEvent(new Event('hashchange'))
}

function response(projectId, extra = {}) {
  return {
    projectId,
    profileRevision: `${projectId}-revision`,
    state: 'supported',
    freshness: 'unknown',
    partial: false,
    generatedAt: '2026-10-06T08:00:00Z',
    results: {
      EDM: {
        projectId,
        profileRevision: `${projectId}-revision`,
        releaseHygiene: { state: 'supported', releases: [], summary: {}, ...extra }
      }
    }
  }
}

describe('Execute Jira Hygiene project selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setProjectId('flightctl')
  })

  it('requests the selected project and renders its release-hygiene view', async () => {
    apiRequest.mockResolvedValue(response('flightctl'))
    const wrapper = shallowMount(HygieneView)
    await flushPromises()

    expect(apiRequest).toHaveBeenCalledWith('/modules/releases/hygiene/project-hygiene?projectId=flightctl')
    expect(wrapper.find('project-hygiene-board-stub').exists()).toBe(true)
    expect(wrapper.find('legacy-hygiene-view-stub').exists()).toBe(false)
    wrapper.unmount()
  })

  it('preserves the legacy board only when the selected profile declares migration', async () => {
    apiRequest.mockResolvedValue({ ...response('osac'), legacyMigration: true })
    setProjectId('osac')
    const wrapper = shallowMount(HygieneView)
    await flushPromises()

    expect(wrapper.find('legacy-hygiene-view-stub').exists()).toBe(true)
    expect(wrapper.find('project-hygiene-board-stub').exists()).toBe(false)
    wrapper.unmount()
  })

  it('drops a previous project response after switching projects', async () => {
    let resolveFlightctl
    apiRequest.mockImplementation(path => {
      if (path.endsWith('projectId=flightctl')) {
        return new Promise(resolve => { resolveFlightctl = resolve })
      }
      if (path.endsWith('projectId=osac')) {
        return Promise.resolve({ ...response('osac'), legacyMigration: true })
      }
      return Promise.reject(new Error(`unexpected path: ${path}`))
    })

    const wrapper = shallowMount(HygieneView)
    await flushPromises()
    setProjectId('osac')
    await flushPromises()
    resolveFlightctl(response('flightctl'))
    await flushPromises()

    expect(wrapper.find('legacy-hygiene-view-stub').exists()).toBe(true)
    expect(wrapper.find('project-hygiene-board-stub').exists()).toBe(false)
    wrapper.unmount()
  })

  it('rejects a response for another project', async () => {
    apiRequest.mockResolvedValue(response('osac'))
    const wrapper = shallowMount(HygieneView)
    await flushPromises()

    expect(wrapper.text()).toContain('Jira Hygiene response project identity mismatch')
    expect(wrapper.find('legacy-hygiene-view-stub').exists()).toBe(false)
    wrapper.unmount()
  })
})

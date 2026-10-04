import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: vi.fn(),
  getRoster: vi.fn(projectId => Promise.resolve({ projectId, orgs: [], people: [] }))
}))

import { apiRequest } from '@shared/client/services/api.js'
import ProjectBuildsView from '../../client/views/ProjectBuildsView.vue'

function setProjectId(projectId) {
  window.location.hash = projectId ? `#/product-builds?projectId=${projectId}` : '#/'
  window.dispatchEvent(new Event('hashchange'))
}

describe('ProjectBuildsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setProjectId('')
  })

  it('renders a project-unavailable response instead of an empty registry', async () => {
    apiRequest.mockResolvedValue({
      projectId: 'flightctl',
      state: 'unavailable',
      reason: 'capability-not-supported',
      data: null
    })
    const wrapper = mount(ProjectBuildsView)
    await flushPromises()

    expect(wrapper.text()).toContain('Build registry unavailable')
    expect(wrapper.text()).toContain('capability-not-supported')
    expect(wrapper.text()).not.toContain('Packages')
  })

  it('keeps the selected project data when an earlier request resolves late', async () => {
    setProjectId('flightctl')
    let resolveFlightctl
    apiRequest.mockImplementation((path) => {
      if (path.endsWith('projectId=flightctl')) {
        return new Promise(resolve => { resolveFlightctl = resolve })
      }
      if (path.endsWith('projectId=osac')) {
        return Promise.resolve({
          projectId: 'osac',
          state: 'supported',
          data: { summary: { packageCount: 8, sourceCount: 1, failedSourceCount: 0 }, packages: [] }
        })
      }
      return Promise.reject(new Error(`unexpected path: ${path}`))
    })

    const wrapper = mount(ProjectBuildsView)
    setProjectId('osac')
    await flushPromises()
    resolveFlightctl({
      projectId: 'flightctl',
      state: 'supported',
      data: { summary: { packageCount: 99, sourceCount: 1, failedSourceCount: 0 }, packages: [] }
    })
    await flushPromises()

    expect(wrapper.text()).toContain('8')
    expect(wrapper.text()).not.toContain('99')
    expect(apiRequest).toHaveBeenCalledWith('/modules/product-builds/project-publication?projectId=flightctl')
    expect(apiRequest).toHaveBeenCalledWith('/modules/product-builds/project-publication?projectId=osac')
  })
})

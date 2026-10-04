import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: vi.fn(),
  getRoster: vi.fn(projectId => Promise.resolve({ projectId, orgs: [], people: [] }))
}))

import { apiRequest } from '@shared/client/services/api.js'
import ReleaseExecutionView from '../../client/views/ReleaseExecutionView.vue'

function setProjectId(projectId) {
  window.location.hash = projectId ? `#/system-health/release-execution?projectId=${projectId}` : '#/'
  window.dispatchEvent(new Event('hashchange'))
}

describe('ReleaseExecutionView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setProjectId('')
  })

  it('does not render an earlier project response after switching projects', async () => {
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
          generatedAt: '2026-10-01T00:00:00Z',
          data: { workflowRuns: [{ id: 'osac-run', name: 'OSAC run' }], jobs: [], releases: [], artifacts: [] }
        })
      }
      return Promise.reject(new Error(`unexpected path: ${path}`))
    })

    const wrapper = mount(ReleaseExecutionView)
    setProjectId('osac')
    await flushPromises()
    resolveFlightctl({
      projectId: 'flightctl',
      state: 'supported',
      data: { workflowRuns: [{ id: 'flightctl-run', name: 'Flight Control run' }], jobs: [], releases: [], artifacts: [] }
    })
    await flushPromises()

    expect(wrapper.text()).toContain('OSAC run')
    expect(wrapper.text()).not.toContain('Flight Control run')
  })
})

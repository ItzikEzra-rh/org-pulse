import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: vi.fn(),
  getRoster: vi.fn(projectId => Promise.resolve({ projectId, orgs: [], people: [] }))
}))

import { apiRequest } from '@shared/client/services/api.js'
import ProjectDesignDocsView from '../../client/components/ProjectDesignDocsView.vue'

function setProjectId(projectId) {
  window.location.hash = projectId ? `#/ai-impact/documentation?projectId=${projectId}` : '#/'
  window.dispatchEvent(new Event('hashchange'))
}

function makePublication(projectId, feature) {
  return {
    projectId,
    freshness: 'fresh',
    generatedAt: '2026-10-01T00:00:00Z',
    data: {
      projectId,
      repository: `${projectId}/design-docs`,
      branch: 'main',
      featureCount: 1,
      artifactCount: 1,
      missingArtifactCount: 0,
      pullRequestCount: 1,
      features: [{ featurePath: 'features/test.md', feature, release: '0.10.0', artifacts: [] }]
    }
  }
}

describe('ProjectDesignDocsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setProjectId('')
  })

  it('does not let a previous project request overwrite the newly selected project', async () => {
    setProjectId('flightctl')
    let resolveFlightctl
    apiRequest.mockImplementation((path) => {
      if (path.endsWith('projectId=flightctl')) {
        return new Promise(resolve => { resolveFlightctl = resolve })
      }
      if (path.endsWith('projectId=osac')) return Promise.resolve(makePublication('osac', 'OSAC feature'))
      return Promise.reject(new Error(`unexpected path: ${path}`))
    })

    const wrapper = mount(ProjectDesignDocsView)
    setProjectId('osac')
    await flushPromises()
    resolveFlightctl(makePublication('flightctl', 'Flight Control feature'))
    await flushPromises()

    expect(wrapper.text()).toContain('OSAC feature')
    expect(wrapper.text()).not.toContain('Flight Control feature')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: vi.fn()
}))

import { apiRequest } from '@shared/client/services/api.js'
import DocumentationView from '../../client/views/DocumentationView.vue'

describe('DocumentationView project selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.location.hash = '#/ai-impact/documentation?projectId=flightctl'
    window.dispatchEvent(new Event('hashchange'))
  })

  it('loads project design-doc evidence without starting the OSAC documentation fetches', async () => {
    apiRequest.mockResolvedValue({
      projectId: 'flightctl',
      state: 'supported',
      freshness: 'fresh',
      partial: false,
      generatedAt: '2026-10-06T08:00:00Z',
      data: {
        repository: 'flightctl/design-docs',
        branch: 'main',
        featureCount: 17,
        artifactCount: 40,
        missingArtifactCount: 0,
        pullRequestCount: 51,
        features: []
      }
    })

    const wrapper = mount(DocumentationView, {
      global: { stubs: { OsacDocumentationView: true, AIImpactGuide: true } }
    })
    await flushPromises()

    expect(apiRequest).toHaveBeenCalledWith('/modules/ai-impact/project-design-docs?projectId=flightctl')
    expect(apiRequest).not.toHaveBeenCalledWith('/modules/ai-impact/doc-data?projectId=flightctl')
    expect(apiRequest).not.toHaveBeenCalledWith('/modules/ai-impact/doc-mr-kpi-data?projectId=flightctl')
    expect(wrapper.text()).toContain('17')
    expect(wrapper.text()).toContain('40')
    expect(wrapper.text()).toContain('51')
  })
})

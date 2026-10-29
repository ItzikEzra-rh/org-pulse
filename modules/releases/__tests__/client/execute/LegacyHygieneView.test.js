import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, shallowMount } from '@vue/test-utils'

vi.mock('@shared/client/services/api.js', () => ({ apiRequest: vi.fn() }))

import { apiRequest } from '@shared/client/services/api.js'
import LegacyHygieneView from '../../../client/execute/views/LegacyHygieneView.vue'
import KanbanBoard from '../../../client/execute/components/hygiene/KanbanBoard.vue'

const releases = [
  { displayName: 'OSAC 0.4', fixVersions: ['0.4'] },
  { displayName: 'OSAC Backlog', fixVersions: ['Backlog'] },
  { displayName: 'Unmapped', fixVersions: [] }
]

function installResponses() {
  apiRequest.mockImplementation(path => {
    const url = new URL(path, 'http://localhost')
    const version = url.searchParams.get('version')
    if (url.pathname.endsWith('/registry')) return Promise.resolve({ releases })
    if (url.pathname.endsWith('/config')) return Promise.resolve({})
    if (url.pathname.endsWith('/execution/features')) return Promise.resolve({ features: [] })
    if (url.pathname.endsWith('/hygiene/summary')) {
      return Promise.resolve({ totalFeatures: version === '0.4' ? 1 : 0, featuresWithViolations: 0 })
    }
    if (url.pathname.endsWith('/hygiene/features')) {
      const features = version === '0.4'
        ? { 'OSAC-1': { key: 'OSAC-1', summary: 'A feature', violations: [] } }
        : {}
      return Promise.resolve({ features, fetchedAt: version === 'Unmapped' ? null : '2026-10-29T08:00:00Z' })
    }
    throw new Error(`Unexpected request: ${path}`)
  })
}

function mountView(version) {
  return shallowMount(LegacyHygieneView, {
    global: { provide: { moduleNav: { params: ref(version ? { version } : {}), navigateTo: vi.fn() } } }
  })
}

describe('Legacy Release Hygiene version mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.location.hash = '#/releases/execute?tab=feature-status&projectId=osac'
    window.dispatchEvent(new Event('hashchange'))
    installResponses()
  })

  it('loads a selected display name using its Jira fix version', async () => {
    const wrapper = mountView('OSAC 0.4')
    await flushPromises()

    expect(apiRequest).toHaveBeenCalledWith('/modules/releases/hygiene/features?version=0.4&projectId=osac')
    expect(apiRequest).toHaveBeenCalledWith('/modules/releases/hygiene/summary?version=0.4&projectId=osac')
    expect(wrapper.findComponent(KanbanBoard).props('features')).toMatchObject([{ key: 'OSAC-1' }])
    expect(wrapper.text()).toContain('Features:1')
    wrapper.unmount()
  })

  it('loads all releases by fix version and falls back to an unmapped display name', async () => {
    const wrapper = mountView()
    await flushPromises()

    for (const version of ['0.4', 'Backlog', 'Unmapped']) {
      expect(apiRequest).toHaveBeenCalledWith(`/modules/releases/hygiene/features?version=${version}&projectId=osac`)
      expect(apiRequest).toHaveBeenCalledWith(`/modules/releases/hygiene/summary?version=${version}&projectId=osac`)
    }
    expect(wrapper.findComponent(KanbanBoard).props('features')).toMatchObject([{ key: 'OSAC-1' }])
    wrapper.unmount()
  })

  it('distinguishes a published empty release from missing hygiene data', async () => {
    const empty = mountView('OSAC Backlog')
    await flushPromises()
    expect(empty.text()).toContain('No features found for the selected release.')
    expect(empty.text()).not.toContain('trigger a hygiene data refresh')
    empty.unmount()

    const missing = mountView('Unmapped')
    await flushPromises()
    expect(missing.text()).toContain('No hygiene data available')
    expect(missing.text()).toContain('trigger a hygiene data refresh')
    missing.unmount()
  })
})

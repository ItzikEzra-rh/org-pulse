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

const publishedAt = '2026-10-29T08:00:00Z'
const mappedFeature = { key: 'OSAC-1', summary: 'Mapped feature', violations: [] }
const refreshedFeature = { key: 'OSAC-2', summary: 'Refreshed feature', violations: [] }

function installResponses(dataByVersion = {
  '0.4': { fetchedAt: publishedAt, features: { 'OSAC-1': mappedFeature } },
  'OSAC Backlog': { fetchedAt: publishedAt, features: {} }
}) {
  apiRequest.mockImplementation(path => {
    const url = new URL(path, 'http://localhost')
    const version = url.searchParams.get('version')
    if (url.pathname.endsWith('/registry')) return Promise.resolve({ releases })
    if (url.pathname.endsWith('/config')) return Promise.resolve({})
    if (url.pathname.endsWith('/execution/features')) return Promise.resolve({ features: [] })
    if (url.pathname.endsWith('/hygiene/summary')) {
      const data = dataByVersion[version]
      return Promise.resolve({ fetchedAt: data?.fetchedAt || null, totalFeatures: Object.keys(data?.features || {}).length, featuresWithViolations: 0 })
    }
    if (url.pathname.endsWith('/hygiene/features')) {
      return Promise.resolve(dataByVersion[version] || { features: {}, fetchedAt: null })
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

  it('falls back to the Jira fix version when display-name data is missing', async () => {
    const wrapper = mountView('OSAC 0.4')
    await flushPromises()

    expect(apiRequest).toHaveBeenCalledWith('/modules/releases/hygiene/features?version=OSAC+0.4&projectId=osac')
    expect(apiRequest).toHaveBeenCalledWith('/modules/releases/hygiene/summary?version=OSAC+0.4&projectId=osac')
    expect(apiRequest).toHaveBeenCalledWith('/modules/releases/hygiene/features?version=0.4&projectId=osac')
    expect(apiRequest).toHaveBeenCalledWith('/modules/releases/hygiene/summary?version=0.4&projectId=osac')
    expect(wrapper.findComponent(KanbanBoard).props('features')).toMatchObject([{ key: 'OSAC-1' }])
    expect(wrapper.text()).toContain('Features:1')
    wrapper.unmount()
  })

  it('prefers data written by refresh under the display name when both files exist', async () => {
    installResponses({
      'OSAC 0.4': { fetchedAt: publishedAt, features: { 'OSAC-2': refreshedFeature } },
      '0.4': { fetchedAt: publishedAt, features: { 'OSAC-1': mappedFeature } }
    })
    const wrapper = mountView('OSAC 0.4')
    await flushPromises()

    expect(apiRequest).toHaveBeenCalledWith('/modules/releases/hygiene/features?version=OSAC+0.4&projectId=osac')
    expect(apiRequest).toHaveBeenCalledWith('/modules/releases/hygiene/summary?version=OSAC+0.4&projectId=osac')
    expect(apiRequest).not.toHaveBeenCalledWith('/modules/releases/hygiene/features?version=0.4&projectId=osac')
    expect(apiRequest).toHaveBeenCalledWith('/modules/releases/execution/features?version=0.4&projectId=osac')
    expect(wrapper.findComponent(KanbanBoard).props('features')).toMatchObject([{ key: 'OSAC-2' }])
    wrapper.unmount()
  })

  it('does not replace a published empty display-name file with fix-version data', async () => {
    installResponses({
      'OSAC 0.4': { fetchedAt: publishedAt, features: {} },
      '0.4': { fetchedAt: publishedAt, features: { 'OSAC-1': mappedFeature } }
    })
    const wrapper = mountView('OSAC 0.4')
    await flushPromises()

    expect(wrapper.text()).toContain('No features found for the selected release.')
    expect(apiRequest).not.toHaveBeenCalledWith('/modules/releases/hygiene/features?version=0.4&projectId=osac')
    wrapper.unmount()
  })

  it('does not fall back when the project data is unavailable', async () => {
    const normalResponse = apiRequest.getMockImplementation()
    apiRequest.mockImplementation(path => path.includes('/hygiene/features?version=OSAC+0.4')
      ? Promise.resolve({ state: 'unavailable', message: 'Hygiene is unavailable' })
      : normalResponse(path))
    const wrapper = mountView('OSAC 0.4')
    await flushPromises()

    expect(wrapper.text()).toContain('Hygiene is unavailable')
    expect(apiRequest).not.toHaveBeenCalledWith('/modules/releases/hygiene/features?version=0.4&projectId=osac')
    wrapper.unmount()
  })

  it('loads all releases using display names and mapped fallbacks where needed', async () => {
    const wrapper = mountView()
    await flushPromises()

    for (const version of ['OSAC+0.4', '0.4', 'OSAC+Backlog', 'Unmapped']) {
      expect(apiRequest).toHaveBeenCalledWith(`/modules/releases/hygiene/features?version=${version}&projectId=osac`)
      expect(apiRequest).toHaveBeenCalledWith(`/modules/releases/hygiene/summary?version=${version}&projectId=osac`)
    }
    expect(apiRequest).not.toHaveBeenCalledWith('/modules/releases/hygiene/features?version=Backlog&projectId=osac')
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

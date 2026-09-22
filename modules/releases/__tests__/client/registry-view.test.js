/**
 * Registry write/direct-source UI (Create/Edit/Archive/Restore/Discover/Resolve
 * Jira Versions) must not render — the registry write routes it used to call
 * have been removed, so the UI must not offer actions that hit routes which
 * no longer exist.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: vi.fn()
}))

vi.mock('@shared/client/composables/useAuth.js', () => ({
  useAuth: () => ({ isAdmin: ref(true), roles: ref([]) })
}))

import { apiRequest } from '@shared/client/services/api.js'
import RegistryView from '../../client/views/RegistryView.vue'

function makeRelease(id, overrides = {}) {
  return {
    id,
    displayName: id.toUpperCase(),
    state: 'active',
    source: 'jira',
    milestones: {},
    ...overrides
  }
}

function mountView(params = {}) {
  return mount(RegistryView, {
    global: {
      provide: {
        moduleNav: {
          navigateTo: vi.fn(),
          goBack: vi.fn(),
          updateParams: vi.fn(),
          params: ref(params)
        }
      }
    }
  })
}

describe('RegistryView source badge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('labels a jira-sourced release as "Jira", not "Manual"', async () => {
    apiRequest.mockResolvedValue({ releases: [makeRelease('rhoai-3.5', { source: 'jira' })] })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Jira')
    expect(wrapper.text()).not.toContain('Manual')
  })

  it('still labels a product-pages release as "Product Pages"', async () => {
    apiRequest.mockResolvedValue({ releases: [makeRelease('rhoai-3.5', { source: 'product-pages' })] })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Product Pages')
  })

  it('falls back to "Manual" only for a truly unrecognized source', async () => {
    apiRequest.mockResolvedValue({ releases: [makeRelease('rhoai-3.5', { source: 'something-else' })] })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Manual')
  })
})

describe('RegistryView write controls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not render Create/Discover/Resolve Jira Versions buttons', async () => {
    apiRequest.mockResolvedValueOnce({
      releases: [makeRelease('rhoai-2.16', { fixVersions: ['RHOAI-2.16'], createdAt: '2026-01-01T00:00:00Z' })]
    })
    const wrapper = mountView()
    await flushPromises()

    const buttonText = wrapper.findAll('button').map(b => b.text())
    expect(buttonText).not.toContain('Discover')
    expect(buttonText).not.toContain('Resolve Jira Versions')
    expect(buttonText).not.toContain('+ New Release')
  })

  it('does not render Edit/Archive/Restore buttons on a release card', async () => {
    apiRequest.mockResolvedValueOnce({
      releases: [makeRelease('rhoai-2.16', { fixVersions: ['RHOAI-2.16'], createdAt: '2026-01-01T00:00:00Z' })]
    })
    const wrapper = mountView()
    await flushPromises()

    const buttonText = wrapper.findAll('button').map(b => b.text())
    expect(buttonText).not.toContain('Edit')
    expect(buttonText).not.toContain('Archive')
    expect(buttonText).not.toContain('Restore')
  })

  it('still fetches and displays releases read-only (GET /registry only)', async () => {
    apiRequest.mockResolvedValueOnce({
      releases: [makeRelease('rhoai-2.16', { displayName: 'RHOAI 2.16', fixVersions: ['RHOAI-2.16'], createdAt: '2026-01-01T00:00:00Z' })]
    })
    const wrapper = mountView()
    await flushPromises()

    expect(apiRequest).toHaveBeenCalledTimes(1)
    expect(apiRequest).toHaveBeenCalledWith('/modules/releases/registry')
    expect(wrapper.text()).toContain('RHOAI 2.16')
  })

  it('uses the explicit project context for a published registry', async () => {
    apiRequest.mockResolvedValueOnce({ releases: [makeRelease('flightctl-1.4.0')] })
    const wrapper = mountView({ projectId: 'flightctl' })
    await flushPromises()

    expect(apiRequest).toHaveBeenCalledWith('/modules/releases/registry?projectId=flightctl')
    expect(wrapper.find('h1').text()).toBe('Release Registry')
  })

  it('shows an empty read-only message when there are no releases', async () => {
    apiRequest.mockResolvedValueOnce({ releases: [] })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('The release registry is empty.')
    expect(wrapper.findAll('button').map(b => b.text())).not.toContain('Create manually')
  })
})

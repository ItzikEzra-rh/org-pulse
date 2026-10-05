import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { shallowMount, flushPromises } from '@vue/test-utils'
import ExecuteView from '../../../client/views/ExecuteView.vue'
const { project, api } = await vi.hoisted(async () => {
  const { ref } = await import('vue')
  return { project: ref('microshift'), api: vi.fn() }
})
vi.mock('@shared/client/services/api.js', () => ({ apiRequest: (...args) => api(...args) }))
vi.mock('@shared/client/composables/useProjectId.js', () => ({ useProjectId: () => project, projectQuery: id => `?projectId=${id}` }))
function mountView() { return shallowMount(ExecuteView, { global: { provide: { moduleNav: { params: ref({}), updateParams: vi.fn() } } } }) }
beforeEach(() => { project.value = 'microshift'; api.mockReset() })
describe('profile-configured Execute presentation', () => {
  it('renders evidence for a third project solely from its profile configuration', async () => {
    api.mockResolvedValue({ projectId: 'microshift', state: 'supported', view: 'release-evidence' })
    const wrapper = mountView(); await flushPromises()
    expect(wrapper.find('project-execution-evidence-view-stub').exists()).toBe(true)
    expect(wrapper.find('overview-view-stub').exists()).toBe(false)
    wrapper.unmount()
  })
  it('renders the configured feature presentation without a client project-name branch', async () => {
    api.mockResolvedValue({ projectId: 'microshift', state: 'supported', view: 'feature-execution' })
    const wrapper = mountView(); await flushPromises()
    expect(wrapper.find('overview-view-stub').exists()).toBe(true)
    expect(wrapper.find('project-execution-evidence-view-stub').exists()).toBe(false)
    wrapper.unmount()
  })
  it('honestly reports unconfigured presentation and never falls back to feature tabs', async () => {
    api.mockResolvedValue({ projectId: 'microshift', state: 'unavailable', view: null, message: 'Not configured' })
    const wrapper = mountView(); await flushPromises()
    expect(wrapper.text()).toContain('Not configured')
    expect(wrapper.find('overview-view-stub').exists()).toBe(false)
    wrapper.unmount()
  })
  it('ignores a late presentation response after project switching', async () => {
    let resolveOld
    api.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve })).mockResolvedValueOnce({ projectId: 'flightctl', state: 'supported', view: 'release-evidence' })
    const wrapper = mountView(); project.value = 'flightctl'; await flushPromises()
    resolveOld({ projectId: 'microshift', state: 'supported', view: 'feature-execution' }); await flushPromises()
    expect(wrapper.find('project-execution-evidence-view-stub').exists()).toBe(true)
    expect(wrapper.find('overview-view-stub').exists()).toBe(false)
    wrapper.unmount()
  })
})

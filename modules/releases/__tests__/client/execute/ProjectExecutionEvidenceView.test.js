import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import View from '../../../client/execute/views/ProjectExecutionEvidenceView.vue'
const project = ref('flightctl')
const api = vi.fn()
vi.mock('@shared/client/services/api.js', () => ({ apiRequest: (...args) => api(...args) }))
vi.mock('@shared/client/composables/useProjectId.js', () => ({ useProjectId: () => project, projectQuery: id => `?projectId=${id}` }))
function envelope(projectId = 'flightctl') {
  return { projectId, projectDisplayName: 'Flight Control', state: 'supported', freshness: 'stale', partial: true, data: {
    projectId, releases: [{ releaseId: 'r1', version: '0.10.0', execution: { workflowRunIds: [1], jobIds: [], artifactIds: [] }, unmatched: [] }],
    workflowRuns: [{ id: 1, repository: 'flightctl/flightctl', name: 'Release workflow', status: 'completed', conclusion: 'failure', sourceUrl: 'https://github.com/flightctl/flightctl/actions/runs/1' }], jobs: [], artifacts: []
  } }
}
beforeEach(() => { project.value = 'flightctl'; api.mockReset() })
describe('project release execution view', () => {
  it('shows bounded evidence, freshness, source links and actual failed conclusion', async () => {
    api.mockResolvedValue(envelope())
    const wrapper = mount(View)
    await flushPromises()
    expect(api).toHaveBeenCalledWith('/modules/releases/execution/evidence?projectId=flightctl')
    expect(wrapper.text()).toContain('Partial coverage')
    expect(wrapper.text()).toContain('stale')
    expect(wrapper.text()).toContain('failure')
    expect(wrapper.text()).not.toContain('completed')
    expect(wrapper.find('a').attributes('href')).toContain('github.com/flightctl')
    await wrapper.get('select').setValue('r1')
    expect(wrapper.text()).toContain('Readiness: unknown')
    expect(wrapper.text()).toContain('No evidence linked to this release')
    wrapper.unmount()
  })
  it('clears old data and rejects late responses after project changes', async () => {
    let resolveOld
    api.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve })).mockResolvedValueOnce(envelope('another'))
    const wrapper = mount(View)
    project.value = 'another'
    await flushPromises()
    resolveOld(envelope())
    await flushPromises()
    expect(wrapper.vm.envelope.projectId).toBe('another')
    wrapper.unmount()
  })
  it('rejects mismatched nested project data', async () => {
    const value = envelope(); value.data.projectId = 'osac'
    api.mockResolvedValue(value)
    const wrapper = mount(View)
    await flushPromises()
    expect(wrapper.text()).toContain('identity mismatch')
    expect(wrapper.find('select').exists()).toBe(false)
    wrapper.unmount()
  })
  it('renders an unavailable publication without showing old evidence', async () => {
    api.mockResolvedValue({ projectId: 'flightctl', state: 'unavailable', freshness: 'unknown', message: 'Collection unavailable' })
    const wrapper = mount(View)
    await flushPromises()
    expect(wrapper.text()).toContain('Collection unavailable')
    expect(wrapper.find('select').exists()).toBe(false)
    wrapper.unmount()
  })
})

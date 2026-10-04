import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: vi.fn()
}))

vi.mock('@shared/client/composables/useProjectId.js', async () => {
  const { ref } = await import('vue')
  const projectId = ref('flightctl')
  return {
    useProjectId: () => projectId,
    projectQuery: value => value ? `?projectId=${encodeURIComponent(value)}` : ''
  }
})

const mockNavigateTo = vi.fn()
vi.mock('@shared/client/composables/useModuleLink.js', () => ({
  useModuleLink: () => ({
    navigateTo: mockNavigateTo,
    linkTo: vi.fn()
  })
}))

import { apiRequest } from '@shared/client/services/api.js'
import CiDutyWidget from '../../../client/widgets/CiDutyWidget.vue'

function makeRoster(entries) {
  return { generatedAt: '2026-09-17T08:00:00Z', entries }
}

describe('CiDutyWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a loading skeleton initially', () => {
    apiRequest.mockReturnValue(new Promise(() => {}))
    const wrapper = mount(CiDutyWidget, { props: { size: 'half' } })
    expect(wrapper.find('.animate-pulse').exists()).toBe(true)
  })

  it('shows a quiet message on 404 (no roster delivered yet)', async () => {
    const err = new Error('No CI Duty roster available yet')
    err.status = 404
    apiRequest.mockRejectedValue(err)
    const wrapper = mount(CiDutyWidget, { props: { size: 'half' } })
    await flushPromises()
    expect(wrapper.text()).toContain('CI Duty roster unavailable')
    expect(wrapper.find('.animate-pulse').exists()).toBe(false)
  })

  it('shows a quiet message on a non-404 failure, not a large error panel', async () => {
    apiRequest.mockRejectedValue(new Error('network down'))
    const wrapper = mount(CiDutyWidget, { props: { size: 'half' } })
    await flushPromises()
    expect(wrapper.text()).toContain('CI Duty roster unavailable')
    expect(wrapper.text()).not.toContain('network down')
  })

  it('shows "no current duty" quietly when nothing matches today', async () => {
    apiRequest.mockResolvedValue(makeRoster([
      { lead: 'Past Person', workgroup: 'CaaS', startDate: '2000-01-01', endDate: '2000-01-07' }
    ]))
    const wrapper = mount(CiDutyWidget, { props: { size: 'half' } })
    await flushPromises()
    expect(wrapper.text()).toContain('No one is currently on CI Duty')
  })

  it('shows "no current duty" alongside the next duty during a roster gap', async () => {
    apiRequest.mockResolvedValue(makeRoster([
      { lead: 'Past Person', workgroup: 'CaaS', startDate: '2000-01-01', endDate: '2000-01-07' },
      { lead: 'Future Lead', workgroup: 'Networking', startDate: '2999-01-01', endDate: '2999-01-07' }
    ]))
    const wrapper = mount(CiDutyWidget, { props: { size: 'half' } })
    await flushPromises()
    expect(wrapper.text()).toContain('No one is currently on CI Duty')
    expect(wrapper.text()).toContain('Next: Future Lead')
    expect(wrapper.text()).toContain('Networking')
  })

  it('renders the current lead with workgroup badge and date range', async () => {
    apiRequest.mockResolvedValue(makeRoster([
      { lead: 'Riccardo Piccoli', workgroup: 'CaaS', startDate: '2000-01-01', endDate: '2999-01-01' }
    ]))
    const wrapper = mount(CiDutyWidget, { props: { size: 'half' } })
    await flushPromises()
    expect(apiRequest).toHaveBeenCalledWith('/modules/system-health/ci-duty?projectId=flightctl')
    expect(wrapper.text()).toContain('Riccardo Piccoli')
    expect(wrapper.text()).toContain('RP')
    expect(wrapper.text()).toContain('CaaS')
    expect(wrapper.text()).toContain('Current')
  })

  it('shows an inapplicable message without rendering the OSAC duty roster', async () => {
    apiRequest.mockResolvedValue({
      projectId: 'flightctl',
      state: 'inapplicable',
      reason: 'user-approved-osac-only',
      data: null
    })
    const wrapper = mount(CiDutyWidget, { props: { size: 'half' } })
    await flushPromises()

    expect(wrapper.text()).toContain('CI Duty is not applicable to this project')
    expect(wrapper.text()).not.toContain('Riccardo Piccoli')
  })

  it('renders the supporting copy alongside the current lead', async () => {
    apiRequest.mockResolvedValue(makeRoster([
      { lead: 'Riccardo Piccoli', workgroup: 'CaaS', startDate: '2000-01-01', endDate: '2999-01-01' }
    ]))
    const wrapper = mount(CiDutyWidget, { props: { size: 'half' } })
    await flushPromises()
    expect(wrapper.text()).toContain('On duty this week')
    expect(wrapper.text()).toContain('Keeping our CI systems healthy and running.')
  })

  it('renders the next lead in the footer when there is a current duty', async () => {
    apiRequest.mockResolvedValue(makeRoster([
      { lead: 'Riccardo Piccoli', workgroup: 'CaaS', startDate: '2000-01-01', endDate: '2999-01-01' },
      { lead: 'Alice Chen', workgroup: 'Networking', startDate: '2999-01-02', endDate: '2999-01-08' }
    ]))
    const wrapper = mount(CiDutyWidget, { props: { size: 'half' } })
    await flushPromises()
    expect(wrapper.text()).toContain('Next: Alice Chen')
    expect(wrapper.text()).toContain('Networking')
  })

  it('omits the footer when there is no next duty', async () => {
    apiRequest.mockResolvedValue(makeRoster([
      { lead: 'Riccardo Piccoli', workgroup: 'CaaS', startDate: '2000-01-01', endDate: '2999-01-01' }
    ]))
    const wrapper = mount(CiDutyWidget, { props: { size: 'half' } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('Next:')
  })

  it('navigates to the full CI Duty view on "View all"', async () => {
    apiRequest.mockResolvedValue(makeRoster([]))
    const wrapper = mount(CiDutyWidget, { props: { size: 'half' } })
    await flushPromises()
    await wrapper.find('button').trigger('click')
    expect(mockNavigateTo).toHaveBeenCalledWith('system-health', 'ci-duty')
  })
})

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

import { apiRequest } from '@shared/client/services/api.js'
import CiDutyView from '../../client/views/CiDutyView.vue'

function makeRoster(entries) {
  return { generatedAt: '2026-09-17T08:00:00Z', entries }
}

describe('CiDutyView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('renders a loading state initially', () => {
    apiRequest.mockReturnValue(new Promise(() => {}))
    const wrapper = mount(CiDutyView)
    expect(wrapper.find('.animate-pulse').exists()).toBe(true)
  })

  it('renders a distinct empty state on 404 (no roster delivered yet)', async () => {
    const err = new Error('No CI Duty roster available yet')
    err.status = 404
    apiRequest.mockRejectedValue(err)
    const wrapper = mount(CiDutyView)
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('No CI Duty roster available')
    expect(wrapper.text()).not.toContain('Failed to load CI Duty roster')
  })

  it('renders an error state (not the empty state) on a non-404 failure', async () => {
    const err = new Error('network down')
    apiRequest.mockRejectedValue(err)
    const wrapper = mount(CiDutyView)
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('Failed to load CI Duty roster')
    expect(wrapper.text()).toContain('network down')
  })

  it('renders current duty, up next, and the rotation table', async () => {
    apiRequest.mockResolvedValue(makeRoster([
      { lead: 'Riccardo Piccoli', workgroup: 'CaaS', startDate: '2000-01-01', endDate: '2999-01-01' },
      { lead: 'Alice Chen', workgroup: 'Networking', startDate: '2999-01-02', endDate: '2999-01-08' }
    ]))
    const wrapper = mount(CiDutyView)
    await flushPromises()
    await flushPromises()

    expect(apiRequest).toHaveBeenCalledWith('/modules/system-health/ci-duty?projectId=flightctl')
    expect(wrapper.text()).toContain('Riccardo Piccoli')
    expect(wrapper.text()).toContain('RP')
    expect(wrapper.text()).toContain('CaaS')
    expect(wrapper.text()).toContain('Alice Chen')
    expect(wrapper.text()).toContain('Networking')
    expect(wrapper.text()).toContain('Current')
    expect(wrapper.text()).toContain('Up Next')
  })

  it('renders an explicit inapplicable state without OSAC roster data', async () => {
    apiRequest.mockResolvedValue({
      projectId: 'flightctl',
      state: 'inapplicable',
      reason: 'user-approved-osac-only',
      data: null
    })
    const wrapper = mount(CiDutyView)
    await flushPromises()
    await flushPromises()

    expect(wrapper.text()).toContain('CI Duty is not applicable')
    expect(wrapper.text()).not.toContain('Riccardo Piccoli')
    expect(wrapper.text()).not.toContain('Upcoming Rotation')
  })

  it('shows "no current duty" state distinct from "no next duty"', async () => {
    apiRequest.mockResolvedValue(makeRoster([
      { lead: 'Past Person', workgroup: 'CaaS', startDate: '2000-01-01', endDate: '2000-01-07' }
    ]))
    const wrapper = mount(CiDutyView)
    await flushPromises()
    await flushPromises()

    expect(wrapper.text()).toContain('No one is currently on CI Duty')
    expect(wrapper.text()).toContain('No upcoming duty scheduled')
  })

  it('renders an empty rotation table when there are no entries', async () => {
    apiRequest.mockResolvedValue(makeRoster([]))
    const wrapper = mount(CiDutyView)
    await flushPromises()
    await flushPromises()

    expect(wrapper.text()).toContain('No rotation entries')
  })
})

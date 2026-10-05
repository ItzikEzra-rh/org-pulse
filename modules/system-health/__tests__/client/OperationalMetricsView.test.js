import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

vi.mock('@shared/client/services/api.js', () => ({ apiRequest: vi.fn() }))

import { apiRequest } from '@shared/client/services/api.js'
import OperationalMetricsView from '../../client/views/OperationalMetricsView.vue'

const PROJECTS = [
  {
    projectId: 'osac',
    displayName: 'OSAC',
    capabilities: {
      operationalMetrics: {
        state: 'supported',
        title: 'Unified Operational Intelligence',
        url: 'https://devtools.pages.redhat.com/n8n-pulumi-poc/#/?org=ecosystem&product=osac&team=osac',
        freshness: 'unknown'
      }
    }
  },
  {
    projectId: 'flightctl',
    displayName: 'Flight Control',
    capabilities: {
      operationalMetrics: {
        state: 'inapplicable',
        reason: 'The UOI registry has no Flightctl/RHEM entry and is OSAC-only.'
      }
    }
  }
]

function setProject(projectId) {
  window.location.hash = `#/system-health/operational-metrics?projectId=${projectId}`
  window.dispatchEvent(new Event('hashchange'))
}

describe('OperationalMetricsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setProject('osac')
  })

  afterEach(() => {
    window.location.hash = '#/'
    window.dispatchEvent(new Event('hashchange'))
  })

  it('keeps the OSAC dashboard for the OSAC project', async () => {
    apiRequest.mockResolvedValue({ projects: PROJECTS })
    const wrapper = mount(OperationalMetricsView)
    await flushPromises()

    const iframe = wrapper.find('iframe')
    expect(iframe.exists()).toBe(true)
    expect(iframe.attributes('src')).toBe(PROJECTS[0].capabilities.operationalMetrics.url)
    expect(iframe.attributes('title')).toBe('Unified Operational Intelligence — OSAC')
    expect(wrapper.find('a').attributes('href')).toBe(PROJECTS[0].capabilities.operationalMetrics.url)
    expect(wrapper.text()).toContain('Freshness: not reported by the external dashboard')
    wrapper.unmount()
  })

  it('shows Flight Control as inapplicable without requesting or mounting the OSAC dashboard', async () => {
    setProject('flightctl')
    apiRequest.mockResolvedValue({ projects: PROJECTS })
    const wrapper = mount(OperationalMetricsView)
    await flushPromises()

    expect(wrapper.text()).toContain('Operational Metrics is not applicable to Flight Control')
    expect(wrapper.text()).toContain('Freshness: not applicable')
    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.find('a').exists()).toBe(false)
    expect(apiRequest).toHaveBeenCalledWith('/projects')
    wrapper.unmount()
  })

  it('removes the old iframe immediately and ignores a stale profile response on project switch', async () => {
    let resolveOsac
    apiRequest
      .mockImplementationOnce(() => new Promise(resolve => { resolveOsac = resolve }))
      .mockResolvedValueOnce({ projects: PROJECTS })

    const wrapper = mount(OperationalMetricsView)
    await flushPromises()
    expect(apiRequest).toHaveBeenCalledTimes(1)

    setProject('flightctl')
    expect(wrapper.find('iframe').exists()).toBe(false)
    await flushPromises()
    expect(wrapper.text()).toContain('not applicable to Flight Control')

    resolveOsac({ projects: PROJECTS })
    await flushPromises()
    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.text()).toContain('not applicable to Flight Control')
    wrapper.unmount()
  })

  it('does not embed a dashboard when the profile omits the capability', async () => {
    apiRequest.mockResolvedValue({ projects: [{ projectId: 'osac', displayName: 'OSAC' }] })
    const wrapper = mount(OperationalMetricsView)
    await flushPromises()

    expect(wrapper.text()).toContain('Operational Metrics unavailable')
    expect(wrapper.text()).toContain('does not declare an Operational Metrics source')
    expect(wrapper.find('iframe').exists()).toBe(false)
    wrapper.unmount()
  })

  it('fails closed for dashboard URLs outside the approved path or project', async () => {
    apiRequest.mockResolvedValue({ projects: [{
      projectId: 'osac',
      displayName: 'OSAC',
      capabilities: {
        operationalMetrics: {
          state: 'supported',
          url: 'https://devtools.pages.redhat.com/n8n-pulumi-poc-evil/osac?product=osac'
        }
      }
    }] })
    const wrapper = mount(OperationalMetricsView)
    await flushPromises()

    expect(wrapper.text()).toContain('The published Operational Metrics URL is missing or invalid')
    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.find('a').exists()).toBe(false)
    wrapper.unmount()
  })

  it('does not load a supported dashboard that names a different project', async () => {
    apiRequest.mockResolvedValue({ projects: [{
      projectId: 'osac',
      displayName: 'OSAC',
      capabilities: {
        operationalMetrics: {
          state: 'supported',
          url: 'https://devtools.pages.redhat.com/n8n-pulumi-poc/#/?product=flightctl'
        }
      }
    }] })
    const wrapper = mount(OperationalMetricsView)
    await flushPromises()

    expect(wrapper.text()).toContain('The published Operational Metrics URL is missing or invalid')
    expect(wrapper.find('iframe').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders an empty source distinctly from an unavailable source', async () => {
    apiRequest.mockResolvedValue({ projects: [{
      projectId: 'osac',
      displayName: 'OSAC',
      capabilities: { operationalMetrics: { state: 'empty' } }
    }] })
    const wrapper = mount(OperationalMetricsView)
    await flushPromises()

    expect(wrapper.text()).toContain('No operational metrics published for OSAC')
    expect(wrapper.text()).toContain('State: empty · Freshness: unknown')
    expect(wrapper.find('iframe').exists()).toBe(false)
    wrapper.unmount()
  })
})

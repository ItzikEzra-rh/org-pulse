import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: vi.fn()
}))

import { apiRequest } from '@shared/client/services/api.js'
import ReleasePlanView from '../../client/views/ReleasePlanView.vue'

function makePlan(overrides = {}) {
  return {
    metadata: { version: '0.3', priorVersion: '0.2', badge: 'Developer Preview' },
    vision: { summary: 'A summary of 0.3.', metrics: [{ num: 41, label: 'Features in 0.3' }] },
    serviceMatrix: {
      services: ['CaaS', 'VMaaS'],
      rows: [
        {
          dimension: 'API',
          cells: {
            CaaS: [{ version: '+0.3', isTarget: true, text: 'Cluster upgrade automation' }],
            VMaaS: '—'
          }
        }
      ]
    },
    useCaseCards: [
      { key: 'caas', title: 'CaaS — Cluster Provisioning', items: [{ jira: 'OSAC-1415', title: 'Support cluster upgrade', customers: ['Moc'] }] }
    ],
    customerCoverage: {
      ncp: [{ req: 'CNP01', requirement: 'Multi-Tenant Isolation', coverage: 'RBAC', version: '0.1', status: 'Done ✅' }],
      byCustomer: [{ customer: 'MOC', rows: [{ key: 'OSAC-1415', feature: 'Support cluster upgrade', version: '0.3', status: 'In Review' }] }]
    },
    cumulativeProgression: [
      { useCase: 'CaaS — Cluster Provisioning', versions: [{ version: '+0.3', isTarget: true, items: [{ jira: 'OSAC-1415', text: 'Support cluster upgrade' }] }] }
    ],
    featureInventory: [
      { group: 'CaaS — Cluster Provisioning', features: [{ key: 'OSAC-1415', summary: 'Support cluster upgrade', customers: ['Moc'], status: 'In Review' }] }
    ],
    notes: {
      needsDecomposition: [],
      spikes: [],
      backlog: [{ jira: 'OSAC-63', title: 'Activity and Audit Log API', customers: ['MOC'], note: 'Backlog' }]
    },
    ...overrides
  }
}

describe('ReleasePlanView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading state initially', () => {
    apiRequest.mockReturnValue(new Promise(() => {}))
    const wrapper = mount(ReleasePlanView)
    expect(wrapper.text()).toContain('Loading release plan')
  })

  it('renders empty state when no versions are published', async () => {
    apiRequest.mockResolvedValue({ versions: [] })
    const wrapper = mount(ReleasePlanView)
    await flushPromises()
    expect(wrapper.text()).toContain('No release plan published')
  })

  it('renders error state (not empty state) when the version index fetch fails', async () => {
    apiRequest.mockRejectedValue(new Error('network down'))
    const wrapper = mount(ReleasePlanView)
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('Failed to load release plan')
    expect(wrapper.text()).toContain('network down')
    expect(wrapper.text()).not.toContain('No release plan published')
  })

  it('renders error state when the plan fetch fails', async () => {
    apiRequest.mockImplementation((path) => {
      if (path === '/modules/releases/release-plans') return Promise.resolve({ versions: ['0.3'] })
      return Promise.reject(new Error('boom'))
    })
    const wrapper = mount(ReleasePlanView)
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('Failed to load release plan')
    expect(wrapper.text()).toContain('boom')
  })

  it('loads the newest version by default and renders all sections', async () => {
    apiRequest.mockImplementation((path) => {
      if (path === '/modules/releases/release-plans') return Promise.resolve({ versions: ['0.2', '0.3'] })
      if (path === '/modules/releases/release-plan?version=0.3') return Promise.resolve(makePlan())
      return Promise.reject(new Error('unexpected path: ' + path))
    })
    const wrapper = mount(ReleasePlanView)
    await flushPromises()
    await flushPromises()

    expect(apiRequest).toHaveBeenCalledWith('/modules/releases/release-plans')
    expect(apiRequest).toHaveBeenCalledWith('/modules/releases/release-plan?version=0.3')
    expect(wrapper.text()).toContain('A summary of 0.3.')
    expect(wrapper.text()).toContain('Cluster upgrade automation')
    expect(wrapper.text()).toContain('CaaS — Cluster Provisioning')
    expect(wrapper.text()).toContain('Support cluster upgrade')
    expect(wrapper.text()).toContain('Multi-Tenant Isolation')
    expect(wrapper.text()).toContain('Activity and Audit Log API')

    const link = wrapper.find('a[href="https://redhat.atlassian.net/browse/OSAC-1415"]')
    expect(link.exists()).toBe(true)
  })

  it('refetches the plan when the version picker changes', async () => {
    apiRequest.mockImplementation((path) => {
      if (path === '/modules/releases/release-plans') return Promise.resolve({ versions: ['0.2', '0.3'] })
      if (path === '/modules/releases/release-plan?version=0.3') return Promise.resolve(makePlan())
      if (path === '/modules/releases/release-plan?version=0.2') return Promise.resolve(makePlan({ vision: { summary: 'A summary of 0.2.', metrics: [] } }))
      return Promise.reject(new Error('unexpected path: ' + path))
    })
    const wrapper = mount(ReleasePlanView)
    await flushPromises()
    await flushPromises()

    await wrapper.find('#release-plan-version').setValue('0.2')
    await flushPromises()

    expect(apiRequest).toHaveBeenCalledWith('/modules/releases/release-plan?version=0.2')
    expect(wrapper.text()).toContain('A summary of 0.2.')
  })

  it('ignores a stale plan response when versions are switched quickly', async () => {
    let resolveFirst
    apiRequest.mockImplementation((path) => {
      if (path === '/modules/releases/release-plans') return Promise.resolve({ versions: ['0.2', '0.3'] })
      if (path === '/modules/releases/release-plan?version=0.3') {
        return new Promise((resolve) => { resolveFirst = resolve })
      }
      if (path === '/modules/releases/release-plan?version=0.2') {
        return Promise.resolve(makePlan({ vision: { summary: 'A summary of 0.2.', metrics: [] } }))
      }
      return Promise.reject(new Error('unexpected path: ' + path))
    })
    const wrapper = mount(ReleasePlanView)
    await flushPromises()
    await flushPromises()

    // Switch to 0.2 before the initial (0.3) request resolves.
    await wrapper.find('#release-plan-version').setValue('0.2')
    await flushPromises()
    expect(wrapper.text()).toContain('A summary of 0.2.')

    // The stale 0.3 response arrives after — it must not clobber the 0.2 view.
    resolveFirst(makePlan({ vision: { summary: 'A summary of 0.3.', metrics: [] } }))
    await flushPromises()
    expect(wrapper.text()).toContain('A summary of 0.2.')
    expect(wrapper.text()).not.toContain('A summary of 0.3.')
  })
})

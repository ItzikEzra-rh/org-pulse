import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: vi.fn(),
  getRoster: vi.fn(projectId => Promise.resolve({ projectId, orgs: [], people: [] }))
}))

import { apiRequest } from '@shared/client/services/api.js'
import ReleasePlanView from '../../client/views/ReleasePlanView.vue'

function makePlan(overrides = {}) {
  return {
    metadata: { version: '0.3', priorVersion: '0.2', badge: 'Developer Preview', generatedAt: '2026-08-19 14:35' },
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
      {
        key: 'caas',
        title: 'CaaS — Cluster Provisioning',
        items: [
          { jira: 'OSAC-1415', title: 'Support cluster upgrade', version: '+0.3', isTarget: true, status: 'In Review', customers: ['Moc'] },
          { jira: 'OSAC-1191', title: 'Cluster provisioning via HyperShift + Metal3', version: '0.1', isTarget: false, status: 'Done ✅', customers: [] }
        ]
      }
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

function makeIndexEntry(version, overrides = {}) {
  return { version, generatedAt: '2026-08-19 14:35', priorVersion: '0.2', badge: 'Developer Preview', ...overrides }
}

describe('ReleasePlanView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.location.hash = '#/'
    window.dispatchEvent(new Event('hashchange'))
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
      if (path === '/modules/releases/release-plans') return Promise.resolve({ versions: [makeIndexEntry('0.3')] })
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
      if (path === '/modules/releases/release-plans') return Promise.resolve({ versions: [makeIndexEntry('0.2'), makeIndexEntry('0.3')] })
      if (path === '/modules/releases/release-plan?version=0.3') return Promise.resolve(makePlan())
      return Promise.reject(new Error('unexpected path: ' + path))
    })
    const wrapper = mount(ReleasePlanView)
    await flushPromises()
    await flushPromises()

    expect(apiRequest).toHaveBeenCalledWith('/modules/releases/release-plans')
    expect(apiRequest).toHaveBeenCalledWith('/modules/releases/release-plan?version=0.3')
    expect(wrapper.text()).toContain('A summary of 0.3.')
    expect(wrapper.text()).toContain('Generated: 2026-08-19 14:35')
    expect(wrapper.text()).toContain('Cluster upgrade automation')
    expect(wrapper.text()).toContain('CaaS — Cluster Provisioning')
    expect(wrapper.text()).toContain('Support cluster upgrade')
    expect(wrapper.text()).toContain('Multi-Tenant Isolation')
    expect(wrapper.text()).toContain('Activity and Audit Log API')

    const link = wrapper.find('a[href="https://redhat.atlassian.net/browse/OSAC-1415"]')
    expect(link.exists()).toBe(true)
  })

  it('extracts the version string from index entries instead of passing the object (prod regression)', async () => {
    // Production incident: index entries are metadata objects, not bare strings.
    // A naive `versions.value = data.versions` let an object reach the query
    // string as "[object Object]", which the backend rejected with 400.
    apiRequest.mockImplementation((path) => {
      if (path === '/modules/releases/release-plans') return Promise.resolve({ schemaVersion: 1, versions: [makeIndexEntry('0.3')] })
      if (path === '/modules/releases/release-plan?version=0.3') return Promise.resolve(makePlan())
      return Promise.reject(new Error('unexpected path: ' + path))
    })
    const wrapper = mount(ReleasePlanView)
    await flushPromises()
    await flushPromises()

    const calledPaths = apiRequest.mock.calls.map((c) => c[0])
    expect(calledPaths.some((p) => p.includes('[object Object]'))).toBe(false)
    expect(apiRequest).toHaveBeenCalledWith('/modules/releases/release-plan?version=0.3')
    expect(wrapper.find('#release-plan-version option').text()).toBe('0.3')
  })

  it('uses a separate projectId parameter and reloads the same version after a project switch', async () => {
    window.location.hash = '#/releases?projectId=flightctl'
    window.dispatchEvent(new Event('hashchange'))
    apiRequest.mockImplementation((path) => {
      if (path === '/projects') {
        return Promise.resolve({ projects: [
          { projectId: 'flightctl', displayName: 'Flight Control' },
          { projectId: 'osac', displayName: 'OSAC' }
        ] })
      }
      if (path === '/modules/releases/release-plans?projectId=flightctl'
          || path === '/modules/releases/release-plans?projectId=osac') {
        return Promise.resolve({ versions: [makeIndexEntry('0.3')] })
      }
      if (path === '/modules/releases/release-plan?version=0.3&projectId=flightctl') {
        return Promise.resolve(makePlan({ vision: { summary: 'Flight Control plan.', metrics: [] } }))
      }
      if (path === '/modules/releases/release-plan?version=0.3&projectId=osac') {
        return Promise.resolve(makePlan({ vision: { summary: 'OSAC plan.', metrics: [] } }))
      }
      return Promise.reject(new Error(`unexpected path: ${path}`))
    })

    const wrapper = mount(ReleasePlanView)
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('Flight Control plan.')
    expect(wrapper.findAll('h2').map(heading => heading.text())).toContain('Flight Control 0.3')

    window.location.hash = '#/releases?projectId=osac'
    window.dispatchEvent(new Event('hashchange'))
    await flushPromises()
    await flushPromises()

    expect(apiRequest).toHaveBeenCalledWith('/modules/releases/release-plan?version=0.3&projectId=flightctl')
    expect(apiRequest).toHaveBeenCalledWith('/modules/releases/release-plan?version=0.3&projectId=osac')
    expect(wrapper.text()).toContain('OSAC plan.')
    expect(wrapper.text()).not.toContain('Flight Control plan.')
    expect(wrapper.findAll('h2').map(heading => heading.text())).toContain('OSAC 0.3')
    expect(wrapper.findAll('h2').map(heading => heading.text())).not.toContain('Flight Control 0.3')
  })

  it('renders a project release-plan envelope with its freshness, partial state and unknown policy predicates', async () => {
    window.location.hash = '#/releases?projectId=flightctl'
    window.dispatchEvent(new Event('hashchange'))
    apiRequest.mockImplementation((path) => {
      if (path === '/projects') return Promise.resolve({ projects: [{ projectId: 'flightctl', displayName: 'Flight Control' }] })
      if (path === '/modules/releases/release-plans?projectId=flightctl') {
        return Promise.resolve({
          projectId: 'flightctl',
          state: 'supported',
          freshness: 'unknown',
          partial: true,
          generatedAt: '2026-10-06T08:17:58Z',
          data: { projectId: 'flightctl', versions: [{ version: '0.10.0', state: 'supported', freshness: 'unknown', partial: true }] }
        })
      }
      if (path === '/modules/releases/release-plan?version=0.10.0&projectId=flightctl') {
        return Promise.resolve({
          projectId: 'flightctl',
          state: 'supported',
          freshness: 'unknown',
          partial: true,
          generatedAt: '2026-10-06T08:17:58Z',
          data: {
            projectId: 'flightctl',
            version: '0.10.0',
            displayName: 'Flight Control 0.10.0',
            planEntryCount: 2,
            explicitTargetCount: 1,
            derivedTargetCount: 1,
            mergedPRCount: 1,
            release: { state: 'archived' },
            derived: {
              freeze: { state: 'unknown', reason: 'No freeze policy is configured.' },
              readiness: { state: 'unknown', reason: 'No readiness policy is configured.' },
              shipped: { state: 'unknown', reason: 'No shipped policy is configured.' }
            },
            planEntries: [{
              issueKey: 'EDM-10',
              summary: 'Observed work item',
              issueType: { name: 'Feature' },
              status: { raw: { name: 'In Progress' } },
              membership: { kind: 'explicit' },
              traceability: [{ pullRequest: { merged: true } }]
            }]
          }
        })
      }
      return Promise.reject(new Error(`unexpected path: ${path}`))
    })

    const wrapper = mount(ReleasePlanView)
    await flushPromises()
    await flushPromises()

    expect(wrapper.text()).toContain('Freshness: unknown')
    expect(wrapper.text()).toContain('Partial evidence')
    expect(wrapper.text()).toContain('Evidence-derived Jira scope and traceability')
    expect(wrapper.text()).toContain('Explicit Fix Version targets')
    expect(wrapper.text()).toContain('readiness')
    expect(wrapper.text()).toContain('Unknown')
    expect(wrapper.text()).toContain('EDM-10')
    expect(wrapper.text()).not.toContain('Forward-looking view')
  })

  it('rejects a project-qualified plan response for another project', async () => {
    window.location.hash = '#/releases?projectId=flightctl'
    window.dispatchEvent(new Event('hashchange'))
    apiRequest.mockImplementation((path) => {
      if (path === '/projects') return Promise.resolve({ projects: [{ projectId: 'flightctl', displayName: 'Flight Control' }] })
      if (path === '/modules/releases/release-plans?projectId=flightctl') {
        return Promise.resolve({ projectId: 'flightctl', data: { versions: [{ version: '0.10.0' }] } })
      }
      if (path === '/modules/releases/release-plan?version=0.10.0&projectId=flightctl') {
        return Promise.resolve({ projectId: 'osac', data: { planEntries: [] } })
      }
      return Promise.reject(new Error(`unexpected path: ${path}`))
    })

    const wrapper = mount(ReleasePlanView)
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('Release plan response project identity mismatch')
  })

  it('rejects a plan whose nested data belongs to another project', async () => {
    window.location.hash = '#/releases?projectId=flightctl'
    window.dispatchEvent(new Event('hashchange'))
    apiRequest.mockImplementation((path) => {
      if (path === '/projects') return Promise.resolve({ projects: [{ projectId: 'flightctl', displayName: 'Flight Control' }] })
      if (path === '/modules/releases/release-plans?projectId=flightctl') {
        return Promise.resolve({ projectId: 'flightctl', data: { projectId: 'flightctl', versions: [{ version: '0.10.0' }] } })
      }
      if (path === '/modules/releases/release-plan?version=0.10.0&projectId=flightctl') {
        return Promise.resolve({ projectId: 'flightctl', data: { projectId: 'osac', planEntries: [] } })
      }
      return Promise.reject(new Error(`unexpected path: ${path}`))
    })

    const wrapper = mount(ReleasePlanView)
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('Release plan response project identity mismatch')
  })

  it('rejects an index whose nested data belongs to another project', async () => {
    window.location.hash = '#/releases?projectId=flightctl'
    window.dispatchEvent(new Event('hashchange'))
    apiRequest.mockImplementation((path) => {
      if (path === '/projects') return Promise.resolve({ projects: [{ projectId: 'flightctl', displayName: 'Flight Control' }] })
      if (path === '/modules/releases/release-plans?projectId=flightctl') {
        return Promise.resolve({ projectId: 'flightctl', data: { projectId: 'osac', versions: [] } })
      }
      return Promise.reject(new Error(`unexpected path: ${path}`))
    })

    const wrapper = mount(ReleasePlanView)
    await flushPromises()
    expect(wrapper.text()).toContain('Release plan index project identity mismatch')
  })

  it('refetches the plan when the version picker changes', async () => {
    apiRequest.mockImplementation((path) => {
      if (path === '/modules/releases/release-plans') return Promise.resolve({ versions: [makeIndexEntry('0.2'), makeIndexEntry('0.3')] })
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
      if (path === '/modules/releases/release-plans') return Promise.resolve({ versions: [makeIndexEntry('0.2'), makeIndexEntry('0.3')] })
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

  it('renders use-case card items sorted oldest-first with version badges, regardless of fixture order', async () => {
    // Fixture intentionally lists the +0.3 item before the 0.1 item.
    apiRequest.mockImplementation((path) => {
      if (path === '/modules/releases/release-plans') return Promise.resolve({ versions: [makeIndexEntry('0.3')] })
      if (path === '/modules/releases/release-plan?version=0.3') return Promise.resolve(makePlan())
      return Promise.reject(new Error('unexpected path: ' + path))
    })
    const wrapper = mount(ReleasePlanView)
    await flushPromises()
    await flushPromises()

    const useCasesSection = wrapper.findAll('section').find((s) => s.text().includes('Use Cases'))
    const items = useCasesSection.findAll('li')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('OSAC-1191')
    expect(items[1].text()).toContain('OSAC-1415')

    const priorBadge = items[0].find('span')
    expect(priorBadge.text()).toBe('0.1')
    expect(priorBadge.classes()).toContain('bg-gray-100')

    const targetBadge = items[1].find('span')
    expect(targetBadge.text()).toBe('+0.3')
    expect(targetBadge.classes()).toContain('bg-green-100')
  })

  it('flags an unfinished prior-version card item but not a finished one or a target item', async () => {
    apiRequest.mockImplementation((path) => {
      if (path === '/modules/releases/release-plans') return Promise.resolve({ versions: [makeIndexEntry('0.3')] })
      if (path === '/modules/releases/release-plan?version=0.3') {
        return Promise.resolve(makePlan({
          useCaseCards: [
            {
              key: 'caas',
              title: 'CaaS — Cluster Provisioning',
              items: [
                { jira: 'OSAC-1191', title: 'Finished prior feature', version: '0.1', isTarget: false, status: 'Done ✅', customers: [] },
                { jira: 'OSAC-1200', title: 'Unfinished prior feature', version: '0.2', isTarget: false, status: 'In Progress', customers: [] },
                { jira: 'OSAC-1415', title: 'Target feature still planned', version: '+0.3', isTarget: true, status: 'Planned', customers: [] }
              ]
            }
          ]
        }))
      }
      return Promise.reject(new Error('unexpected path: ' + path))
    })
    const wrapper = mount(ReleasePlanView)
    await flushPromises()
    await flushPromises()

    const useCasesSection = wrapper.findAll('section').find((s) => s.text().includes('Use Cases'))
    const items = useCasesSection.findAll('li')

    expect(items[0].text()).toContain('Finished prior feature')
    expect(items[0].text()).not.toContain('In Progress')

    expect(items[1].text()).toContain('Unfinished prior feature')
    expect(items[1].text()).toContain('(In Progress)')

    expect(items[2].text()).toContain('Target feature still planned')
    expect(items[2].text()).not.toContain('Planned')
  })

  it('shows a dash for a matrix cell with an empty array instead of an empty list', async () => {
    apiRequest.mockImplementation((path) => {
      if (path === '/modules/releases/release-plans') return Promise.resolve({ versions: [makeIndexEntry('0.3')] })
      if (path === '/modules/releases/release-plan?version=0.3') {
        return Promise.resolve(makePlan({
          serviceMatrix: {
            services: ['CaaS', 'VMaaS'],
            rows: [{ dimension: 'API', cells: { CaaS: [{ version: '+0.3', isTarget: true, text: 'Cluster upgrade automation' }], VMaaS: [] } }]
          }
        }))
      }
      return Promise.reject(new Error('unexpected path: ' + path))
    })
    const wrapper = mount(ReleasePlanView)
    await flushPromises()
    await flushPromises()

    const row = wrapper.findAll('tbody tr')[0]
    const cells = row.findAll('td')
    expect(cells[2].text()).toBe('—')
  })

  it('omits the generated-at line when metadata has no generatedAt', async () => {
    apiRequest.mockImplementation((path) => {
      if (path === '/modules/releases/release-plans') return Promise.resolve({ versions: [makeIndexEntry('0.3')] })
      if (path === '/modules/releases/release-plan?version=0.3') {
        return Promise.resolve(makePlan({ metadata: { version: '0.3', priorVersion: '0.2', badge: 'Developer Preview' } }))
      }
      return Promise.reject(new Error('unexpected path: ' + path))
    })
    const wrapper = mount(ReleasePlanView)
    await flushPromises()
    await flushPromises()

    expect(wrapper.text()).not.toContain('Generated:')
  })
})

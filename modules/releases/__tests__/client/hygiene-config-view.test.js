import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: vi.fn()
}))

import { apiRequest } from '@shared/client/services/api.js'
import HygieneConfigView from '../../client/components/HygieneConfigView.vue'

function sampleConfig(overrides = {}) {
  return {
    schemaVersion: 1,
    projects: {
      OSAC: {
        displayName: 'OSAC',
        jiraBaseUrl: 'https://redhat.atlassian.net',
        rules: [
          {
            id: 'in-progress-no-fix-version',
            name: 'In Progress Feature/Epic without Fix Version',
            description: 'Features and Epics that are In Progress must have a Fix Version.',
            category: 'lifecycle',
            jql: 'project = OSAC AND status = "In Progress" AND fixVersion is EMPTY'
          },
          {
            id: 'no-team',
            name: 'Open issue without Team',
            description: 'All issues that are not Done should have a Team assigned.',
            category: 'ownership',
            jql: 'project = OSAC AND cf[10001] is EMPTY'
          }
        ],
        fieldMappings: { team: 'customfield_10001' }
      }
    },
    ...overrides
  }
}

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  err.data = { error: message }
  return err
}

describe('HygieneConfigView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.location.hash = '#/settings/releases?projectId=osac'
    window.dispatchEvent(new Event('urlchange'))
  })

  it('calls the new read-only project-hygiene config endpoint', async () => {
    apiRequest.mockResolvedValue(sampleConfig())
    mount(HygieneConfigView)
    await flushPromises()
    expect(apiRequest.mock.calls.map(([path]) => path)).toEqual([
      '/modules/releases/hygiene/project-hygiene/config?projectId=osac'
    ])
  })

  it('never calls the legacy POST /config or POST /refresh endpoints', async () => {
    apiRequest.mockResolvedValue(sampleConfig())
    mount(HygieneConfigView)
    await flushPromises()
    const calledPaths = apiRequest.mock.calls.map(([path]) => path)
    expect(calledPaths).not.toContain('/modules/releases/hygiene/config')
    expect(calledPaths.some(path => /^\/modules\/releases\/hygiene\/refresh/.test(path))).toBe(false)
  })

  it('shows a loading state before the request resolves', () => {
    apiRequest.mockReturnValue(new Promise(() => {}))
    const wrapper = mount(HygieneConfigView)
    expect(wrapper.text()).toContain('Loading hygiene rules')
  })

  it('renders one card per rule with name, description, JQL, and category badge', async () => {
    apiRequest.mockResolvedValue(sampleConfig())
    const wrapper = mount(HygieneConfigView)
    await flushPromises()

    expect(wrapper.text()).toContain('In Progress Feature/Epic without Fix Version')
    expect(wrapper.text()).toContain('Features and Epics that are In Progress must have a Fix Version.')
    expect(wrapper.text()).toContain('project = OSAC AND status = "In Progress" AND fixVersion is EMPTY')
    expect(wrapper.text()).toContain('lifecycle')

    expect(wrapper.text()).toContain('Open issue without Team')
    expect(wrapper.text()).toContain('ownership')
  })

  it('groups rules dynamically by category rather than a fixed list', async () => {
    apiRequest.mockResolvedValue(sampleConfig())
    const wrapper = mount(HygieneConfigView)
    await flushPromises()

    expect(wrapper.text()).toContain('Lifecycle')
    expect(wrapper.text()).toContain('Ownership')
  })

  it('shows project key and field mappings as read-only scope info', async () => {
    apiRequest.mockResolvedValue(sampleConfig())
    const wrapper = mount(HygieneConfigView)
    await flushPromises()

    expect(wrapper.text()).toContain('OSAC')
    expect(wrapper.text()).toContain('team field')
    expect(wrapper.text()).toContain('customfield_10001')
  })

  it('does not render any save, refresh, toggle, threshold, or editable inputs', async () => {
    apiRequest.mockResolvedValue(sampleConfig())
    const wrapper = mount(HygieneConfigView)
    await flushPromises()

    expect(wrapper.findAll('button').length).toBe(0)
    expect(wrapper.findAll('input').length).toBe(0)
    expect(wrapper.findAll('select').length).toBe(0)
    expect(wrapper.find('[role="switch"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Save Configuration')
    expect(wrapper.text()).not.toContain('Refresh')
  })

  it('does not hardcode rule IDs or category names — renders whatever the contract provides', async () => {
    apiRequest.mockResolvedValue(sampleConfig({
      projects: {
        RHOAIENG: {
          displayName: 'RHOAI Engineering',
          jiraBaseUrl: 'https://redhat.atlassian.net',
          rules: [
            {
              id: 'custom-rule',
              name: 'Custom Rule Name',
              description: 'A totally different rule.',
              category: 'custom-category',
              jql: 'project = RHOAIENG'
            }
          ],
          fieldMappings: { owner: 'customfield_99999' }
        }
      }
    }))
    const wrapper = mount(HygieneConfigView)
    await flushPromises()

    expect(wrapper.text()).toContain('RHOAIENG')
    expect(wrapper.text()).toContain('Custom Rule Name')
    expect(wrapper.text()).toContain('Custom-category')
    expect(wrapper.text()).toContain('owner field')
  })

  it('shows an empty state when no projects are configured', async () => {
    apiRequest.mockResolvedValue({ schemaVersion: 1, projects: {} })
    const wrapper = mount(HygieneConfigView)
    await flushPromises()
    expect(wrapper.text()).toContain('No hygiene rules are configured yet.')
  })

  it('shows a not-published explanation on 404 without treating it as a hard error', async () => {
    apiRequest.mockRejectedValue(httpError(404, 'Project hygiene configuration has not been published yet'))
    const wrapper = mount(HygieneConfigView)
    await flushPromises()
    expect(wrapper.text()).toContain('Project hygiene configuration has not been published yet')
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('shows a non-destructive unavailable state with retry on other failures', async () => {
    apiRequest.mockRejectedValue(httpError(503, 'Project hygiene data is temporarily unavailable'))
    const wrapper = mount(HygieneConfigView)
    await flushPromises()
    expect(wrapper.text()).toContain('Project hygiene data is temporarily unavailable')
    expect(wrapper.find('button').exists()).toBe(true)
  })

  it('does not silently pick an arbitrary project when the response is malformed', async () => {
    apiRequest.mockResolvedValue({ schemaVersion: 1, projects: null })
    const wrapper = mount(HygieneConfigView)
    await flushPromises()
    expect(wrapper.text()).toContain('No hygiene rules are configured yet.')
  })
})

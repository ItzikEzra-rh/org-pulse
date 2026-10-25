import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import PersonTable from '../../client/components/PersonTable.vue'

vi.mock('@shared/client/composables/useModuleLink', () => ({
  useModuleLink: () => ({
    linkTo: (mod, view, params) => {
      const qs = Object.entries(params)
        .filter(([, v]) => v != null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
      return `#/${mod}/${view}${qs ? `?${qs}` : ''}`
    }
  })
}))

const { mockProjectId } = vi.hoisted(() => ({ mockProjectId: { value: '' } }))
vi.mock('@shared/client/composables/useProjectId', () => ({
  useProjectId: () => mockProjectId,
  projectParam: (id) => (id ? { projectId: id } : {})
}))

vi.mock('@shared/client/composables/useRoster', () => ({
  useRoster: () => ({
    visibleFields: ref([]),
    primaryDisplayField: ref(null)
  })
}))

vi.mock('@shared/client/composables/useGithubStats', () => ({
  useGithubStats: () => ({ getContributions: () => null })
}))

vi.mock('@shared/client/composables/useGitlabStats', () => ({
  useGitlabStats: () => ({ getContributions: () => null })
}))

// OSAC-5968: this list's name link bypasses the row's @select emit, so it
// must carry the project context and accountId identity on its own href.
describe('PersonTable project context preservation (OSAC-5968)', () => {
  beforeEach(() => {
    mockProjectId.value = ''
  })

  it('preserves the selected project and uses accountId identity for a project-qualified member', () => {
    mockProjectId.value = 'flightctl'
    const member = { name: 'Priya Shah', jiraDisplayName: 'Priya Shah', accountId: 'acc-123' }
    const wrapper = mount(PersonTable, { props: { members: [member], teamKey: 'flightctl::Core' } })

    const href = wrapper.find('a').attributes('href')
    expect(href).toContain('projectId=flightctl')
    expect(href).toContain('accountId=acc-123')
    expect(href).not.toContain('person=')
  })

  it('leaves legacy OSAC uid links unaffected when no project is selected', () => {
    const member = { name: 'Alice Smith', jiraDisplayName: 'Alice Smith', uid: 'asmith' }
    const wrapper = mount(PersonTable, { props: { members: [member] } })

    const href = wrapper.find('a').attributes('href')
    expect(href).toContain('uid=asmith')
    expect(href).not.toContain('projectId=')
  })
})

// The column headers must reflect the real measured lookback window, or
// stay neutral when it isn't known -- never hardcode "(90d)".
describe('PersonTable lookback-window column labels', () => {
  function headerText(wrapper, label) {
    return wrapper.findAll('th').map(th => th.text()).some(text => text.includes(label))
  }

  it('labels the columns with the real lookback window when every member agrees', () => {
    const members = [
      { name: 'Ada', accountId: 'acc-1' },
      { name: 'Bob', accountId: 'acc-2' }
    ]
    const memberMetrics = new Map([
      ['acc-1', { lookbackDays: 365, resolvedCount: 2, resolvedPoints: 3 }],
      ['acc-2', { lookbackDays: 365, resolvedCount: 1, resolvedPoints: 1 }]
    ])
    const wrapper = mount(PersonTable, { props: { members, memberMetrics } })

    expect(headerText(wrapper, 'Resolved (365d)')).toBe(true)
    expect(headerText(wrapper, 'Points (365d)')).toBe(true)
    expect(headerText(wrapper, '(90d)')).toBe(false)
  })

  it('falls back to a neutral label when the lookback window is unknown or mixed', () => {
    const members = [
      { name: 'Ada', accountId: 'acc-1' },
      { name: 'Bob', accountId: 'acc-2' }
    ]
    const memberMetrics = new Map([
      ['acc-1', { lookbackDays: 365, resolvedCount: 2, resolvedPoints: 3 }],
      ['acc-2', { lookbackDays: 90, resolvedCount: 1, resolvedPoints: 1 }]
    ])
    const wrapper = mount(PersonTable, { props: { members, memberMetrics } })

    expect(headerText(wrapper, 'Resolved (')).toBe(false)
    expect(headerText(wrapper, 'Points (')).toBe(false)
    expect(headerText(wrapper, 'Resolved')).toBe(true)
    expect(headerText(wrapper, 'Points')).toBe(true)
  })

  it('uses a neutral label for legacy OSAC members, whose metrics never publish a lookbackDays', () => {
    const members = [{ name: 'Alice Smith', jiraDisplayName: 'Alice Smith', uid: 'asmith' }]
    const memberMetrics = new Map([
      ['Alice Smith', { resolvedCount: 4, resolvedPoints: 8, avgCycleTimeDays: 2 }]
    ])
    const wrapper = mount(PersonTable, { props: { members, memberMetrics } })

    expect(headerText(wrapper, 'Resolved (90d)')).toBe(false)
    expect(headerText(wrapper, 'Resolved')).toBe(true)
    expect(headerText(wrapper, 'Points')).toBe(true)
  })
})

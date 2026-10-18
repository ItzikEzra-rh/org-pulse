import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TeamOverviewTab from '../../client/components/TeamOverviewTab.vue'

// Mock the chart component to avoid canvas issues in tests
vi.mock('vue-chartjs', () => ({
  Doughnut: { template: '<div class="mock-doughnut"></div>', props: ['data', 'options'] }
}))
vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  ArcElement: {},
  Tooltip: {},
  Legend: {}
}))

// Mock useModuleLink for TeamMembersTable
vi.mock('@shared/client/composables/useModuleLink', () => ({
  useModuleLink: () => ({
    linkTo: (_mod, _view, _params) => '#'
  })
}))

const sampleMembers = [
  { name: 'Alice Smith', jiraDisplayName: 'Alice Smith', engineeringSpeciality: 'Software Engineer', geo: 'US-Raleigh' },
  { name: 'Bob Jones', jiraDisplayName: 'Bob Jones', engineeringSpeciality: 'QE', geo: 'CZ-Brno' },
]

describe('TeamOverviewTab', () => {
  it('derives the Headcount by Role chart from the loaded members', () => {
    const wrapper = mount(TeamOverviewTab, {
      props: { members: sampleMembers }
    })
    expect(wrapper.text()).toContain('Headcount by Role')
    expect(wrapper.find('.mock-doughnut').exists()).toBe(true)
    // One member per role, total equals unique membership.
    const roleRows = wrapper.findAll('[data-testid="headcount-role-row"]')
    expect(roleRows).toHaveLength(2)
    expect(wrapper.text()).toContain('Total2')
  })

  it('hides the headcount chart when there are no members', () => {
    const wrapper = mount(TeamOverviewTab, {
      props: { members: [] }
    })
    expect(wrapper.text()).not.toContain('Headcount by Role')
    expect(wrapper.find('.mock-doughnut').exists()).toBe(false)
  })

  it('buckets members with no resolvable role as Unknown so the total stays complete', () => {
    const wrapper = mount(TeamOverviewTab, {
      props: { members: [...sampleMembers, { name: 'Dana Lee', jiraDisplayName: 'Dana Lee' }] }
    })
    const roleRows = wrapper.findAll('[data-testid="headcount-role-row"]')
    expect(roleRows.some(r => r.text().includes('Unknown'))).toBe(true)
    expect(wrapper.text()).toContain('Total3')
  })

  it('deduplicates members by canonical identity when deriving headcount', () => {
    const duplicate = { accountId: 'acct-1', name: 'Alice Smith', jiraDisplayName: 'Alice Smith', title: 'Software Engineer' }
    const wrapper = mount(TeamOverviewTab, {
      props: { members: [duplicate, { ...duplicate }] }
    })
    expect(wrapper.text()).toContain('Total1')
  })

  it('renders members table with correct member count', () => {
    const wrapper = mount(TeamOverviewTab, {
      props: { members: sampleMembers }
    })
    expect(wrapper.text()).toContain('Team Members')
    expect(wrapper.text()).toContain('2 members')
    expect(wrapper.text()).toContain('Alice Smith')
    expect(wrapper.text()).toContain('Bob Jones')
  })

  it('shows singular "member" for single member', () => {
    const wrapper = mount(TeamOverviewTab, {
      props: { members: [sampleMembers[0]] }
    })
    expect(wrapper.text()).toContain('1 member')
    expect(wrapper.text()).not.toContain('1 members')
  })

  it('does not render FTE anywhere in the headcount widget', () => {
    const wrapper = mount(TeamOverviewTab, {
      props: { members: sampleMembers }
    })
    expect(wrapper.text()).not.toContain('FTE')
  })

  it('selecting a role in the headcount chart filters the members table', async () => {
    const wrapper = mount(TeamOverviewTab, {
      props: { members: sampleMembers }
    })
    expect(wrapper.text()).toContain('Alice Smith')
    expect(wrapper.text()).toContain('Bob Jones')

    const roleRows = wrapper.findAll('[data-testid="headcount-role-row"]')
    const qeRow = roleRows.find(r => r.text().includes('QE'))
    await qeRow.trigger('click')

    expect(wrapper.text()).toContain('Bob Jones')
    expect(wrapper.text()).not.toContain('Alice Smith')
  })

  it('"All roles" clears a role selection made from the headcount chart', async () => {
    const wrapper = mount(TeamOverviewTab, {
      props: { members: sampleMembers }
    })
    const roleRows = wrapper.findAll('[data-testid="headcount-role-row"]')
    const qeRow = roleRows.find(r => r.text().includes('QE'))
    await qeRow.trigger('click')
    expect(wrapper.text()).not.toContain('Alice Smith')

    const allRolesButton = wrapper.findAll('button').find(b => b.text() === 'All roles')
    await allRolesButton.trigger('click')

    expect(wrapper.text()).toContain('Alice Smith')
    expect(wrapper.text()).toContain('Bob Jones')
  })
})

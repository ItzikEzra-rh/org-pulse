import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import TeamMembersTable from '../../client/components/TeamMembersTable.vue'

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

const { mockRoster } = vi.hoisted(() => ({
  mockRoster: { managerNames: { value: {} }, people: { value: [] }, auxiliaryManagers: { value: {} } }
}))
vi.mock('@shared/client/composables/useRoster', () => ({ useRoster: () => mockRoster }))

function resetRoster() {
  mockRoster.managerNames.value = {}
  mockRoster.people.value = []
  mockRoster.auxiliaryManagers.value = {}
}

const sampleMembers = [
  { name: 'Alice Smith', title: 'Senior Software Engineer', geo: 'NA', country: 'USA' },
  { name: 'Bob Jones', title: 'Senior Software Engineer', geo: 'NA', country: 'CAN' },
  { name: 'Carla Diaz', title: 'Principal Software Engineer', geo: 'EMEA', country: 'ESP' },
]

describe('TeamMembersTable region/country filters', () => {
  it('renders Region and Country selects with options from member data', () => {
    const wrapper = mount(TeamMembersTable, { props: { members: sampleMembers } })
    const selects = wrapper.findAll('select')
    expect(selects.length).toBe(2)
    expect(wrapper.text()).toContain('NA')
    expect(wrapper.text()).toContain('EMEA')
    expect(wrapper.text()).toContain('USA')
    expect(wrapper.text()).toContain('ESP')
  })

  it('filters members by region', async () => {
    const wrapper = mount(TeamMembersTable, { props: { members: sampleMembers } })
    const regionSelect = wrapper.findAll('select')[0]
    await regionSelect.setValue('EMEA')

    expect(wrapper.text()).toContain('Carla Diaz')
    expect(wrapper.text()).not.toContain('Alice Smith')
    expect(wrapper.text()).not.toContain('Bob Jones')
  })

  it('filters members by country', async () => {
    const wrapper = mount(TeamMembersTable, { props: { members: sampleMembers } })
    const countrySelect = wrapper.findAll('select')[1]
    await countrySelect.setValue('CAN')

    expect(wrapper.text()).toContain('Bob Jones')
    expect(wrapper.text()).not.toContain('Alice Smith')
    expect(wrapper.text()).not.toContain('Carla Diaz')
  })

  it('composes region filter with role filter using AND semantics', async () => {
    const wrapper = mount(TeamMembersTable, { props: { members: sampleMembers, roleFilter: null } })
    const regionSelect = wrapper.findAll('select')[0]
    await regionSelect.setValue('NA')

    const roleButton = wrapper.findAll('button').find(b => b.text() === 'Principal Software Engineer')
    await roleButton.trigger('click')
    expect(wrapper.emitted('update:roleFilter')[0]).toEqual(['Principal Software Engineer'])

    // roleFilter is a controlled prop (owned by the parent) — apply the emitted update
    await wrapper.setProps({ roleFilter: 'Principal Software Engineer' })

    // Principal Software Engineer only exists in EMEA, so NA + that role yields no matches
    expect(wrapper.text()).toContain('No members found.')
  })

  it('does not render region/country selects when all members share the same value', () => {
    const singleRegionMembers = sampleMembers.map(m => ({ ...m, geo: 'NA', country: 'USA' }))
    const wrapper = mount(TeamMembersTable, { props: { members: singleRegionMembers } })
    expect(wrapper.findAll('select').length).toBe(0)
  })
})

describe('TeamMembersTable project context preservation (OSAC-5968)', () => {
  beforeEach(() => {
    mockProjectId.value = ''
  })

  it('preserves the selected project and uses accountId identity for a project-qualified member', () => {
    mockProjectId.value = 'flightctl'
    const member = { name: 'Priya Shah', accountId: 'acc-123' }
    const wrapper = mount(TeamMembersTable, { props: { members: [member], teamKey: 'flightctl::Core' } })

    const href = wrapper.find('a').attributes('href')
    expect(href).toContain('projectId=flightctl')
    expect(href).toContain('accountId=acc-123')
    expect(href).not.toContain('person=')
  })

  it('leaves legacy OSAC uid links unaffected when no project is selected', () => {
    const member = { name: 'Alice Smith', uid: 'asmith' }
    const wrapper = mount(TeamMembersTable, { props: { members: [member] } })

    const href = wrapper.find('a').attributes('href')
    expect(href).toContain('uid=asmith')
    expect(href).not.toContain('projectId=')
  })
})

describe('TeamMembersTable direct manager resolution', () => {
  beforeEach(resetRoster)

  function managerCell(wrapper) {
    // Second cell in the first data row is the Manager column.
    return wrapper.findAll('tbody tr')[0].findAll('td')[1]
  }

  it('resolves a roster managerRef to a linked person within the project', () => {
    mockProjectId.value = 'flightctl'
    mockRoster.people.value = [{ accountId: 'mgr-1', displayName: 'Manager One' }]
    const member = { name: 'Alice', accountId: 'acc-1', managerRef: { kind: 'roster', accountId: 'mgr-1' } }
    const cell = managerCell(mount(TeamMembersTable, { props: { members: [member] } }))

    expect(cell.text()).toBe('Manager One')
    const link = cell.find('a')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toContain('accountId=mgr-1')
  })

  it('shows an external managerRef name without a link', () => {
    mockRoster.auxiliaryManagers.value = { 'ext-uid': { ldapUid: 'ext-uid', displayName: 'External Manager' } }
    const member = { name: 'Alice', accountId: 'acc-1', managerRef: { kind: 'external', ldapUid: 'ext-uid' } }
    const cell = managerCell(mount(TeamMembersTable, { props: { members: [member] } }))

    expect(cell.text()).toBe('External Manager')
    expect(cell.find('a').exists()).toBe(false)
  })

  it('shows an unresolved managerRef as unavailable', () => {
    const member = { name: 'Alice', accountId: 'acc-1', managerRef: { kind: 'unresolved', reason: 'no-match' } }
    const cell = managerCell(mount(TeamMembersTable, { props: { members: [member] } }))

    expect(cell.text()).toBe('—')
  })

  it('resolves a legacy OSAC uid via managerNames with a link', () => {
    mockRoster.managerNames.value = { 'osac-mgr': 'Legacy Manager' }
    const member = { name: 'Alice', uid: 'asmith', managerUid: 'osac-mgr' }
    const cell = managerCell(mount(TeamMembersTable, { props: { members: [member] } }))

    expect(cell.text()).toBe('Legacy Manager')
    expect(cell.find('a').attributes('href')).toContain('uid=osac-mgr')
  })
})

describe('TeamMembersTable display-name collisions', () => {
  beforeEach(resetRoster)

  it('renders both people who share a display name but have distinct accountIds', () => {
    mockRoster.people.value = [
      { accountId: 'mgr-a', displayName: 'Manager A' },
      { accountId: 'mgr-b', displayName: 'Manager B' }
    ]
    const members = [
      { name: 'Alex Kim', accountId: 'acc-1', title: 'QE', managerRef: { kind: 'roster', accountId: 'mgr-a' } },
      { name: 'Alex Kim', accountId: 'acc-2', title: 'SWE', managerRef: { kind: 'roster', accountId: 'mgr-b' } }
    ]
    const wrapper = mount(TeamMembersTable, { props: { members } })

    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    // Each row keeps its own manager/role — rows are not collapsed by name.
    expect(rows[0].findAll('td')[1].text()).toBe('Manager A')
    expect(rows[1].findAll('td')[1].text()).toBe('Manager B')
  })

  it('renders distinct rows for id-less members sharing a display name', () => {
    const members = [
      { name: 'Alex Kim', title: 'QE' },
      { name: 'Alex Kim', title: 'SWE' }
    ]
    const wrapper = mount(TeamMembersTable, { props: { members } })

    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    const roles = rows.map(r => r.findAll('td')[2].text()).sort()
    expect(roles).toEqual(['QE', 'SWE'])
  })
})

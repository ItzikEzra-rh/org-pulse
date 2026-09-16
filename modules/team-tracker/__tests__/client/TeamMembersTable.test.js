import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TeamMembersTable from '../../client/components/TeamMembersTable.vue'

vi.mock('@shared/client/composables/useModuleLink', () => ({
  useModuleLink: () => ({
    linkTo: (_mod, _view, _params) => '#'
  })
}))

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

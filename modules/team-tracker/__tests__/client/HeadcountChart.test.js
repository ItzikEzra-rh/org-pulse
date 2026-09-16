import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import HeadcountChart from '../../client/components/HeadcountChart.vue'

vi.mock('vue-chartjs', () => ({
  Doughnut: {
    name: 'Doughnut',
    props: ['data', 'options'],
    template: '<canvas data-testid="doughnut-canvas"></canvas>'
  }
}))

vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  ArcElement: 'ArcElement',
  Tooltip: 'Tooltip',
  Legend: 'Legend'
}))

describe('HeadcountChart', () => {
  const headcount = {
    byRole: { Engineer: 5, Manager: 2 },
    totalHeadcount: 7
  }

  it('highlights the row matching selectedRole', () => {
    const wrapper = mount(HeadcountChart, {
      props: { headcount, selectedRole: 'Engineer' }
    })

    const rows = wrapper.findAll('[data-testid="headcount-role-row"]')
    const engineerRow = rows.find(r => r.text().includes('Engineer'))
    const managerRow = rows.find(r => r.text().includes('Manager'))

    expect(engineerRow.classes()).toContain('bg-primary-50')
    expect(managerRow.classes()).not.toContain('bg-primary-50')
  })

  it('highlights no row when selectedRole is null', () => {
    const wrapper = mount(HeadcountChart, {
      props: { headcount, selectedRole: null }
    })

    const rows = wrapper.findAll('[data-testid="headcount-role-row"]')
    rows.forEach(row => expect(row.classes()).not.toContain('bg-primary-50'))
  })

  it('emits select-role when a row is clicked', async () => {
    const wrapper = mount(HeadcountChart, {
      props: { headcount, selectedRole: null }
    })

    const rows = wrapper.findAll('[data-testid="headcount-role-row"]')
    const engineerRow = rows.find(r => r.text().includes('Engineer'))
    await engineerRow.trigger('click')

    expect(wrapper.emitted('select-role')).toEqual([['Engineer']])
  })
})

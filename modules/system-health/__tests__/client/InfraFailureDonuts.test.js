import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import InfraFailureDonuts from '../../client/components/ci-digest/InfraFailureDonuts.vue'

vi.mock('vue-chartjs', () => ({
  Doughnut: {
    name: 'Doughnut',
    props: ['data', 'options'],
    template: '<canvas data-testid="doughnut"></canvas>'
  }
}))

vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  ArcElement: 'ArcElement',
  Tooltip: 'Tooltip',
  Legend: 'Legend'
}))

function mountDonuts(window24, window72) {
  return mount(InfraFailureDonuts, { props: { window24, window72 } })
}

describe('InfraFailureDonuts', () => {
  it('plots only infra/test when unattributed_total is 0, and hides the Unattributed legend entry', () => {
    const window = { infra_total: 44, test_total: 49, unattributed_total: 0, total_failures: 93, infra_by_step: [] }
    const wrapper = mountDonuts(window, window)

    const doughnuts = wrapper.findAllComponents({ name: 'Doughnut' })
    expect(doughnuts[0].props('data').datasets[0].data).toEqual([44, 49, 0])
    expect(wrapper.text()).not.toContain('Unattributed')
  })

  it('includes unattributed_total as a third segment so the ring total matches total_failures', () => {
    // 10 infra + 20 test + 5 unattributed = 35, matching total_failures -- the
    // exporter partitions every failed job into exactly one of these three
    // buckets (get_presubmit_infra_failures_json), so all three must sum to
    // the displayed "N failures" caption.
    const window = { infra_total: 10, test_total: 20, unattributed_total: 5, total_failures: 35, infra_by_step: [] }
    const wrapper = mountDonuts(window, window)

    const doughnuts = wrapper.findAllComponents({ name: 'Doughnut' })
    const data = doughnuts[0].props('data')
    expect(data.labels).toEqual(['Infra', 'Test', 'Unattributed'])
    expect(data.datasets[0].data).toEqual([10, 20, 5])
    expect(data.datasets[0].data.reduce((a, b) => a + b, 0)).toBe(window.total_failures)
    expect(wrapper.text()).toContain('Unattributed')
    expect(wrapper.text()).toContain('35 failures')
  })

  it('renders the neutral "no failures" ring when infra, test, and unattributed are all 0', () => {
    const window = { infra_total: 0, test_total: 0, unattributed_total: 0, total_failures: 0, infra_by_step: [] }
    const wrapper = mountDonuts(window, window)

    const doughnuts = wrapper.findAllComponents({ name: 'Doughnut' })
    expect(doughnuts[0].props('data').labels).toEqual(['No failures'])
  })

  it('shows the Unattributed legend entry when only one of the two windows has any', () => {
    const clean = { infra_total: 0, test_total: 7, unattributed_total: 0, total_failures: 7, infra_by_step: [] }
    const withUnattributed = { infra_total: 0, test_total: 20, unattributed_total: 3, total_failures: 23, infra_by_step: [] }
    const wrapper = mountDonuts(clean, withUnattributed)

    expect(wrapper.text()).toContain('Unattributed')
  })
})

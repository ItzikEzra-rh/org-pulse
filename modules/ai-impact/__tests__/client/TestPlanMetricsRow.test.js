import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TestPlanMetricsRow from '../../client/components/TestPlanMetricsRow.vue'

const testPlans = {
  'TP-1': { key: 'TP-1', score: 9, verdict: 'Ready', humanReviewStatus: 'approved' },
  'TP-2': { key: 'TP-2', score: 6, verdict: 'Rework', humanReviewStatus: 'awaiting-review' },
  'TP-3': { key: 'TP-3', score: 5, verdict: 'Rework' }
}

function metric(wrapper, label) {
  const tile = wrapper.findAll('.space-y-1').find(item => item.find('p').text().startsWith(label))
  return tile.find('span.text-3xl').text()
}

describe('TestPlanMetricsRow', () => {
  it('uses supplied verdicts for pass rate and review status for action metrics', () => {
    const wrapper = mount(TestPlanMetricsRow, { props: { testPlans } })
    expect(metric(wrapper, 'Total Plans')).toBe('3')
    expect(metric(wrapper, 'Pass Rate')).toBe('33%')
    expect(metric(wrapper, 'Avg Score')).toBe('6.7')
    expect(metric(wrapper, 'Needs Action')).toBe('2')
    expect(metric(wrapper, 'Signed Off')).toBe('1')
  })
})

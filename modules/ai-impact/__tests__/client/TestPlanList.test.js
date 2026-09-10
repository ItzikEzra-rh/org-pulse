import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TestPlanList from '../../client/components/TestPlanList.vue'

const plans = {
  'TP-1': { key: 'TP-1', sourceKey: 'OSAC-1', feature: 'First plan', score: 9, verdict: 'Ready', humanReviewStatus: 'approved', jiraPriority: 'Major', reviewedAt: '2026-09-01', components: ['API'] },
  'TP-2': { key: 'TP-2', sourceKey: 'OSAC-2', feature: 'Second plan', score: 6, verdict: 'Rework', humanReviewStatus: null, jiraPriority: 'Critical', reviewedAt: '2026-09-02', components: ['UI'] }
}

describe('TestPlanList', () => {
  it('preserves source verdicts and identifies records by plan key', () => {
    const wrapper = mount(TestPlanList, { props: { testPlans: plans, selectedPlan: plans['TP-2'] } })
    expect(wrapper.text()).toContain('Rework')
    expect(wrapper.text()).toContain('6/10')
    expect(wrapper.text()).toContain('TP-2')
    expect(wrapper.text()).toContain('2 of 2 total')
    expect(wrapper.findAll('.ring-primary-500')).toHaveLength(1)
  })

  it('filters missing review status as awaiting sign-off and supports priority/component filters', async () => {
    const reviewWrapper = mount(TestPlanList, { props: { testPlans: plans, humanReviewFilter: 'awaiting-review' } })
    expect(reviewWrapper.text()).toContain('Second plan')
    expect(reviewWrapper.text()).not.toContain('First plan')

    const filtered = mount(TestPlanList, { props: { testPlans: plans, priorityFilter: 'Major', componentFilter: 'API' } })
    expect(filtered.text()).toContain('First plan')
    expect(filtered.text()).not.toContain('Second plan')
  })

  it('sorts by review date', () => {
    const wrapper = mount(TestPlanList, { props: { testPlans: plans, sortBy: 'newest' } })
    const cards = wrapper.findAllComponents({ name: 'TestPlanListItem' })
    expect(cards[0].props('plan').key).toBe('TP-2')
  })
})

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AssessmentBreakdown from '../../client/components/AssessmentBreakdown.vue'

function mountWith(assessment) {
  return mount(AssessmentBreakdown, { props: { assessment } })
}

describe('AssessmentBreakdown rubric versioning', () => {
  it('renders v2 criterion labels for a v2 assessment', () => {
    const wrapper = mountWith({
      rubricVersion: 'v2',
      scores: { what: 2, why: 2, userFacing: 1, rightSized: 2, testability: 2 },
      total: 9,
      passFail: 'PASS'
    })
    const text = wrapper.text()
    expect(text).toContain('User-Facing Focus')
    expect(text).toContain('Right-Sized')
    expect(text).toContain('Testability')
    expect(text).not.toContain('How')
  })

  it('renders v1 criterion labels for a v1 assessment', () => {
    const wrapper = mountWith({
      rubricVersion: 'v1',
      scores: { what: 2, why: 2, how: 1, task: 2, size: 2 },
      total: 9,
      passFail: 'PASS'
    })
    const text = wrapper.text()
    expect(text).toContain('How')
    expect(text).toContain('Task')
    expect(text).not.toContain('User-Facing Focus')
  })

  it('infers v2 from score keys when rubricVersion is absent', () => {
    const wrapper = mountWith({
      scores: { what: 2, why: 2, userFacing: 1, rightSized: 2, testability: 2 },
      total: 9,
      passFail: 'PASS'
    })
    expect(wrapper.text()).toContain('User-Facing Focus')
  })
})

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AssessmentHistory from '../../client/components/AssessmentHistory.vue'

// Current (latest) is v2; the prior history entry is v1.
function mountTransition() {
  return mount(AssessmentHistory, {
    props: {
      currentTotal: 9,
      currentAssessedAt: '2026-08-01T00:00:00Z',
      currentScores: { what: 2, why: 1, userFacing: 2, rightSized: 2, testability: 2 },
      history: [
        {
          rubricVersion: 'v1',
          total: 10,
          passFail: 'PASS',
          scores: { what: 2, why: 2, how: 2, task: 2, size: 2 },
          assessedAt: '2026-04-01T00:00:00Z'
        }
      ]
    }
  })
}

describe('AssessmentHistory v1↔v2 transition diff', () => {
  it('does not report rubric-exclusive criteria as score changes', async () => {
    const wrapper = mountTransition()
    // Expand the history section so the per-criterion diff chips render.
    await wrapper.find('button').trigger('click')
    const text = wrapper.text()

    // Shared criterion that actually changed (why 2 -> 1) should appear.
    expect(text).toContain('Why')

    // v1-only criteria must NOT be reported as -N changes.
    expect(text).not.toContain('How')
    expect(text).not.toContain('Task')
    expect(text).not.toContain('Size')
    // v2-only criteria must NOT be reported as +N changes.
    expect(text).not.toContain('User-Facing Focus')
    expect(text).not.toContain('Right-Sized')
    expect(text).not.toContain('Testability')
  })
})

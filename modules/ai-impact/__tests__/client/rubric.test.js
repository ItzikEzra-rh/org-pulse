import { describe, it, expect } from 'vitest'
import { rubricForAssessment, rubricFor, RUBRICS } from '../../client/rubric.js'

describe('rubricForAssessment', () => {
  it('returns the v2 rubric when rubricVersion is v2', () => {
    const r = rubricForAssessment({ rubricVersion: 'v2', scores: {} })
    expect(r.keys).toEqual(['what', 'why', 'userFacing', 'rightSized', 'testability'])
    expect(r.labels.userFacing).toBe('User-Facing Focus')
    expect(r.labels.rightSized).toBe('Right-Sized')
  })

  it('returns the v1 rubric when rubricVersion is v1', () => {
    const r = rubricForAssessment({ rubricVersion: 'v1', scores: {} })
    expect(r.keys).toEqual(['what', 'why', 'how', 'task', 'size'])
    expect(r.labels.how).toBe('How')
  })

  it('defaults to v1 when rubricVersion is missing and keys are v1', () => {
    const r = rubricForAssessment({ scores: { what: 2, how: 1 } })
    expect(r.keys).toEqual(['what', 'why', 'how', 'task', 'size'])
  })

  it('infers v2 from score keys when rubricVersion is missing', () => {
    const r = rubricForAssessment({ scores: { userFacing: 2 } })
    expect(r).toBe(RUBRICS.v2)
  })

  it('handles null/undefined assessment', () => {
    expect(rubricForAssessment(null).keys).toEqual(RUBRICS.v1.keys)
  })
})

describe('rubricFor', () => {
  it('returns the rubric for a version string, v1 fallback', () => {
    expect(rubricFor('v2')).toBe(RUBRICS.v2)
    expect(rubricFor('nope')).toBe(RUBRICS.v1)
  })
})

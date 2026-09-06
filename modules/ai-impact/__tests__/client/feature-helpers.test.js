import { describe, it, expect } from 'vitest'
import { getTotalScoreClass, getDesignStatusClass, getDesignStatusLabel, getMeaningfulDesignReviewStatus } from '../../client/utils/feature-helpers.js'

describe('getMeaningfulDesignReviewStatus', () => {
  it('existing + unscored + default awaiting-review: not meaningful', () => {
    expect(getMeaningfulDesignReviewStatus({ designPrStatus: 'Merged', scores: null, humanReviewStatus: 'awaiting-review' })).toBeNull()
  })

  it('existing + unscored + approved: meaningful', () => {
    expect(getMeaningfulDesignReviewStatus({ designPrStatus: 'Merged', scores: null, humanReviewStatus: 'approved' })).toBe('approved')
  })

  it('existing + unscored + needs-review: meaningful', () => {
    expect(getMeaningfulDesignReviewStatus({ designPrStatus: 'Merged', scores: null, humanReviewStatus: 'needs-review' })).toBe('needs-review')
  })

  it('existing + scored + awaiting-review: meaningful', () => {
    expect(getMeaningfulDesignReviewStatus({ designPrStatus: 'Merged', scores: { total: 6 }, humanReviewStatus: 'awaiting-review' })).toBe('awaiting-review')
  })

  it('missing Design: never meaningful, regardless of humanReviewStatus', () => {
    expect(getMeaningfulDesignReviewStatus({ designPrStatus: null, scores: { total: 6 }, humanReviewStatus: 'approved' })).toBeNull()
  })
})

describe('getDesignStatusLabel / getDesignStatusClass', () => {
  it('labels a null designPrStatus as Missing Design', () => {
    expect(getDesignStatusLabel(null)).toBe('Missing Design')
    expect(getDesignStatusClass(null)).toContain('bg-blue-100')
  })

  it('does not label a Design artifact as missing just because it is unscored', () => {
    expect(getDesignStatusLabel('Merged')).toBeNull()
    expect(getDesignStatusClass('Merged')).toBe('')
  })

  it('does not label any non-null designPrStatus as missing', () => {
    expect(getDesignStatusLabel('Open')).toBeNull()
    expect(getDesignStatusLabel('Closed')).toBeNull()
  })
})

describe('getTotalScoreClass', () => {
  it('renders a perfect 8/8 total as green', () => {
    expect(getTotalScoreClass(8)).toContain('text-green-600')
  })

  it('renders 4-7 out of 8 as amber, not red', () => {
    expect(getTotalScoreClass(4)).toContain('text-amber-600')
    expect(getTotalScoreClass(5)).toContain('text-amber-600')
    expect(getTotalScoreClass(6)).toContain('text-amber-600')
    expect(getTotalScoreClass(7)).toContain('text-amber-600')
  })

  it('renders 0-3 out of 8 as red', () => {
    expect(getTotalScoreClass(0)).toContain('text-red-600')
    expect(getTotalScoreClass(3)).toContain('text-red-600')
  })
})

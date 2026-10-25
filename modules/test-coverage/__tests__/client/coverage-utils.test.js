import { describe, it, expect } from 'vitest'
import { filterByGroup } from '../../client/utils/coverage.js'

describe('filterByGroup', () => {
  const rows = [{ key: 'a', group: 'core' }, { key: 'b', group: 'platform' }]

  it('keeps only the selected group', () => {
    expect(filterByGroup(rows, 'platform')).toEqual([{ key: 'b', group: 'platform' }])
  })

  it('returns all rows for an empty key', () => {
    expect(filterByGroup(rows, '')).toBe(rows)
  })
})

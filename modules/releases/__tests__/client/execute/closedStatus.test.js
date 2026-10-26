import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
import { CLOSED_STATUSES, isClosedStatus } from '../../../client/execute/utils/closedStatus'

const require = createRequire(import.meta.url)

describe('closedStatus', () => {
  it('mirrors the server CLOSED_STATUSES definition', () => {
    expect(CLOSED_STATUSES).toEqual(require('../../../server/planning/constants').CLOSED_STATUSES)
  })

  it('matches terminal statuses case-insensitively and ignores others', () => {
    expect(['Closed', 'DONE', ' resolved ', 'Cancelled'].every(isClosedStatus)).toBe(true)
    expect(['In Progress', 'Release Pending', '', null, undefined].some(isClosedStatus)).toBe(false)
  })
})

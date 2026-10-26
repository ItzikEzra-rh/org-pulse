import { describe, it, expect } from 'vitest'
import { formatRelativeTime, parseDateValue } from '@shared/client/utils/format.js'

describe('formatRelativeTime', () => {
  const now = new Date(2026, 9, 25, 12, 0, 0).getTime()

  it('compares bare dates by calendar day', () => {
    expect(formatRelativeTime('2026-10-25', now)).toBe('today')
    expect(formatRelativeTime('2026-10-24', now)).toBe('yesterday')
    expect(formatRelativeTime('2026-10-20', now)).toBe('5 days ago')
  })

  it('formats timestamps and edge values', () => {
    expect(formatRelativeTime(new Date(now - 2 * 3600000).toISOString(), now)).toBe('2h ago')
    expect(formatRelativeTime(new Date(now - 3 * 86400000).toISOString(), now)).toBe('3 days ago')
    expect(formatRelativeTime(null, now)).toBe('never')
    expect(formatRelativeTime('not-a-date', now)).toBe('unknown')
  })

  it('reports date-only parsing', () => {
    expect(parseDateValue('2026-10-25').dateOnly).toBe(true)
    expect(parseDateValue('2026-10-25T10:00:00Z').dateOnly).toBe(false)
  })
})

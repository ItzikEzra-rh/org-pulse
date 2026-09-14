import { describe, it, expect } from 'vitest'
import { preparationHelpText } from '../../../client/execute/utils/readiness'

describe('preparationHelpText', () => {
  it('uses OSAC-specific PRD/Design wording for OSAC feature keys', () => {
    expect(preparationHelpText('ready', 'OSAC-1862')).toContain('Required PRD and Design pull requests have been merged.')
    expect(preparationHelpText('pending', 'OSAC-1862')).toContain('Required PRD or Design work is still pending completion and PR merge.')
    expect(preparationHelpText('unknown', 'OSAC-1862')).toContain('Not enough information to confirm whether the required PRD and Design pull requests have been merged.')
  })

  it('falls back to generic wording for non-OSAC feature keys, never asserting OSAC policy', () => {
    const text = preparationHelpText('ready', 'RHOAIENG-500')
    expect(text).not.toContain('PRD')
    expect(text).toContain('Required preparation is confirmed complete.')
  })

  it('falls back to generic wording when the feature key is missing', () => {
    const text = preparationHelpText('pending', undefined)
    expect(text).not.toContain('PRD')
    expect(text).toContain('Required preparation is still pending.')
  })

  it('returns null for not-applicable regardless of project', () => {
    expect(preparationHelpText('not-applicable', 'OSAC-1862')).toBeNull()
  })
})

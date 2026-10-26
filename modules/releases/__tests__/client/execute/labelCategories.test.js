import { describe, it, expect } from 'vitest'
import { labelCategoryConfigFor } from '../../../client/execute/utils/labelCategories'

describe('labelCategoryConfigFor', () => {
  it('supplies the readiness allowlist for a configured project key', () => {
    expect(labelCategoryConfigFor([{ key: 'OSAC-1' }, { key: 'OSAC-2' }]).readinessLabels).toEqual(['osac-ui', 'osac-ux'])
  })

  it('falls back to generic defaults for unconfigured projects and empty lists', () => {
    expect(labelCategoryConfigFor([{ key: 'OTHER-1' }])).toEqual({})
    expect(labelCategoryConfigFor([])).toEqual({})
  })
})

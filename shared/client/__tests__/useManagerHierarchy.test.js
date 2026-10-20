import { describe, it, expect } from 'vitest'
import { getManagerChain, getDirectReports, getHierarchyAvailability } from '../composables/useManagerHierarchy.js'

function rosterPerson(accountId, { displayName, title = null, managerRef = null, active = true } = {}) {
  return { accountId, displayName: displayName || accountId, title, managerRef, active }
}

describe('getManagerChain', () => {
  it('walks a roster-only chain up to a verified terminator', () => {
    const people = [
      rosterPerson('ic', { managerRef: { kind: 'roster', accountId: 'mgr' } }),
      rosterPerson('mgr', { displayName: 'Mgr One', managerRef: { kind: 'roster', accountId: 'vp' } }),
      rosterPerson('vp', { displayName: 'VP One', managerRef: null })
    ]

    const chain = getManagerChain('ic', { people, auxiliaryManagers: {} })

    expect(chain).toEqual([
      { kind: 'roster', accountId: 'mgr', name: 'Mgr One', title: null, navigable: true },
      { kind: 'roster', accountId: 'vp', name: 'VP One', title: null, navigable: true },
      { kind: 'end' }
    ])
  })

  it('does not label a null managerRef as a verified root', () => {
    // unmatched/ambiguous records also publish managerRef: null
    const people = [rosterPerson('vp', { managerRef: null })]
    const chain = getManagerChain('vp', { people, auxiliaryManagers: {} })
    expect(chain).toEqual([{ kind: 'end' }])
    expect(chain[0]).not.toHaveProperty('verified')
    expect(chain[0]).not.toHaveProperty('root')
  })

  it('crosses into an external auxiliary manager and continues the walk', () => {
    const people = [rosterPerson('ic', { managerRef: { kind: 'external', ldapUid: 'director1' } })]
    const auxiliaryManagers = {
      director1: { ldapUid: 'director1', displayName: 'Director One', title: 'Director', managerRef: { kind: 'external', ldapUid: 'vp1' } },
      vp1: { ldapUid: 'vp1', displayName: 'VP One', title: 'VP', managerRef: null }
    }

    const chain = getManagerChain('ic', { people, auxiliaryManagers })

    expect(chain).toEqual([
      { kind: 'external', ldapUid: 'director1', name: 'Director One', title: 'Director', navigable: false },
      { kind: 'external', ldapUid: 'vp1', name: 'VP One', title: 'VP', navigable: false },
      { kind: 'end' }
    ])
  })

  it('dedupes a shared external ancestor referenced by two different roster people', () => {
    const auxiliaryManagers = {
      shared: { ldapUid: 'shared', displayName: 'Shared Director', managerRef: null }
    }
    const chainA = getManagerChain('a', {
      people: [rosterPerson('a', { managerRef: { kind: 'external', ldapUid: 'shared' } })],
      auxiliaryManagers
    })
    const chainB = getManagerChain('b', {
      people: [rosterPerson('b', { managerRef: { kind: 'external', ldapUid: 'shared' } })],
      auxiliaryManagers
    })

    expect(chainA[0]).toEqual({ kind: 'external', ldapUid: 'shared', name: 'Shared Director', title: null, navigable: false })
    expect(chainB[0]).toEqual(chainA[0])
  })

  it('surfaces a published unresolved hop verbatim', () => {
    const people = [rosterPerson('ic', { managerRef: { kind: 'unresolved', reason: 'depth-exceeded' } })]
    const chain = getManagerChain('ic', { people, auxiliaryManagers: {} })
    expect(chain).toEqual([{ kind: 'unresolved', reason: 'depth-exceeded' }])
  })

  it('guards against a roster cycle as defense-in-depth even though the contract is acyclic', () => {
    const people = [
      rosterPerson('a', { managerRef: { kind: 'roster', accountId: 'b' } }),
      rosterPerson('b', { managerRef: { kind: 'roster', accountId: 'a' } })
    ]
    const chain = getManagerChain('a', { people, auxiliaryManagers: {} })
    expect(chain[chain.length - 1]).toEqual({ kind: 'unresolved', reason: 'cycle' })
    expect(chain.length).toBeLessThan(10)
  })

  it('guards against an external-to-external cycle', () => {
    const auxiliaryManagers = {
      x: { ldapUid: 'x', displayName: 'X', managerRef: { kind: 'external', ldapUid: 'y' } },
      y: { ldapUid: 'y', displayName: 'Y', managerRef: { kind: 'external', ldapUid: 'x' } }
    }
    const people = [rosterPerson('ic', { managerRef: { kind: 'external', ldapUid: 'x' } })]
    const chain = getManagerChain('ic', { people, auxiliaryManagers })
    expect(chain[chain.length - 1]).toEqual({ kind: 'unresolved', reason: 'cycle' })
  })

  it('reports depth-exceeded, not cycle, for a long acyclic roster chain', () => {
    const people = []
    for (let i = 0; i < 100; i++) {
      people.push(rosterPerson(`p${i}`, { managerRef: { kind: 'roster', accountId: `p${i + 1}` } }))
    }
    people.push(rosterPerson('p100', { managerRef: null }))

    const chain = getManagerChain('p0', { people, auxiliaryManagers: {} })
    expect(chain[chain.length - 1]).toEqual({ kind: 'unresolved', reason: 'depth-exceeded' })
    expect(chain.some(node => node.reason === 'cycle')).toBe(false)
  })

  it('reports depth-exceeded, not cycle, for a long acyclic external chain', () => {
    const auxiliaryManagers = {}
    for (let i = 0; i < 100; i++) {
      auxiliaryManagers[`e${i}`] = {
        ldapUid: `e${i}`,
        displayName: `E${i}`,
        managerRef: { kind: 'external', ldapUid: `e${i + 1}` }
      }
    }
    auxiliaryManagers['e100'] = { ldapUid: 'e100', displayName: 'E100', managerRef: null }
    const people = [rosterPerson('ic', { managerRef: { kind: 'external', ldapUid: 'e0' } })]

    const chain = getManagerChain('ic', { people, auxiliaryManagers })
    expect(chain[chain.length - 1]).toEqual({ kind: 'unresolved', reason: 'depth-exceeded' })
    expect(chain.some(node => node.reason === 'cycle')).toBe(false)
  })

  it('reports a dangling roster ref instead of throwing', () => {
    const people = [rosterPerson('ic', { managerRef: { kind: 'roster', accountId: 'ghost' } })]
    expect(getManagerChain('ic', { people, auxiliaryManagers: {} })).toEqual([
      { kind: 'unresolved', reason: 'dangling-roster-ref' }
    ])
  })

  it('reports a dangling external ref instead of throwing', () => {
    const people = [rosterPerson('ic', { managerRef: { kind: 'external', ldapUid: 'missing' } })]
    expect(getManagerChain('ic', { people, auxiliaryManagers: {} })).toEqual([
      { kind: 'unresolved', reason: 'dangling-external-ref' }
    ])
  })

  it('returns an empty chain for an unknown accountId instead of fabricating one', () => {
    expect(getManagerChain('nobody', { people: [], auxiliaryManagers: {} })).toEqual([])
  })

  it('never leaks data across two independent calls for different projects', () => {
    // same accountId reused across two unrelated snapshots
    const projectAChain = getManagerChain('p1', {
      people: [rosterPerson('p1', { managerRef: { kind: 'roster', accountId: 'mgrA' } }), rosterPerson('mgrA', { displayName: 'Project A Manager' })],
      auxiliaryManagers: {}
    })
    const projectBChain = getManagerChain('p1', {
      people: [rosterPerson('p1', { managerRef: { kind: 'roster', accountId: 'mgrB' } }), rosterPerson('mgrB', { displayName: 'Project B Manager' })],
      auxiliaryManagers: {}
    })

    expect(projectAChain[0].name).toBe('Project A Manager')
    expect(projectBChain[0].name).toBe('Project B Manager')
  })
})

describe('getDirectReports', () => {
  it('returns only active people whose managerRef points at the given accountId', () => {
    const people = [
      rosterPerson('mgr', {}),
      rosterPerson('r1', { displayName: 'Report One', title: 'Engineer', managerRef: { kind: 'roster', accountId: 'mgr' } }),
      rosterPerson('r2', { displayName: 'Inactive Report', managerRef: { kind: 'roster', accountId: 'mgr' }, active: false }),
      rosterPerson('other', { managerRef: { kind: 'roster', accountId: 'someone-else' } })
    ]

    expect(getDirectReports('mgr', { people })).toEqual([
      { accountId: 'r1', name: 'Report One', title: 'Engineer', navigable: true }
    ])
  })

  it('does not leak another manager\'s reports', () => {
    const people = [
      rosterPerson('r1', { managerRef: { kind: 'roster', accountId: 'mgrA' } }),
      rosterPerson('r2', { managerRef: { kind: 'roster', accountId: 'mgrB' } })
    ]
    expect(getDirectReports('mgrA', { people }).map(r => r.accountId)).toEqual(['r1'])
  })

  it('ignores external managerRef — only in-roster edges count as reports', () => {
    const people = [rosterPerson('r1', { managerRef: { kind: 'external', ldapUid: 'director1' } })]
    expect(getDirectReports('director1', { people })).toEqual([])
  })
})

describe('getHierarchyAvailability', () => {
  it('is unavailable when no enrichment ever joined', () => {
    expect(getHierarchyAvailability(undefined)).toEqual({ available: false, indicator: null })
  })

  it('is unavailable when the join was distrusted (expired/unknown freshness)', () => {
    expect(getHierarchyAvailability({ state: 'absent', generatedAt: '2026-01-01T00:00:00Z' })).toEqual({
      available: false,
      indicator: null
    })
  })

  it('is available with no indicator when fresh', () => {
    expect(getHierarchyAvailability({ state: 'fresh' })).toEqual({ available: true, indicator: null })
  })

  it('preserves usable stale enrichment with a stale indicator', () => {
    expect(getHierarchyAvailability({ state: 'stale' })).toEqual({ available: true, indicator: 'stale' })
  })

  it('preserves usable partial enrichment with a partial indicator', () => {
    expect(getHierarchyAvailability({ state: 'partial' })).toEqual({ available: true, indicator: 'partial' })
  })

  it('preserves both signals when a stale republish is also missing records', () => {
    expect(getHierarchyAvailability({ state: 'stale', partial: true })).toEqual({
      available: true,
      indicator: 'stale, partial'
    })
  })
})

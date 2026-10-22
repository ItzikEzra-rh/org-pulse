/**
 * Manager hierarchy traversal over the managerRef/auxiliaryManagers contract
 * (docs/data/manager-hierarchy-contract.md). `null` always means `end`, never
 * a verified root — unmatched/ambiguous people publish null too.
 */

// Depth safety net for very long acyclic chains; cycles are caught separately by the visited sets.
const MAX_CHAIN_WALK = 64

function indexByAccountId(people) {
  const map = new Map()
  for (const person of people || []) {
    if (person && typeof person.accountId === 'string' && person.accountId) {
      map.set(person.accountId, person)
    }
  }
  return map
}

// Own-property only: auxiliaryManagers is keyed by externally-supplied ldapUid
// (e.g. a deep-link param), so a key like "constructor" or "toString" must not
// resolve to an inherited Object.prototype member.
export function getAuxiliaryManager(auxiliaryManagers, ldapUid) {
  return auxiliaryManagers && Object.prototype.hasOwnProperty.call(auxiliaryManagers, ldapUid)
    ? auxiliaryManagers[ldapUid]
    : undefined
}

function rosterNode(person) {
  return { kind: 'roster', accountId: person.accountId, name: person.displayName, title: person.title ?? null, navigable: true }
}

// Navigable: resolves to a (projectId, ldapUid) external-manager profile.
function externalNode(ldapUid, record) {
  return { kind: 'external', ldapUid, name: record.displayName, title: record.title ?? null, navigable: true }
}

function walkManagerChain(startRef, { peopleByAccountId, auxiliaryManagers, visitedRoster, visitedExternal }) {
  const chain = []
  let ref = startRef

  while (true) {
    if (ref == null || typeof ref !== 'object') {
      chain.push({ kind: 'end' })
      return chain
    }

    if (ref.kind === 'roster') {
      if (visitedRoster.has(ref.accountId)) {
        chain.push({ kind: 'unresolved', reason: 'cycle' })
        return chain
      }
      if (chain.length >= MAX_CHAIN_WALK) {
        chain.push({ kind: 'unresolved', reason: 'depth-exceeded' })
        return chain
      }
      const manager = peopleByAccountId.get(ref.accountId)
      if (!manager) {
        chain.push({ kind: 'unresolved', reason: 'dangling-roster-ref' })
        return chain
      }
      visitedRoster.add(ref.accountId)
      chain.push(rosterNode(manager))
      ref = manager.managerRef ?? null
      continue
    }

    if (ref.kind === 'external') {
      const record = getAuxiliaryManager(auxiliaryManagers, ref.ldapUid)
      if (visitedExternal.has(ref.ldapUid)) {
        chain.push({ kind: 'unresolved', reason: 'cycle' })
        return chain
      }
      if (chain.length >= MAX_CHAIN_WALK) {
        chain.push({ kind: 'unresolved', reason: 'depth-exceeded' })
        return chain
      }
      if (!record) {
        chain.push({ kind: 'unresolved', reason: 'dangling-external-ref' })
        return chain
      }
      visitedExternal.add(ref.ldapUid)
      chain.push(externalNode(ref.ldapUid, record))
      ref = record.managerRef ?? null
      continue
    }

    if (ref.kind === 'unresolved') {
      chain.push({ kind: 'unresolved', reason: ref.reason || 'unknown' })
      return chain
    }

    chain.push({ kind: 'end' }) // malformed ref: degrade, don't throw
    return chain
  }
}

/** Ordered chain from accountId's direct manager upward; last entry is always `end` or `unresolved`. */
export function getManagerChain(accountId, { people, auxiliaryManagers } = {}) {
  const peopleByAccountId = indexByAccountId(people)
  const start = peopleByAccountId.get(accountId)
  if (!start) return []

  return walkManagerChain(start.managerRef ?? null, {
    peopleByAccountId,
    auxiliaryManagers,
    visitedRoster: new Set([accountId]),
    visitedExternal: new Set()
  })
}

/** Same as `getManagerChain`, starting from a verified external manager's own auxiliaryManagers record. */
export function getManagerChainFromExternal(ldapUid, { people, auxiliaryManagers } = {}) {
  const start = getAuxiliaryManager(auxiliaryManagers, ldapUid)
  if (!start) return []

  return walkManagerChain(start.managerRef ?? null, {
    peopleByAccountId: indexByAccountId(people),
    auxiliaryManagers,
    visitedRoster: new Set(),
    visitedExternal: new Set([ldapUid])
  })
}

/** Active roster people whose managerRef points at accountId; no transitive closure. */
export function getDirectReports(accountId, { people } = {}) {
  return (people || [])
    .filter(p => p?.active && p.managerRef?.kind === 'roster' && p.managerRef.accountId === accountId)
    .map(p => ({ accountId: p.accountId, name: p.displayName, title: p.title ?? null, navigable: true }))
}

/** Active roster people whose managerRef points at an external manager's ldapUid; no transitive closure. */
export function getDirectReportsOfExternal(ldapUid, { people } = {}) {
  return (people || [])
    .filter(p => p?.active && p.managerRef?.kind === 'external' && p.managerRef.ldapUid === ldapUid)
    .map(p => ({ accountId: p.accountId, name: p.displayName, title: p.title ?? null, navigable: true }))
}

/** Stale/partial enrichment is still usable (with an indicator); only a missing/distrusted join is unavailable. */
export function getHierarchyAvailability(enrichment) {
  if (!enrichment || typeof enrichment !== 'object') return { available: false, indicator: null }
  if (enrichment.state === 'fresh') return { available: true, indicator: null }
  if (enrichment.state === 'stale' || enrichment.state === 'partial') {
    const indicator = enrichment.state === 'stale' && enrichment.partial ? 'stale, partial' : enrichment.state
    return { available: true, indicator }
  }
  return { available: false, indicator: null }
}

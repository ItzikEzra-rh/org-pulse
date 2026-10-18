// Shared member-resolution rules for the Team Overview, generalized across the
// legacy OSAC registry model and the project-qualified normalized model so the
// members table and Headcount chart stay consistent. Identity is never joined
// by display name.

export const UNKNOWN_ROLE = 'Unknown'

// Resolves a custom field by display label across the sheets model (label keys)
// and the in-app model (field-id keys); arrays are joined for display.
export function getCustomFieldByLabel(member, label, fieldDefinitions = []) {
  const cf = member?.customFields
  if (!cf) return null
  let val = cf[label]
  if (!val) {
    const def = fieldDefinitions.find(f => f.label?.toLowerCase() === label.toLowerCase())
    if (def) val = cf[def.id]
  }
  if (val == null) return null
  return Array.isArray(val) ? val.join(', ') : val
}

// Canonical role, or null when none is published (callers bucket null as Unknown).
export function resolveMemberRole(member, fieldDefinitions = []) {
  return (
    getCustomFieldByLabel(member, 'Engineering Speciality', fieldDefinitions) ||
    member?.engineeringSpeciality ||
    member?.specialty ||
    member?.title ||
    null
  )
}

// Stable dedup identity (accountId/uid); null when absent, since a display name
// never identifies a person.
export function memberCanonicalIdentity(member) {
  return member?.accountId || member?.uid || null
}

// Collapse members sharing a stable identity; id-less members are kept distinct
// so same-named legacy entries are never merged.
export function dedupeMembersByIdentity(members = []) {
  const seen = new Set()
  const result = []
  for (const member of members) {
    const identity = memberCanonicalIdentity(member)
    if (identity != null) {
      if (seen.has(identity)) continue
      seen.add(identity)
    }
    result.push(member)
  }
  return result
}

/**
 * Resolve a member's direct manager across both identity models. Returns
 * `{ name, link }` where `link` is non-null only for a valid roster identity;
 * external/legacy-uid names are not linkable. Returns null when unavailable.
 */
export function resolveMemberManager(member, ctx = {}) {
  const { people = [], peopleByAccountId = null, auxiliaryManagers = {}, managerNames = {} } = ctx

  // Typed project-qualified reference takes precedence over the legacy uid.
  const ref = member?.managerRef
  if (ref && typeof ref === 'object') {
    if (ref.kind === 'roster' && ref.accountId) {
      // Prefer the prebuilt lookup when the caller supplies one (O(1) per row).
      const person = peopleByAccountId
        ? peopleByAccountId.get(ref.accountId)
        : people.find(p => p.accountId === ref.accountId)
      const name = person?.displayName || person?.name
      return name ? { name, link: { accountId: ref.accountId } } : null
    }
    if (ref.kind === 'external' && ref.ldapUid) {
      const aux = auxiliaryManagers[ref.ldapUid]
      return aux?.displayName ? { name: aux.displayName, link: null } : null
    }
    return null
  }

  const uid = member?.managerUid || member?.manager
  if (!uid) return null
  const name = managerNames[uid]
  // Unresolved uid shows raw, not linkable (never a display-name join).
  return name ? { name, link: { uid } } : { name: uid, link: null }
}

// Physical location (city/country), distinct from Geo/Region; null when unpublished.
export function resolveMemberLocation(member) {
  const city = member?.city
  const country = member?.country
  if (city && country) return `${city}, ${country}`
  // A richer published location string beats a lone city/country fragment.
  return member?.location || city || country || null
}

// Headcount by Role derived from loaded members: deduplicated by stable
// identity, missing roles bucketed as Unknown, total == unique membership.
export function deriveHeadcountByRole(members = [], fieldDefinitions = []) {
  const unique = dedupeMembersByIdentity(members)
  const byRole = {}
  for (const member of unique) {
    const role = resolveMemberRole(member, fieldDefinitions) || UNKNOWN_ROLE
    byRole[role] = (byRole[role] || 0) + 1
  }
  return { byRole, totalHeadcount: unique.length }
}

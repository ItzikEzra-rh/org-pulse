import { ref, computed, watch } from 'vue'
import { getRoster } from '../services/api'
import { useProjectId } from './useProjectId.js'

// Carries forward normalized person fields as-is; never fabricates ones the source hasn't published.
// Physical location (city/country/location) is distinct from Geo/Region and is
// passed through so Team Overview can display it when the publication provides it.
function _toNormalizedMember(person) {
  return {
    accountId: person.accountId,
    name: person.displayName,
    jiraDisplayName: person.displayName,
    email: person.email ?? null,
    title: person.title ?? null,
    geo: person.geo ?? null,
    city: person.city ?? null,
    country: person.country ?? null,
    location: person.location ?? null,
    identities: person.identities ?? {},
    managerRef: person.managerRef ?? null,
    customFields: {}
  }
}

const rosterData = ref(null)
const loading = ref(false)
const error = ref(null)
const selectedOrgKey = ref(null)
const projectId = useProjectId()
let rosterProjectId = projectId.value
let requestSequence = 0
let pendingRosterRequest = null

watch(projectId, currentProjectId => {
  rosterProjectId = currentProjectId
  rosterData.value = null
  selectedOrgKey.value = null
  error.value = null
  loading.value = false
  requestSequence += 1
  pendingRosterRequest = null
  fetchRoster()
}, { flush: 'sync' })

function fetchRoster({ force = false } = {}) {
  const requestedProjectId = projectId.value
  if (!force && rosterData.value && rosterProjectId === requestedProjectId) {
    return Promise.resolve(rosterData.value)
  }
  if (!force && pendingRosterRequest?.projectId === requestedProjectId) {
    return pendingRosterRequest.promise
  }

  const requestId = ++requestSequence
  rosterProjectId = requestedProjectId
  loading.value = true
  error.value = null

  const promise = (async () => {
    try {
      const fresh = await getRoster(requestedProjectId)
      if (requestedProjectId && requestedProjectId !== 'osac' && fresh?.projectId !== requestedProjectId) {
        throw new Error('Roster response project identity mismatch')
      }
      if (requestId === requestSequence && projectId.value === requestedProjectId) {
        rosterData.value = fresh
        rosterProjectId = requestedProjectId
      }
      return fresh
    } catch (err) {
      if (requestId === requestSequence && projectId.value === requestedProjectId) {
        error.value = err.message
        console.error('Failed to load roster:', err)
      }
      return null
    } finally {
      if (requestId === requestSequence) {
        loading.value = false
        pendingRosterRequest = null
      }
    }
  })()

  pendingRosterRequest = { projectId: requestedProjectId, promise }
  return promise
}

function loadRoster() {
  return fetchRoster()
}

function reloadRoster() {
  return fetchRoster({ force: true })
}

export function useRoster() {
  // The project-qualified read model has flat teams[]/people[] instead of
  // the legacy orgs{} shape; org selection and custom fields don't apply to it.
  const isNormalizedModel = computed(() => Array.isArray(rosterData.value?.teams))

  const orgs = computed(() => {
    if (isNormalizedModel.value) return []
    if (!rosterData.value?.orgs) return []
    return rosterData.value.orgs
  })

  const people = computed(() => {
    if (isNormalizedModel.value) return rosterData.value.people || []
    return Array.isArray(rosterData.value?.people) ? rosterData.value.people : []
  })

  function getPersonByAccountId(accountId) {
    return people.value.find(p => p.accountId === accountId) || null
  }

  const visibleFields = computed(() => {
    return rosterData.value?.visibleFields || []
  })

  const primaryDisplayField = computed(() => {
    return rosterData.value?.primaryDisplayField || null
  })

  const managerNames = computed(() => {
    return rosterData.value?.managerNames || {}
  })

  // Project-qualified external managers, keyed by ldapUid. Present only when an
  // enrichment publication joined; carries displayName for typed external refs.
  const auxiliaryManagers = computed(() => {
    return rosterData.value?.auxiliaryManagers || {}
  })

  const selectedOrg = computed(() => {
    if (!selectedOrgKey.value) return null
    return orgs.value.find(o => o.key === selectedOrgKey.value || o.displayName === selectedOrgKey.value) || null
  })

  const teams = computed(() => {
    if (isNormalizedModel.value) {
      const peopleByAccountId = new Map(people.value.map(p => [p.accountId, p]))
      return (rosterData.value.teams || []).map(team => ({
        key: team.key,
        displayKey: null,
        displayName: team.displayName,
        members: (team.memberAccountIds || [])
          .map(accountId => peopleByAccountId.get(accountId))
          .filter(person => person?.active)
          .map(_toNormalizedMember),
        teamId: team.id,
        metadata: {},
        description: team.description
      }))
    }

    function buildTeam(org, teamName, team) {
      return {
        key: `${org.key}::${teamName}`,
        displayKey: org.displayName ? `${org.displayName}::${teamName}` : null,
        displayName: team.displayName,
        members: team.members,
        teamId: team.teamId || null,
        metadata: team.metadata || {},
        description: team.description || null
      }
    }

    // When no org is selected, show all teams across all orgs
    if (!selectedOrgKey.value) {
      const allTeams = []
      for (const org of orgs.value) {
        if (!org.teams) continue
        for (const [teamName, team] of Object.entries(org.teams)) {
          allTeams.push(buildTeam(org, teamName, team))
        }
      }
      return allTeams
    }
    const org = selectedOrg.value
    if (!org?.teams) return []
    return Object.entries(org.teams).map(([teamName, team]) => buildTeam(org, teamName, team))
  })

  // accountId is the stable identity when published; displayName can collide
  // across people and must not be used for matching once accountId exists.
  function memberIdentity(member) {
    return member.accountId || member.jiraDisplayName
  }

  const multiTeamMembers = computed(() => {
    const idCounts = {}
    for (const team of teams.value) {
      for (const member of team.members) {
        const id = memberIdentity(member)
        idCounts[id] = (idCounts[id] || 0) + 1
      }
    }
    return new Set(
      Object.entries(idCounts)
        .filter(([, count]) => count > 1)
        .map(([id]) => id)
    )
  })

  function getTeamsForPerson(identity) {
    return teams.value.filter(t =>
      t.members.some(m => memberIdentity(m) === identity)
    )
  }

  const uniqueMemberCount = computed(() => {
    const names = new Set()
    for (const team of teams.value) {
      for (const member of team.members) {
        names.add(member.accountId || member.jiraDisplayName)
      }
    }
    return names.size
  })

  function selectOrg(orgKey) {
    selectedOrgKey.value = orgKey
  }

  return {
    rosterData,
    isNormalizedModel,
    orgs,
    people,
    getPersonByAccountId,
    selectedOrg,
    selectedOrgKey,
    selectOrg,
    teams,
    loading,
    error,
    multiTeamMembers,
    getTeamsForPerson,
    uniqueMemberCount,
    visibleFields,
    primaryDisplayField,
    managerNames,
    auxiliaryManagers,
    loadRoster,
    reloadRoster
  }
}

<script setup>
import { ref, computed, onMounted, inject, watch } from 'vue'
import { useOrgRoster } from '../composables/useOrgRoster'
import { useRoster } from '@shared/client/composables/useRoster'
import { useProjectId } from '@shared/client/composables/useProjectId.js'
import { usePermissions } from '@shared/client/composables/usePermissions'
import { useFieldDefinitions } from '@shared/client/composables/useFieldDefinitions'
import { useFieldFilters } from '../composables/useFieldFilters'
import OrgSelector from '../components/OrgSelector.vue'
import TeamCard from '../components/TeamCard.vue'
import FieldFilterPanel from '../components/FieldFilterPanel.vue'

const nav = inject('moduleNav')
const projectId = useProjectId()
const {
  orgs,
  selectedOrg,
  loading: orgLoading,
  searchQuery,
  sortBy,
  filteredTeams,
  totalPeople: orgTotalPeople,
  unassigned,
  loadTeams,
  loadOrgs
} = useOrgRoster()
const {
  rosterData,
  loading: projectRosterLoading,
  error: projectRosterError,
  uniqueMemberCount,
  loadRoster
} = useRoster()
const { isAdmin } = usePermissions()
const unassignedExpanded = ref(false)
const expandedTeamKeys = ref(new Set())
const isProjectRoster = computed(() => Boolean(projectId.value) && projectId.value !== 'osac')
const loading = computed(() => isProjectRoster.value ? projectRosterLoading.value : orgLoading.value)
const isInAppMode = computed(() => !isProjectRoster.value && rosterData.value?.teamDataSource === 'in-app')
const displayedPeopleCount = computed(() => isProjectRoster.value ? uniqueMemberCount.value : orgTotalPeople.value)
const projectRosterStatus = computed(() => {
  const availability = rosterData.value?.availability
  if (availability === 'available') return 'Supported'
  if (availability === 'empty') return 'Empty'
  if (availability === 'unavailable') return 'Unavailable'
  return ''
})
const projectRosterUpdatedAt = computed(() => rosterData.value?.publication?.generatedAt || null)
const projectTeams = computed(() => {
  if (!isProjectRoster.value || !Array.isArray(rosterData.value?.orgs)) return []
  return rosterData.value.orgs.flatMap(org =>
    Object.entries(org.teams || {}).map(([key, team]) => ({
      key: `${org.key}::${key}`,
      name: team.displayName || key,
      org: org.displayName || projectId.value,
      memberCount: Array.isArray(team.members) ? team.members.length : 0,
      members: Array.isArray(team.members) ? team.members : [],
      metadata: team.metadata || {}
    }))
  )
})

const { definitions, fetchDefinitions } = useFieldDefinitions()

const teamFieldDefs = computed(() =>
  isProjectRoster.value
    ? []
    : (definitions.value.teamFields || []).filter(f => f.visible && !f.deleted && f.type === 'constrained')
)

const {
  activeFilters: teamActiveFilters,
  setFilter: setTeamFilter,
  clearFilter: clearTeamFilter,
  clearAll: clearAllTeamFilters,
  filtered: teamFieldFiltered,
  filterCounts: teamFilterCounts
} = useFieldFilters(
  filteredTeams,
  teamFieldDefs,
  (team) => team.metadata || {}
)

const displayedTeams = computed(() => teamFieldFiltered.value)

const visibleTeams = computed(() => {
  if (!isProjectRoster.value) return displayedTeams.value

  const query = searchQuery.value.trim().toLowerCase()
  let result = projectTeams.value.filter(team => {
    if (!query) return true
    return team.name.toLowerCase().includes(query)
      || team.members.some(member => (member.jiraDisplayName || member.name || '').toLowerCase().includes(query))
  })

  if (sortBy.value === 'headcount') {
    result = [...result].sort((a, b) => b.memberCount - a.memberCount || a.name.localeCompare(b.name))
  } else if (sortBy.value === 'rfe') {
    result = [...result].sort((a, b) => a.name.localeCompare(b.name))
  } else {
    result = [...result].sort((a, b) => a.name.localeCompare(b.name))
  }
  return result
})

const projectRosterUnavailable = computed(() =>
  isProjectRoster.value
  && !loading.value
  && (Boolean(projectRosterError.value) || rosterData.value?.availability === 'unavailable')
)

function openTeam(team) {
  if (isProjectRoster.value) {
    const expanded = new Set(expandedTeamKeys.value)
    if (expanded.has(team.key)) expanded.delete(team.key)
    else expanded.add(team.key)
    expandedTeamKeys.value = expanded
    return
  }
  nav.navigateTo('team-detail', { teamKey: `${team.org}::${team.name}` })
}

function selectOrg(org) {
  selectedOrg.value = org
  loadTeams(org)
}

async function loadDirectoryData() {
  if (isProjectRoster.value) {
    await loadRoster()
    return
  }

  const orgParam = nav.params.value?.org || selectedOrg.value
  await Promise.all([loadTeams(orgParam || undefined), loadOrgs(), fetchDefinitions()])

  if (nav.params.value?.org) {
    selectedOrg.value = nav.params.value.org
  }
}

onMounted(loadDirectoryData)
watch(projectId, () => {
  if (isProjectRoster.value) {
    sortBy.value = 'name'
    expandedTeamKeys.value = new Set()
  }
  loadDirectoryData()
})
</script>

<template>
  <div>
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
      <div>
        <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100">Team Directory</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ visibleTeams.length }} teams · {{ displayedPeopleCount }} people</p>
        <p v-if="isProjectRoster" class="mt-1 text-xs text-gray-400 dark:text-gray-500">
          {{ projectRosterStatus || (projectRosterError ? 'Unavailable' : 'Loading') }}
          <span v-if="projectRosterUpdatedAt"> · Updated {{ new Date(projectRosterUpdatedAt).toLocaleString() }}</span>
        </p>
      </div>
      <div class="flex items-center gap-3">
        <div class="relative">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search teams..."
            class="w-64 pl-4 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        <select v-model="sortBy" class="h-[38px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
          <option value="name">A–Z</option>
          <option value="headcount">Headcount</option>
          <option v-if="!isProjectRoster" value="rfe">PRD Count</option>
        </select>
      </div>
    </div>

    <OrgSelector
      v-if="!isProjectRoster && orgs.length > 1"
      :orgs="orgs"
      :model-value="selectedOrg"
      @select="selectOrg"
      class="mb-6"
    />

    <!-- Team field filters -->
    <div v-if="!isProjectRoster && teamFieldDefs.length > 0 && !loading" class="mb-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <FieldFilterPanel
        :field-definitions="teamFieldDefs"
        :active-filters="teamActiveFilters"
        :filter-counts="teamFilterCounts"
        @update:filter="({ fieldId, values }) => setTeamFilter(fieldId, values)"
        @clear:filter="clearTeamFilter"
        @clear:all="clearAllTeamFilters"
      />
    </div>

    <!-- Unassigned people banner -->
    <div v-if="!isProjectRoster && unassigned.length > 0 && !loading" class="mb-6 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-lg">
      <button
        @click="unassignedExpanded = !unassignedExpanded"
        class="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div class="flex items-center gap-2">
          <svg class="h-4 w-4 text-amber-500 dark:text-amber-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span class="text-sm font-medium text-amber-800 dark:text-amber-300">
            {{ unassigned.length }} {{ unassigned.length === 1 ? 'person' : 'people' }} not assigned to any team
          </span>
        </div>
        <svg
          class="h-4 w-4 text-amber-500 dark:text-amber-400 transition-transform"
          :class="{ 'rotate-180': unassignedExpanded }"
          xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div v-if="unassignedExpanded" class="px-4 pb-3">
        <div class="flex flex-wrap gap-2">
          <button
            v-for="person in unassigned"
            :key="person.name"
            class="inline-flex items-center px-2.5 py-1 rounded-md text-xs bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-800/30 text-gray-700 dark:text-gray-300 hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors"
            :title="[person.title, person.org].filter(Boolean).join(' · ')"
            @click="nav.navigateTo('person-detail', person.uid ? { uid: person.uid } : { person: person.name })"
          >
            {{ person.name }}
          </button>
        </div>
        <button
          v-if="isAdmin && isInAppMode"
          @click="nav.navigateTo('unassigned')"
          class="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 rounded-md hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
        >
          <svg class="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          Manage Unassigned
        </button>
      </div>
    </div>

    <div v-if="loading" class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
    </div>

    <div v-else-if="projectRosterUnavailable" class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center" role="status">
      <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">Team roster unavailable</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400">{{ projectRosterError || rosterData?.reason || 'No current roster publication is available for this project.' }}</p>
    </div>

    <div v-else-if="visibleTeams.length === 0" class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
      <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">No Teams Found</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        {{ isProjectRoster ? 'The published roster has no teams or no team matches this search.' : 'Try a different search or org filter.' }}
      </p>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div v-for="team in visibleTeams" :key="`${team.org}::${team.name}`">
        <TeamCard
          :team="team"
          @select="openTeam(team)"
        />
        <div v-if="isProjectRoster && expandedTeamKeys.has(team.key)" class="mt-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <h3 class="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Members</h3>
          <ul v-if="team.members.length" class="space-y-1">
            <li v-for="(member, index) in team.members" :key="`${member.jiraDisplayName || member.name}-${index}`" class="text-sm text-gray-600 dark:text-gray-300">
              {{ member.jiraDisplayName || member.name }}
            </li>
          </ul>
          <p v-else class="text-sm text-gray-500 dark:text-gray-400">No active members are published for this team.</p>
        </div>
      </div>
    </div>
  </div>
</template>

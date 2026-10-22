<template>
  <div>
    <template v-if="isProjectMode">
      <div class="mb-6">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">{{ projectId }} Dashboard</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Project summary</p>
      </div>

      <div v-if="projectLoading" class="flex items-center justify-center py-12">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>

      <div v-else-if="projectUnavailable" class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
        <p class="text-red-700 dark:text-red-400 text-sm">No current roster publication is available for this project.</p>
      </div>

      <template v-else-if="projectRoster">
        <div v-if="projectEmpty" class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center">
          <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">No Active People Published</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400">The published project roster has no active people yet.</p>
        </div>

        <template v-else>
          <!-- Stats cards -->
          <div class="grid grid-cols-2 gap-4 mb-8">
            <button
              @click="goToTeamDirectory"
              class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-sm transition-all"
            >
              <p class="text-3xl font-bold text-primary-600">{{ projectTeamCount }}</p>
              <p class="text-sm text-gray-500 dark:text-gray-400">Teams</p>
            </button>
            <button
              @click="goToPeople"
              class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-sm transition-all"
            >
              <p class="text-3xl font-bold text-primary-600">{{ projectRoleHeadcount.totalHeadcount }}</p>
              <p class="text-sm text-gray-500 dark:text-gray-400">People</p>
            </button>
          </div>

          <!-- Role Breakdown -->
          <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 mb-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Headcount by Role</h3>
            <HeadcountChart :headcount="projectRoleHeadcount" />
          </div>

          <!-- Teams -->
          <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 mb-6">
            <button class="flex items-center gap-2 group mb-4" @click="teamsExpanded = !teamsExpanded">
              <svg
                class="h-4 w-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-transform"
                :class="{ '-rotate-90': !teamsExpanded }"
                xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Teams ({{ projectTeamCount }})</h3>
            </button>
            <div v-if="teamsExpanded" class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                <thead class="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th
                      class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none"
                      @click="toggleSort('name')"
                    >
                      Team <span v-if="teamSort === 'name'">{{ teamSortDir === 'asc' ? '▲' : '▼' }}</span>
                    </th>
                    <th
                      class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none"
                      @click="toggleSort('members')"
                    >
                      Members <span v-if="teamSort === 'members'">{{ teamSortDir === 'asc' ? '▲' : '▼' }}</span>
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                  <tr
                    v-for="t in sortedProjectTeams"
                    :key="t.key"
                    class="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                    @click="goToTeam(t)"
                  >
                    <td class="px-4 py-3">
                      <span class="text-primary-600 hover:text-primary-800 dark:hover:text-primary-400 hover:underline font-medium">{{ t.displayName }}</span>
                    </td>
                    <td class="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{{ t.members.length }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </template>
    </template>
    <template v-else>
    <template v-if="summary">
      <!-- Header -->
      <div class="mb-6">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">{{ summary.org }} Dashboard</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Org-level summary</p>
      </div>
    </template>

    <!-- Org selector -->
    <OrgSelector
      v-if="orgs.length > 0"
      :orgs="orgs"
      :modelValue="selectedOrg"
      @select="handleOrgSelect"
      class="mb-6"
    />

    <!-- No org selected prompt (shouldn't normally show since we auto-load All) -->
    <div v-if="!selectedOrg && !summary && !loading" class="text-center py-12">
      <p class="text-gray-500 dark:text-gray-400">Select an organization to view its dashboard.</p>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
      <p class="text-red-700 dark:text-red-400 text-sm">{{ error }}</p>
    </div>

    <template v-if="summary && !loading && !error">
      <!-- Stats cards -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <button
          @click="goToTeamDirectory"
          class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-sm transition-all"
        >
          <p class="text-3xl font-bold text-primary-600">{{ summary.teamCount }}</p>
          <p class="text-sm text-gray-500 dark:text-gray-400">Teams</p>
        </button>
        <button
          @click="goToPeople"
          class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-sm transition-all"
        >
          <p class="text-3xl font-bold text-primary-600">{{ summary.headcount }}</p>
          <p class="text-sm text-gray-500 dark:text-gray-400">People</p>
        </button>
        <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
          <p class="text-3xl font-bold text-gray-800 dark:text-gray-100">{{ summary.components?.length || 0 }}</p>
          <p class="text-sm text-gray-500 dark:text-gray-400">Components</p>
        </div>
        <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
          <p class="text-3xl font-bold text-amber-600">{{ summary.totalRfeCount || 0 }}</p>
          <p class="text-sm text-gray-500 dark:text-gray-400">Open PRDs</p>
        </div>
      </div>

      <!-- Role Breakdown -->
      <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 mb-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Headcount by Role</h3>
        <HeadcountChart :headcount="roleHeadcount" />
      </div>

      <!-- Teams -->
      <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 mb-6">
        <button class="flex items-center gap-2 group mb-4" @click="teamsExpanded = !teamsExpanded">
          <svg
            class="h-4 w-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-transform"
            :class="{ '-rotate-90': !teamsExpanded }"
            xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Teams</h3>
        </button>
        <div v-if="teamsExpanded" class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
            <thead class="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th
                  class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none"
                  @click="toggleSort('name')"
                >
                  Team <span v-if="teamSort === 'name'">{{ teamSortDir === 'asc' ? '▲' : '▼' }}</span>
                </th>
                <th
                  v-if="isAllView"
                  class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none"
                  @click="toggleSort('org')"
                >
                  Org <span v-if="teamSort === 'org'">{{ teamSortDir === 'asc' ? '▲' : '▼' }}</span>
                </th>
                <th
                  class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none"
                  @click="toggleSort('members')"
                >
                  Members <span v-if="teamSort === 'members'">{{ teamSortDir === 'asc' ? '▲' : '▼' }}</span>
                </th>
                <th
                  class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none"
                  @click="toggleSort('rfe')"
                >
                  Open PRDs <span v-if="teamSort === 'rfe'">{{ teamSortDir === 'asc' ? '▲' : '▼' }}</span>
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              <tr
                v-for="t in sortedTeams"
                :key="(t.org || '') + '::' + t.name"
                class="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                @click="goToTeam(t)"
              >
                <td class="px-4 py-3">
                  <span class="text-primary-600 hover:text-primary-800 dark:hover:text-primary-400 hover:underline font-medium">{{ t.name }}</span>
                </td>
                <td v-if="isAllView" class="px-4 py-3 text-gray-500 dark:text-gray-400 text-sm">{{ t.org }}</td>
                <td class="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{{ t.memberCount }}</td>
                <td class="px-4 py-3 text-right">
                  <span
                    v-if="t.rfeCount > 0"
                    class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/20 text-amber-800 dark:text-amber-400"
                  >
                    {{ t.rfeCount }}
                  </span>
                  <span v-else class="text-gray-400 dark:text-gray-500">0</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- RFE by Component (top 10) -->
      <div v-if="topRfeComponents.length > 0" class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 mb-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Top PRD Backlog by Component</h3>
        <div class="space-y-2">
          <div
            v-for="comp in topRfeComponents"
            :key="comp.name"
            class="flex items-center gap-3"
          >
            <span class="text-sm text-gray-700 dark:text-gray-300 w-48 truncate">{{ comp.name }}</span>
            <div class="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-5 overflow-hidden">
              <div
                class="bg-amber-400 h-full rounded-full"
                :style="{ width: `${(comp.count / maxRfeCount) * 100}%` }"
              ></div>
            </div>
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300 w-10 text-right">{{ comp.count }}</span>
          </div>
        </div>
      </div>

      <!-- Components -->
      <div v-if="summary.components && summary.components.length > 0" class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Components ({{ summary.components.length }})</h3>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="comp in summary.components"
            :key="comp"
            class="inline-flex items-center px-2.5 py-1 rounded text-sm bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
          >
            {{ comp }}
          </span>
        </div>
      </div>
    </template>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject, watch } from 'vue'
import HeadcountChart from '../components/HeadcountChart.vue'
import OrgSelector from '../components/OrgSelector.vue'
import { useOrgRoster } from '../composables/useOrgRoster'
import { useRoster } from '@shared/client/composables/useRoster'
import { useProjectId } from '@shared/client/composables/useProjectId.js'
import { deriveHeadcountByRole } from '../utils/member-resolution'

const nav = inject('moduleNav')
const { loadOrgSummary, loadOrgs, orgs } = useOrgRoster()
const projectId = useProjectId()
const {
  rosterData,
  people: canonicalPeople,
  teams: canonicalTeams,
  loading: canonicalLoading,
  error: canonicalError,
  loadRoster
} = useRoster()

const isProjectMode = computed(() => Boolean(projectId.value) && projectId.value !== 'osac')

const summary = ref(null)
const selectedOrg = ref(null)
const loading = ref(false)
const error = ref(null)
const teamSort = ref('members')
const teamSortDir = ref('desc')
const teamsExpanded = ref(true)

const roleHeadcount = computed(() => {
  if (!summary.value) return {}
  return {
    byRole: summary.value.roleBreakdown || {},
    totalHeadcount: summary.value.headcount || 0
  }
})

const sortedTeams = computed(() => {
  if (!summary.value?.teams) return []
  const dir = teamSortDir.value === 'asc' ? 1 : -1
  return [...summary.value.teams].sort((a, b) => {
    switch (teamSort.value) {
      case 'name': return dir * a.name.localeCompare(b.name)
      case 'org': return dir * (a.org || '').localeCompare(b.org || '')
      case 'members': return dir * ((a.memberCount || 0) - (b.memberCount || 0))
      case 'rfe': return dir * ((a.rfeCount || 0) - (b.rfeCount || 0))
      default: return 0
    }
  })
})

const topRfeComponents = computed(() => {
  if (!summary.value?.rfeByComponent) return []
  return Object.entries(summary.value.rfeByComponent)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
})

const maxRfeCount = computed(() => {
  if (topRfeComponents.value.length === 0) return 1
  return topRfeComponents.value[0].count
})

const isAllView = computed(() => !selectedOrg.value)

// --- Canonical project-mode dashboard, reusing useRoster's project-qualified read model ---

// Gated on a projectId match so a stale fetch from a just-left project never renders.
const projectRoster = computed(() => {
  if (!isProjectMode.value || rosterData.value?.projectId !== projectId.value) return null
  return rosterData.value
})

const projectLoading = computed(() => isProjectMode.value && canonicalLoading.value)

const projectUnavailable = computed(() =>
  isProjectMode.value &&
  !projectLoading.value &&
  (Boolean(canonicalError.value) || projectRoster.value?.availability === 'unavailable')
)

// Each roster person appears once per project, so this is already the unique
// active headcount — including active people with no team (teamIds: []).
const activeProjectPeople = computed(() => {
  if (!projectRoster.value) return []
  return (canonicalPeople.value || []).filter(p => p.active)
})

const projectEmpty = computed(() => Boolean(projectRoster.value) && activeProjectPeople.value.length === 0)

// Shares one derivation with the headcount stat tile so role breakdown and
// total headcount can never disagree.
const projectRoleHeadcount = computed(() => deriveHeadcountByRole(activeProjectPeople.value))

const projectTeamCount = computed(() => (projectRoster.value ? canonicalTeams.value.length : 0))

const sortedProjectTeams = computed(() => {
  if (!projectRoster.value) return []
  const dir = teamSortDir.value === 'asc' ? 1 : -1
  return [...canonicalTeams.value].sort((a, b) =>
    teamSort.value === 'name' ? dir * a.displayName.localeCompare(b.displayName) : dir * (a.members.length - b.members.length)
  )
})

function toggleSort(column) {
  if (teamSort.value === column) {
    teamSortDir.value = teamSortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    teamSort.value = column
    teamSortDir.value = (column === 'name' || column === 'org') ? 'asc' : 'desc'
  }
}

function goToTeamDirectory() {
  nav.navigateTo('home', !isProjectMode.value && selectedOrg.value ? { org: selectedOrg.value } : {})
}

function goToPeople() {
  nav.navigateTo('people', !isProjectMode.value && selectedOrg.value ? { org: selectedOrg.value } : {})
}

function goToTeam(team) {
  if (isProjectMode.value) {
    nav.navigateTo('team-detail', { teamKey: team.key })
    return
  }
  const org = team.org || summary.value.org
  nav.navigateTo('team-detail', { teamKey: `${org}::${team.name}` })
}

async function handleOrgSelect(orgName) {
  selectedOrg.value = orgName
  loading.value = true
  error.value = null
  try {
    // null means "All" — load aggregate via _all
    summary.value = await loadOrgSummary(orgName || '_all')
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function loadLegacyDashboard() {
  await loadOrgs()
  const orgName = nav.params.value?.org
  // Load either the requested org or the aggregate view
  await handleOrgSelect(orgName || null)
}

onMounted(async () => {
  if (isProjectMode.value) {
    await loadRoster()
    return
  }
  await loadLegacyDashboard()
})

watch(projectId, async () => {
  if (isProjectMode.value) {
    teamSort.value = 'members'
    teamSortDir.value = 'desc'
    await loadRoster()
    return
  }
  summary.value = null
  selectedOrg.value = null
  await loadLegacyDashboard()
})
</script>

<script setup>
import { ref, computed, onMounted, inject, watch } from 'vue'
import { apiRequest } from '@shared/client/services/api.js'
import { useProjectId } from '@shared/client/composables/useProjectId.js'
import { useRoster } from '@shared/client/composables/useRoster.js'
import { useFieldDefinitions } from '@shared/client/composables/useFieldDefinitions'
import { useFieldFilters } from '../composables/useFieldFilters'
import FieldFilterPanel from '../components/FieldFilterPanel.vue'

const nav = inject('moduleNav')
const projectId = useProjectId()
const {
  rosterData: projectRosterData,
  error: projectRosterError,
  loadRoster
} = useRoster()

const people = ref([])
const stats = ref(null)
const syncStatus = ref(null)
const orgDisplayNames = ref({})
const loading = ref(true)
const search = ref('')
const selectedOrgs = ref([])
const selectedGeos = ref([])
const projectRosterMessage = ref(null)
let loadSequence = 0
const isProjectRoster = computed(() => Boolean(projectId.value) && projectId.value !== 'osac')
const projectRosterStatus = computed(() => {
  if (!isProjectRoster.value) return ''
  const roster = projectRosterData.value
  if (projectRosterMessage.value || projectRosterError.value) return 'Unavailable'
  if (!roster || roster.projectId !== projectId.value) return loading.value ? 'Loading' : 'Unavailable'
  if (roster.availability === 'available') return 'Supported'
  if (roster.availability === 'empty') return 'Empty'
  if (roster.availability === 'unavailable') return 'Unavailable'
  return 'Unavailable'
})
const projectRosterUpdatedAt = computed(() => {
  if (projectRosterData.value?.projectId !== projectId.value) return null
  return projectRosterData.value?.publication?.generatedAt || null
})
const ORG_TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'engineering', label: 'Engineering' },
  { value: 'auxiliary', label: 'Non-Engineering' }
]

// Temporarily hidden from the type filter; auxiliary profiles/data stay intact for restoration.
const HIDDEN_ORG_TYPES = ['auxiliary']
const visibleOrgTypeOptions = computed(() => ORG_TYPE_OPTIONS.filter(o => !HIDDEN_ORG_TYPES.includes(o.value)))

const selectedOrgType = ref('all')
const sortField = ref('name')
const sortAsc = ref(true)

const { definitions, fetchDefinitions } = useFieldDefinitions()

const personFieldDefs = computed(() =>
  isProjectRoster.value
    ? []
    : (definitions.value.personFields || []).filter(f => f.visible && !f.deleted && f.type === 'constrained')
)

function personKey(person) {
  return person.uid || person.rowKey || person.accountId || person.name
}

// Full unfiltered active people list (for absolute filter counts)
const activePeople = computed(() => people.value.filter(p => p.status === 'active'))

const {
  activeFilters: fieldActiveFilters,
  setFilter: setFieldFilter,
  clearFilter: clearFieldFilter,
  clearAll: clearAllFieldFilters,
  filtered: fieldFiltered,
  filterCounts: fieldFilterCounts
} = useFieldFilters(
  activePeople,
  personFieldDefs,
  (person) => person._appFields || {}
)

async function loadData() {
  const requestId = ++loadSequence
  const requestedProjectId = projectId.value
  const isCurrentRequest = () => requestId === loadSequence && projectId.value === requestedProjectId
  loading.value = true
  projectRosterMessage.value = null

  if (requestedProjectId && requestedProjectId !== 'osac') {
    people.value = []
    stats.value = null
    syncStatus.value = null
    orgDisplayNames.value = {}
    try {
      const roster = await loadRoster()
      if (!isCurrentRequest()) return
      if (!roster || roster.projectId !== requestedProjectId) {
        projectRosterMessage.value = projectRosterError.value || 'Roster response project identity mismatch.'
        return
      }
      if (roster.availability === 'unavailable' || roster.state === 'unavailable') {
        projectRosterMessage.value = roster.reason || 'No current roster publication is available for this project.'
        return
      }
      if (!['available', 'empty'].includes(roster.availability) || !Array.isArray(roster.people)) {
        projectRosterMessage.value = 'The project roster does not provide a people directory.'
        return
      }

      people.value = roster.people.map(person => ({
        rowKey: `${requestedProjectId}:${person.accountId}`,
        accountId: person.accountId,
        name: person.name,
        status: person.status,
        orgRoot: person.orgRoot,
        orgDisplayName: person.orgDisplayName,
        teams: Array.isArray(person.teams) ? person.teams : [],
        _appFields: {}
      }))
      return
    } catch (error) {
      if (isCurrentRequest()) {
        people.value = []
        projectRosterMessage.value = error.message
      }
      return
    } finally {
      if (isCurrentRequest()) loading.value = false
    }
  }

  try {
    const [peopleRes, statsRes, syncRes] = await Promise.all([
      apiRequest('/modules/team-tracker/registry/people'),
      apiRequest('/modules/team-tracker/registry/stats'),
      apiRequest('/modules/team-tracker/ipa/sync/status'),
      fetchDefinitions()
    ])
    if (!isCurrentRequest()) return
    people.value = peopleRes.people || []
    stats.value = statsRes
    syncStatus.value = syncRes
    orgDisplayNames.value = statsRes.orgDisplayNames || {}
  } catch {
    if (isCurrentRequest()) people.value = []
  } finally {
    if (isCurrentRequest()) loading.value = false
  }
}

function orgName(uid) {
  return orgDisplayNames.value[uid] || uid
}

const orgs = computed(() => {
  const set = new Set()
  for (const p of people.value) {
    if (p.orgRoot) set.add(p.orgRoot)
  }
  return Array.from(set)
    .map(uid => ({ uid, name: orgName(uid) }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

const geos = computed(() => {
  const set = new Set()
  for (const p of people.value) {
    if (p.geo) set.add(p.geo)
  }
  return Array.from(set).sort()
})

const filteredStats = computed(() => {
  const list = filtered.value
  const ghCount = list.filter(p => p.github && p.github.username).length
  const glCount = list.filter(p => p.gitlab && p.gitlab.username).length
  return {
    total: list.length,
    github: ghCount,
    gitlab: glCount
  }
})

const filtered = computed(() => {
  // Start with field-filtered set (from full active list with absolute counts)
  const fieldFilteredKeys = new Set(fieldFiltered.value.map(personKey))
  let list = people.value.filter(p => p.status === 'active' && fieldFilteredKeys.has(personKey(p)))

  // orgType filter
  if (selectedOrgType.value !== 'all') {
    const targetType = selectedOrgType.value
    list = list.filter(p => (p.orgType || 'engineering') === targetType)
  }

  if (selectedOrgs.value.length > 0) {
    const orgSet = new Set(selectedOrgs.value)
    list = list.filter(p => orgSet.has(p.orgRoot))
  }
  if (selectedGeos.value.length > 0) {
    const geoSet = new Set(selectedGeos.value)
    list = list.filter(p => geoSet.has(p.geo))
  }
  if (search.value) {
    const term = search.value.toLowerCase()
    list = list.filter(p => {
      const searchable = [
        p.name, p.email, p.uid,
        p.github ? p.github.username : '',
        p.gitlab ? p.gitlab.username : '',
        personTeamDisplay(p)
      ].join(' ').toLowerCase()
      return searchable.includes(term)
    })
  }

  list = [...list].sort((a, b) => {
    let av, bv
    if (sortField.value.startsWith('_field_')) {
      const fieldId = sortField.value.slice(7)
      av = personFieldValue(a, fieldId)
      bv = personFieldValue(b, fieldId)
    } else if (sortField.value === 'orgDisplayName') {
      av = a.orgDisplayName || ''
      bv = b.orgDisplayName || ''
    } else if (sortField.value === 'teams') {
      av = personTeamDisplay(a)
      bv = personTeamDisplay(b)
    } else {
      av = a[sortField.value] || ''
      bv = b[sortField.value] || ''
    }
    const cmp = String(av).localeCompare(String(bv))
    return sortAsc.value ? cmp : -cmp
  })

  return list
})

function personFieldValue(p, fieldId) {
  const val = (p._appFields || {})[fieldId]
  if (Array.isArray(val)) return val.join(', ')
  return val || ''
}

function personTeamDisplay(p) {
  if ((p.orgType || 'engineering') === 'auxiliary') {
    return (p.associatedTeamNames || []).join(', ')
  }
  return (p.teams || []).join(', ')
}

function toggleSort(field) {
  if (sortField.value === field) {
    sortAsc.value = !sortAsc.value
  } else {
    sortField.value = field
    sortAsc.value = true
  }
}

function sortIcon(field) {
  if (sortField.value !== field) return ''
  return sortAsc.value ? ' \u25B2' : ' \u25BC'
}

function openPerson(uid) {
  nav.navigateTo('person-detail', { uid })
}


function exportCsv() {
  const fieldLabels = personFieldDefs.value.map(fd => fd.label)
  const rows = isProjectRoster.value
    ? [['Project', 'Name', 'Team(s)']]
    : [['Org', 'Name', 'UID', 'Email', 'Title', 'Geo', 'Location', 'Team(s)', 'GitHub', 'GitLab', 'Type', ...fieldLabels]]
  for (const p of filtered.value) {
    const fieldValues = personFieldDefs.value.map(fd => personFieldValue(p, fd.id))
    if (isProjectRoster.value) {
      rows.push([p.orgDisplayName || '', p.name, personTeamDisplay(p)])
    } else {
      rows.push([
        p.orgDisplayName || '', p.name, p.uid, p.email, p.title, p.geo || '',
        p.location || '', personTeamDisplay(p),
        p.github ? p.github.username : '', p.gitlab ? p.gitlab.username : '',
        p.orgType || 'engineering', ...fieldValues
      ])
    }
  }
  const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'people-' + new Date().toISOString().slice(0, 10) + '.csv'
  a.click()
  URL.revokeObjectURL(url)
}

onMounted(loadData)
watch(projectId, () => {
  search.value = ''
  selectedOrgs.value = []
  selectedGeos.value = []
  selectedOrgType.value = 'all'
  people.value = []
  stats.value = null
  syncStatus.value = null
  orgDisplayNames.value = {}
  projectRosterMessage.value = null
  loading.value = true
  loadData()
}, { flush: 'sync' })
</script>

<template>
  <div>
    <p v-if="isProjectRoster" class="mb-4 text-xs text-gray-500 dark:text-gray-400" role="status">
      {{ projectRosterStatus }}
      <span v-if="projectRosterUpdatedAt"> · Updated {{ new Date(projectRosterUpdatedAt).toLocaleString() }}</span>
    </p>

    <!-- Stats header -->
    <div v-if="!loading && people.length > 0" class="grid gap-4 mb-6" :class="isProjectRoster ? 'grid-cols-1' : 'grid-cols-3'">
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">{{ filteredStats.total }}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400">People</div>
      </div>
      <div v-if="!isProjectRoster" class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div class="text-2xl font-bold text-green-600">{{ filteredStats.github }} <span class="text-sm font-normal text-gray-400">/ {{ filteredStats.total }}</span></div>
        <div class="text-xs text-gray-500 dark:text-gray-400">GitHub IDs <span class="text-green-600 font-medium">{{ filteredStats.total ? Math.round(filteredStats.github / filteredStats.total * 100) : 0 }}%</span></div>
      </div>
      <div v-if="!isProjectRoster" class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div class="text-2xl font-bold text-orange-600">{{ filteredStats.gitlab }} <span class="text-sm font-normal text-gray-400">/ {{ filteredStats.total }}</span></div>
        <div class="text-xs text-gray-500 dark:text-gray-400">GitLab IDs <span class="text-orange-600 font-medium">{{ filteredStats.total ? Math.round(filteredStats.gitlab / filteredStats.total * 100) : 0 }}%</span></div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="!loading && people.length === 0" class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
      <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
        {{ isProjectRoster && projectRosterStatus === 'Unavailable' ? 'People roster unavailable' : isProjectRoster ? 'No People Published' : 'No People Yet' }}
      </h3>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        {{ isProjectRoster ? (projectRosterMessage || 'The published project roster has no active people.') : 'Configure IPA org roots and run a sync in the module settings to populate the registry.' }}
      </p>
    </div>

    <!-- Search + Filters + Table -->
    <div v-else-if="!loading" class="space-y-4">
      <div class="flex flex-col sm:flex-row gap-3">
        <div class="flex-1 relative">
        <input
          v-model="search"
          type="text"
          :placeholder="isProjectRoster ? 'Search by name or team...' : 'Search by name, email, UID, GitHub, or GitLab...'"
            class="w-full pl-4 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        <button @click="exportCsv" class="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex-shrink-0">Export CSV</button>
      </div>

      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 flex flex-wrap items-start gap-6">
        <!-- Type filter -->
        <div v-if="!isProjectRoster">
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Type</label>
          <div class="flex gap-1">
            <button
              v-for="opt in visibleOrgTypeOptions"
              :key="opt.value"
              @click="selectedOrgType = opt.value"
              class="px-2.5 py-1 text-xs rounded-md border transition-colors"
              :class="selectedOrgType === opt.value
                ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300 font-medium'
                : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'"
            >{{ opt.label }}</button>
          </div>
        </div>

        <!-- Orgs -->
        <div v-if="!isProjectRoster && orgs.length > 0">
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Orgs</label>
          <div class="space-y-1 max-h-48 overflow-y-auto">
            <label
              v-for="org in orgs"
              :key="org.uid"
              class="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
            >
              <input
                type="checkbox"
                :value="org.uid"
                v-model="selectedOrgs"
                class="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
              />
              <span class="text-sm text-gray-700 dark:text-gray-300">{{ org.name }}</span>
            </label>
          </div>
        </div>

        <!-- Geos -->
        <div v-if="!isProjectRoster && geos.length > 0">
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">Geo</label>
          <div class="space-y-1 max-h-48 overflow-y-auto">
            <label
              v-for="geo in geos"
              :key="geo"
              class="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
            >
              <input
                type="checkbox"
                :value="geo"
                v-model="selectedGeos"
                class="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
              />
              <span class="text-sm text-gray-700 dark:text-gray-300">{{ geo }}</span>
            </label>
          </div>
        </div>

        <!-- Custom field filters -->
        <FieldFilterPanel
          v-if="personFieldDefs.length > 0"
          :field-definitions="personFieldDefs"
          :active-filters="fieldActiveFilters"
          :filter-counts="fieldFilterCounts"
          @update:filter="({ fieldId, values }) => setFieldFilter(fieldId, values)"
          @clear:filter="clearFieldFilter"
          @clear:all="clearAllFieldFilters"
        />

        <span class="text-sm text-gray-500 dark:text-gray-400 self-center ml-auto">{{ filtered.length }} results</span>
      </div>

      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th @click="toggleSort('orgDisplayName')" class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-200">{{ isProjectRoster ? 'Project' : 'Org' }}{{ sortIcon('orgDisplayName') }}</th>
                <th @click="toggleSort('name')" class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-200">Name{{ sortIcon('name') }}</th>
                <th v-if="!isProjectRoster" @click="toggleSort('title')" class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 hidden md:table-cell">Title{{ sortIcon('title') }}</th>
                <th v-if="!isProjectRoster" @click="toggleSort('geo')" class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 hidden lg:table-cell">Geo{{ sortIcon('geo') }}</th>
                <th v-if="!isProjectRoster" @click="toggleSort('location')" class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 hidden lg:table-cell">Location{{ sortIcon('location') }}</th>
                <th @click="toggleSort('teams')" class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-200" :class="isProjectRoster ? '' : 'hidden md:table-cell'">Team(s){{ sortIcon('teams') }}</th>
                <th
                  v-for="fd in personFieldDefs"
                  :key="fd.id"
                  @click="toggleSort('_field_' + fd.id)"
                  class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 hidden lg:table-cell"
                >{{ fd.label }}{{ sortIcon('_field_' + fd.id) }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              <tr
                v-for="p in filtered"
                :key="personKey(p)"
                class="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                :class="isProjectRoster ? '' : 'cursor-pointer'"
                @click="!isProjectRoster && openPerson(p.uid)"
              >
                <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{{ p.orgDisplayName }}</td>
                <td class="px-4 py-3">
                  <span class="text-sm font-medium" :class="isProjectRoster ? 'text-gray-900 dark:text-gray-100' : 'text-primary-600 dark:text-primary-400 hover:underline'">{{ p.name }}</span>
                </td>
                <td v-if="!isProjectRoster" class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hidden md:table-cell">{{ p.title }}</td>
                <td v-if="!isProjectRoster" class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hidden lg:table-cell">{{ p.geo }}</td>
                <td v-if="!isProjectRoster" class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hidden lg:table-cell">{{ p.location }}</td>
                <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400" :class="isProjectRoster ? '' : 'hidden md:table-cell'">{{ personTeamDisplay(p) || '\u2014' }}</td>
                <td
                  v-for="fd in personFieldDefs"
                  :key="fd.id"
                  class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hidden lg:table-cell"
                >{{ personFieldValue(p, fd.id) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div v-if="loading" class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
    </div>
  </div>
</template>

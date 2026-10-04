<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useAuth } from '@shared/client/composables/useAuth.js'
import { useVersions, useEpicsByRelease } from '../composables/useFeatureTraffic'
import {
  useComponentStatusFilter,
  collectComponentOptions,
  collectStatusOptions,
  collectTeamOptions,
  collectAssigneeOptions,
  matchesComponents,
  matchesStatus,
  matchesTeam,
  matchesAssignee
} from '../composables/useComponentStatusFilter'
import StatusBadge from '../components/StatusBadge.vue'
import EpicBreakdown from '../components/EpicBreakdown.vue'
import ComponentStatusFilterBar from '../components/ComponentStatusFilterBar.vue'

const { versions, loadVersions } = useVersions()
const { features, fetchedAt, loading, error, loadEpicsByRelease } = useEpicsByRelease()
const {
  selectedComponents,
  selectedStatuses,
  selectedTeams,
  selectedAssignees,
  toggleComponent,
  toggleStatus,
  toggleTeam,
  toggleAssignee,
  setAssignees,
  clearFilters,
  isFiltered
} = useComponentStatusFilter()

const { user } = useAuth()
// Hidden when no reliable jiraDisplayName is resolved for the current user — never guessed client-side.
const meAssignee = computed(() => user.value?.jiraDisplayName || null)

function selectMeAssignee() {
  if (meAssignee.value) setAssignees([meAssignee.value])
}

const selectedVersion = ref('')

function formatDate(iso) {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString()
}

// Options reflect the full tree for the selected release, independent of the
// current filter selection, so narrowing one field never hides options for the other.
const componentOptions = computed(() => {
  const items = []
  for (const f of features.value) {
    items.push(f)
    for (const e of f.epics) items.push(e)
  }
  return collectComponentOptions(items, item => item.components)
})

const statusOptions = computed(() => {
  const items = []
  for (const f of features.value) {
    items.push(f)
    for (const e of f.epics) items.push(e)
  }
  return collectStatusOptions(items, item => item.status)
})

// Team lives only on the Feature (the generated contract has no per-Epic Team), so
// options are sourced from Features alone rather than the Feature+Epic union above.
const teamOptions = computed(() => collectTeamOptions(features.value, f => f.team))

// Assignee is the direct epic.assignee only — no Feature-level assignee exists, so
// options are sourced from Epics alone (never the Feature, never a rollup).
const assigneeOptions = computed(() => {
  const items = []
  for (const f of features.value) items.push(...f.epics)
  return collectAssigneeOptions(items, e => e.assignee)
})

// A Feature stays visible when it, or at least one of its Epics, matches the active
// Component/Status filters — only the matching Epics are shown under it (mirrors how a
// context Feature already narrows to its directly-matching Epic(s) rather than its full
// sibling list). Team has no per-Epic value, so it gates the whole Feature (and its
// Epics) up front rather than joining the Component/Status OR-across-hierarchy check.
const filteredFeatures = computed(() => {
  if (!isFiltered.value) {
    return features.value.map(feature => ({ ...feature, directEpicCount: feature.epics.length }))
  }
  const result = []
  for (const feature of features.value) {
    if (!matchesTeam(feature.team, selectedTeams.value)) continue
    const matchingEpics = feature.epics.filter(e =>
      matchesComponents(e.components, selectedComponents.value) &&
      matchesStatus(e.status, selectedStatuses.value) &&
      matchesAssignee(e.assignee, selectedAssignees.value)
    )
    const featureMatchesComponentStatus =
      matchesComponents(feature.components, selectedComponents.value) &&
      matchesStatus(feature.status, selectedStatuses.value)
    // Assignee has no Feature-level equivalent, so an active Assignee filter can only be
    // satisfied by a matching Epic — the Feature itself never counts as a match for it.
    const assigneeFilterActive = selectedAssignees.value.length > 0
    const featureMatches = featureMatchesComponentStatus && !assigneeFilterActive
    if (!featureMatches && matchingEpics.length === 0) continue
    // directEpicCount preserves the release-context Epic count (pre-filter) so the
    // caption never attributes Component/Status-filter narrowing to version context.
    result.push({ ...feature, epics: matchingEpics, directEpicCount: feature.epics.length })
  }
  return result
})

watch(selectedVersion, (v) => {
  clearFilters()
  loadEpicsByRelease(v)
})

onMounted(async () => {
  await loadVersions('epics')
  if (versions.value.length > 0 && !selectedVersion.value) {
    selectedVersion.value = versions.value[0]
  }
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">Epics by Release</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Release &rarr; Feature &rarr; Epics, grouped by the Feature's Fix Version. A Feature may
          also appear as <strong>context</strong> when one of its Epics is directly assigned to this
          milestone even though the Feature's own Fix Version is different — its real Fix Version is
          shown as-is, and only the matching Epic(s) are listed.
          <span v-if="fetchedAt" class="ml-2">&middot; Data from {{ formatDate(fetchedAt) }}</span>
        </p>
      </div>

      <div class="flex items-center gap-2">
        <label for="epics-by-release-version" class="text-sm font-medium text-gray-700 dark:text-gray-300">Release:</label>
        <select
          id="epics-by-release-version"
          v-model="selectedVersion"
          class="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
        >
          <option v-if="versions.length === 0" value="">No releases available</option>
          <option v-for="v in versions" :key="v" :value="v">{{ v }}</option>
        </select>
      </div>
    </div>

    <ComponentStatusFilterBar
      v-if="!loading && features.length > 0"
      :component-options="componentOptions"
      :status-options="statusOptions"
      :team-options="teamOptions"
      :assignee-options="assigneeOptions"
      :selected-components="selectedComponents"
      :selected-statuses="selectedStatuses"
      :selected-teams="selectedTeams"
      :selected-assignees="selectedAssignees"
      :me-assignee="meAssignee"
      @toggle-component="toggleComponent"
      @toggle-status="toggleStatus"
      @toggle-team="toggleTeam"
      @toggle-assignee="toggleAssignee"
      @set-assignee-me="selectMeAssignee"
      @clear="clearFilters"
    />

    <!-- Error -->
    <div v-if="error" class="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-4 text-red-700 dark:text-red-400 text-sm">
      {{ error }}
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-12 text-gray-500 dark:text-gray-400">
      Loading epics for {{ selectedVersion }}...
    </div>

    <template v-else>
      <div v-if="!selectedVersion" class="text-center py-12 text-gray-500 dark:text-gray-400">
        Select a release to view its Features and Epics.
      </div>

      <div v-else-if="features.length === 0" class="text-center py-12 text-gray-500 dark:text-gray-400">
        No Features found for release {{ selectedVersion }}.
      </div>

      <div v-else-if="filteredFeatures.length === 0" class="text-center py-12 text-gray-500 dark:text-gray-400">
        No Features match the current filters.
      </div>

      <div v-else class="space-y-5">
        <div
          v-for="feature in filteredFeatures"
          :key="feature.key"
          class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
        >
          <!-- Feature header -->
          <div class="px-4 py-3 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <a
                :href="'https://redhat.atlassian.net/browse/' + feature.key"
                target="_blank"
                class="text-primary-600 dark:text-blue-400 hover:underline font-mono text-xs font-semibold flex-shrink-0"
              >{{ feature.key }}</a>
              <StatusBadge :status="feature.status" />
              <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{{ feature.summary }}</h3>
              <span
                v-if="feature.isContext"
                class="px-1.5 py-0.5 rounded text-[9px] font-medium italic bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 flex-shrink-0"
                :title="'This Feature is assigned to ' + (feature.fixVersions.join(', ') || 'no Fix Version') + ', but has an Epic directly assigned to ' + selectedVersion"
              >context</span>
            </div>
            <div class="flex items-center gap-1.5 flex-shrink-0">
              <span
                v-for="v in feature.fixVersions"
                :key="v"
                class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400"
                :title="feature.isContext ? 'Feature\'s real Fix Version — not relabeled to ' + selectedVersion : undefined"
              >{{ v }}</span>
            </div>
          </div>

          <div v-if="feature.isContext" class="px-4 pt-2 text-xs text-gray-500 dark:text-gray-400">
            Showing {{ feature.directEpicCount }} of {{ feature.totalEpicCount }} Epic{{ feature.totalEpicCount === 1 ? '' : 's' }}
            &mdash; only the one{{ feature.directEpicCount === 1 ? '' : 's' }} directly assigned to {{ selectedVersion }}.
            See Feature Detail for the rest.
            <span v-if="isFiltered && feature.epics.length !== feature.directEpicCount">{{ feature.epics.length }} shown after filters.</span>
          </div>

          <div class="p-3">
            <EpicBreakdown :epics="feature.epics" show-provenance />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

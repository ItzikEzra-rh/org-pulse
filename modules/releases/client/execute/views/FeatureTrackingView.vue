<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useProjectId } from '@shared/client/composables/useProjectId.js'
import { useFeatureTracking } from '../composables/useFeatureTracking.js'
import {
  useComponentStatusFilter,
  collectComponentOptions,
  collectStatusOptions,
  collectTeamOptions,
  teamFilterValue,
  matchesComponents,
  matchesStatus,
  matchesTeam
} from '../composables/useComponentStatusFilter'
import FeatureTrackingTable from '../components/FeatureTrackingTable.vue'
import ComponentStatusFilterBar from '../components/ComponentStatusFilterBar.vue'

const {
  releases,
  trackingData,
  loading,
  error,
  state: trackingState,
  message: trackingMessage,
  partial: trackingPartial,
  indexPartial,
  loadReleases,
  loadTrackingData
} = useFeatureTracking()
const {
  selectedComponents,
  selectedStatuses,
  selectedTeams,
  toggleComponent,
  toggleStatus,
  toggleTeam,
  clearFilters: clearComponentStatusFilters,
  isFiltered: isComponentStatusFiltered
} = useComponentStatusFilter()

const selectedReleaseId = ref(null)
const activeFilter = ref(null)
const projectId = useProjectId()

const releaseNames = computed(() => {
  var map = {}
  for (var i = 0; i < releases.value.length; i++) {
    map[releases.value[i].releaseId] = releases.value[i].displayName
  }
  return map
})

const currentData = computed(() => trackingData.value)
const features = computed(() => (currentData.value && currentData.value.features) || [])
const counts = computed(() => (currentData.value && currentData.value.counts) || null)
const hasUnknownTeam = computed(() => features.value.some(f => f.coverage?.team === 'unknown' || f.coverage?.team === 'unavailable'))
const canRenderTrackingData = computed(() => currentData.value && Array.isArray(currentData.value.features))
const baselineDate = computed(() => currentData.value ? currentData.value.baselineDate : null)
const baselineSource = computed(() => currentData.value ? (currentData.value.baselineSource || 'unknown') : null)
const wasQueryFailed = computed(() => !!(currentData.value && currentData.value.wasQueryFailed))
const baselineNotYetReached = computed(() => {
  if (!baselineDate.value) return false
  return new Date(baselineDate.value + 'T00:00:00') > new Date()
})

// Only a successful collection, with a resolvable and already-reached baseline, and
// no active filter, can confidently be read as "this release genuinely has no
// Feature-level scope" rather than a failed/incomplete/not-yet-evaluable collection.
const isGenuineZeroScope = computed(() => {
  if (!canRenderTrackingData.value) return false
  if (activeFilter.value) return false
  if (isComponentStatusFiltered.value) return false
  if (wasQueryFailed.value) return false
  if (baselineSource.value === 'unknown') return false
  if (baselineNotYetReached.value) return false
  return features.value.length === 0
})

// Options reflect the full feature list for the selected release, independent of the
// current filter selection, so narrowing one field never hides options for the other.
const componentOptions = computed(() => collectComponentOptions(features.value, f => f.components))
const statusOptions = computed(() => collectStatusOptions(features.value, f => f.status))
const teamOptions = computed(() => collectTeamOptions(features.value, teamFilterValue))

const tableEmptyMessage = computed(() => {
  return isGenuineZeroScope.value
    ? 'No Feature-level scope was found for this release or milestone.'
    : 'No features match this filter.'
})

const tableEmptyMessageDetail = computed(() => {
  return isGenuineZeroScope.value
    ? 'Epics may still be assigned to this milestone and are shown in Epics by Release.'
    : ''
})

function isKnownCount(value) {
  return Number.isInteger(value) && value >= 0
}

function displayCount(value) {
  return isKnownCount(value) ? value : 'Unknown'
}

function baselineSourceLabel(source) {
  if (source === 'override') return 'manual override'
  if (source === 'unknown' && currentData.value?.scopePolicyState === 'unconfigured') return 'policy not configured'
  if (source === 'unknown') return 'unknown'
  var match = /^releaseStart\+(\d+)d$/.exec(source || '')
  if (match) return 'release start + ' + match[1] + 'd'
  return source || ''
}

const filteredFeatures = computed(() => {
  var result = features.value
  if (activeFilter.value) {
    result = result.filter(function (f) {
      if (activeFilter.value === 'blocker') return f.isBlockerPriority && f.scopeChange !== 'dropped' && f.scopeChange !== 'moved'
      return f.scopeChange === activeFilter.value
    })
  }
  if (isComponentStatusFiltered.value) {
    result = result.filter(function (f) {
      return matchesComponents(f.components, selectedComponents.value) &&
        matchesStatus(f.status, selectedStatuses.value) &&
        matchesTeam(f.team, selectedTeams.value, f.coverage?.team)
    })
  }
  return result
})

function setFilter(type) {
  activeFilter.value = activeFilter.value === type ? null : type
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  var d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function selectRelease(releaseId) {
  selectedReleaseId.value = releaseId
}

watch(selectedReleaseId, async (id) => {
  activeFilter.value = null
  clearComponentStatusFilters()
  if (id) await loadTrackingData(id)
})

onMounted(async () => {
  await loadReleases()
  if (releases.value.length > 0) {
    selectedReleaseId.value = releases.value[0].releaseId
  }
})

watch(projectId, async () => {
  selectedReleaseId.value = null
  activeFilter.value = null
  clearComponentStatusFilters()
  await loadReleases()
  if (releases.value.length > 0) selectedReleaseId.value = releases.value[0].releaseId
}, { flush: 'sync' })
</script>

<template>
  <div>
    <!-- Header -->
    <div class="mb-5">
      <h2 class="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
        <span class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 text-white">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        </span>
        Feature Tracking
      </h2>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1 ml-9">
        Features committed to each release's baseline scope, and what changed since.
      </p>
    </div>

    <!-- Release selector chips -->
    <div v-if="releases.length > 0" class="mb-5">
      <div class="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 ml-0.5">Release</div>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="r in releases"
          :key="r.releaseId"
          @click="selectRelease(r.releaseId)"
          class="relative px-3.5 py-1.5 text-sm font-semibold rounded-full transition-all duration-150"
          :class="selectedReleaseId === r.releaseId
            ? 'bg-primary-600 dark:bg-primary-500 text-white shadow-md shadow-primary-500/25 dark:shadow-primary-500/20 scale-[1.02]'
            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600 hover:text-primary-700 dark:hover:text-primary-300 hover:shadow-sm'"
        >
          {{ r.displayName }}
        </button>
      </div>
    </div>

    <div
      v-if="indexPartial"
      role="status"
      class="mb-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-300"
    >
      Some release tracking artifacts are partial or unavailable. Their counts stay Unknown and their details are labeled unavailable.
    </div>

    <ComponentStatusFilterBar
      v-if="canRenderTrackingData && !loading"
      class="mb-5 rounded-xl border border-gray-200 dark:border-gray-700"
      :component-options="componentOptions"
      :status-options="statusOptions"
      :team-options="teamOptions"
      :selected-components="selectedComponents"
      :selected-statuses="selectedStatuses"
      :selected-teams="selectedTeams"
      @toggle-component="toggleComponent"
      @toggle-status="toggleStatus"
      @toggle-team="toggleTeam"
      @clear="clearComponentStatusFilters"
    />

    <!-- WAS-query-failed warning -->
    <div
      v-if="currentData && trackingPartial"
      role="status"
      class="mb-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-300"
    >
      This release tracking artifact is partial. Values without complete source coverage remain Unknown.
    </div>

    <div
      v-if="canRenderTrackingData && hasUnknownTeam"
      role="status"
      class="mb-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5 text-xs text-gray-600 dark:text-gray-400"
    >
      Team attribution is unknown for some features. The Team filter keeps these rows under Unknown.
    </div>

    <div
      v-if="currentData && wasQueryFailed"
      class="mb-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2"
    >
      <svg class="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
      Dropped/moved feature data for this release may be incomplete — the scope-change query failed during the last data refresh.
    </div>

    <!-- Baseline not yet reached -->
    <div
      v-if="canRenderTrackingData && baselineNotYetReached"
      class="mb-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-2.5 text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2"
    >
      <svg class="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      This release's baseline ({{ formatDate(baselineDate) }}) hasn't been reached yet — scope shown below is provisional and may still change before the freeze.
    </div>

    <!-- Summary cards -->
    <div v-if="canRenderTrackingData && !loading" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
      <div
        @click="setFilter(null)"
        class="relative overflow-hidden bg-white dark:bg-gray-800 rounded-xl border px-4 py-3.5 cursor-pointer transition-all duration-150 hover:shadow-md"
        :class="!activeFilter
          ? 'border-indigo-400 dark:border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-800 shadow-sm'
          : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600'"
      >
        <div class="absolute top-0 left-0 w-1 h-full bg-indigo-500 rounded-l-xl" />
        <div class="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Features</div>
        <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">{{ displayCount(currentData.featureCount) }}</div>
      </div>

      <div class="relative overflow-hidden bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3.5">
        <div class="absolute top-0 left-0 w-1 h-full rounded-l-xl" :class="baselineSource === 'unknown' ? 'bg-gray-400' : 'bg-emerald-500'" />
        <div class="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Baseline</div>
        <div class="text-sm font-bold" :class="baselineSource === 'unknown' ? 'text-gray-400' : 'text-emerald-600 dark:text-emerald-400'">
          {{ baselineDate ? formatDate(baselineDate) : 'Unknown' }}
        </div>
        <div class="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{{ baselineSourceLabel(baselineSource) }}</div>
      </div>

      <div
        v-if="counts"
        @click="isKnownCount(counts.added) && counts.added > 0 ? setFilter('added') : undefined"
        class="relative overflow-hidden bg-white dark:bg-gray-800 rounded-xl border px-4 py-3.5 transition-all duration-150"
        :class="[
          activeFilter === 'added' ? 'border-blue-400 dark:border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800 shadow-sm' : 'border-gray-200 dark:border-gray-700',
          isKnownCount(counts.added) && counts.added > 0 ? 'cursor-pointer hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600' : ''
        ]"
      >
        <div class="absolute top-0 left-0 w-1 h-full bg-blue-500 rounded-l-xl" />
        <div class="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Added</div>
        <div class="text-2xl font-bold" :class="counts.added > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-gray-100'">{{ displayCount(counts.added) }}</div>
      </div>

      <div
        v-if="counts"
        @click="isKnownCount(counts.dropped) && counts.dropped > 0 ? setFilter('dropped') : undefined"
        class="relative overflow-hidden bg-white dark:bg-gray-800 rounded-xl border px-4 py-3.5 transition-all duration-150"
        :class="[
          activeFilter === 'dropped' ? 'border-amber-400 dark:border-amber-500 ring-2 ring-amber-200 dark:ring-amber-800 shadow-sm' : 'border-gray-200 dark:border-gray-700',
          isKnownCount(counts.dropped) && counts.dropped > 0 ? 'cursor-pointer hover:shadow-md hover:border-amber-300 dark:hover:border-amber-600' : ''
        ]"
      >
        <div class="absolute top-0 left-0 w-1 h-full bg-amber-500 rounded-l-xl" />
        <div class="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Dropped</div>
        <div class="text-2xl font-bold" :class="counts.dropped > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100'">{{ displayCount(counts.dropped) }}</div>
      </div>

      <div
        v-if="counts"
        @click="isKnownCount(counts.moved) && counts.moved > 0 ? setFilter('moved') : undefined"
        class="relative overflow-hidden bg-white dark:bg-gray-800 rounded-xl border px-4 py-3.5 transition-all duration-150"
        :class="[
          activeFilter === 'moved' ? 'border-purple-400 dark:border-purple-500 ring-2 ring-purple-200 dark:ring-purple-800 shadow-sm' : 'border-gray-200 dark:border-gray-700',
          isKnownCount(counts.moved) && counts.moved > 0 ? 'cursor-pointer hover:shadow-md hover:border-purple-300 dark:hover:border-purple-600' : ''
        ]"
      >
        <div class="absolute top-0 left-0 w-1 h-full bg-purple-500 rounded-l-xl" />
        <div class="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Moved</div>
        <div class="text-2xl font-bold" :class="counts.moved > 0 ? 'text-purple-600 dark:text-purple-400' : 'text-gray-900 dark:text-gray-100'">{{ displayCount(counts.moved) }}</div>
      </div>

      <div
        v-if="counts && (!isKnownCount(counts.blockerPriority) || counts.blockerPriority > 0)"
        @click="isKnownCount(counts.blockerPriority) ? setFilter('blocker') : undefined"
        class="relative overflow-hidden bg-white dark:bg-gray-800 rounded-xl border px-4 py-3.5 transition-all duration-150"
        :class="activeFilter === 'blocker' ? 'border-red-400 dark:border-red-500 ring-2 ring-red-200 dark:ring-red-800 shadow-sm' : 'border-gray-200 dark:border-gray-700'"
        title="Priority == Blocker (not a live blocked-state signal)"
      >
        <div class="absolute top-0 left-0 w-1 h-full bg-red-500 rounded-l-xl" />
        <div class="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Blocker Priority</div>
        <div class="text-2xl font-bold" :class="isKnownCount(counts.blockerPriority) ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'">{{ displayCount(counts.blockerPriority) }}</div>
      </div>
    </div>

    <!-- Unknown-baseline notice -->
    <div
      v-if="canRenderTrackingData && baselineSource === 'unknown' && currentData.scopePolicyState !== 'unconfigured'"
      class="mb-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5 text-xs text-gray-600 dark:text-gray-400"
    >
      No baseline could be established for this release (no override configured and no release-start date in the registry), so features can't be classified as committed/added/dropped/moved. All {{ currentData.featureCount }} features are shown as scope Unknown.
    </div>

    <div
      v-if="canRenderTrackingData && currentData.scopePolicyState === 'unconfigured'"
      role="status"
      class="mb-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5 text-xs text-gray-600 dark:text-gray-400"
    >
      A scope-baseline policy is not configured for this project. Committed, added, dropped, and moved counts remain Unknown; observed Features are shown with scope Unknown.
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="flex flex-col items-center justify-center py-16 gap-3">
      <svg class="animate-spin h-8 w-8 text-primary-500" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
      <span class="text-sm text-gray-500 dark:text-gray-400">Loading feature tracking data...</span>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-5 py-4 text-sm text-red-700 dark:text-red-400 flex items-start gap-3">
      <svg class="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
      {{ error }}
    </div>

    <!-- Empty state: no releases published yet -->
    <div v-else-if="releases.length === 0" class="text-center py-16 text-gray-400 dark:text-gray-500">
      <svg class="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
      <p class="text-sm font-medium">{{ trackingState === 'unavailable' ? trackingMessage : 'No feature tracking data has been published yet.' }}</p>
    </div>

    <!-- Data table -->
    <div
      v-else-if="currentData && !canRenderTrackingData"
      role="status"
      class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-5 py-4 text-sm text-gray-600 dark:text-gray-300"
    >
      {{ currentData.message || currentData.error?.message || 'Feature tracking data is unavailable for this release.' }}
    </div>

    <template v-else-if="canRenderTrackingData">
      <div
        v-if="activeFilter"
        class="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-gray-50 dark:bg-gray-800/60 text-gray-700 dark:text-gray-300"
      >
        <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        <span>Showing {{ activeFilter === 'blocker' ? 'blocker priority' : activeFilter }} features only</span>
        <button
          @click="setFilter(null)"
          class="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold hover:bg-white/50 dark:hover:bg-gray-800/50 transition-colors"
        >
          Clear filter
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <FeatureTrackingTable
        :features="filteredFeatures"
        :release-names="releaseNames"
        :empty-message="tableEmptyMessage"
        :empty-message-detail="tableEmptyMessageDetail"
      />
    </template>
  </div>
</template>

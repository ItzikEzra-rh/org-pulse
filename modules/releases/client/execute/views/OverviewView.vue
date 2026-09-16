<script setup>
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue'
import { useFeatureTraffic, useFeatureDetail, useVersions } from '../composables/useFeatureTraffic'
import StatusBadge from '../components/StatusBadge.vue'
import AIInfoBubble from '../components/AIInfoBubble.vue'
import FeatureExecutionDrawer from '../components/FeatureExecutionDrawer.vue'
import {
  useComponentStatusFilter,
  collectComponentOptions,
  collectStatusOptions,
  matchesComponents,
  matchesStatus,
  componentDisplayLabel
} from '../composables/useComponentStatusFilter'
import {
  isValidProgressCount,
  executionUnavailableInfo,
  PROGRESS_SUPPORTING_TEXT,
  effectiveExecutionState,
  effectiveExecutionCoverage,
  effectiveExecutionCoverageReason,
  effectiveExecutionIssueCount,
  effectiveDoneExecutionIssueCount
} from '../utils/progress'
import { preparationHelpText } from '../utils/readiness'

const { features, fetchedAt, loading, error, loadFeatures } = useFeatureTraffic()
const { versions, loadVersions } = useVersions()
const {
  feature: detailFeature,
  loading: detailLoading,
  error: detailError,
  loadFeature: loadFeatureDetail
} = useFeatureDetail()
const {
  selectedComponents,
  selectedStatuses,
  toggleComponent,
  toggleStatus,
  clearFilters: clearComponentStatusFilters,
  isFiltered: isComponentStatusFiltered
} = useComponentStatusFilter()

const selectedVersions = ref([])
const selectedExecutionStates = ref([])
const attentionBlockersOnly = ref(false)
const searchQuery = ref('')
const viewMode = ref('board') // 'board' or 'list'

const CLOSED_DROPDOWNS = { version: false, executionState: false, component: false, jiraStatus: false }
const openDropdown = ref({ ...CLOSED_DROPDOWNS })

function toggleDropdown(name) {
  const wasOpen = openDropdown.value[name]
  openDropdown.value = { ...CLOSED_DROPDOWNS, [name]: !wasOpen }
}

function toggleVersion(v) {
  const idx = selectedVersions.value.indexOf(v)
  if (idx >= 0) selectedVersions.value.splice(idx, 1)
  else selectedVersions.value.push(v)
}

function toggleExecutionState(v) {
  const idx = selectedExecutionStates.value.indexOf(v)
  if (idx >= 0) selectedExecutionStates.value.splice(idx, 1)
  else selectedExecutionStates.value.push(v)
}

const versionFilterLabel = computed(() => {
  if (selectedVersions.value.length === 0) return 'All Versions'
  if (selectedVersions.value.length === 1) return selectedVersions.value[0]
  return selectedVersions.value.length + ' versions'
})

function multiFilterLabel(selectedLabels, allLabel) {
  if (!selectedLabels || selectedLabels.length === 0) return allLabel
  if (selectedLabels.length === 1) return selectedLabels[0]
  return selectedLabels.length + ' selected'
}
const componentFilterLabel = computed(() => multiFilterLabel(selectedComponents.value.map(componentDisplayLabel), 'All components'))
const jiraStatusFilterLabel = computed(() => multiFilterLabel(selectedStatuses.value, 'All statuses'))

const EXECUTION_STATE_FILTER_OPTIONS = [
  { value: 'no-tracked-work', label: 'No Tracked Work' },
  { value: 'not-started', label: 'Not Started' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'complete', label: 'Complete' },
  { value: 'unavailable', label: 'Execution Data Unavailable' }
]
const allowedExecutionStateFilterIds = new Set(EXECUTION_STATE_FILTER_OPTIONS.map(o => o.value))

const executionStateFilterLabel = computed(() => {
  if (selectedExecutionStates.value.length === 0) return 'All Execution States'
  if (selectedExecutionStates.value.length === 1) {
    const opt = EXECUTION_STATE_FILTER_OPTIONS.find(o => o.value === selectedExecutionStates.value[0])
    return opt ? opt.label : selectedExecutionStates.value[0]
  }
  return selectedExecutionStates.value.length + ' states'
})

// Close dropdowns on outside click
function handleOutsideClick(e) {
  if (!e.target.closest('.multi-select-dropdown')) {
    openDropdown.value = { ...CLOSED_DROPDOWNS }
  }
}

// Known executionState values from the producer contract. Anything else — null,
// missing, or an unrecognized value from an older payload — is a coverage
// fallback, never a fabricated lane.
const KNOWN_EXECUTION_STATES = new Set(['no-tracked-work', 'not-started', 'in-progress', 'complete'])
function laneKey(f) {
  const state = effectiveExecutionState(f)
  return KNOWN_EXECUTION_STATES.has(state) ? state : 'unavailable'
}

const LANE_META = {
  'no-tracked-work': {
    title: 'No Tracked Work',
    subtitle: 'No observed execution scope',
    borderClass: 'border-gray-200 dark:border-gray-700',
    bgClass: 'bg-gray-50 dark:bg-gray-800/40',
    headerBg: 'bg-gray-100 dark:bg-gray-800',
    textClass: 'text-gray-600 dark:text-gray-400',
    dotClass: 'bg-gray-400'
  },
  'not-started': {
    title: 'Not Started',
    subtitle: 'Execution scope observed, no work begun yet',
    borderClass: 'border-slate-300 dark:border-slate-600',
    bgClass: 'bg-slate-50 dark:bg-slate-500/5',
    headerBg: 'bg-slate-100 dark:bg-slate-500/10',
    textClass: 'text-slate-700 dark:text-slate-300',
    dotClass: 'bg-slate-400'
  },
  'in-progress': {
    title: 'In Progress',
    subtitle: 'Execution work under way',
    borderClass: 'border-blue-300 dark:border-blue-500/40',
    bgClass: 'bg-blue-50 dark:bg-blue-500/5',
    headerBg: 'bg-blue-100 dark:bg-blue-500/10',
    textClass: 'text-blue-700 dark:text-blue-400',
    dotClass: 'bg-blue-500'
  },
  complete: {
    title: 'Observed Work Done',
    subtitle: 'All observed execution work is Done, or the Epic was credited complete via its Jira status',
    borderClass: 'border-emerald-300 dark:border-emerald-500/40',
    bgClass: 'bg-emerald-50 dark:bg-emerald-500/5',
    headerBg: 'bg-emerald-100 dark:bg-emerald-500/10',
    textClass: 'text-emerald-700 dark:text-emerald-400',
    dotClass: 'bg-emerald-500'
  },
  unavailable: {
    title: 'Execution Data Unavailable',
    subtitle: 'Execution state could not be determined for these features',
    borderClass: 'border-dashed border-gray-300 dark:border-gray-600',
    bgClass: 'bg-gray-50/60 dark:bg-gray-800/20',
    headerBg: 'bg-gray-100/80 dark:bg-gray-800/60',
    textClass: 'text-gray-500 dark:text-gray-400',
    dotClass: 'bg-gray-300'
  }
}
// Board columns are only the three real execution states; `no-tracked-work`
// and `unavailable` both fold into the separate coverage total instead of
// being columns of their own.
const BOARD_COLUMNS = ['not-started', 'in-progress', 'complete']
const PAGE_SIZE = 12

const READINESS_META = {
  ready: { label: 'Ready', class: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/30' },
  pending: { label: 'Pending', class: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-500/30' },
  unknown: { label: 'Unknown', class: 'bg-gray-100 dark:bg-gray-500/15 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-500/30' },
  'not-applicable': { label: 'N/A', class: 'bg-gray-50 dark:bg-gray-800/40 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700' }
}
function readinessMeta(r, featureKey) {
  const key = READINESS_META[r] ? r : 'unknown'
  return { ...READINESS_META[key], help: preparationHelpText(key, featureKey) }
}

// `complete` is state-driven 100%, not a done/total division — a
// confirmed-complete Epic can have zero actual children (0/0).
function executionSummary(f) {
  const coverage = effectiveExecutionCoverage(f)
  const total = effectiveExecutionIssueCount(f)
  const done = effectiveDoneExecutionIssueCount(f)
  if (coverage === 'available' && effectiveExecutionState(f) === 'complete' &&
      isValidProgressCount(total) && isValidProgressCount(done)) {
    return { kind: 'available', pct: 100, done, total }
  }
  if (coverage === 'available' && isValidProgressCount(total) && isValidProgressCount(done) && total > 0 && done <= total) {
    return { kind: 'available', pct: Math.round((done / total) * 100), done, total }
  }
  const info = executionUnavailableInfo(effectiveExecutionCoverageReason(f))
  return { kind: 'unavailable', caption: info.caption, detail: info.detail }
}

const WITH_PROGRESS_DATA_HELP =
  'Features with collected execution issues that can be used to calculate progress. Includes work that has not started.'
const WITHOUT_PROGRESS_DATA_HELP =
  'Progress cannot be calculated because no execution issues were found, only preparation issues were found, or issue details are missing. This does not necessarily mean work hasn’t started.'

const OVERVIEW_FILTER_STORAGE_KEY = 'releases:feature-list-filters'

function saveOverviewFilters() {
  try {
    sessionStorage.setItem(
      OVERVIEW_FILTER_STORAGE_KEY,
      JSON.stringify({
        selectedVersions: selectedVersions.value,
        selectedExecutionStates: selectedExecutionStates.value,
        selectedComponents: selectedComponents.value,
        selectedStatuses: selectedStatuses.value,
        attentionBlockersOnly: attentionBlockersOnly.value,
        searchQuery: searchQuery.value,
        viewMode: viewMode.value
      })
    )
  } catch {
    /* quota / private mode */
  }
}

function restoreOverviewFilters() {
  try {
    const raw = sessionStorage.getItem(OVERVIEW_FILTER_STORAGE_KEY)
    if (!raw) return
    const o = JSON.parse(raw)
    if (!o || typeof o !== 'object') return

    if (Array.isArray(o.selectedVersions)) {
      selectedVersions.value = o.selectedVersions.filter(v => typeof v === 'string')
    }
    if (Array.isArray(o.selectedExecutionStates)) {
      selectedExecutionStates.value = o.selectedExecutionStates.filter(
        id => typeof id === 'string' && allowedExecutionStateFilterIds.has(id)
      )
    }
    if (Array.isArray(o.selectedComponents)) {
      selectedComponents.value = o.selectedComponents.filter(v => typeof v === 'string')
    }
    if (Array.isArray(o.selectedStatuses)) {
      selectedStatuses.value = o.selectedStatuses.filter(v => typeof v === 'string')
    }
    if (typeof o.attentionBlockersOnly === 'boolean') {
      attentionBlockersOnly.value = o.attentionBlockersOnly
    }
    if (typeof o.searchQuery === 'string') {
      searchQuery.value = o.searchQuery.slice(0, 2000)
    }
    if (o.viewMode === 'list' || o.viewMode === 'board') {
      viewMode.value = o.viewMode
    }
  } catch {
    /* ignore corrupt JSON */
  }
}

watch(
  [selectedVersions, selectedExecutionStates, selectedComponents, selectedStatuses, attentionBlockersOnly, searchQuery, viewMode],
  saveOverviewFilters,
  { deep: true }
)

// Options reflect the full feature list, independent of the current filter
// selection, so narrowing one dimension never hides options for another.
const componentOptions = computed(() => collectComponentOptions(features.value, f => f.components))
const jiraStatusOptions = computed(() => collectStatusOptions(features.value, f => f.statusCategory))

const isAnyFiltered = computed(() =>
  selectedVersions.value.length > 0 ||
  selectedExecutionStates.value.length > 0 ||
  attentionBlockersOnly.value ||
  !!searchQuery.value ||
  isComponentStatusFiltered.value
)

function clearAllFilters() {
  selectedVersions.value = []
  selectedExecutionStates.value = []
  attentionBlockersOnly.value = false
  searchQuery.value = ''
  clearComponentStatusFilters()
}

const filteredFeatures = computed(() => {
  let list = features.value
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(f =>
      f.key.toLowerCase().includes(q) ||
      f.summary.toLowerCase().includes(q)
    )
  }
  if (selectedVersions.value.length > 0) {
    list = list.filter(f => f.fixVersions && f.fixVersions.some(v => selectedVersions.value.includes(v)))
  }
  if (selectedExecutionStates.value.length > 0) {
    list = list.filter(f => selectedExecutionStates.value.includes(laneKey(f)))
  }
  if (isComponentStatusFiltered.value) {
    list = list.filter(f =>
      matchesComponents(f.components, selectedComponents.value) &&
      matchesStatus(f.statusCategory, selectedStatuses.value)
    )
  }
  if (attentionBlockersOnly.value) {
    list = list.filter(f => (f.blockerCount || 0) > 0)
  }
  return list
})

// Precomputed once per feature so Board and List share identical presentation
// logic without recomputing per-cell in the template.
const decoratedFeatures = computed(() => filteredFeatures.value.map(f => ({
  feature: f,
  lane: laneKey(f),
  progress: executionSummary(f),
  readiness: readinessMeta(f.preparationReadiness, f.key)
})))

// Requires both a recognized lane and validated progress, so a known lane
// with invalid counts (or vice versa) lands in coverage, not neither total.
function isBoardEligible(d) {
  return BOARD_COLUMNS.includes(d.lane) && d.progress.kind === 'available'
}

// The three execution columns are rendered as vertically stacked sections.
// `LANE_META`/`laneKey` remain in use by filtering and the List view's
// per-row lane badge.
const boardColumns = computed(() => {
  const buckets = { 'not-started': [], 'in-progress': [], complete: [] }
  for (const d of decoratedFeatures.value) {
    if (isBoardEligible(d)) buckets[d.lane].push(d)
  }
  return BOARD_COLUMNS.map(id => ({ id, ...LANE_META[id], items: buckets[id] }))
})

// Exact complement of board membership.
const coverageFeatures = computed(() =>
  decoratedFeatures.value.filter(d => !isBoardEligible(d))
)
const measurableCount = computed(() => decoratedFeatures.value.length - coverageFeatures.value.length)

const columnPage = ref({ 'not-started': 1, 'in-progress': 1, complete: 1 })
const collapsedColumns = ref(new Set())
const coveragePage = ref(1)
const coveragePanelOpen = ref(false)

// Measured content width, not viewport width — the sidebar can leave a "wide" viewport narrow.
const rootEl = ref(null)
const contentWidth = ref(Infinity)
let contentResizeObserver = null

function updateContentWidth() {
  if (rootEl.value) contentWidth.value = rootEl.value.getBoundingClientRect().width
}

const coverageGridClass = computed(() => {
  if (contentWidth.value < 420) return 'grid-cols-1'
  if (contentWidth.value < 700) return 'grid-cols-2'
  return 'grid-cols-3'
})

// Independent per-column pagination — a presentation slice only, it never
// changes the filtered population or the counts shown in headers/tabs.
function pageSlice(items, page) {
  return items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
}
function pageCount(items) {
  return Math.max(1, Math.ceil(items.length / PAGE_SIZE))
}
function setColumnPage(id, page) {
  columnPage.value = { ...columnPage.value, [id]: page }
}
function toggleColumn(id) {
  const next = new Set(collapsedColumns.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsedColumns.value = next
}

watch(filteredFeatures, () => {
  columnPage.value = { 'not-started': 1, 'in-progress': 1, complete: 1 }
  coveragePage.value = 1
})

const expandedLabelCards = ref(new Set())
function toggleLabelsExpand(key) {
  const next = new Set(expandedLabelCards.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedLabelCards.value = next
}

const selectedFeatureKey = ref(null)
const selectedCard = ref(null)

// event.currentTarget is the accessible details-trigger button when it fired the
// click; explicitly focusing it (rather than relying on click-to-focus, which
// Safari doesn't do for buttons) guarantees useFocusTrap restores focus there on close.
function handleSelect(d, event) {
  if (event && event.currentTarget && typeof event.currentTarget.focus === 'function') {
    event.currentTarget.focus()
  }
  selectedFeatureKey.value = d.feature.key
  selectedCard.value = d
  loadFeatureDetail(d.feature.key)
}

function closeDrawer() {
  selectedFeatureKey.value = null
  selectedCard.value = null
}

function formatDate(iso) {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString()
}

onMounted(() => {
  document.addEventListener('click', handleOutsideClick)
  restoreOverviewFilters()
  loadFeatures()
  loadVersions()
  saveOverviewFilters()

  updateContentWidth()
  if (typeof ResizeObserver !== 'undefined' && rootEl.value) {
    contentResizeObserver = new ResizeObserver(updateContentWidth)
    contentResizeObserver.observe(rootEl.value)
  }
  window.addEventListener('resize', updateContentWidth)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleOutsideClick)
  window.removeEventListener('resize', updateContentWidth)
  contentResizeObserver?.disconnect()
})
</script>

<template>
  <div ref="rootEl" class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">Feature Execution Overview</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Execution status and progress for features in the selected release, based on observed Jira data.
          <span v-if="fetchedAt" class="ml-2">
            &middot; Data from {{ formatDate(fetchedAt) }}
          </span>
          <span v-if="features.length" class="ml-2">
            &middot; {{ filteredFeatures.length }} feature<span v-if="filteredFeatures.length !== 1">s</span><template v-if="filteredFeatures.length !== features.length"> (filtered)</template>
          </span>
        </p>
      </div>
      <!-- View toggle -->
      <div class="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
        <button
          @click="viewMode = 'board'"
          class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
          :class="viewMode === 'board'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
        >Board</button>
        <button
          @click="viewMode = 'list'"
          class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
          :class="viewMode === 'list'
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
        >List</button>
      </div>
    </div>

    <!-- Filter toolbar -->
    <div class="flex flex-wrap gap-3 items-end p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div class="flex flex-col gap-0.5">
        <label for="feature-search" class="text-xs font-medium text-gray-600 dark:text-gray-400">Search</label>
        <input
          id="feature-search"
          v-model="searchQuery"
          type="text"
          placeholder="Search features..."
          class="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
        />
      </div>

      <!-- Multi-select: Versions -->
      <div class="flex flex-col gap-0.5">
        <label class="text-xs font-medium text-gray-600 dark:text-gray-400">Version</label>
        <div class="relative multi-select-dropdown">
          <button
            @click.stop="toggleDropdown('version')"
            class="bg-white dark:bg-gray-800 border rounded-md px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none flex items-center gap-1.5 min-w-[140px]"
            :class="selectedVersions.length > 0
              ? 'border-primary-500 ring-1 ring-primary-500'
              : 'border-gray-300 dark:border-gray-600'"
          >
            <span class="flex-1 text-left truncate">{{ versionFilterLabel }}</span>
            <svg class="w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform" :class="{ 'rotate-180': openDropdown.version }" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
          <div
            v-if="openDropdown.version"
            class="absolute z-20 mt-1 w-56 max-h-60 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-1"
          >
            <label
              v-for="v in versions"
              :key="v"
              class="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-900 dark:text-gray-100"
            >
              <input
                type="checkbox"
                :checked="selectedVersions.includes(v)"
                @change="toggleVersion(v)"
                class="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
              />
              <span class="truncate">{{ v }}</span>
            </label>
            <div v-if="versions.length === 0" class="px-3 py-2 text-xs text-gray-400">No versions available</div>
          </div>
        </div>
      </div>

      <!-- Multi-select: Component -->
      <div v-if="componentOptions.length > 0" class="flex flex-col gap-0.5">
        <label class="text-xs font-medium text-gray-600 dark:text-gray-400">Component</label>
        <div class="relative multi-select-dropdown">
          <button
            @click.stop="toggleDropdown('component')"
            class="bg-white dark:bg-gray-800 border rounded-md px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none flex items-center gap-1.5 min-w-[140px]"
            :class="selectedComponents.length > 0
              ? 'border-primary-500 ring-1 ring-primary-500'
              : 'border-gray-300 dark:border-gray-600'"
          >
            <span class="flex-1 text-left truncate">{{ componentFilterLabel }}</span>
            <svg class="w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform" :class="{ 'rotate-180': openDropdown.component }" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
          <div
            v-if="openDropdown.component"
            class="absolute z-20 mt-1 w-56 max-h-60 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-1"
          >
            <label
              v-for="c in componentOptions"
              :key="c"
              class="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-900 dark:text-gray-100"
            >
              <input
                type="checkbox"
                :checked="selectedComponents.includes(c)"
                @change="toggleComponent(c)"
                class="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
              />
              <span class="truncate">{{ componentDisplayLabel(c) }}</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Multi-select: Execution State -->
      <div class="flex flex-col gap-0.5">
        <label class="text-xs font-medium text-gray-600 dark:text-gray-400">Execution state</label>
        <div class="relative multi-select-dropdown">
          <button
            @click.stop="toggleDropdown('executionState')"
            class="bg-white dark:bg-gray-800 border rounded-md px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none flex items-center gap-1.5 min-w-[160px]"
            title="Execution state reflects observed, normalized Jira issues only; recognized preparation work is excluded."
            :class="selectedExecutionStates.length > 0
              ? 'border-primary-500 ring-1 ring-primary-500'
              : 'border-gray-300 dark:border-gray-600'"
          >
            <span class="flex-1 text-left truncate">{{ executionStateFilterLabel }}</span>
            <svg class="w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform" :class="{ 'rotate-180': openDropdown.executionState }" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
          <div
            v-if="openDropdown.executionState"
            class="absolute z-20 mt-1 w-60 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-1"
          >
            <label
              v-for="opt in EXECUTION_STATE_FILTER_OPTIONS"
              :key="opt.value"
              class="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-900 dark:text-gray-100"
            >
              <input
                type="checkbox"
                :checked="selectedExecutionStates.includes(opt.value)"
                @change="toggleExecutionState(opt.value)"
                class="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
              />
              <span>{{ opt.label }}</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Multi-select: Jira status -->
      <div v-if="jiraStatusOptions.length > 0" class="flex flex-col gap-0.5">
        <label class="text-xs font-medium text-gray-600 dark:text-gray-400">Jira status</label>
        <div class="relative multi-select-dropdown">
          <button
            @click.stop="toggleDropdown('jiraStatus')"
            class="bg-white dark:bg-gray-800 border rounded-md px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none flex items-center gap-1.5 min-w-[140px]"
            :class="selectedStatuses.length > 0
              ? 'border-primary-500 ring-1 ring-primary-500'
              : 'border-gray-300 dark:border-gray-600'"
          >
            <span class="flex-1 text-left truncate">{{ jiraStatusFilterLabel }}</span>
            <svg class="w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform" :class="{ 'rotate-180': openDropdown.jiraStatus }" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
          <div
            v-if="openDropdown.jiraStatus"
            class="absolute z-20 mt-1 w-60 max-h-60 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-1"
          >
            <label
              v-for="s in jiraStatusOptions"
              :key="s"
              class="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer text-sm text-gray-900 dark:text-gray-100"
            >
              <input
                type="checkbox"
                :checked="selectedStatuses.includes(s)"
                @change="toggleStatus(s)"
                class="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
              />
              <span class="truncate">{{ s }}</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Blockers only toggle -->
      <label class="flex items-center gap-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
        <input
          v-model="attentionBlockersOnly"
          type="checkbox"
          class="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
        />
        Blockers only
      </label>

      <button
        v-if="isAnyFiltered"
        class="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white py-1.5"
        @click="clearAllFilters"
      >
        Clear filters
      </button>
    </div>

    <!-- Error -->
    <div v-if="error" class="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-4 text-red-700 dark:text-red-400 text-sm">
      {{ error }}
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-12 text-gray-500">
      Loading feature data...
    </div>

    <template v-else>
      <!-- ===================== BOARD VIEW ===================== -->
      <template v-if="viewMode === 'board'">
        <!-- Data coverage: not additional columns, a separate accounting of the
             filtered population's measurable-vs-not execution progress. -->
        <div class="flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm mb-4">
          <span class="text-gray-600 dark:text-gray-300">
            Features: <strong class="text-gray-900 dark:text-gray-100">{{ filteredFeatures.length }}</strong>
          </span>
          <span class="inline-flex items-center text-gray-600 dark:text-gray-300">
            With progress data: <strong class="text-gray-900 dark:text-gray-100 ml-1">{{ measurableCount }}</strong>
            <AIInfoBubble hoverable :text="WITH_PROGRESS_DATA_HELP" />
          </span>
          <span class="inline-flex items-center">
            <button
              type="button"
              class="text-gray-600 dark:text-gray-300 underline decoration-dotted underline-offset-2 hover:text-gray-900 dark:hover:text-white"
              :aria-expanded="coveragePanelOpen"
              aria-controls="coverage-panel"
              @click="coveragePanelOpen = !coveragePanelOpen"
            >
              Without progress data: <strong class="text-gray-900 dark:text-gray-100">{{ coverageFeatures.length }}</strong>
            </button>
            <AIInfoBubble hoverable :text="WITHOUT_PROGRESS_DATA_HELP" />
          </span>
        </div>

        <div
          v-if="coveragePanelOpen"
          id="coverage-panel"
          class="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/60 dark:bg-gray-800/20 p-3 mb-4"
        >
          <div v-if="coverageFeatures.length === 0" class="text-center py-6 text-gray-500 text-sm">
            No features without measurable execution progress.
          </div>
          <template v-else>
            <div class="grid gap-2" :class="coverageGridClass">
              <div
                v-for="d in pageSlice(coverageFeatures, coveragePage)"
                :key="d.feature.key"
                class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200/80 dark:border-gray-700/80 cursor-pointer hover:shadow-md dark:hover:border-gray-600 transition-all p-3"
                @click="handleSelect(d, $event)"
              >
                <div class="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-1">
                  <div class="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      class="text-primary-600 dark:text-blue-400 font-mono text-xs font-semibold hover:underline focus:outline-none focus:ring-2 focus:ring-primary-500 rounded whitespace-nowrap shrink-0"
                      :aria-label="'Open details for ' + d.feature.key"
                      @click.stop="handleSelect(d, $event)"
                    >{{ d.feature.key }}</button>
                    <span class="inline-flex items-center gap-1">
                      <span class="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Jira status</span>
                      <StatusBadge :status="d.feature.status" />
                    </span>
                  </div>
                  <span class="inline-flex items-center gap-1">
                    <span class="inline-flex items-center text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                      Preparation
                      <AIInfoBubble hoverable v-if="d.readiness.help" :text="d.readiness.help" />
                    </span>
                    <span
                      class="inline-block px-1.5 py-0.5 rounded border text-[10px] font-semibold"
                      :class="d.readiness.class"
                    >{{ d.readiness.label }}</span>
                  </span>
                </div>
                <p class="text-sm text-gray-900 dark:text-gray-100 font-medium leading-snug mb-1">{{ d.feature.summary }}</p>
                <p class="text-xs italic text-gray-500 dark:text-gray-400">{{ d.progress.caption }}</p>
              </div>
            </div>
            <div v-if="pageCount(coverageFeatures) > 1" class="flex items-center justify-center gap-3 mt-3 text-xs text-gray-500 dark:text-gray-400">
              <button
                type="button" class="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40"
                :disabled="coveragePage <= 1" @click="coveragePage--"
              >Prev</button>
              <span>Page {{ coveragePage }} of {{ pageCount(coverageFeatures) }}</span>
              <button
                type="button" class="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40"
                :disabled="coveragePage >= pageCount(coverageFeatures)" @click="coveragePage++"
              >Next</button>
            </div>
          </template>
        </div>

        <!-- Vertically stacked execution sections -->
        <div class="grid grid-cols-1 gap-4">
          <div
            v-for="col in boardColumns"
            :key="col.id"
            class="rounded-lg border overflow-hidden"
            :class="[col.borderClass, col.bgClass]"
          >
            <!-- Collapsible column header -->
            <button
              type="button"
              class="w-full px-4 py-3 flex items-center justify-between text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
              :class="col.headerBg"
              :aria-expanded="!collapsedColumns.has(col.id)"
              :aria-controls="'execution-section-' + col.id"
              @click="toggleColumn(col.id)"
            >
              <div class="flex items-center gap-2">
                <span class="w-3 h-3 rounded-full" :class="col.dotClass" />
                <h3 class="text-sm font-semibold" :class="col.textClass">{{ col.title }}</h3>
                <span class="text-xs font-medium px-1.5 py-0.5 rounded-full bg-white/60 dark:bg-gray-900/30" :class="col.textClass">{{ col.items.length }}</span>
              </div>
              <svg
                class="w-4 h-4 transition-transform"
                :class="{ '-rotate-90': collapsedColumns.has(col.id) }"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              ><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m6 9 6 6 6-6" /></svg>
            </button>

            <div v-show="!collapsedColumns.has(col.id)" :id="'execution-section-' + col.id">
              <div v-if="col.items.length === 0" class="p-4 text-center text-xs text-gray-400 dark:text-gray-500">
                No features
              </div>

              <!-- Feature cards: spread each page across three columns on wide screens -->
              <div v-else class="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              <div
                v-for="d in pageSlice(col.items, columnPage[col.id])"
                :key="d.feature.key"
                class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200/80 dark:border-gray-700/80 cursor-pointer hover:shadow-md dark:hover:border-gray-600 transition-all overflow-hidden"
                @click="handleSelect(d, $event)"
              >
                <!-- Card header -->
                <div class="px-4 pt-3 pb-2">
                  <div class="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-1">
                    <div class="flex items-center gap-2 min-w-0">
                      <button
                        type="button"
                        class="text-primary-600 dark:text-blue-400 font-mono text-xs font-semibold hover:underline focus:outline-none focus:ring-2 focus:ring-primary-500 rounded whitespace-nowrap shrink-0"
                        :aria-label="'Open details for ' + d.feature.key"
                        @click.stop="handleSelect(d, $event)"
                      >{{ d.feature.key }}</button>
                      <span class="inline-flex items-center gap-1">
                        <span class="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Jira status</span>
                        <StatusBadge :status="d.feature.status" />
                      </span>
                    </div>
                    <span class="inline-flex items-center gap-1">
                      <span class="inline-flex items-center text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                        Preparation
                        <AIInfoBubble hoverable v-if="d.readiness.help" :text="d.readiness.help" />
                      </span>
                      <span
                        class="inline-block px-1.5 py-0.5 rounded border text-[10px] font-semibold"
                        :class="d.readiness.class"
                      >{{ d.readiness.label }}</span>
                    </span>
                  </div>
                  <p class="text-sm text-gray-900 dark:text-gray-100 font-medium leading-snug">{{ d.feature.summary }}</p>
                </div>

                <!-- Progress -->
                <div class="px-4 pb-2">
                  <template v-if="d.progress.kind === 'available'">
                    <div class="flex items-center gap-2">
                      <div class="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div class="h-full rounded-full bg-primary-500" :style="{ width: d.progress.pct + '%' }" />
                      </div>
                      <span class="text-xs font-semibold text-gray-600 dark:text-gray-300 w-24 text-right">{{ d.progress.done }}/{{ d.progress.total }} &middot; {{ d.progress.pct }}%</span>
                    </div>
                  </template>
                  <p v-else class="text-xs italic text-gray-400 dark:text-gray-500">{{ d.progress.caption }}</p>
                </div>

                <!-- Counts breakdown -->
                <div class="px-4 pb-2 flex items-center gap-3 text-xs">
                  <span class="text-gray-500 dark:text-gray-400">
                    <span class="font-semibold text-gray-700 dark:text-gray-300">{{ d.feature.epicCount }}</span> Epics
                  </span>
                  <span class="text-gray-300 dark:text-gray-600">|</span>
                  <span class="text-gray-500 dark:text-gray-400" title="Total tracked child issues, including recognized preparation">
                    <span class="font-semibold text-gray-700 dark:text-gray-300">{{ d.feature.issueCount }}</span> Total issues
                  </span>
                  <span v-if="d.feature.blockerCount > 0" class="text-gray-300 dark:text-gray-600">|</span>
                  <span v-if="d.feature.blockerCount > 0" class="text-amber-600 dark:text-amber-400 font-semibold">
                    {{ d.feature.blockerCount }} Blockers
                  </span>
                </div>

                <!-- Footer pills -->
                <div class="px-4 pb-3 flex flex-wrap items-center gap-1.5">
                  <span
                    v-if="d.feature.assignee"
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                  >
                    <svg class="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><circle cx="10" cy="6" r="4"/><path d="M2 17c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                    {{ d.feature.assignee }}
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400"
                  >Unassigned</span>

                  <span
                    v-for="c in (d.feature.components || []).slice(0, 2)"
                    :key="c"
                    class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400"
                  >{{ componentDisplayLabel(c) }}</span>
                  <span
                    v-if="(d.feature.components || []).length > 2"
                    class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                  >+{{ d.feature.components.length - 2 }}</span>

                  <span
                    v-for="v in (d.feature.fixVersions || [])"
                    :key="v"
                    class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400"
                  >{{ v }}</span>

                  <span
                    v-for="l in (d.feature.labels || []).slice(0, 3)"
                    :key="l"
                    class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-teal-100 dark:bg-teal-500/15 text-teal-700 dark:text-teal-400"
                  >{{ l }}</span>
                  <button
                    v-if="(d.feature.labels || []).length > 3 && !expandedLabelCards.has(d.feature.key)"
                    type="button"
                    class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                    :aria-expanded="false"
                    :aria-label="'Show ' + (d.feature.labels.length - 3) + ' more labels'"
                    @click.stop="toggleLabelsExpand(d.feature.key)"
                  >+{{ d.feature.labels.length - 3 }}</button>
                  <template v-if="expandedLabelCards.has(d.feature.key)">
                    <span
                      v-for="l in d.feature.labels.slice(3)"
                      :key="l"
                      class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-teal-100 dark:bg-teal-500/15 text-teal-700 dark:text-teal-400"
                    >{{ l }}</span>
                    <button
                      type="button"
                      class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                      :aria-expanded="true"
                      aria-label="Show fewer labels"
                      @click.stop="toggleLabelsExpand(d.feature.key)"
                    >Less</button>
                  </template>
                </div>
              </div>
              </div>

              <div
                v-if="pageCount(col.items) > 1"
                class="flex items-center justify-center gap-3 py-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200/60 dark:border-gray-700/60"
              >
                <button
                  type="button" class="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40"
                  :disabled="columnPage[col.id] <= 1" @click="setColumnPage(col.id, columnPage[col.id] - 1)"
                >Prev</button>
                <span>Page {{ columnPage[col.id] }} of {{ pageCount(col.items) }}</span>
                <button
                  type="button" class="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40"
                  :disabled="columnPage[col.id] >= pageCount(col.items)" @click="setColumnPage(col.id, columnPage[col.id] + 1)"
                >Next</button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="filteredFeatures.length === 0 && !loading" class="text-center py-12 text-gray-500">
          No features found matching the current filters.
        </div>
      </template>

      <!-- ===================== LIST VIEW ===================== -->
      <template v-if="viewMode === 'list'">
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-200 dark:border-gray-700">
                  <th class="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">Key</th>
                  <th class="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">Summary</th>
                  <th class="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">Jira Status</th>
                  <th class="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">Execution State</th>
                  <th
                    class="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium"
                    :title="PROGRESS_SUPPORTING_TEXT"
                  >Progress</th>
                  <th class="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">Preparation</th>
                  <th class="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">Epics</th>
                  <th
                    class="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium"
                    title="Total tracked child issues, including recognized preparation — a different denominator than Progress"
                  >Total issues</th>
                  <th class="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">Attention</th>
                  <th class="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">Components</th>
                  <th class="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">Version</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="d in decoratedFeatures"
                  :key="d.feature.key"
                  class="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                  @click="handleSelect(d, $event)"
                >
                  <td class="px-3 py-2">
                    <button
                      type="button"
                      class="text-primary-600 dark:text-blue-400 font-mono text-xs hover:underline focus:outline-none focus:ring-2 focus:ring-primary-500 rounded"
                      :aria-label="'Open details for ' + d.feature.key"
                      @click.stop="handleSelect(d, $event)"
                    >{{ d.feature.key }}</button>
                  </td>
                  <td class="px-3 py-2 text-gray-900 dark:text-gray-100 max-w-xs truncate">{{ d.feature.summary }}</td>
                  <td class="px-3 py-2"><StatusBadge :status="d.feature.status" /></td>
                  <td class="px-3 py-2">
                    <span class="inline-flex items-center gap-1.5">
                      <span class="w-2 h-2 rounded-full" :class="LANE_META[d.lane].dotClass" />
                      <span class="text-xs" :class="LANE_META[d.lane].textClass">{{ LANE_META[d.lane].title }}</span>
                    </span>
                  </td>
                  <td class="px-3 py-2 min-w-[150px]">
                    <template v-if="d.progress.kind === 'available'">
                      <div class="flex items-center gap-2">
                        <div class="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div class="h-full rounded-full bg-primary-500" :style="{ width: d.progress.pct + '%' }" />
                        </div>
                        <span class="text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">{{ d.progress.done }}/{{ d.progress.total }} &middot; {{ d.progress.pct }}%</span>
                      </div>
                    </template>
                    <span v-else class="text-xs italic text-gray-400 dark:text-gray-500">{{ d.progress.caption }}</span>
                  </td>
                  <td class="px-3 py-2">
                    <span class="inline-flex items-center gap-1">
                      <span class="inline-block px-1.5 py-0.5 rounded border text-[10px] font-semibold" :class="d.readiness.class">{{ d.readiness.label }}</span>
                      <AIInfoBubble hoverable v-if="d.readiness.help" :text="d.readiness.help" />
                    </span>
                  </td>
                  <td class="px-3 py-2 text-gray-700 dark:text-gray-300">{{ d.feature.epicCount }}</td>
                  <td class="px-3 py-2 text-gray-700 dark:text-gray-300">{{ d.feature.issueCount }}</td>
                  <td class="px-3 py-2">
                    <span v-if="d.feature.blockerCount > 0" class="text-amber-600 dark:text-amber-400 font-medium">{{ d.feature.blockerCount }} Blockers</span>
                    <span v-else class="text-gray-400 dark:text-gray-600">&mdash;</span>
                  </td>
                  <td class="px-3 py-2 max-w-[160px]">
                    <span
                      v-for="c in (d.feature.components || []).slice(0, 2)"
                      :key="c"
                      class="inline-block px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400 text-xs mr-1 mb-1"
                    >{{ componentDisplayLabel(c) }}</span>
                    <span v-if="(d.feature.components || []).length > 2" class="text-xs text-gray-400 dark:text-gray-500">+{{ d.feature.components.length - 2 }}</span>
                    <span v-if="(d.feature.components || []).length === 0" class="text-xs text-gray-400 dark:text-gray-500">Unassigned</span>
                  </td>
                  <td class="px-3 py-2">
                    <span
                      v-for="v in (d.feature.fixVersions || []).slice(0, 2)"
                      :key="v"
                      class="inline-block px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs mr-1"
                    >{{ v }}</span>
                  </td>
                </tr>
                <tr v-if="decoratedFeatures.length === 0">
                  <td colspan="11" class="px-3 py-8 text-center text-gray-500">
                    No features found matching the current filters.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </template>

    <FeatureExecutionDrawer
      :feature-key="selectedFeatureKey"
      :card="selectedCard"
      :detail="detailFeature"
      :loading="detailLoading"
      :error="detailError"
      @close="closeDrawer"
      @retry="loadFeatureDetail(selectedFeatureKey)"
    />
  </div>
</template>

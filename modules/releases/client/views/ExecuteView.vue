<template>
  <p v-if="presentationLoading" class="p-6" role="status">Loading execution configuration…</p>
  <div v-else-if="presentationError" class="p-6" role="alert">{{ presentationError }}</div>
  <div v-else-if="!['supported', 'empty'].includes(presentation?.state) || !presentation?.view" class="p-6" role="status">
    {{ presentation?.message || `Release execution is ${presentation?.state || 'unavailable'} for this project.` }}
  </div>
  <ProjectExecutionEvidenceView v-else-if="presentation.view === 'release-evidence'" />
  <div v-else-if="presentation.view === 'feature-execution'">
    <div class="border-b border-gray-200 dark:border-gray-700">
      <nav class="flex -mb-px px-4" aria-label="Execute sub-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          class="px-4 py-3 text-sm font-medium border-b-2 transition-colors"
          :class="activeTab === tab.id
            ? 'border-primary-500 text-primary-600 dark:text-primary-400'
            : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'"
        >
          {{ tab.label }}
        </button>
      </nav>
    </div>
    <div class="p-6">
      <OverviewView v-if="activeTab === 'feature-list'" />
      <HygieneView v-else-if="activeTab === 'feature-status'" />
      <FeatureTrackingView v-else-if="activeTab === 'feature-tracking'" />
      <EpicsByReleaseView v-else-if="activeTab === 'epics-by-release'" />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, inject, onMounted } from 'vue'
import { apiRequest } from '@shared/client/services/api.js'
import { useProjectId, projectQuery } from '@shared/client/composables/useProjectId.js'
import ProjectExecutionEvidenceView from '../execute/views/ProjectExecutionEvidenceView.vue'
import OverviewView from '../execute/views/OverviewView.vue'
import HygieneView from '../execute/views/HygieneView.vue'
import FeatureTrackingView from '../execute/views/FeatureTrackingView.vue'
import EpicsByReleaseView from '../execute/views/EpicsByReleaseView.vue'

const nav = inject('moduleNav')
const projectId = useProjectId()
const presentation = ref(null)
const presentationLoading = ref(true)
const presentationError = ref(null)
let presentationSequence = 0
async function loadPresentation() {
  const requestedProjectId = projectId.value
  const sequence = ++presentationSequence
  presentation.value = null
  presentationError.value = null
  presentationLoading.value = true
  try {
    const result = await apiRequest(`/modules/releases/execution/presentation${projectQuery(requestedProjectId)}`)
    if (sequence !== presentationSequence || requestedProjectId !== projectId.value) return
    if (requestedProjectId && result?.projectId !== requestedProjectId) throw new Error('Execution configuration project identity mismatch')
    presentation.value = result
  } catch (error) {
    if (sequence === presentationSequence && requestedProjectId === projectId.value) presentationError.value = error.message || 'Execution configuration is unavailable'
  } finally {
    if (sequence === presentationSequence && requestedProjectId === projectId.value) presentationLoading.value = false
  }
}
onMounted(loadPresentation)
watch(projectId, loadPresentation, { flush: 'sync' })

const ALL_TABS = [
  { id: 'feature-list', label: 'Feature List' },
  { id: 'feature-status', label: 'Feature Status' },
  { id: 'feature-tracking', label: 'Feature Tracking' },
  { id: 'epics-by-release', label: 'Epics by Release' },
]

// Temporarily hidden from the tab bar; HygieneView and its panel stay in place for restoration.
const HIDDEN_TAB_IDS = ['feature-status']

const tabs = ALL_TABS.filter(tab => !HIDDEN_TAB_IDS.includes(tab.id))
const VALID_TABS = tabs.map(t => t.id)
const DEFAULT_TAB = 'feature-list'

const activeTab = ref(DEFAULT_TAB)

let updatingFromUrl = false

watch(activeTab, (tab) => {
  if (!updatingFromUrl) {
    nav.updateParams({ tab: tab === DEFAULT_TAB ? undefined : tab })
  }
})

watch(() => nav.params.value?.tab, (tabParam) => {
  const tab = tabParam && VALID_TABS.includes(tabParam) ? tabParam : DEFAULT_TAB
  if (activeTab.value !== tab) {
    updatingFromUrl = true
    activeTab.value = tab
    nextTick(() => { updatingFromUrl = false })
  }
}, { immediate: true })
</script>

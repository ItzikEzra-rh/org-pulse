<script setup>
import { ref, computed, watch, inject } from 'vue'
import { useAIImpact } from '../composables/useAIImpact.js'
import { useAssessments } from '../composables/useAssessments.js'
import { useFeatures } from '../composables/useFeatures.js'
import { PHASES } from '../constants.js'
import PhaseContent from '../components/PhaseContent.vue'
import RFEDetailModal from '../components/RFEDetailModal.vue'
import AIImpactGuide from '../components/AIImpactGuide.vue'

const moduleNav = inject('moduleNav')
const selectedRFE = ref(null)
const notFoundRFE = ref(null)
const timeWindow = ref('month')
const filter = ref('all')
const searchQuery = ref('')
const chartExpanded = ref(true)
const sortBy = ref('default')
const passFailFilter = ref('all')
const priorityFilter = ref('all')
const artifactFilter = ref('all')
const reviewStatusFilter = ref('all')
const componentFilter = ref('all')

const { rfeData, loading, error, load } = useAIImpact(timeWindow)
const { assessments, loadAssessments, loadAssessmentDetail } = useAssessments()
const { features, loadFeatures } = useFeatures()

loadAssessments()
loadFeatures()

const phase = PHASES.find(p => p.id === 'prd-review')
const metrics = computed(() => rfeData.value?.metrics || null)
const trendData = computed(() => rfeData.value?.trendData || [])
const breakdown = computed(() => rfeData.value?.breakdown || [])
const pipelineFriction = computed(() => rfeData.value?.pipelineFriction || null)

const timeWindowCutoff = computed(() => {
  const days = timeWindow.value === 'week' ? 7 : timeWindow.value === '3months' ? 90 : 30
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
})

const isInTimeWindow = rfe => new Date(rfe.created) >= timeWindowCutoff.value

const listRFEs = computed(() => {
  if (!rfeData.value?.issues) return []
  return rfeData.value.issues.filter(rfe => {
    const matchesFilter = filter.value === 'all' ||
      (rfe.status !== 'No PR' && rfe.aiInvolvement === filter.value)
    const q = searchQuery.value.toLowerCase()
    const matchesSearch = !q ||
      rfe.summary.toLowerCase().includes(q) ||
      rfe.key.toLowerCase().includes(q) ||
      (rfe.creatorDisplayName && rfe.creatorDisplayName.toLowerCase().includes(q))
    return matchesFilter && matchesSearch
  })
})

const timeFilteredRFEs = computed(() => {
  return listRFEs.value.filter(isInTimeWindow)
})

// Time-window scoped only, independent of the AI-involvement filter and search box,
// so it stays consistent with the other window-scoped metrics tiles.
const windowedRFEs = computed(() => {
  if (!rfeData.value?.issues) return []
  return rfeData.value.issues.filter(isInTimeWindow)
})

// Reverse lookup: sourceRfe -> feature key/status for cross-linking
const rfeToFeature = computed(() => {
  const map = {}
  for (const f of Object.values(features.value)) {
    if (f.sourceRfe) {
      map[f.sourceRfe] = { key: f.key, summary: f.title, status: f.status || 'Unknown', fixVersions: [] }
    }
  }
  return map
})

// Enrich selected RFE with linkedFeature from features data when Jira link is missing
const enrichedSelectedRFE = computed(() => {
  const rfe = selectedRFE.value
  if (!rfe) return null
  if (rfe.linkedFeature) return rfe
  const featureLink = rfeToFeature.value[rfe.key]
  if (!featureLink) return rfe
  return { ...rfe, linkedFeature: featureLink }
})

const filteredAssessments = computed(() => {
  const rfeKeys = new Set(timeFilteredRFEs.value.map(r => r.key))
  const result = {}
  for (const [key, assessment] of Object.entries(assessments.value)) {
    if (rfeKeys.has(key)) {
      result[key] = assessment
    }
  }
  return result
})

function handleRetry() {
  load()
  loadAssessments()
}

function handleSelectRFE(rfe) {
  selectedRFE.value = rfe
  moduleNav.navigateTo('prd-review', { select: rfe.key })
}

function handleCloseModal() {
  selectedRFE.value = null
  const params = fromForYou.value ? { from: 'sotu' } : {}
  moduleNav.navigateTo('prd-review', params)
}

function handleNavigateToFeature(featureKey) {
  selectedRFE.value = null
  moduleNav.navigateTo('design-review', { select: featureKey })
}

function handleNavigateToTestPlan(sourceKey) {
  moduleNav.navigateTo('test-plan-review', { select: sourceKey })
}

const fromForYou = computed(() => moduleNav.params.value?.from === 'sotu' || moduleNav.params.value?.from === 'state-of-the-union')

function goBackToForYou() {
  window.location.hash = '#/'
}

// Handle incoming select param (cross-link from Feature Review)
// Watch both params and rfeData — params may arrive before data is loaded
watch([() => moduleNav.params.value, rfeData], ([params]) => {
  if (params?.select && rfeData.value?.issues) {
    const rfe = rfeData.value.issues.find(r => r.key === params.select)
    if (rfe && selectedRFE.value?.key !== rfe.key) {
      filter.value = 'all'
      searchQuery.value = ''
      passFailFilter.value = 'all'
      priorityFilter.value = 'all'
      artifactFilter.value = 'all'
      reviewStatusFilter.value = 'all'
      componentFilter.value = 'all'
      selectedRFE.value = rfe
      notFoundRFE.value = null
    } else if (!rfe) {
      notFoundRFE.value = params.select
    }
  }
}, { immediate: true })
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden bg-gray-50 dark:bg-gray-900">
    <div v-if="fromForYou" class="px-4 py-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shrink-0">
      <button
        @click="goBackToForYou"
        class="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center gap-1"
      >
        &larr; Back to State of the Union
      </button>
    </div>
    <div class="flex flex-1 overflow-hidden">
    <PhaseContent
      :phase="phase"
      :loading="loading"
      :error="error"
      :rfeData="rfeData"
      :metrics="metrics"
      :trendData="trendData"
      :breakdown="breakdown"
      :filteredRFEs="listRFEs"
      :windowedRFEs="windowedRFEs"
      :timeWindow="timeWindow"
      :filter="filter"
      :searchQuery="searchQuery"
      :chartExpanded="chartExpanded"
      :assessments="assessments"
      :filteredAssessments="filteredAssessments"
      :sortBy="sortBy"
      :passFailFilter="passFailFilter"
      :priorityFilter="priorityFilter"
      :artifactFilter="artifactFilter"
      :reviewStatusFilter="reviewStatusFilter"
      :componentFilter="componentFilter"
      :selectedRFE="selectedRFE"
      :rfeToFeature="rfeToFeature"
      :pipelineFriction="pipelineFriction"
      @update:timeWindow="timeWindow = $event"
      @update:filter="filter = $event"
      @update:searchQuery="searchQuery = $event"
      @update:chartExpanded="chartExpanded = $event"
      @update:sortBy="sortBy = $event"
      @update:passFailFilter="passFailFilter = $event"
      @update:priorityFilter="priorityFilter = $event"
      @update:artifactFilter="artifactFilter = $event"
      @update:reviewStatusFilter="reviewStatusFilter = $event"
      @update:componentFilter="componentFilter = $event"
      @selectRFE="handleSelectRFE"
      @retry="handleRetry"
    />

    <!-- Not-found banner for cross-link to missing RFE -->
    <Teleport to="body">
      <Transition name="notfound">
        <div
          v-if="notFoundRFE"
          class="fixed top-4 right-4 z-50 max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-lg border-l-4 border-yellow-500 p-4"
          role="alert"
        >
          <div class="flex items-start gap-3">
            <svg class="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div class="flex-1">
              <p class="text-sm font-medium text-gray-900 dark:text-gray-100">PRD not found</p>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                <span class="font-mono">{{ notFoundRFE }}</span> is not in the assessment dataset.
                <a
                  v-if="notFoundRFE.startsWith('EP-')"
                  :href="`https://github.com/osac-project/enhancement-proposals/pull/${notFoundRFE.slice(3)}`"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-blue-600 dark:text-blue-400 hover:underline"
                >View on GitHub</a>
                <a
                  v-else-if="rfeData?.jiraHost"
                  :href="`${rfeData.jiraHost}/browse/${notFoundRFE}`"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-blue-600 dark:text-blue-400 hover:underline"
                >View in Jira</a>
              </p>
            </div>
            <button
              @click="notFoundRFE = null"
              aria-label="Dismiss"
              class="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
    </div>

    <RFEDetailModal
      :show="!!enrichedSelectedRFE"
      :rfe="enrichedSelectedRFE"
      :phases="PHASES"
      :jiraHost="rfeData?.jiraHost"
      :assessment="assessments[selectedRFE?.key] || null"
      :loadAssessmentDetail="loadAssessmentDetail"
      @close="handleCloseModal"
      @navigateToFeature="handleNavigateToFeature"
      @navigateToTestPlan="handleNavigateToTestPlan"
    />

    <AIImpactGuide />
  </div>
</template>

<style scoped>
.notfound-enter-active, .notfound-leave-active { transition: all 0.3s ease; }
.notfound-enter-from { transform: translateX(100%); opacity: 0; }
.notfound-leave-to { transform: translateY(-20px); opacity: 0; }
</style>

<script setup>
import { ref, watch, onBeforeUnmount, nextTick, computed } from 'vue'
import PipelineTimeline from './PipelineTimeline.vue'
import AssessmentBreakdown from './AssessmentBreakdown.vue'
import AssessmentHistory from './AssessmentHistory.vue'
import FeedbackText from './FeedbackText.vue'
import MetaChipGroup from './MetaChipGroup.vue'
import { useTestPlans } from '../composables/useTestPlans.js'
import {
  getReviewStatusClass, getReviewStatusLabel, getPrdSignOffStatus,
  getInvolvementLabel, getInvolvementClass, getPrdReviewPrUrl, EP_GITHUB_REPO
} from '../utils/feature-helpers.js'

const props = defineProps({
  show: { type: Boolean, default: false },
  rfe: { type: Object, default: null },
  phases: { type: Array, required: true },
  jiraHost: { type: String, default: null },
  assessment: { type: Object, default: null },
  loadAssessmentDetail: { type: Function, default: null }
})

const prdUnavailable = computed(() => props.rfe?.prdArtifactPresence === 'unavailable' || props.rfe?.status === 'Unknown')
const prdPresentWithoutPr = computed(() => props.rfe?.prdArtifactPresence === 'present' && props.rfe?.status === 'No PR')

const emit = defineEmits(['close', 'navigateToFeature', 'navigateToTestPlan'])

function issueUrl(key) {
  if (key && key.startsWith('EP-')) return `${EP_GITHUB_REPO}/${key.slice(3)}`
  return props.jiraHost ? `${props.jiraHost}/browse/${key}` : null
}

const assessmentDetail = ref(null)
const detailLoading = ref(false)
const modalRef = ref(null)
let previousActiveElement = null

const { loadTestPlanDetail } = useTestPlans()
const testPlanData = ref(null)

watch(
  () => props.rfe?.key,
  async (key) => {
    assessmentDetail.value = null
    if (!props.show || !key || !props.assessment || !props.loadAssessmentDetail) return
    detailLoading.value = true
    try {
      assessmentDetail.value = await props.loadAssessmentDetail(key)
    } catch {
      // Silently fail - slim data still shows
    } finally {
      detailLoading.value = false
    }
  },
  { immediate: true }
)

// Linked-feature enrichment can resolve after the RFE key is already loaded
// (async enrichment), so the test plan load reacts to its own key.
watch(
  () => props.rfe?.linkedFeature?.key,
  async (linkedFeatureKey) => {
    testPlanData.value = null
    if (!props.show || !linkedFeatureKey) return
    try {
      testPlanData.value = await loadTestPlanDetail(linkedFeatureKey)
    } catch {
      // Silently fail - slim data still shows
    }
  },
  { immediate: true }
)

watch(() => props.show, (visible) => {
  if (visible) {
    previousActiveElement = document.activeElement
    document.body.style.overflow = 'hidden'
    nextTick(() => {
      const focusable = modalRef.value?.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      focusable?.focus()
    })
  } else {
    document.body.style.overflow = ''
    previousActiveElement?.focus()
    previousActiveElement = null
  }
})

onBeforeUnmount(() => {
  document.body.style.overflow = ''
})

function handleKeydown(e) {
  if (e.key === 'Escape') {
    emit('close')
    return
  }
  if (e.key === 'Tab' && modalRef.value) {
    const focusables = modalRef.value.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
}

</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="show && rfe" class="fixed inset-0 z-50 flex items-center justify-center p-4" @keydown="handleKeydown">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/50" @click="emit('close')" />

        <!-- Modal -->
        <div ref="modalRef" role="dialog" aria-modal="true" class="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">
          <!-- Header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-3 min-w-0">
              <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ rfe.status === 'No PR' || prdUnavailable ? 'Feature Details' : 'PRD Details' }}</h2>
              <a
                v-if="issueUrl(rfe.key)"
                :href="issueUrl(rfe.key)"
                target="_blank"
                rel="noopener noreferrer"
                class="font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0"
              >
                {{ rfe.key }}
              </a>
              <span v-else class="font-mono text-xs text-gray-500 dark:text-gray-400 shrink-0">{{ rfe.key }}</span>
            </div>
            <button
              @click="emit('close')"
              aria-label="Close"
              class="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Content (scrollable) -->
          <div class="flex-1 overflow-auto px-6 py-5">
            <h3 class="font-medium text-gray-900 dark:text-gray-200 mb-4">{{ rfe.summary }}</h3>

            <div v-if="prdUnavailable" class="mb-6 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/30 px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
              PRD document and review status are unavailable because the project docs registry could not be verified.
            </div>
            <div v-else-if="rfe.status === 'No PR'" class="mb-6 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/30 px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
              {{ prdPresentWithoutPr ? 'A PRD document exists, but no linked PR is available to review.' : 'No PRD has been verified for this feature.' }}
            </div>

            <div v-else class="grid grid-cols-3 gap-4 mb-6 text-sm">
              <div>
                <p class="text-gray-500 dark:text-gray-400 text-xs mb-1">Author</p>
                <p class="font-medium dark:text-gray-200">{{ rfe.creatorDisplayName }}</p>
              </div>
              <div>
                <p class="text-gray-500 dark:text-gray-400 text-xs mb-1">Created</p>
                <p class="font-medium dark:text-gray-200">{{ new Date(rfe.created).toLocaleDateString() }}</p>
              </div>
              <div>
                <p class="text-gray-500 dark:text-gray-400 text-xs mb-1">Priority</p>
                <span class="inline-flex items-center px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 text-xs capitalize dark:text-gray-300">
                  {{ rfe.priority }}
                </span>
              </div>
              <div>
                <p class="text-gray-500 dark:text-gray-400 text-xs mb-1">AI Involvement</p>
                <span
                  class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                  :class="getInvolvementClass(rfe.aiInvolvement)"
                >
                  {{ getInvolvementLabel(rfe.aiInvolvement) }}
                </span>
              </div>
              <div>
                <p class="text-gray-500 dark:text-gray-400 text-xs mb-1">Review Status</p>
                <span
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
                  :class="getReviewStatusClass(getPrdSignOffStatus(rfe.status))"
                >
                  {{ getReviewStatusLabel(getPrdSignOffStatus(rfe.status)) }}
                </span>
              </div>
            </div>

            <!-- Component / Fix Version -->
            <div v-if="rfe.components?.length || rfe.linkedFeature?.fixVersions?.length" class="grid grid-cols-3 gap-4 mb-6 text-sm">
              <div><MetaChipGroup label="Component" :values="rfe.components" /></div>
              <div><MetaChipGroup label="Fix Version" :values="rfe.linkedFeature?.fixVersions" /></div>
            </div>

            <!-- Links -->
            <div v-if="getPrdReviewPrUrl(rfe)" class="border-t border-gray-200 dark:border-gray-700 pt-4 mb-4">
              <div class="flex flex-wrap items-center gap-2">
                <a
                  :href="getPrdReviewPrUrl(rfe)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
                  title="View PRD pull request on GitHub"
                >
                  <svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                  PRD PR
                </a>
              </div>
            </div>

            <!-- Assessment Section -->
            <template v-if="prdUnavailable">
              <div class="border-t border-gray-200 dark:border-gray-700 pt-4 mb-4">
                <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Quality Assessment</h4>
                <div class="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/30 px-4 py-5 text-center">
                  <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Assessment unavailable</p>
                  <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">The docs registry is unavailable, so the PRD and its score cannot be verified.</p>
                </div>
              </div>
            </template>
            <template v-else-if="rfe.status === 'No PR'">
              <div class="border-t border-gray-200 dark:border-gray-700 pt-4 mb-4">
                <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Quality Assessment</h4>
                <div class="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/30 px-4 py-5 text-center">
                  <p class="text-sm font-medium text-gray-500 dark:text-gray-400">No PRD to assess</p>
                  <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">This feature has no verified PRD, so no quality assessment is available.</p>
                </div>
              </div>
            </template>
            <template v-else-if="assessment">
              <div class="border-t border-gray-200 dark:border-gray-700 pt-4 mb-4">
                <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Quality Assessment</h4>
                <AssessmentBreakdown :assessment="assessment" :detail="assessmentDetail" />
              </div>

              <!-- Verdict -->
              <div v-if="assessmentDetail?.latest?.verdict" class="border-t border-gray-200 dark:border-gray-700 pt-4 mb-4">
                <h4 class="text-xs text-gray-500 dark:text-gray-400 mb-1">Verdict</h4>
                <p class="text-sm font-medium text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-700/50 rounded-md px-3 py-2">
                  {{ assessmentDetail.latest.verdict }}
                </p>
              </div>

              <!-- Feedback -->
              <div v-if="assessmentDetail?.latest?.feedback" class="border-t border-gray-200 dark:border-gray-700 pt-4 mb-4">
                <h4 class="text-xs text-gray-500 dark:text-gray-400 mb-1">Feedback</h4>
                <div class="bg-gray-50 dark:bg-gray-700/50 rounded-md px-3 py-2">
                  <FeedbackText :text="assessmentDetail.latest.feedback" />
                </div>
              </div>

              <!-- History -->
              <div v-if="assessmentDetail?.history?.length > 0" class="mb-4">
                <AssessmentHistory
                  :history="assessmentDetail.history"
                  :currentTotal="assessment.total"
                  :currentAssessedAt="assessment.assessedAt"
                  :currentScores="assessment.scores"
                />
              </div>

              <div v-if="detailLoading" class="text-xs text-gray-400 dark:text-gray-500 mb-4">Loading full assessment...</div>
            </template>

            <!-- No assessment placeholder -->
            <div v-else class="border-t border-gray-200 dark:border-gray-700 pt-4 mb-4">
              <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Quality Assessment</h4>
              <div class="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/30 px-4 py-5 text-center">
                <svg class="mx-auto h-8 w-8 text-gray-300 dark:text-gray-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Not yet assessed</p>
                <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Quality scores will appear here once this PRD has been evaluated by the assessment pipeline.</p>
              </div>
            </div>

            <PipelineTimeline :rfe="rfe" :testPlan="testPlanData?.latest" :phases="phases" :jiraHost="jiraHost" @navigateToFeature="emit('navigateToFeature', $event)" @navigateToTestPlan="emit('navigateToTestPlan', $event)" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-active .relative,
.modal-leave-active .relative {
  transition: transform 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .relative {
  transform: scale(0.95);
}
</style>

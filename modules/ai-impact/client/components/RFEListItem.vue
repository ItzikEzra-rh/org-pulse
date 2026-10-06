<script setup>
import { computed } from 'vue'
import {
  getReviewStatusClass, getReviewStatusLabel, getPrdSignOffStatus,
  getPrdReviewStatusTooltip, getInvolvementLabel, getInvolvementClass
} from '../utils/feature-helpers.js'
import InfoBubble from './InfoBubble.vue'

const props = defineProps({
  rfe: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  assessment: { type: Object, default: null },
  hasLinkedFeature: { type: Boolean, default: false }
})

function getPrdArtifactPresence(rfe) {
  if (['present', 'missing', 'unavailable'].includes(rfe.prdArtifactPresence)) return rfe.prdArtifactPresence
  if (rfe.status === 'Unknown') return 'unavailable'
  return rfe.status === 'No PR' ? 'missing' : 'present'
}

const prdArtifactPresence = computed(() => getPrdArtifactPresence(props.rfe))
const prdUnavailable = computed(() => prdArtifactPresence.value === 'unavailable')
const hasOpenPrdPr = computed(() => props.rfe.status === 'Open' && Boolean(props.rfe.prdPrUrl))
const prdMissing = computed(() => (prdArtifactPresence.value === 'missing' && !hasOpenPrdPr.value)
  || (prdArtifactPresence.value !== 'unavailable' && props.rfe.status === 'No PR' && prdArtifactPresence.value !== 'present'))
const prdHasNoLinkedPr = computed(() => prdArtifactPresence.value === 'present' && props.rfe.status === 'No PR')
const hasVerifiedPrdPr = computed(() => !['No PR', 'Unknown'].includes(props.rfe.status)
  && (prdArtifactPresence.value === 'present' || hasOpenPrdPr.value))
const visiblePrUrl = computed(() => {
  if (hasVerifiedPrdPr.value && props.rfe.prdPrUrl) return props.rfe.prdPrUrl
  return props.rfe.linkedPrs?.find(pr => pr?.url)?.url || null
})
const prLinkTitle = computed(() => hasVerifiedPrdPr.value && props.rfe.prdPrUrl
  ? 'View PRD pull request on GitHub'
  : 'View linked pull request on GitHub')

const emit = defineEmits(['select'])
</script>

<template>
  <div
    @click="emit('select', rfe)"
    class="p-4 rounded-lg border cursor-pointer transition-all"
    :class="{
      'border-primary-500 bg-primary-50 dark:bg-primary-900/30 ring-1 ring-primary-500': selected,
      'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700': !selected
    }"
  >
    <div class="flex items-start justify-between gap-4">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <span class="font-mono text-xs text-gray-500 dark:text-gray-400">{{ rfe.key }}</span>
          <span
            v-if="prdUnavailable"
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
          >
            PRD unavailable
          </span>
          <span
            v-else-if="prdHasNoLinkedPr"
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
          >
            PRD doc, no linked PR
          </span>
          <span
            v-else-if="prdMissing"
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
          >
            Missing PRD
          </span>
          <span
            v-else-if="hasVerifiedPrdPr && rfe.aiInvolvement != null"
            class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
            :class="getInvolvementClass(rfe.aiInvolvement)"
          >
            {{ getInvolvementLabel(rfe.aiInvolvement) }}
          </span>
          <span
            v-else-if="hasVerifiedPrdPr"
            class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
          >
            AI status unavailable
          </span>
          <span
            v-if="hasOpenPrdPr"
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200"
          >
            {{ rfe.prdDraft ? 'Draft PRD PR' : 'PRD PR in review' }}
          </span>
        </div>
        <h4 class="font-medium text-sm truncate dark:text-gray-200">{{ rfe.summary }}</h4>
        <div v-if="hasVerifiedPrdPr" class="flex items-center flex-wrap gap-2 mt-2">
          <span class="inline-flex items-center">
            <span
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
              :class="getReviewStatusClass(getPrdSignOffStatus(rfe.status, rfe.prdDraft))"
            >
              <svg v-if="getPrdSignOffStatus(rfe.status, rfe.prdDraft) === 'needs-review'" class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              <span class="font-medium opacity-75">Review</span>
              {{ getReviewStatusLabel(getPrdSignOffStatus(rfe.status, rfe.prdDraft)) }}
            </span>
            <InfoBubble :text="getPrdReviewStatusTooltip(getPrdSignOffStatus(rfe.status, rfe.prdDraft))" />
          </span>
          <span v-if="rfe.created" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-xs">
            <span class="font-medium text-gray-500 dark:text-gray-400">{{ rfe.prdPrCreatedAt ? 'PR opened' : 'Created' }}</span>
            <span class="text-gray-800 dark:text-gray-100">{{ new Date(rfe.prdPrCreatedAt || rfe.created).toLocaleDateString() }}</span>
          </span>
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-xs">
            <span class="font-medium text-gray-500 dark:text-gray-400">Score</span>
            <span class="text-gray-800 dark:text-gray-100">{{ assessment ? `${assessment.total}/10` : 'N/A' }}</span>
          </span>
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-xs">
            <span class="font-medium text-gray-500 dark:text-gray-400">Priority</span>
            <span class="text-gray-800 dark:text-gray-100 capitalize">{{ rfe.priority }}</span>
          </span>
        </div>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <a
          v-if="visiblePrUrl"
          :href="visiblePrUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="text-purple-500 dark:text-purple-400"
          :title="prLinkTitle"
          @click.stop
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
        <span
          v-if="hasLinkedFeature"
          class="text-blue-500 dark:text-blue-400"
          title="View Feature"
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </span>
        <svg class="h-4 w-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  </div>
</template>

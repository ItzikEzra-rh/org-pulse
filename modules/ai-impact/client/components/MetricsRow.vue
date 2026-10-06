<script setup>
import { computed } from 'vue'
import { getPrdSignOffStatus } from '../utils/feature-helpers.js'
import InfoBubble from './InfoBubble.vue'

const props = defineProps({
  metrics: {
    type: Object,
    default: null
  },
  pipelineFriction: {
    type: Object,
    default: null
  },
  rfes: {
    type: Array,
    default: () => []
  },
  assessments: {
    type: Object,
    default: () => ({})
  }
})

// PRD rows with no linked PR or unverified docs cannot be signed off, assessed, or actioned.
const existingRfes = computed(() => props.rfes.filter(rfe =>
  !['No PR', 'Unknown'].includes(rfe.status) && rfe.prdArtifactPresence !== 'unavailable'
))

const signedOffCount = computed(() => existingRfes.value.filter(rfe => getPrdSignOffStatus(rfe.status, rfe.prdDraft) === 'approved').length)

const assessedRfes = computed(() => existingRfes.value.filter(rfe => props.assessments[rfe.key]))

// A non-draft open PRD is awaiting human sign-off whether or not an AI marker
// review exists. A missing AI assessment never hides the human-review work.
const needsActionCount = computed(() => existingRfes.value.filter(rfe =>
  getPrdSignOffStatus(rfe.status, rfe.prdDraft) === 'awaiting-review').length)

// null (not 0) with no assessed population, so the template renders "—" instead of a misleading 0%.
const approvalRate = computed(() => {
  if (assessedRfes.value.length === 0) return null
  const passed = assessedRfes.value.filter(rfe => props.assessments[rfe.key].passFail === 'PASS').length
  return Math.round((passed / assessedRfes.value.length) * 100)
})

const hasEligibleData = computed(() => props.metrics?.windowAISignalTotal != null
  ? props.metrics.windowAISignalTotal > 0
  : props.metrics?.windowTotal > 0)

function getTrendClass(trend) {
  if (trend === 'growing') return 'text-green-600 dark:text-green-400'
  if (trend === 'declining') return 'text-red-600 dark:text-red-400'
  return 'text-gray-500 dark:text-gray-400'
}

function formatChange(change) {
  if (change > 0) return `+${change}%`
  return `${change}%`
}

function formatFrictionChange(change) {
  if (change > 0) return `+${change}pp`
  if (change < 0) return `${change}pp`
  return '—'
}
</script>

<template>
  <div v-if="metrics" class="p-6 border-b border-gray-200 dark:border-gray-700">
    <div class="grid gap-6 grid-cols-2 lg:grid-cols-5">
      <!-- Total PRDs -->
      <div class="space-y-1">
        <p class="text-sm text-gray-500 dark:text-gray-400 flex items-center">
          Total PRDs
          <InfoBubble trigger="hover" text="PRD pull requests opened in the selected period. Drafts are included in this activity count; Jira creation dates are used only when no PR opening date is available." />
        </p>
        <span class="text-3xl font-bold dark:text-gray-100">{{ metrics.windowTotal }}</span>
        <p class="text-xs text-gray-400 dark:text-gray-500">{{ metrics.totalRFEs }} all time</p>
      </div>

      <!-- Created with AI -->
      <div class="space-y-1">
        <p class="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
          <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
          Created with AI
          <InfoBubble trigger="hover" text="Percentage of PRDs with a known AI-provenance state that were created with AI. Rows without scanned AI evidence are excluded." />
        </p>
        <div class="flex items-baseline gap-2">
          <span class="text-3xl font-bold dark:text-gray-100">{{ hasEligibleData ? `${metrics.createdPct}%` : '—' }}</span>
          <span v-if="hasEligibleData && metrics.createdChange !== null" class="text-sm flex items-center gap-1" :class="getTrendClass(metrics.trend)">
            <svg v-if="metrics.trend === 'growing'" class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <svg v-else-if="metrics.trend === 'declining'" class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
            </svg>
            <svg v-else class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
            </svg>
            {{ formatChange(metrics.createdChange) }}
          </span>
        </div>
        <p v-if="pipelineFriction" class="text-xs text-gray-400 dark:text-gray-500">
          {{ pipelineFriction.needsAttentionPct }}% require attention
          <span class="ml-1">{{ formatFrictionChange(pipelineFriction.needsAttentionChange) }}</span>
        </p>
      </div>

      <!-- Approval Rate -->
      <div class="space-y-1">
        <p class="text-sm text-gray-500 dark:text-gray-400 flex items-center">
          Approval Rate
          <InfoBubble trigger="hover" text="Percentage of AI-assessed PRDs that passed the AI review." />
        </p>
        <span class="text-3xl font-bold dark:text-gray-100">{{ approvalRate === null ? '—' : `${approvalRate}%` }}</span>
      </div>

      <!-- Needs Action -->
      <div class="space-y-1">
        <p class="text-sm text-gray-500 dark:text-gray-400 flex items-center">
          Needs Action
          <InfoBubble trigger="hover" text="Non-draft, unmerged PRDs that have not been signed off, whether or not an AI review score exists." />
        </p>
        <span class="text-3xl font-bold" :class="needsActionCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'dark:text-gray-100'">
          {{ needsActionCount }}
        </span>
      </div>

      <!-- Signed Off -->
      <div class="space-y-1">
        <p class="text-sm text-gray-500 dark:text-gray-400 flex items-center">
          Signed Off
          <InfoBubble trigger="hover" text="PRDs whose pull request has been merged." />
        </p>
        <span class="text-3xl font-bold" :class="signedOffCount > 0 ? 'text-green-600 dark:text-green-400' : 'dark:text-gray-100'">
          {{ signedOffCount }}
        </span>
      </div>
    </div>
  </div>
</template>

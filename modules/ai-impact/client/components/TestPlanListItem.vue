<script setup>
import { getVerdictBgClass, getVerdictLabel, getScoreColorClass, getTestPlanReviewStatusLabel, getTestPlanReviewStatusTooltip } from '../utils/test-plan-helpers.js'
import { getReviewStatusClass } from '../utils/feature-helpers.js'

defineProps({
  plan: { type: Object, required: true },
  selected: { type: Boolean, default: false }
})

const emit = defineEmits(['select'])
</script>

<template>
  <div
    @click="emit('select', plan)"
    class="p-4 rounded-lg border cursor-pointer transition-all"
    :class="{
      'border-primary-500 bg-primary-50 dark:bg-primary-900/30 ring-1 ring-primary-500': selected,
      'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700': !selected
    }"
  >
    <div class="flex items-start justify-between gap-4">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <span class="font-mono text-xs text-gray-500 dark:text-gray-400">{{ plan.key }}</span>
          <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium" :class="getVerdictBgClass(plan.verdict)">{{ getVerdictLabel(plan.verdict) }}</span>
        </div>
        <h4 class="font-medium text-sm truncate dark:text-gray-200">{{ plan.feature || plan.featureName || plan.title }}</h4>
        <div class="flex items-center flex-wrap gap-2 mt-2">
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" :class="getReviewStatusClass(plan.humanReviewStatus || 'awaiting-review')" :title="getTestPlanReviewStatusTooltip(plan.humanReviewStatus)">
            <span class="font-medium opacity-75 mr-1">Review</span>{{ getTestPlanReviewStatusLabel(plan.humanReviewStatus) }}
          </span>

          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-xs">
            <span class="font-medium text-gray-500 dark:text-gray-400">Score</span>
            <span :class="getScoreColorClass(plan.score || 0)">{{ plan.score || 0 }}/10</span>
          </span>

          <span v-if="plan.reviewedAt" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-xs"><span class="font-medium text-gray-500 dark:text-gray-400">Reviewed</span><span class="text-gray-800 dark:text-gray-100">{{ new Date(plan.reviewedAt).toLocaleDateString() }}</span></span>

          <span v-if="plan.jiraPriority" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-xs"><span class="font-medium text-gray-500 dark:text-gray-400">Priority</span><span class="text-gray-800 dark:text-gray-100">{{ plan.jiraPriority }}</span></span>

        </div>
      </div>
      <div class="flex items-center shrink-0">
        <svg class="h-4 w-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  </div>
</template>

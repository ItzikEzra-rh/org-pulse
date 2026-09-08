<script setup>
import { computed } from 'vue'
import { getMeaningfulDesignReviewStatus } from '../utils/feature-helpers.js'
import InfoBubble from './InfoBubble.vue'

const props = defineProps({
  features: { type: Object, default: () => ({}) },
  allTimeTotal: { type: Number, default: null }
})

const featureList = computed(() => Object.values(props.features))

// Existing Designs only — a Feature with no design doc yet isn't part of any
// Design-side population (Total, Created with AI, Approval Rate).
const existingDesigns = computed(() => featureList.value.filter(f => f.designPrStatus != null))

const totalDesigns = computed(() => existingDesigns.value.length)

// null (not 0) with no existing-Design population, so the template renders
// "—" instead of a misleading 0%.
const createdWithAIRate = computed(() => {
  if (existingDesigns.value.length === 0) return null
  const created = existingDesigns.value.filter(f => f.aiInvolvement === 'created' || f.aiInvolvement === 'both').length
  return Math.round((created / existingDesigns.value.length) * 100)
})

// Approval Rate aggregates AI scores, so its population is existing Designs
// with an actual score. humanReviewStatus (below) is set from Jira sign-off
// labels independently of scoring, so it needs its own population.
const scoredFeatures = computed(() => existingDesigns.value.filter(f => f.scores?.total != null))

// null (not 0) when there is no scored population, so the template can
// render "—" instead of a misleading 0% that looks like a real result.
const approvalRate = computed(() => {
  if (scoredFeatures.value.length === 0) return null
  const approved = scoredFeatures.value.filter(f => f.recommendation === 'approve').length
  return Math.round((approved / scoredFeatures.value.length) * 100)
})

// Needs Action / Signed Off use the same meaningful-review rule as the list
// badge/filter (see getMeaningfulDesignReviewStatus), so an unscored default
// 'awaiting-review' doesn't inflate "Needs Action" the way a real one does.
const needsActionCount = computed(() => {
  return featureList.value.filter(f => {
    const status = getMeaningfulDesignReviewStatus(f)
    return status === 'needs-review' || status === 'awaiting-review'
  }).length
})

const signedOffCount = computed(() => {
  return featureList.value.filter(f => getMeaningfulDesignReviewStatus(f) === 'approved').length
})
</script>

<template>
  <div class="p-6 border-b border-gray-200 dark:border-gray-700">
    <div class="grid gap-6 grid-cols-2 lg:grid-cols-5">
      <div class="space-y-1">
        <p class="text-sm text-gray-500 dark:text-gray-400 flex items-center">
          Total Designs
          <InfoBubble trigger="hover" text="Designs that exist in the selected period." />
        </p>
        <span class="text-3xl font-bold dark:text-gray-100">{{ totalDesigns }}</span>
        <p v-if="allTimeTotal !== null" class="text-xs text-gray-400 dark:text-gray-500">{{ allTimeTotal }} all time</p>
      </div>

      <div class="space-y-1">
        <p class="text-sm text-gray-500 dark:text-gray-400 flex items-center">
          Created with AI
          <InfoBubble trigger="hover" text="Percentage of existing Designs created with AI." />
        </p>
        <span class="text-3xl font-bold dark:text-gray-100">{{ createdWithAIRate === null ? '—' : `${createdWithAIRate}%` }}</span>
      </div>

      <div class="space-y-1">
        <p class="text-sm text-gray-500 dark:text-gray-400 flex items-center">
          Approval Rate
          <InfoBubble trigger="hover" text="Percentage of AI-assessed Designs that received an Approve recommendation." />
        </p>
        <span class="text-3xl font-bold dark:text-gray-100">{{ approvalRate === null ? '—' : `${approvalRate}%` }}</span>
      </div>

      <div class="space-y-1">
        <p class="text-sm text-gray-500 dark:text-gray-400 flex items-center">
          Needs Action
          <InfoBubble trigger="hover" text="AI-assessed Designs flagged for action or awaiting human sign-off." />
        </p>
        <span class="text-3xl font-bold" :class="needsActionCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'dark:text-gray-100'">
          {{ needsActionCount }}
        </span>
      </div>

      <div class="space-y-1">
        <p class="text-sm text-gray-500 dark:text-gray-400 flex items-center">
          Signed Off
          <InfoBubble trigger="hover" text="Designs explicitly approved by a human reviewer." />
        </p>
        <span class="text-3xl font-bold" :class="signedOffCount > 0 ? 'text-green-600 dark:text-green-400' : 'dark:text-gray-100'">
          {{ signedOffCount }}
        </span>
      </div>
    </div>
  </div>
</template>

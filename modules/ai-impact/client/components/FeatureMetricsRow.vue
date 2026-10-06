<script setup>
import { computed } from 'vue'
import { getMeaningfulDesignReviewStatus, hasReviewableDesign } from '../utils/feature-helpers.js'
import InfoBubble from './InfoBubble.vue'

const props = defineProps({
  features: { type: Object, default: () => ({}) },
  allTimeTotal: { type: Number, default: null }
})

const featureList = computed(() => Object.values(props.features))

// Existing Designs only — a Feature with no design doc yet isn't part of any
// Design-side population (Total, Created with AI, Approval Rate).
const existingDesigns = computed(() => featureList.value.filter(hasReviewableDesign))

const totalDesigns = computed(() => existingDesigns.value.length)

// null (not 0) with no existing-Design population, so the template renders
// "—" instead of a misleading 0%.
const createdWithAIRate = computed(() => {
  const knownEvidence = existingDesigns.value.filter(f => ['created', 'revised', 'both', 'none'].includes(f.aiInvolvement))
  if (knownEvidence.length === 0) return null
  const created = knownEvidence.filter(f => f.aiInvolvement === 'created' || f.aiInvolvement === 'both').length
  return Math.round((created / knownEvidence.length) * 100)
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

// Open, non-draft Design PRs are explicit human-review work even when an AI
// score is absent. Legacy default awaiting-review still remains score-gated.
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
          <InfoBubble trigger="hover" text="Design documents present on the configured branch and non-draft Design PRs opened in the selected period. Draft PRs and missing documents are excluded. Jira creation date is used when no Design PR date is available." />
        </p>
        <span class="text-3xl font-bold dark:text-gray-100">{{ totalDesigns }}</span>
        <p v-if="allTimeTotal !== null" class="text-xs text-gray-400 dark:text-gray-500">{{ allTimeTotal }} all time</p>
      </div>

      <div class="space-y-1">
        <p class="text-sm text-gray-500 dark:text-gray-400 flex items-center">
          Created with AI
          <InfoBubble trigger="hover" text="Percentage of Designs with a known provenance signal that were created with AI. Rows without a scanned provenance signal are excluded." />
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
          <InfoBubble trigger="hover" text="Designs with an explicit human-review request or review concern, regardless of whether an AI score exists." />
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

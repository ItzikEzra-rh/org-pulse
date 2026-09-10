<script setup>
import { computed } from 'vue'
import InfoBubble from './InfoBubble.vue'

const props = defineProps({
  testPlans: { type: Object, default: () => ({}) }
})

const planList = computed(() => Object.values(props.testPlans))

const stats = computed(() => {
  let sum = 0, scored = 0, ready = 0, needsAction = 0, signedOff = 0
  for (const p of planList.value) {
    if (typeof p.score === 'number') { sum += p.score; scored++ }
    if (p.verdict === 'Ready') ready++
    if (p.humanReviewStatus === 'approved') signedOff++
    else needsAction++
  }
  const total = planList.value.length
  return {
    total,
    avg: scored ? (sum / scored).toFixed(1) : 0,
    passRate: total ? Math.round((ready / total) * 100) : 0,
    needsAction,
    signedOff
  }
})
</script>

<template>
  <div class="p-6 border-b border-gray-200 dark:border-gray-700">
    <div class="grid gap-6 grid-cols-2 lg:grid-cols-5">
      <div class="space-y-1">
        <p class="text-sm text-gray-500 dark:text-gray-400 flex items-center">Total Plans <InfoBubble trigger="hover" text="Test plans with an AI quality assessment." /></p>
        <span class="text-3xl font-bold dark:text-gray-100">{{ stats.total }}</span>
      </div>

      <div class="space-y-1">
        <p class="text-sm text-gray-500 dark:text-gray-400 flex items-center">Pass Rate <InfoBubble trigger="hover" text="Percentage of assessed test plans with a Ready recommendation." /></p>
        <span class="text-3xl font-bold dark:text-gray-100">{{ stats.passRate }}%</span>
      </div>

      <div class="space-y-1">
        <p class="text-sm text-gray-500 dark:text-gray-400 flex items-center">Avg Score <InfoBubble trigger="hover" text="Average score across plans with a numeric quality score." /></p>
        <span class="text-3xl font-bold dark:text-gray-100">{{ stats.avg }}</span>
        <p class="text-xs text-gray-400 dark:text-gray-500">out of 10</p>
      </div>

      <div class="space-y-1">
        <p class="text-sm text-gray-500 dark:text-gray-400 flex items-center">Needs Action <InfoBubble trigger="hover" text="Test plans flagged for action or awaiting human sign-off." /></p>
        <span class="text-3xl font-bold" :class="stats.needsAction > 0 ? 'text-amber-600 dark:text-amber-400' : 'dark:text-gray-100'">
          {{ stats.needsAction }}
        </span>
      </div>

      <div class="space-y-1">
        <p class="text-sm text-gray-500 dark:text-gray-400 flex items-center">Signed Off <InfoBubble trigger="hover" text="Test plans explicitly approved by a human reviewer." /></p>
        <span class="text-3xl font-bold" :class="stats.signedOff > 0 ? 'text-green-600 dark:text-green-400' : 'dark:text-gray-100'">
          {{ stats.signedOff }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend
} from 'chart.js'
import { useDarkMode } from '@shared/client'
import InfoBubble from './InfoBubble.vue'
import { SCORE_HEX } from '../utils/score-colors.js'
import { normalizeTestPlanReviewStatus } from '../utils/test-plan-helpers.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const props = defineProps({
  testPlans: { type: Object, default: () => ({}) }
})

const expanded = ref(true)
const plans = computed(() => Object.values(props.testPlans))
const { textColor, gridColor } = useDarkMode()

const datedPlans = computed(() => plans.value.filter(plan => plan.reviewedAt && !Number.isNaN(new Date(plan.reviewedAt).getTime())))
const reviewDates = computed(() => [...new Set(datedPlans.value.map(plan => new Date(plan.reviewedAt).toLocaleDateString()))].sort((a, b) => new Date(a) - new Date(b)))

const activityData = computed(() => ({
  labels: reviewDates.value,
  datasets: ['Ready', 'Revise', 'Rework'].map((verdict, index) => ({
    label: verdict,
    data: reviewDates.value.map(date => datedPlans.value.filter(plan => new Date(plan.reviewedAt).toLocaleDateString() === date && plan.verdict === verdict).length),
    backgroundColor: [SCORE_HEX.green, SCORE_HEX.amber, SCORE_HEX.red][index],
    borderRadius: 3
  }))
}))

const verdictData = computed(() => ({
  labels: ['Ready', 'Revise', 'Rework'],
  datasets: [{
    data: ['Ready', 'Revise', 'Rework'].map(verdict => plans.value.filter(plan => plan.verdict === verdict).length),
    backgroundColor: [SCORE_HEX.green, SCORE_HEX.amber, SCORE_HEX.red],
    borderRadius: 3
  }]
}))

const reviewData = computed(() => ({
  labels: ['Signed Off', 'Awaiting Sign-off', 'Flagged'],
  datasets: [{
    data: ['approved', 'awaiting-review', 'needs-review'].map(status => plans.value.filter(plan => normalizeTestPlanReviewStatus(plan.humanReviewStatus) === status).length),
    backgroundColor: [SCORE_HEX.green, SCORE_HEX.amber, SCORE_HEX.red],
    borderRadius: 3
  }]
}))

const baseOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { color: textColor.value, font: { size: 11 } }, grid: { color: gridColor.value } },
    y: { beginAtZero: true, ticks: { stepSize: 1, color: textColor.value, font: { size: 11 } }, grid: { color: gridColor.value } }
  }
}))

const activityOptions = computed(() => ({
  ...baseOptions.value,
  plugins: { legend: { display: true, position: 'bottom', labels: { color: textColor.value, font: { size: 11 }, boxWidth: 12 } } },
  scales: {
    x: { stacked: true, ticks: { color: textColor.value, font: { size: 11 } }, grid: { color: gridColor.value } },
    y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1, color: textColor.value, font: { size: 11 } }, grid: { color: gridColor.value } }
  }
}))
</script>

<template>
  <section v-if="plans.length" class="border-b border-gray-200 dark:border-gray-700">
    <button type="button" class="w-full px-6 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors" @click="expanded = !expanded">
      <span class="flex items-center gap-2 text-sm font-medium dark:text-gray-300">
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
        Trend Visualization
        <span class="font-normal text-gray-400 dark:text-gray-500">Review activity by assessment date</span>
      </span>
      <svg class="h-4 w-4 text-gray-400 transition-transform" :class="{ 'rotate-180': expanded }" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
    </button>

    <div v-if="expanded" class="px-6 pb-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 class="text-sm font-medium dark:text-gray-300 flex items-center mb-3">Plans Reviewed <InfoBubble trigger="hover" text="Current test-plan assessments grouped by their review date and AI recommendation." /></h3>
        <div v-if="datedPlans.length" class="h-52"><Bar :data="activityData" :options="activityOptions" /></div>
        <div v-else class="h-52 flex items-center justify-center text-sm text-gray-400">No review dates available</div>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 class="text-sm font-medium dark:text-gray-300 flex items-center mb-3">AI Recommendations <InfoBubble trigger="hover" text="Current Ready, Revise, and Rework recommendation counts." /></h3>
        <div class="h-52"><Bar :data="verdictData" :options="baseOptions" /></div>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 class="text-sm font-medium dark:text-gray-300 flex items-center mb-3">Human Review <InfoBubble trigger="hover" text="Current human sign-off status across assessed test plans." /></h3>
        <div class="h-52"><Bar :data="reviewData" :options="baseOptions" /></div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'
import { useDarkMode } from '@shared/client'
import InfoBubble from './InfoBubble.vue'
import { SCORE_HEX, scoreRgba } from '../utils/score-colors.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const props = defineProps({
  features: { type: Object, default: () => ({}) }
})

const featureList = computed(() => Object.values(props.features))

// Both charts visualise design scores, so they consider only features that
// actually have a score. Features with no Design artifact, or an
// unscored/pending Design, carry no scores.total and would otherwise pile
// into a false "0" (fail) bucket now that every feature is listed.
const scoredFeatures = computed(() =>
  featureList.value.filter(f => f.scores?.total != null)
)

const expanded = ref(true)

const { textColor, gridColor } = useDarkMode()

// Score Distribution: histogram of scores.total (0-8)
const scoreDistributionData = computed(() => {
  const buckets = Array(9).fill(0)
  for (const f of scoredFeatures.value) {
    const total = f.scores?.total ?? 0
    if (total >= 0 && total <= 8) buckets[total]++
  }
  return {
    labels: ['0', '1', '2', '3', '4', '5', '6', '7', '8'],
    datasets: [{
      label: 'Features',
      data: buckets,
      backgroundColor: buckets.map((_, i) => {
        if (i <= 2) return scoreRgba('red', 0.7)
        if (i <= 5) return scoreRgba('amber', 0.7)
        return scoreRgba('green', 0.7)
      }),
      borderRadius: 3
    }]
  }
})

const scoreDistributionOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false }
  },
  scales: {
    x: { title: { display: true, text: 'Total Score', color: textColor.value, font: { size: 11 } }, ticks: { color: textColor.value, font: { size: 11 } }, grid: { color: gridColor.value } },
    y: { title: { display: true, text: 'Count', color: textColor.value, font: { size: 11 } }, beginAtZero: true, ticks: { stepSize: 1, color: textColor.value, font: { size: 11 } }, grid: { color: gridColor.value } }
  }
}))

// Dimension Breakdown: stacked bar showing pass(2)/partial(1)/fail(0) per dimension
const dimensionBreakdownData = computed(() => {
  const dims = ['feasibility', 'testability', 'scope', 'architecture']
  const counts = { pass: [], partial: [], fail: [] }

  for (const dim of dims) {
    let pass = 0, partial = 0, fail = 0
    for (const f of scoredFeatures.value) {
      const score = f.scores?.[dim] ?? 0
      if (score === 2) pass++
      else if (score === 1) partial++
      else fail++
    }
    counts.pass.push(pass)
    counts.partial.push(partial)
    counts.fail.push(fail)
  }

  return {
    labels: dims.map(d => d.charAt(0).toUpperCase() + d.slice(1)),
    datasets: [
      { label: 'Pass (2)', data: counts.pass, backgroundColor: SCORE_HEX.green },
      { label: 'Partial (1)', data: counts.partial, backgroundColor: SCORE_HEX.amber },
      { label: 'Fail (0)', data: counts.fail, backgroundColor: SCORE_HEX.red }
    ]
  }
})

const dimensionBreakdownOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  barPercentage: 0.6,
  categoryPercentage: 0.6,
  plugins: {
    legend: { display: true, position: 'bottom', labels: { color: textColor.value, font: { size: 11 }, boxWidth: 12 } }
  },
  scales: {
    x: { stacked: true, ticks: { color: textColor.value, font: { size: 11 } }, grid: { color: gridColor.value } },
    y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1, color: textColor.value, font: { size: 11 } }, grid: { color: gridColor.value } }
  }
}))
</script>

<template>
  <div v-if="featureList.length > 0" class="border-b border-gray-200 dark:border-gray-700">
    <button
      @click="expanded = !expanded"
      class="w-full px-6 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
    >
      <span class="flex items-center gap-2 text-sm font-medium dark:text-gray-300">
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        Score Insights
      </span>
      <svg
        class="h-4 w-4 transition-transform dark:text-gray-300"
        :class="{ 'rotate-180': expanded }"
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <div v-if="expanded" class="px-6 pb-6">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 class="text-sm font-medium dark:text-gray-300 flex items-center mb-3">
            Score Distribution
            <InfoBubble trigger="hover" text="Distribution of total design review scores (0-8) across reviewed features. Red bars indicate weak scores (0-2), amber indicates moderate (3-5), green indicates strong (6-8)." />
          </h3>
          <div class="h-64">
            <Bar :data="scoreDistributionData" :options="scoreDistributionOptions" />
          </div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 class="text-sm font-medium dark:text-gray-300 flex items-center mb-3">
            Dimension Breakdown
            <InfoBubble trigger="hover" text="Per-dimension counts of reviewed features scoring 2 (Pass), 1 (Partial), or 0 (Fail) on feasibility, testability, scope, and architecture." />
          </h3>
          <div class="h-64">
            <Bar :data="dimensionBreakdownData" :options="dimensionBreakdownOptions" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
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
  testPlans: { type: Object, default: () => ({}) },
  expanded: { type: Boolean, default: true }
})
defineEmits(['toggle'])

const planList = computed(() => Object.values(props.testPlans))

const { textColor, gridColor } = useDarkMode()

const scoreDistributionData = computed(() => {
  const buckets = Array(11).fill(0)
  for (const p of planList.value) {
    const score = p.score
    if (typeof score === 'number' && score >= 0 && score <= 10) buckets[score]++
  }
  return {
    labels: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
    datasets: [{
      label: 'Test Plans',
      data: buckets,
      backgroundColor: buckets.map((_, i) => i <= 3 ? scoreRgba('red', 0.7) : i <= 7 ? scoreRgba('amber', 0.7) : scoreRgba('green', 0.7)),
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
    x: { title: { display: true, text: 'Quality Score', color: textColor.value }, ticks: { color: textColor.value }, grid: { color: gridColor.value } },
    y: { title: { display: true, text: 'Count', color: textColor.value }, beginAtZero: true, ticks: { stepSize: 1, color: textColor.value }, grid: { color: gridColor.value } }
  }
}))

const DIMENSIONS = [
  { key: 'specificity', label: 'Specificity' },
  { key: 'grounding', label: 'Grounding' },
  { key: 'scope_fidelity', label: 'Scope Fidelity' },
  { key: 'actionability', label: 'Actionability' },
  { key: 'consistency', label: 'Consistency' }
]

const dimensionBreakdownData = computed(() => {
  const counts = { pass: [], partial: [], fail: [] }

  for (const dim of DIMENSIONS) {
    let pass = 0, partial = 0, fail = 0
    for (const p of planList.value) {
      const score = p.scores?.[dim.key]
      if (score === 2) pass++
      else if (score === 1) partial++
      else if (score === 0) fail++
    }
    counts.pass.push(pass)
    counts.partial.push(partial)
    counts.fail.push(fail)
  }

  return {
    labels: DIMENSIONS.map(d => d.label),
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
  plugins: {
    legend: { display: true, position: 'bottom', labels: { color: textColor.value, font: { size: 11 }, boxWidth: 12 } }
  },
  scales: {
    x: { stacked: true, ticks: { color: textColor.value }, grid: { color: gridColor.value } },
    y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1, color: textColor.value }, grid: { color: gridColor.value } }
  }
}))
</script>

<template>
  <section v-if="planList.length > 0" class="border-b border-gray-200 dark:border-gray-700">
    <button type="button" class="w-full px-6 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors" @click="$emit('toggle')">
      <span class="flex items-center gap-2 text-sm font-medium dark:text-gray-300">
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
        Score Insights
      </span>
      <svg class="h-4 w-4 text-gray-400 transition-transform" :class="{ 'rotate-180': expanded }" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
    </button>
    <div v-if="expanded" class="px-6 pb-6">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 class="text-sm font-medium dark:text-gray-300 flex items-center mb-3">Score Distribution <InfoBubble trigger="hover" text="Distribution of scored test plans from 0–10. Missing scores are excluded." /></h3>
          <div class="h-64"><Bar :data="scoreDistributionData" :options="scoreDistributionOptions" /></div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 class="text-sm font-medium dark:text-gray-300 flex items-center mb-3">Dimension Breakdown <InfoBubble trigger="hover" text="Per-dimension counts scoring 2 (Pass), 1 (Partial), or 0 (Fail). Missing dimensions are excluded." /></h3>
          <div class="h-64"><Bar :data="dimensionBreakdownData" :options="dimensionBreakdownOptions" /></div>
        </div>
      </div>
    </div>
  </section>
</template>

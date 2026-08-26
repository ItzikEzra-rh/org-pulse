<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
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

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const props = defineProps({
  features: { type: Object, default: () => ({}) }
})

const featureList = computed(() => Object.values(props.features))

// Both charts visualise design scores, so they consider only features that
// actually have a score. Features with no design review (designStatus
// 'no-design') or an unscored/pending design carry no scores.total and would
// otherwise pile into a false "0" (fail) bucket now that every feature is listed.
const scoredFeatures = computed(() =>
  featureList.value.filter(f => f.designStatus !== 'no-design' && f.scores?.total != null)
)

const expanded = ref(true)

const isDark = ref(false)
onMounted(() => {
  isDark.value = document.documentElement.classList.contains('dark') ||
    (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const observer = new MutationObserver(() => {
    isDark.value = document.documentElement.classList.contains('dark')
  })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  onBeforeUnmount(() => observer.disconnect())
})

const textColor = computed(() => isDark.value ? 'rgba(209, 213, 219, 1)' : 'rgba(107, 114, 128, 1)')
const gridColor = computed(() => isDark.value ? 'rgba(75, 85, 99, 0.5)' : 'rgba(229, 231, 235, 1)')

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
        if (i <= 2) return 'rgba(239, 68, 68, 0.7)'    // red for low
        if (i <= 5) return 'rgba(245, 158, 11, 0.7)'    // amber for mid
        return 'rgba(16, 185, 129, 0.7)'                 // green for high
      })
    }]
  }
})

const scoreDistributionOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    title: { display: true, text: 'Score Distribution', color: textColor.value },
    legend: { display: false }
  },
  scales: {
    x: { title: { display: true, text: 'Total Score', color: textColor.value }, ticks: { color: textColor.value }, grid: { color: gridColor.value } },
    y: { title: { display: true, text: 'Count', color: textColor.value }, beginAtZero: true, ticks: { stepSize: 1, color: textColor.value }, grid: { color: gridColor.value } }
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
      { label: 'Pass (2)', data: counts.pass, backgroundColor: 'rgba(16, 185, 129, 0.7)' },
      { label: 'Partial (1)', data: counts.partial, backgroundColor: 'rgba(245, 158, 11, 0.7)' },
      { label: 'Fail (0)', data: counts.fail, backgroundColor: 'rgba(239, 68, 68, 0.7)' }
    ]
  }
})

const dimensionBreakdownOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    title: { display: true, text: 'Dimension Breakdown', color: textColor.value },
    legend: { display: true, position: 'bottom', labels: { color: textColor.value } }
  },
  scales: {
    x: { stacked: true, ticks: { color: textColor.value }, grid: { color: gridColor.value } },
    y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1, color: textColor.value }, grid: { color: gridColor.value } }
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
        <div class="h-64">
          <Bar :data="scoreDistributionData" :options="scoreDistributionOptions" />
        </div>
        <div class="h-64">
          <Bar :data="dimensionBreakdownData" :options="dimensionBreakdownOptions" />
        </div>
      </div>
    </div>
  </div>
</template>

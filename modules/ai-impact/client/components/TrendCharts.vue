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

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

import { useDarkMode } from '@shared/client'
import InfoBubble from './InfoBubble.vue'

const props = defineProps({
  trendData: { type: Array, default: () => [] },
  breakdown: { type: Array, default: () => [] },
  expanded: { type: Boolean, default: true },
  timeWindow: { type: String, default: 'month' },
  itemLabel: { type: String, default: 'PRDs' },
  // Tooltip-only label (matches KPI phrasing, e.g. "PRDs"/"Designs"), distinct
  // from itemLabel which reads naturally mid-sentence (e.g. "design docs").
  countLabel: { type: String, default: 'PRDs' }
})

const emit = defineEmits(['toggle'])

const { textColor, gridColor } = useDarkMode()

const bucketNoun = computed(() => props.timeWindow === '3months' ? 'week' : 'day')

const trendSubtitle = computed(() => {
  const horizon = props.timeWindow === 'week' ? 'last 7 days' : props.timeWindow === '3months' ? 'last 90 days' : 'last 30 days'
  return `${bucketNoun.value === 'day' ? 'Daily' : 'Weekly'} trend · ${horizon}`
})

// Limit labels without reducing the underlying daily data.
const X_AXIS_TICK_LIMIT = 8

const createdPctChartData = computed(() => ({
  labels: props.trendData.map(p => p.date),
  datasets: [
    {
      label: 'Created with AI',
      data: props.trendData.map(p => p.total ? p.createdWithAI : null),
      backgroundColor: 'rgba(16, 185, 129, 0.6)',
      borderColor: 'rgba(16, 185, 129, 0.8)',
      borderWidth: 1
    },
    {
      label: 'Not created with AI',
      data: props.trendData.map(p => p.total ? p.total - p.createdWithAI : null),
      backgroundColor: 'rgba(156, 163, 175, 0.5)',
      borderColor: 'rgba(156, 163, 175, 0.7)',
      borderWidth: 1
    }
  ]
}))

const createdPctChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: ctx => {
          const point = props.trendData[ctx.dataIndex]
          if (!point || !point.total) return `No ${props.countLabel} in this period`
          if (ctx.datasetIndex === 0) return `Created with AI: ${point.createdWithAI} of ${point.total} ${props.countLabel} · ${point.createdPct}%`
          const notCreated = point.total - point.createdWithAI
          return `Not created with AI: ${notCreated} of ${point.total} ${props.countLabel} · ${100 - point.createdPct}%`
        }
      }
    }
  },
  scales: {
    x: { stacked: true, ticks: { font: { size: 10 }, color: textColor.value, autoSkip: true, maxTicksLimit: X_AXIS_TICK_LIMIT }, grid: { color: gridColor.value } },
    y: { stacked: true, beginAtZero: true, ticks: { font: { size: 10 }, color: textColor.value, precision: 0 }, title: { display: true, text: 'Count', color: textColor.value }, grid: { color: gridColor.value } }
  }
}))

const revisedCountChartData = computed(() => ({
  labels: props.trendData.map(p => p.date),
  datasets: [{
    label: 'Review with AI',
    data: props.trendData.map(p => p.revisedCount),
    backgroundColor: 'rgba(245, 158, 11, 0.6)',
    borderColor: 'rgba(245, 158, 11, 0.8)',
    borderWidth: 1
  }]
}))

const revisedCountChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { font: { size: 10 }, color: textColor.value, autoSkip: true, maxTicksLimit: X_AXIS_TICK_LIMIT }, grid: { color: gridColor.value } },
    y: { beginAtZero: true, ticks: { font: { size: 10 }, color: textColor.value, precision: 0 }, title: { display: true, text: 'Review (count)', color: textColor.value }, grid: { color: gridColor.value } }
  }
}))

const breakdownChartData = computed(() => ({
  labels: props.breakdown.map(b => b.name),
  datasets: [{
    data: props.breakdown.map(b => b.value),
    backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#d1d5db']
  }]
}))

const breakdownChartOptions = computed(() => ({
  indexAxis: 'y',
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { font: { size: 10 }, color: textColor.value }, grid: { color: gridColor.value } },
    y: { ticks: { font: { size: 10 }, color: textColor.value }, grid: { color: gridColor.value } }
  }
}))
</script>

<template>
  <div class="border-b border-gray-200 dark:border-gray-700">
    <button
      @click="emit('toggle')"
      class="w-full px-6 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
    >
      <span class="flex items-center gap-2 text-sm font-medium dark:text-gray-300">
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        Trend Visualization
        <span class="text-xs font-normal text-gray-400 dark:text-gray-500">{{ trendSubtitle }}</span>
      </span>
      <svg
        class="h-4 w-4 transition-transform dark:text-gray-300"
        :class="{ 'rotate-180': expanded }"
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <div v-if="expanded" class="px-6 pb-6 space-y-6">
      <div class="flex flex-wrap gap-6">
      <div class="min-w-[280px] flex-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div class="flex items-center justify-between flex-wrap gap-y-1 mb-3">
          <h3 class="text-sm font-medium dark:text-gray-300 flex items-center">
            Created with AI
            <InfoBubble trigger="hover" :text="`Shows total ${countLabel} per period, split by whether they were created with AI. Hover for counts and percentages.`" />
          </h3>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
            <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm" style="background-color: #10b981" /> Created with AI</span>
            <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm" style="background-color: #9ca3af" /> Not created with AI</span>
          </div>
        </div>
        <div class="h-[180px]">
          <Bar :data="createdPctChartData" :options="createdPctChartOptions" />
        </div>
      </div>

      <div class="min-w-[280px] flex-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-medium dark:text-gray-300 flex items-center">
            Review with AI
            <InfoBubble trigger="hover" :text="`Count of ${itemLabel} reviewed with AI, per ${bucketNoun} over the selected period.`" />
          </h3>
        </div>
        <div class="h-[180px]">
          <Bar :data="revisedCountChartData" :options="revisedCountChartOptions" />
        </div>
      </div>

      <div class="min-w-[280px] flex-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-medium dark:text-gray-300 flex items-center">
            AI Involvement Breakdown
            <InfoBubble trigger="hover" :text="`Counts of ${itemLabel} by AI involvement: created with AI, reviewed with AI, both, or no AI involvement.`" />
          </h3>
        </div>
        <div class="h-[180px]">
          <Bar :data="breakdownChartData" :options="breakdownChartOptions" />
        </div>
      </div>
      </div>
    </div>
  </div>
</template>

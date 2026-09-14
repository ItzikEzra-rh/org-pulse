<script setup>
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip
} from 'chart.js'
import { useDarkMode } from '@shared/client'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

const COLOR_LIGHT = '#3b82f6'
const COLOR_DARK = '#7295ce'

const props = defineProps({
  // [{ bucket, prs, success, cancelled, failure }]
  histogram: { type: Array, default: () => [] }
})

const { isDark, textColor, gridColor } = useDarkMode()

const barColor = computed(() => isDark.value ? COLOR_DARK : COLOR_LIGHT)

const chartData = computed(() => ({
  labels: props.histogram.map(d => d.bucket),
  datasets: [{
    label: 'PRs',
    data: props.histogram.map(d => d.prs),
    backgroundColor: barColor.value,
    borderRadius: 3
  }]
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label(ctx) {
          const d = props.histogram[ctx.dataIndex]
          return `${d.prs} PR${d.prs !== 1 ? 's' : ''} — ${d.success} success, ${d.cancelled} cancelled, ${d.failure} failure`
        }
      }
    }
  },
  scales: {
    x: {
      title: { display: true, text: 'e2e job runs on the PR', color: textColor.value, font: { size: 11 } },
      ticks: { color: textColor.value, font: { size: 10 } },
      grid: { display: false }
    },
    y: {
      beginAtZero: true,
      ticks: { color: textColor.value, font: { size: 10 }, precision: 0 },
      grid: { color: gridColor.value }
    }
  }
}))
</script>

<template>
  <div v-if="histogram.length" class="h-[220px]">
    <Bar :data="chartData" :options="chartOptions" />
  </div>
  <p v-else class="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">No e2e PR activity in this window.</p>
</template>

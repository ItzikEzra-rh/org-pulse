<script setup>
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend
} from 'chart.js'
import { useDarkMode } from '@shared/client'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const COLOR_24H_LIGHT = '#f97316'
const COLOR_24H_DARK = '#c39764'
const COLOR_7D_LIGHT = '#3b82f6'
const COLOR_7D_DARK = '#7295ce'

const props = defineProps({
  // [{ repo, hours24, label24, count24, hours7d, label7d, count7d }]
  rows: { type: Array, required: true },
  emptyMessage: { type: String, default: 'No data in this window.' }
})

const { isDark, textColor, gridColor } = useDarkMode()

const color24h = computed(() => isDark.value ? COLOR_24H_DARK : COLOR_24H_LIGHT)
const color7d = computed(() => isDark.value ? COLOR_7D_DARK : COLOR_7D_LIGHT)

const chartData = computed(() => ({
  labels: props.rows.map(r => r.repo),
  datasets: [
    { label: '24h', data: props.rows.map(r => r.hours24), backgroundColor: color24h.value, borderRadius: 3 },
    { label: '7d', data: props.rows.map(r => r.hours7d), backgroundColor: color7d.value, borderRadius: 3 }
  ]
}))

const chartOptions = computed(() => ({
  indexAxis: 'y',
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: true, position: 'top', labels: { color: textColor.value, font: { size: 11 }, boxWidth: 12 } },
    tooltip: {
      callbacks: {
        label(ctx) {
          const row = props.rows[ctx.dataIndex]
          const isH24 = ctx.dataset.label === '24h'
          const label = isH24 ? row.label24 : row.label7d
          const count = isH24 ? row.count24 : row.count7d
          if (label == null) return `${ctx.dataset.label}: no data`
          return `${ctx.dataset.label}: ${label}${count != null ? ` (${count})` : ''}`
        }
      }
    }
  },
  scales: {
    x: {
      beginAtZero: true,
      title: { display: true, text: 'Hours', color: textColor.value, font: { size: 11 } },
      ticks: { color: textColor.value, font: { size: 10 } },
      grid: { color: gridColor.value }
    },
    y: {
      ticks: { color: textColor.value, font: { size: 11 } },
      grid: { display: false }
    }
  }
}))
</script>

<template>
  <div v-if="rows.length" class="h-[220px]">
    <Bar :data="chartData" :options="chartOptions" />
  </div>
  <p v-else class="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">{{ emptyMessage }}</p>
</template>

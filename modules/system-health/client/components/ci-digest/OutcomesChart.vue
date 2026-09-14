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

const OUTCOME_COLORS = {
  Success: '#10b981',
  Cancelled: '#f59e0b',
  Failure: '#ef4444'
}

const props = defineProps({
  // [{ outcome, count }]
  outcomes: { type: Array, default: () => [] }
})

const { textColor, gridColor } = useDarkMode()

const total = computed(() => props.outcomes.reduce((sum, o) => sum + o.count, 0))

const chartData = computed(() => ({
  labels: props.outcomes.map(o => o.outcome),
  datasets: [{
    data: props.outcomes.map(o => o.count),
    backgroundColor: props.outcomes.map(o => OUTCOME_COLORS[o.outcome] || '#6b7280'),
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
          const pct = total.value > 0 ? ((ctx.parsed.y / total.value) * 100).toFixed(1) : '0.0'
          return `${ctx.label}: ${ctx.parsed.y.toLocaleString()} (${pct}%)`
        }
      }
    }
  },
  scales: {
    x: { ticks: { color: textColor.value, font: { size: 11 } }, grid: { display: false } },
    y: {
      beginAtZero: true,
      ticks: { color: textColor.value, font: { size: 10 } },
      grid: { color: gridColor.value }
    }
  }
}))
</script>

<template>
  <div v-if="outcomes.length && total > 0" class="h-[220px]">
    <Bar :data="chartData" :options="chartOptions" />
  </div>
  <p v-else class="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">No e2e job runs in this window.</p>
</template>

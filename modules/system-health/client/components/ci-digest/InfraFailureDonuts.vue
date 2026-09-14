<script setup>
import { computed } from 'vue'
import { Doughnut } from 'vue-chartjs'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js'
import { useDarkMode } from '@shared/client'

ChartJS.register(ArcElement, Tooltip, Legend)

const COLOR_INFRA_LIGHT = '#ef4444'
const COLOR_INFRA_DARK = '#c39764'
// Test-failure hue, stepped per theme rather than a single mid-tone --
// dark `#7295ce` clears contrast against the dark card surface the way the
// light `#4a3aa7` does against white.
const COLOR_TEST_LIGHT = '#4a3aa7'
const COLOR_TEST_DARK = '#7295ce'
const COLOR_UNATTRIBUTED = '#9ca3af'

const props = defineProps({
  // { infra_total, test_total, unattributed_total, total_failures, infra_by_step }
  window24: { type: Object, required: true },
  window72: { type: Object, required: true }
})

const { isDark, gridColor } = useDarkMode()

const colorInfra = computed(() => isDark.value ? COLOR_INFRA_DARK : COLOR_INFRA_LIGHT)
const colorTest = computed(() => isDark.value ? COLOR_TEST_DARK : COLOR_TEST_LIGHT)

// The exporter partitions every failed job into exactly one of infra/test/
// unattributed (see get_presubmit_infra_failures_json in workflow-exporter.py),
// so total_failures === infra_total + test_total + unattributed_total always
// -- the ring must include all three or it under-represents the "N failures"
// caption whenever a job's failure_reason is missing/unrecognized.
function windowTotal(window) {
  return (window.infra_total || 0) + (window.test_total || 0) + (window.unattributed_total || 0)
}

function donutData(window) {
  const infra = window.infra_total || 0
  const test = window.test_total || 0
  const unattributed = window.unattributed_total || 0
  if (windowTotal(window) === 0) {
    return { labels: ['No failures'], datasets: [{ data: [1], backgroundColor: [gridColor.value], borderWidth: 0 }] }
  }
  return {
    labels: ['Infra', 'Test', 'Unattributed'],
    datasets: [{ data: [infra, test, unattributed], backgroundColor: [colorInfra.value, colorTest.value, COLOR_UNATTRIBUTED], borderWidth: 2, borderColor: 'transparent' }]
  }
}

const data24 = computed(() => donutData(props.window24))
const data72 = computed(() => donutData(props.window72))

function donutOptions(window) {
  const total = windowTotal(window)
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: total > 0,
        callbacks: {
          label(ctx) {
            const pct = total > 0 ? Math.round((ctx.parsed / total) * 100) : 0
            return `${ctx.label}: ${ctx.parsed} (${pct}%)`
          }
        }
      }
    }
  }
}

const options24 = computed(() => donutOptions(props.window24))
const options72 = computed(() => donutOptions(props.window72))

const topSteps = computed(() => (props.window72.infra_by_step || []).slice(0, 5))

// Kept out of the legend in the common case (both windows report 0) so the
// chart doesn't advertise a category that never actually appears.
const hasUnattributed = computed(() =>
  (props.window24.unattributed_total || 0) > 0 || (props.window72.unattributed_total || 0) > 0
)
</script>

<template>
  <div>
    <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
      Infra = CI's own fault (setup/teardown/provisioning), Test = product/test failures.
    </p>
    <div class="grid grid-cols-2 gap-4">
      <div class="text-center">
        <div class="h-32 relative">
          <Doughnut :data="data24" :options="options24" />
        </div>
        <div class="text-xs font-semibold text-gray-700 dark:text-gray-300 mt-2">24h</div>
        <div class="text-[11px] text-gray-500 dark:text-gray-400">{{ window24.total_failures || 0 }} failures</div>
      </div>
      <div class="text-center">
        <div class="h-32 relative">
          <Doughnut :data="data72" :options="options72" />
        </div>
        <div class="text-xs font-semibold text-gray-700 dark:text-gray-300 mt-2">72h</div>
        <div class="text-[11px] text-gray-500 dark:text-gray-400">{{ window72.total_failures || 0 }} failures</div>
      </div>
    </div>
    <div class="flex justify-center gap-4 mt-3 text-[11px] text-gray-500 dark:text-gray-400">
      <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full inline-block" :style="{ background: colorInfra }"></span>Infra</span>
      <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full inline-block" :style="{ background: colorTest }"></span>Test</span>
      <span v-if="hasUnattributed" class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full inline-block" style="background:#9ca3af"></span>Unattributed</span>
    </div>
    <p v-if="topSteps.length" class="text-[11px] text-gray-500 dark:text-gray-400 mt-3">
      Top infra steps (72h): {{ topSteps.map(s => `${s.step} (${s.count})`).join(', ') }}
    </p>
  </div>
</template>

<template>
  <div class="flex items-center gap-8">
    <div class="w-48 h-48">
      <Doughnut :data="chartData" :options="chartOptions" />
    </div>
    <div class="flex-1">
      <table class="min-w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-gray-500 dark:text-gray-400 uppercase">
            <th class="py-1">Role</th>
            <th class="py-1 text-right">Headcount</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
          <tr
            v-for="(row, i) in tableRows"
            :key="row.role"
            data-testid="headcount-role-row"
            class="cursor-pointer"
            :class="{ 'bg-primary-50 dark:bg-primary-900/20': selectedRole === row.role }"
            @click="selectRole(row.role)"
          >
            <td class="py-1.5 flex items-center gap-2">
              <span class="inline-block w-3 h-3 rounded-full" :style="{ backgroundColor: colors[i % colors.length] }"></span>
              {{ row.role }}
            </td>
            <td class="py-1.5 text-right text-gray-700 dark:text-gray-300">{{ row.headcount }}</td>
          </tr>
          <tr class="font-semibold border-t border-gray-300 dark:border-gray-600">
            <td class="py-1.5">Total</td>
            <td class="py-1.5 text-right">{{ totalHeadcount }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Doughnut } from 'vue-chartjs'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'

ChartJS.register(ArcElement, Tooltip, Legend)

const props = defineProps({
  headcount: { type: Object, required: true },
  selectedRole: { type: String, default: null }
})

const emit = defineEmits(['select-role'])

const colors = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
]

const tableRows = computed(() => {
  const byRole = props.headcount?.byRole || {}
  return Object.entries(byRole)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([role, count]) => ({
      role,
      headcount: count
    }))
})

const totalHeadcount = computed(() => props.headcount?.totalHeadcount || 0)

function selectRole(role) {
  emit('select-role', role)
}

const chartData = computed(() => ({
  labels: tableRows.value.map(r => r.role),
  datasets: [{
    data: tableRows.value.map(r => r.headcount),
    backgroundColor: tableRows.value.map((_, i) => colors[i % colors.length]),
    borderWidth: 2,
    borderColor: '#fff',
  }]
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: true,
  onClick(_event, elements) {
    if (!elements.length) return
    const row = tableRows.value[elements[0].index]
    if (row) selectRole(row.role)
  },
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label(ctx) {
          const row = tableRows.value[ctx.dataIndex]
          return `${row.role}: ${row.headcount}`
        }
      }
    }
  }
}))
</script>

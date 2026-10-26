<template>
  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">Test Coverage</h3>
      <button
        @click="navigateTo('test-coverage', 'coverage')"
        class="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
      >View coverage</button>
    </div>

    <div v-if="loading" class="space-y-3" data-testid="loading">
      <div v-for="i in 3" :key="i" class="h-9 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
    </div>

    <div v-else-if="error" class="text-sm text-red-600 dark:text-red-400">
      <p>{{ error }}</p>
      <button @click="load" class="mt-2 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">Retry</button>
    </div>

    <div v-else-if="!latest || !latest.available" class="text-sm text-gray-500 dark:text-gray-400 py-4 text-center" data-testid="empty-state">
      No coverage data has been synced yet.
    </div>

    <template v-else>
      <div class="grid grid-cols-3 gap-2">
        <div v-for="card in cards" :key="card.key" class="rounded-lg px-2.5 py-2 text-center" :class="card.classes">
          <div class="text-xl font-bold tabular-nums" :data-testid="`count-${card.key}`">{{ card.count }}</div>
          <div class="text-[10px] font-medium leading-tight mt-0.5">{{ card.label }}</div>
        </div>
      </div>
      <p class="mt-3 text-xs text-gray-400 dark:text-gray-500" data-testid="updated">
        {{ overview.length }} {{ overview.length === 1 ? 'area' : 'areas' }} · {{ wgs.length }} working {{ wgs.length === 1 ? 'group' : 'groups' }} · updated {{ updated }}
      </p>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { apiRequest } from '@shared/client/services/api.js'
import { useModuleLink } from '@shared/client/composables/useModuleLink.js'
import { useProjectId, projectQuery } from '@shared/client/composables/useProjectId.js'
import { formatRelativeTime } from '@shared/client/utils/format.js'

defineProps({ size: { type: String, default: 'half' } })

const { navigateTo } = useModuleLink()
const projectId = useProjectId()
const latest = ref(null)
const loading = ref(true)
const error = ref(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    latest.value = await apiRequest(`/modules/test-coverage/latest${projectQuery(projectId.value)}`)
  } catch (err) {
    error.value = err.message || 'Failed to load coverage'
  } finally {
    loading.value = false
  }
}

onMounted(load)

const overview = computed(() => (latest.value && latest.value.overview) || [])
const wgs = computed(() => (latest.value && latest.value.groups) || [])
const updated = computed(() => formatRelativeTime(latest.value && latest.value.lastRunAt))
const cards = computed(() => {
  const counts = { ready: 0, 'not ready': 0, 'insufficient evidence': 0 }
  for (const row of overview.value) counts[row.verdict] += 1
  return [
    { key: 'ready', label: 'Ready', count: counts.ready, classes: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' },
    { key: 'not-ready', label: 'Not ready', count: counts['not ready'], classes: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' },
    { key: 'insufficient', label: 'Insufficient evidence', count: counts['insufficient evidence'], classes: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400' }
  ]
})
</script>

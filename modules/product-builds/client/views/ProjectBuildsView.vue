<template>
  <div class="max-w-4xl mx-auto px-4 py-6">
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Build Registry</h1>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">Project build evidence — OCI images, Helm charts, and RPMs from the project registry.</p>
    </div>

    <div v-if="loading" class="space-y-4">
      <div class="animate-pulse bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 h-40"></div>
      <div class="animate-pulse bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 h-16"></div>
    </div>

    <div v-else-if="error" class="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-4 text-sm text-red-700 dark:text-red-400">
      {{ error }}
      <button class="ml-2 underline" @click="load">Retry</button>
    </div>

    <div v-else-if="unavailable" class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div class="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Build registry unavailable</div>
      <div class="text-sm text-gray-500 dark:text-gray-400">{{ unavailable.reason }}</div>
    </div>

    <template v-else-if="registry">
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <div class="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Registry summary</div>
        <div class="flex flex-wrap gap-6 text-sm">
          <div>
            <div class="text-2xl font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{{ summary.packageCount ?? 0 }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Packages</div>
          </div>
          <div>
            <div class="text-2xl font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{{ summary.sourceCount ?? 0 }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Sources</div>
          </div>
          <div>
            <div class="text-2xl font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{{ summary.failedSourceCount ?? 0 }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Failed sources</div>
          </div>
        </div>
        <div class="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700/60 text-xs">
          <span v-for="(count, type) in summary.packageTypes || {}" :key="type" class="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
            {{ type }} · {{ count }}
          </span>
        </div>
        <div v-if="summary.truncatedSourceCount > 0" class="mt-3 text-xs text-amber-600 dark:text-amber-400">
          {{ summary.truncatedSourceCount }} source(s) truncated at the capture limit
        </div>
        <div v-if="registry.partial" class="mt-1 text-xs text-gray-400 dark:text-gray-500">
          Partial capture — some sources are bounded by the collector's limits
        </div>
        <div class="mt-3 text-xs text-gray-400 dark:text-gray-500">
          Generated {{ formatDate(registry.generatedAt) }}
        </div>
      </div>

      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">
          Packages
        </div>
        <div class="divide-y divide-gray-100 dark:divide-gray-700/50 max-h-96 overflow-y-auto">
          <div v-for="pkg in packages" :key="pkg.id" class="px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-sm">
            <div class="min-w-0">
              <div class="font-medium text-gray-900 dark:text-gray-100 truncate">{{ pkg.name }}</div>
              <div class="text-xs text-gray-500 dark:text-gray-400 truncate">{{ pkg.repository }}</div>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                {{ pkg.packageType }}
              </span>
              <span class="text-xs text-gray-600 dark:text-gray-300 tabular-nums">{{ pkg.tag || pkg.digest?.slice(0, 12) }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { apiRequest } from '@shared/client/services/api.js'
import { useProjectId, projectQuery } from '@shared/client/composables/useProjectId.js'

const registry = ref(null)
const loading = ref(true)
const error = ref(null)
const unavailable = ref(null)

const summary = computed(() => registry.value?.data?.summary || {})
const packages = computed(() => {
  const list = registry.value?.data?.packages || []
  return [...list].sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')))
})

async function load() {
  loading.value = true
  error.value = null
  unavailable.value = null
  try {
    registry.value = await apiRequest(`/modules/product-builds/project-publication${projectQuery(useProjectId().value)}`)
  } catch (e) {
    if (e.status === 404) {
      unavailable.value = { reason: 'No build registry published for this project yet' }
    } else {
      error.value = e.message || 'Failed to load the build registry'
    }
  } finally {
    loading.value = false
  }
}

function formatDate(value) {
  if (!value) return 'unknown'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

onMounted(load)
watch(useProjectId(), () => load())
</script>

<template>
  <div class="max-w-6xl mx-auto py-6 px-4 space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Release Execution</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Bounded CI evidence — workflow runs, jobs, and artifacts for the project's recent releases
        </p>
      </div>
      <div class="text-right text-xs text-gray-500 dark:text-gray-400">
        <template v-if="envelope">
          Generated {{ formatDate(envelope.generatedAt) }}
          <p v-if="envelope.freshness !== 'fresh'" class="text-amber-600 dark:text-amber-400 font-semibold mt-0.5">
            ⚠ Publication is {{ envelope.freshness }}
          </p>
          <p v-if="envelope.partial === true" role="status" class="text-amber-600 dark:text-amber-400 font-semibold mt-0.5">
            ⚠ Partial evidence; counts follow the collector's bounded source coverage.
          </p>
        </template>
      </div>
    </div>

    <div v-if="loading" class="space-y-4">
      <div class="animate-pulse bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 h-32"></div>
    </div>

    <div v-else-if="error" class="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-4 text-sm text-red-700 dark:text-red-400">
      {{ error }}
      <button class="ml-2 underline" @click="load">Retry</button>
    </div>

    <div v-else-if="unavailable" class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div class="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Release execution evidence unavailable</div>
      <div class="text-sm text-gray-500 dark:text-gray-400">{{ unavailable }}</div>
    </div>

    <template v-else-if="data">
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div class="text-2xl font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{{ (data.workflowRuns || []).length }}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Workflow runs</div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div class="text-2xl font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{{ (data.jobs || []).length }}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Jobs</div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div class="text-2xl font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{{ (data.releases || []).length }}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Releases</div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div class="text-2xl font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{{ (data.artifacts || []).length }}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Artifacts</div>
        </div>
      </div>

      <section v-if="diagnostics" aria-label="Release execution coverage" class="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div class="border-b border-gray-200 dark:border-gray-700 px-5 py-3">
          <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Collection coverage</h2>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {{ diagnostics.counts?.workflowRunCount ?? (data.workflowRuns || []).length }} workflow runs,
            {{ diagnostics.counts?.jobCount ?? (data.jobs || []).length }} jobs, and
            {{ diagnostics.counts?.artifactCount ?? (data.artifacts || []).length }} artifacts were published.
            <span v-if="diagnostics.bounded === true">The collector applies a bounded lookback and per-source limits.</span>
          </p>
        </div>
        <div class="p-5 space-y-4">
          <div v-if="unmatchedReleases.length" role="status">
            <h3 class="text-xs font-semibold text-amber-700 dark:text-amber-300">{{ unmatchedReleases.length }} release records have unmatched evidence</h3>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">These records were not confidently joined to a Jira release. Their evidence is shown without a guessed association.</p>
            <ul class="mt-2 divide-y divide-gray-100 dark:divide-gray-700">
              <li v-for="item in unmatchedReleases" :key="item.releaseId" class="flex flex-wrap items-baseline gap-x-3 py-2 text-xs">
                <span class="font-mono font-medium text-gray-800 dark:text-gray-200">{{ item.version || item.releaseId }}</span>
                <span class="text-gray-500 dark:text-gray-400">{{ item.releaseId }}</span>
                <span class="ml-auto text-gray-500 dark:text-gray-400">Observed: {{ (item.evidence || []).join(', ') || 'unknown' }}</span>
              </li>
            </ul>
          </div>
          <p v-else-if="Array.isArray(diagnostics.unmatched)" class="text-xs text-gray-500 dark:text-gray-400">
            The collector reported no unmatched release records.
          </p>
          <details v-if="truncatedSources.length" class="rounded-md border border-gray-200 dark:border-gray-700">
            <summary class="cursor-pointer px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300">
              Bounded or truncated evidence sources ({{ truncatedSources.length }})
            </summary>
            <ul class="border-t border-gray-200 dark:border-gray-700 px-3 py-2">
              <li v-for="(item, index) in truncatedSources" :key="`${item.repository || item.kind || 'source'}:${index}`" class="py-1 text-xs text-gray-600 dark:text-gray-300">
                {{ item.repository || item.directory || 'Collector' }} · {{ item.kind || 'bounded source' }}
                <span v-if="item.since"> · since {{ item.since }}</span>
                <span v-if="Number.isInteger(item.omitted)"> · {{ item.omitted }} omitted</span>
                <span v-else-if="Number.isInteger(item.limit)"> · limit {{ item.limit }}</span>
              </li>
            </ul>
          </details>
        </div>
      </section>

      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">
          Workflow runs
        </div>
        <div v-if="!(data.workflowRuns || []).length" class="px-6 py-6 text-sm text-gray-500 dark:text-gray-400">
          No workflow runs in the lookback window.
        </div>
        <div v-else class="divide-y divide-gray-100 dark:divide-gray-700/50 max-h-96 overflow-y-auto">
          <div v-for="run in data.workflowRuns" :key="run.id || run.runId" class="px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-sm">
            <div class="min-w-0">
              <div class="font-medium text-gray-900 dark:text-gray-100 truncate">{{ run.name || run.workflow || 'Workflow run' }}</div>
              <div class="text-xs text-gray-500 dark:text-gray-400 truncate">{{ run.repository || run.repo || '' }}</div>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border" :class="runBadgeClasses(run)">
                {{ run.status || run.conclusion || 'unknown' }}
              </span>
              <span class="text-xs text-gray-500 dark:text-gray-400 tabular-nums">{{ formatDate(run.createdAt || run.runAt) }}</span>
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

const envelope = ref(null)
const loading = ref(true)
const error = ref(null)
const unavailable = ref(null)
const data = ref(null)
const projectId = useProjectId()
let requestSequence = 0
const diagnostics = computed(() => data.value?.diagnostics || null)
const unmatchedReleases = computed(() => Array.isArray(diagnostics.value?.unmatched) ? diagnostics.value.unmatched : [])
const truncatedSources = computed(() => Array.isArray(diagnostics.value?.truncated) ? diagnostics.value.truncated : [])

function runBadgeClasses(run) {
  const status = String(run.status || run.conclusion || '').toLowerCase()
  if (['success', 'completed'].includes(status)) return 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/30'
  if (['failure', 'failed', 'timed_out'].includes(status)) return 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/30'
  if (['in_progress', 'queued', 'pending'].includes(status)) return 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/30'
  return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600'
}

function formatDate(value) {
  if (!value) return 'unknown'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

async function load() {
  const requestedProjectId = projectId.value
  const requestId = ++requestSequence
  loading.value = true
  error.value = null
  unavailable.value = null
  data.value = null
  envelope.value = null
  try {
    const next = await apiRequest(`/modules/system-health/release-execution${projectQuery(requestedProjectId)}`)
    if (requestId !== requestSequence || projectId.value !== requestedProjectId) return
    if (next?.projectId && next.projectId !== requestedProjectId) {
      throw new Error('Release execution response project identity mismatch')
    }
    envelope.value = next
    data.value = next?.data || null
    if (!data.value) unavailable.value = next?.error || 'No release execution publication for this project'
  } catch (e) {
    if (requestId !== requestSequence || projectId.value !== requestedProjectId) return
    if (e.status === 404) {
      unavailable.value = 'No release execution publication for this project yet'
    } else {
      error.value = e.message || 'Failed to load release execution evidence'
    }
  } finally {
    if (requestId === requestSequence && projectId.value === requestedProjectId) {
      loading.value = false
    }
  }
}

onMounted(load)
watch(projectId, () => load(), { flush: 'sync' })
</script>

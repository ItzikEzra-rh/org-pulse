<template>
  <div class="max-w-4xl mx-auto px-4 py-6 space-y-6">
    <div class="mb-2">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Design Documentation</h1>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Design-doc presence for this project — collected from the project's design-docs repository.
      </p>
    </div>

    <div v-if="loading" class="space-y-4">
      <div class="animate-pulse bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 h-32"></div>
    </div>

    <div v-else-if="error" class="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-4 text-sm text-red-700 dark:text-red-400">
      {{ error }}
      <button class="ml-2 underline" @click="load">Retry</button>
    </div>

    <div v-else-if="unavailable" class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div class="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Design-docs evidence unavailable</div>
      <div class="text-sm text-gray-500 dark:text-gray-400">{{ unavailable }}</div>
    </div>

    <template v-else-if="data">
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div class="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">Repository</div>
          <a
            v-if="repository" :href="`https://github.com/${repository}`" target="_blank" rel="noopener noreferrer"
            class="text-sm text-primary-600 dark:text-primary-400 hover:underline"
          >{{ repository }}<span v-if="branch" class="text-gray-500 dark:text-gray-400"> @ {{ branch }}</span></a>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <div class="text-2xl font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{{ data.featureCount ?? 0 }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Features</div>
          </div>
          <div>
            <div class="text-2xl font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{{ data.artifactCount ?? 0 }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Artifacts present</div>
          </div>
          <div>
            <div class="text-2xl font-semibold text-amber-600 dark:text-amber-400 tabular-nums">{{ data.missingArtifactCount ?? 0 }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Missing artifacts</div>
          </div>
          <div>
            <div class="text-2xl font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{{ data.pullRequestCount ?? 0 }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Design PRs</div>
          </div>
        </div>
        <div v-if="partial || freshness !== 'fresh'" class="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700/60 text-xs">
          <span v-if="partial" class="text-amber-600 dark:text-amber-400">Partial capture — bounded by collector limits. </span>
          <span v-if="freshness !== 'fresh'" class="text-amber-600 dark:text-amber-400">Publication is {{ freshness }}. </span>
          <span class="text-gray-400 dark:text-gray-500">Generated {{ formatDate(generatedAt) }}</span>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">
          Features
        </div>
        <div class="divide-y divide-gray-100 dark:divide-gray-700/50 max-h-[28rem] overflow-y-auto">
          <div v-for="feature in data.features || []" :key="feature.featurePath" class="px-6 py-3 text-sm">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="min-w-0">
                <span v-if="feature.jiraKey" class="font-medium text-gray-900 dark:text-gray-100">
                  <a :href="`https://redhat.atlassian.net/browse/${feature.jiraKey}`" target="_blank" rel="noopener noreferrer" class="hover:underline">{{ feature.jiraKey }}</a>
                  <span class="text-gray-400 dark:text-gray-500 font-normal"> — </span>
                  <span class="text-gray-700 dark:text-gray-300 font-normal">{{ feature.feature }}</span>
                </span>
                <span v-else class="font-medium text-gray-900 dark:text-gray-100">{{ feature.feature }}</span>
              </div>
              <div class="flex flex-wrap gap-1.5 shrink-0">
                <span v-for="artifact in feature.artifacts || []" :key="artifact.path" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border" :class="artifactBadgeClasses(artifact)">
                  {{ artifact.type }}
                </span>
              </div>
            </div>
            <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">{{ feature.release }}</div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { apiRequest } from '@shared/client/services/api.js'
import { useProjectId } from '@shared/client/composables/useProjectId.js'

const envelope = ref(null)
const loading = ref(true)
const error = ref(null)
const unavailable = ref(null)

const data = computed(() => envelope.value?.data || null)
const repository = computed(() => data.value?.repository || null)
const branch = computed(() => data.value?.branch || null)
const partial = computed(() => envelope.value?.partial === true)
const freshness = computed(() => envelope.value?.freshness)
const generatedAt = computed(() => envelope.value?.generatedAt)
const projectId = useProjectId()
let requestSequence = 0

function artifactBadgeClasses(artifact) {
  if (artifact.presence === 'present') return 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/30'
  if (artifact.presence === 'missing') return 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30'
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
  envelope.value = null
  try {
    if (!requestedProjectId) {
      unavailable.value = 'No project context selected'
      loading.value = false
      return
    }
    const next = await apiRequest(`/modules/ai-impact/project-design-docs?projectId=${encodeURIComponent(requestedProjectId)}`)
    if (requestId !== requestSequence || projectId.value !== requestedProjectId) return
    envelope.value = next
  } catch (e) {
    if (requestId !== requestSequence || projectId.value !== requestedProjectId) return
    if (e.status === 404) {
      unavailable.value = 'No design-docs publication for this project yet'
    } else {
      error.value = e.message || 'Failed to load design-docs evidence'
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

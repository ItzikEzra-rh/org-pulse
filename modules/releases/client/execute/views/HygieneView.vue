<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { apiRequest } from '@shared/client/services/api.js'
import { useProjectId } from '@shared/client/composables/useProjectId.js'
import LegacyHygieneView from './LegacyHygieneView.vue'
import ProjectHygieneBoard from '../components/hygiene/ProjectHygieneBoard.vue'

const projectId = useProjectId()
const selectedProjectId = ref('')
const projectName = ref('')
const contract = ref(null)
const loading = ref(true)
const error = ref(null)
const unavailable = ref(null)
let requestSequence = 0

const legacyMigration = computed(() => contract.value?.legacyMigration === true)
const result = computed(() => {
  const results = contract.value?.results
  if (!results || typeof results !== 'object' || Array.isArray(results)) return null
  const entries = Object.values(results)
  if (entries.length !== 1) return null
  const value = entries[0]
  if (!value || value.projectId !== selectedProjectId.value) return null
  if (value.profileRevision !== contract.value?.profileRevision) return null
  return value
})

const releaseHygiene = computed(() => result.value?.releaseHygiene || null)

async function load() {
  const requestId = ++requestSequence
  const requestedProjectId = projectId.value
  selectedProjectId.value = ''
  projectName.value = ''
  contract.value = null
  error.value = null
  unavailable.value = null
  loading.value = true

  try {
    let projects = []
    try {
      const discovery = await apiRequest('/projects')
      if (requestId !== requestSequence || projectId.value !== requestedProjectId) return
      projects = Array.isArray(discovery?.projects) ? discovery.projects : []
    } catch (cause) {
      if (!requestedProjectId) throw cause
    }

    let resolvedProjectId = requestedProjectId
    const selectedProject = requestedProjectId
      ? projects.find(project => project?.projectId === requestedProjectId)
      : projects.length === 1
        ? projects[0]
        : null
    if (!resolvedProjectId && typeof selectedProject?.projectId === 'string') {
      resolvedProjectId = selectedProject.projectId
    }
    if (!resolvedProjectId) {
      unavailable.value = projects.length > 1
        ? 'Select a project to view its Jira Hygiene evidence.'
        : 'No project profile is available for Jira Hygiene.'
      return
    }
    projectName.value = typeof selectedProject?.displayName === 'string'
      ? selectedProject.displayName
      : resolvedProjectId

    selectedProjectId.value = resolvedProjectId
    const response = await apiRequest(
      `/modules/releases/hygiene/project-hygiene?projectId=${encodeURIComponent(resolvedProjectId)}`
    )
    if (requestId !== requestSequence || projectId.value !== requestedProjectId) return
    if (response?.projectId !== resolvedProjectId) {
      throw new Error('Jira Hygiene response project identity mismatch')
    }
    if (response.state === 'unavailable' || response.state === 'inapplicable') {
      unavailable.value = response.message || response.error || 'Jira Hygiene is unavailable for this project.'
    } else if (!['supported', 'empty'].includes(response.state)) {
      throw new Error('Jira Hygiene response state is invalid')
    }
    contract.value = response
  } catch (cause) {
    if (requestId !== requestSequence || projectId.value !== requestedProjectId) return
    error.value = cause.message || 'Failed to load Jira Hygiene evidence'
    contract.value = null
  } finally {
    if (requestId === requestSequence && projectId.value === requestedProjectId) {
      loading.value = false
    }
  }
}

onMounted(load)
watch(projectId, load, { flush: 'sync' })
</script>

<template>
  <div class="space-y-4">
    <div v-if="loading" role="status" class="text-center py-12 text-sm text-gray-500 dark:text-gray-400">
      Loading Jira Hygiene evidence...
    </div>

    <div
      v-else-if="error"
      role="alert"
      class="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-400"
    >
      {{ error }}
      <button class="ml-2 underline" @click="load">Retry</button>
    </div>

    <LegacyHygieneView v-else-if="legacyMigration" />

    <div
      v-else-if="unavailable"
      role="status"
      class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-5 text-sm text-gray-600 dark:text-gray-300"
    >
      {{ unavailable }}
    </div>

    <ProjectHygieneBoard
      v-else-if="releaseHygiene"
      :hygiene="releaseHygiene"
      :project-name="projectName"
      :generated-at="contract?.generatedAt"
      :freshness="contract?.freshness"
      :partial="contract?.partial"
    />

    <div
      v-else-if="contract"
      role="status"
      class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-5 text-sm text-gray-600 dark:text-gray-300"
    >
      Release Hygiene attribution has not been published for {{ projectName || selectedProjectId }}.
    </div>
  </div>
</template>

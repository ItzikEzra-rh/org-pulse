<template>
  <select
    v-if="projects.length > 1"
    id="project-selector"
    class="px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer transition-colors duration-200"
    :value="selectedProjectId"
    :disabled="updating"
    aria-label="Project context"
    @change="onSelect"
  >
    <option v-if="unknownProjectId" :value="unknownProjectId" disabled>
      Unknown project: {{ unknownProjectId }}
    </option>
    <option v-for="project in projects" :key="project.projectId" :value="project.projectId">
      {{ project.displayName }}
    </option>
  </select>
</template>

<script setup>
import { inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { apiRequest } from '@shared/client/services/api.js'

const emit = defineEmits(['context-state'])
const nav = inject('moduleNav', null)
const projects = ref([])
const selectedProjectId = ref('')
const updating = ref(false)
const unknownProjectId = ref('')
const PROJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const PROJECT_DISCOVERY_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000]
let isMounted = false
let retryTimer = null
let cancelRetryWait = null
let discoveryAbortController = null

function validateProjectsResponse(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)
      || !Array.isArray(data.projects) || data.projects.length === 0) {
    throw new Error('Published project list is missing or empty')
  }

  const projectIds = new Set()
  return data.projects.map(project => {
    if (!project || typeof project !== 'object' || Array.isArray(project)
        || typeof project.projectId !== 'string'
        || !PROJECT_ID_PATTERN.test(project.projectId)
        || typeof project.displayName !== 'string'
        || project.displayName.trim() === '') {
      throw new Error('Published project list contains an invalid entry')
    }
    if (projectIds.has(project.projectId)) {
      throw new Error(`Published project list contains a duplicate ID: ${project.projectId}`)
    }
    projectIds.add(project.projectId)
    return { projectId: project.projectId, displayName: project.displayName.trim() }
  })
}

function readProjectIdFromHash() {
  const query = (window.location.hash || '#/').split('?').slice(1).join('?')
  return new URLSearchParams(query).get('projectId') || ''
}

function currentProjectId() {
  const params = nav?.params.value
  if (params && Object.prototype.hasOwnProperty.call(params, 'projectId')) {
    return params.projectId || ''
  }
  return readProjectIdFromHash()
}

function setContextState(state, projectId = '') {
  emit('context-state', { state, projectId: projectId || null })
}

function resolveProjectContext(projectId = currentProjectId()) {
  const requestedId = projectId || ''
  unknownProjectId.value = ''

  if (requestedId) {
    if (!projects.value.some(project => project.projectId === requestedId)) {
      selectedProjectId.value = requestedId
      unknownProjectId.value = requestedId
      setContextState('not-found', requestedId)
      return
    }
    selectedProjectId.value = requestedId
    setContextState('ready', requestedId)
    return
  }

  if (projects.value.length === 0) {
    selectedProjectId.value = ''
    setContextState('unavailable')
    return
  }

  const defaultProject = projects.value[0]
  if (projects.value.length === 1 && defaultProject.projectId === 'osac') {
    selectedProjectId.value = ''
    setContextState('ready')
    return
  }
  selectedProjectId.value = defaultProject.projectId
  // The selector must set the context in the URL too; a visual default alone
  // leaves every project-aware request unqualified.
  nav?.updateParams({ projectId: defaultProject.projectId }, { push: false })
  setContextState('ready', defaultProject.projectId)
}

function waitForRetry(delayMs) {
  return new Promise(resolve => {
    cancelRetryWait = resolve
    retryTimer = setTimeout(() => {
      retryTimer = null
      cancelRetryWait = null
      resolve(true)
    }, delayMs)
  })
}

function cancelPendingRetry() {
  if (retryTimer !== null) clearTimeout(retryTimer)
  retryTimer = null
  if (cancelRetryWait) {
    const resolve = cancelRetryWait
    cancelRetryWait = null
    resolve(false)
  }
}

async function loadProjects() {
  let lastError
  for (let attempt = 0; attempt <= PROJECT_DISCOVERY_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      discoveryAbortController = new AbortController()
      const data = await apiRequest('/projects', { signal: discoveryAbortController.signal })
      discoveryAbortController = null
      if (!isMounted) return
      projects.value = validateProjectsResponse(data)
      // Read the route only after discovery completes so navigation during a
      // retry resolves against the latest project ID.
      resolveProjectContext()
      return
    } catch (error) {
      discoveryAbortController = null
      if (!isMounted) return

      lastError = error
      const retryDelayMs = PROJECT_DISCOVERY_RETRY_DELAYS_MS[attempt]
      if (error?.status !== 503 || retryDelayMs === undefined) break
      const shouldRetry = await waitForRetry(retryDelayMs)
      if (!shouldRetry || !isMounted) return
    }
  }

  if (!isMounted) return
  console.error('Failed to load projects:', lastError)
  setContextState('unavailable')
}

onMounted(() => {
  isMounted = true
  setContextState('loading')
  void loadProjects()
})

onBeforeUnmount(() => {
  isMounted = false
  discoveryAbortController?.abort()
  discoveryAbortController = null
  cancelPendingRetry()
})

// Keep the selection and the app's project context aligned after navigation,
// including browser history changes and manually edited project IDs.
watch(() => nav?.params.value?.projectId, current => {
  if (!projects.value.length) return
  resolveProjectContext(current ?? readProjectIdFromHash())
})

function onSelect(event) {
  const projectId = event.target.value
  if (!nav || projectId === selectedProjectId.value) return
  setContextState('loading', projectId)
  updating.value = true
  nav.updateParams({ projectId })
  selectedProjectId.value = projectId
  updating.value = false
}
</script>

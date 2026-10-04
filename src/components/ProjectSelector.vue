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
import { inject, onMounted, ref, watch } from 'vue'
import { apiRequest } from '@shared/client/services/api.js'

const emit = defineEmits(['context-state'])
const nav = inject('moduleNav', null)
const projects = ref([])
const selectedProjectId = ref('')
const updating = ref(false)
const unknownProjectId = ref('')

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
    setContextState('ready')
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

onMounted(async () => {
  setContextState('loading')
  try {
    const data = await apiRequest('/projects')
    projects.value = Array.isArray(data.projects) ? data.projects : []
    resolveProjectContext()
  } catch (error) {
    console.error('Failed to load projects:', error)
    setContextState('unavailable')
  }
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

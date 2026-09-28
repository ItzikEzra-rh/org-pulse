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
    <option v-for="project in projects" :key="project.projectId" :value="project.projectId">
      {{ project.displayName }}
    </option>
  </select>
</template>

<script setup>
import { inject, onMounted, ref } from 'vue'
import { apiRequest } from '@shared/client/services/api.js'

const nav = inject('moduleNav', null)
const projects = ref([])
const selectedProjectId = ref('')
const updating = ref(false)

onMounted(async () => {
  try {
    const data = await apiRequest('/projects')
    projects.value = data.projects || []
    const current = nav?.params.value?.projectId
    selectedProjectId.value =
      current && projects.value.some(p => p.projectId === current)
        ? current
        : (projects.value[0]?.projectId || '')
  } catch (error) {
    console.error('Failed to load projects:', error)
  }
})

function onSelect(event) {
  const projectId = event.target.value
  if (!nav || projectId === selectedProjectId.value) return
  updating.value = true
  nav.updateParams({ projectId })
  selectedProjectId.value = projectId
  updating.value = false
}
</script>

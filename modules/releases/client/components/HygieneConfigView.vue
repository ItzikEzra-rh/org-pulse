<template>
  <div class="max-w-4xl mx-auto">
    <!-- Loading -->
    <div v-if="loading" class="text-center py-12 text-gray-500 dark:text-gray-400">
      Loading hygiene rules...
    </div>

    <!-- Not yet published (404) -->
    <div v-else-if="notPublished" class="text-center py-12 text-gray-500 dark:text-gray-400">
      {{ loadError }}
    </div>

    <!-- Other load failure -->
    <div v-else-if="loadError" class="text-center py-12">
      <p class="text-red-600 dark:text-red-400">{{ loadError }}</p>
      <button @click="fetchConfig" class="mt-3 text-sm text-primary-600 hover:text-primary-700">Retry</button>
    </div>

    <!-- No projects configured -->
    <div v-else-if="projectEntries.length === 0" class="text-center py-12 text-gray-500 dark:text-gray-400">
      No hygiene rules are configured yet.
    </div>

    <template v-else>
      <div v-for="[projectKey, project] in projectEntries" :key="projectKey" class="mb-10 last:mb-0">
        <!-- Scope -->
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-5 mb-6">
          <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Scope</h3>
          <dl class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
            <dt class="text-gray-500 dark:text-gray-400">Project</dt>
            <dd class="text-gray-900 dark:text-gray-100">{{ project.displayName || projectKey }} ({{ projectKey }})</dd>
            <template v-for="(fieldId, fieldName) in project.fieldMappings" :key="fieldName">
              <dt class="text-gray-500 dark:text-gray-400 capitalize">{{ fieldName }} field</dt>
              <dd class="text-gray-900 dark:text-gray-100 font-mono text-xs">{{ fieldId }}</dd>
            </template>
          </dl>
        </div>

        <!-- Rules by category -->
        <div class="space-y-4">
          <div
            v-for="category in groupRulesByCategory(project.rules)"
            :key="category.key"
            class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm"
          >
            <div class="px-5 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {{ category.label }}
                <span class="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">
                  ({{ category.rules.length }} rule{{ category.rules.length !== 1 ? 's' : '' }})
                </span>
              </h3>
            </div>
            <div class="divide-y divide-gray-100 dark:divide-gray-700">
              <div v-for="rule in category.rules" :key="rule.id" class="px-5 py-4">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ rule.name }}</span>
                  <span class="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                    {{ rule.category }}
                  </span>
                </div>
                <p v-if="rule.description" class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{{ rule.description }}</p>
                <pre
                  v-if="rule.jql"
                  class="mt-2 px-3 py-2 bg-gray-50 dark:bg-gray-900 rounded text-xs font-mono text-gray-700 dark:text-gray-300 overflow-x-auto"
                >{{ rule.jql }}</pre>
              </div>
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

const loading = ref(true)
const loadError = ref('')
const notPublished = ref(false)
const config = ref(null)
const projectId = useProjectId()
let latestRequestId = 0

const projectEntries = computed(() => {
  const projects = config.value && config.value.projects
  if (!projects || typeof projects !== 'object') return []
  return Object.entries(projects)
})

function categoryLabel(key) {
  return key.charAt(0).toUpperCase() + key.slice(1)
}

function groupRulesByCategory(rules) {
  const groups = {}
  for (const rule of rules || []) {
    const key = rule.category || 'other'
    if (!groups[key]) {
      groups[key] = { key, label: categoryLabel(key), rules: [] }
    }
    groups[key].rules.push(rule)
  }
  return Object.values(groups)
}

async function fetchConfig() {
  const requestId = ++latestRequestId
  const requestedProjectId = projectId.value
  loading.value = true
  loadError.value = ''
  notPublished.value = false
  config.value = null
  try {
    const data = await apiRequest(`/modules/releases/hygiene/project-hygiene/config${projectQuery(requestedProjectId)}`)
    if (requestId !== latestRequestId || projectId.value !== requestedProjectId) return
    config.value = data
  } catch (e) {
    if (requestId !== latestRequestId || projectId.value !== requestedProjectId) return
    config.value = null
    if (e.status === 404) {
      notPublished.value = true
      loadError.value = (e.data && e.data.error) || 'Project Hygiene configuration has not been published yet.'
    } else {
      loadError.value = e.message || 'Project hygiene configuration is currently unavailable.'
    }
  } finally {
    if (requestId === latestRequestId && projectId.value === requestedProjectId) loading.value = false
  }
}

onMounted(fetchConfig)

watch(projectId, fetchConfig, { flush: 'sync' })
</script>

<script setup>
import { computed, ref, watch } from 'vue'
import { apiRequest } from '@shared/client/services/api.js'
import { useProjectId } from '@shared/client/composables/useProjectId.js'

const PROJECTS_ENDPOINT = '/projects'
const APPROVED_DASHBOARD_ORIGIN = 'https://devtools.pages.redhat.com'
const APPROVED_DASHBOARD_PATH = '/n8n-pulumi-poc'

const projectId = useProjectId()
const projectName = ref('')
const selectedProjectId = ref('')
const capability = ref(null)
const state = ref('loading')
const reason = ref('')
let requestSequence = 0

const dashboardUrl = computed(() => {
  if (state.value !== 'supported' || typeof capability.value?.url !== 'string') return ''
  return approvedDashboardUrl(capability.value.url, selectedProjectId.value)
})

const dashboardTitle = computed(() => {
  const title = capability.value?.title || 'Operational Metrics'
  return projectName.value ? `${title} — ${projectName.value}` : title
})

const statusHeading = computed(() => {
  if (state.value === 'not-found') return 'Project not found'
  if (state.value === 'empty' && !projectName.value) return 'Select a project'
  if (state.value === 'empty') return `No operational metrics published for ${projectName.value}`
  if (state.value === 'inaccessible') return 'Operational Metrics source inaccessible'
  if (state.value === 'disabled') return 'Operational Metrics disabled'
  if (state.value === 'source-only') return 'Operational Metrics source is not served as a dashboard'
  if (state.value === 'error') return 'Operational Metrics refresh failed'
  return 'Operational Metrics unavailable'
})

const freshnessLabel = computed(() => {
  if (['not-found', 'inapplicable', 'disabled'].includes(state.value)
      || (state.value === 'empty' && !projectName.value)) return 'not applicable'
  if (state.value === 'supported') return 'not reported by the external dashboard'
  return 'unknown'
})

async function loadCapability() {
  const requestedProjectId = projectId.value
  const requestId = ++requestSequence
  projectName.value = ''
  selectedProjectId.value = ''
  capability.value = null
  reason.value = ''
  state.value = 'loading'

  try {
    const response = await apiRequest(PROJECTS_ENDPOINT)
    if (requestId !== requestSequence || projectId.value !== requestedProjectId) return
    if (!response || !Array.isArray(response.projects)) {
      throw new Error('The published project list is invalid.')
    }

    const selectedProject = requestedProjectId
      ? response.projects.find(project => project?.projectId === requestedProjectId)
      : response.projects.length === 1
        ? response.projects[0]
        : null

    if (!selectedProject) {
      state.value = requestedProjectId ? 'not-found' : 'empty'
      reason.value = requestedProjectId
        ? `No published project matches “${requestedProjectId}”.`
        : 'Select a project to view its operational metrics.'
      return
    }

    projectName.value = typeof selectedProject.displayName === 'string'
      ? selectedProject.displayName
      : ''
    selectedProjectId.value = selectedProject.projectId
    const nextCapability = selectedProject.capabilities?.operationalMetrics
    if (!nextCapability || typeof nextCapability !== 'object') {
      state.value = 'unavailable'
      reason.value = 'The published project profile does not declare an Operational Metrics source.'
      return
    }

    const supportedUrlIsValid = nextCapability.state === 'supported'
      && typeof nextCapability.url === 'string'
      && Boolean(approvedDashboardUrl(nextCapability.url, selectedProjectId.value))
    capability.value = nextCapability
    state.value = supportedUrlIsValid ? 'supported' : nextCapability.state
    if (nextCapability.state === 'supported' && !supportedUrlIsValid) {
      state.value = 'unavailable'
      reason.value = 'The published Operational Metrics URL is missing or invalid.'
    } else {
      reason.value = typeof nextCapability.reason === 'string' && nextCapability.reason.trim()
        ? nextCapability.reason.trim()
        : defaultReason(nextCapability.state)
    }
  } catch (error) {
    if (requestId !== requestSequence || projectId.value !== requestedProjectId) return
    state.value = 'unavailable'
    reason.value = error.message || 'Failed to load the project capability.'
  }
}

function approvedDashboardUrl(value, expectedProjectId) {
  try {
    const url = new URL(value)
    const products = url.searchParams.getAll('product')
    const fragmentQueryStart = url.hash.indexOf('?')
    if (fragmentQueryStart >= 0) {
      const fragmentParams = new URLSearchParams(url.hash.slice(fragmentQueryStart + 1))
      products.push(...fragmentParams.getAll('product'))
    }
    if (url.protocol === 'https:'
        && url.origin === APPROVED_DASHBOARD_ORIGIN
        && !url.username
        && !url.password
        && (url.pathname === APPROVED_DASHBOARD_PATH
          || url.pathname.startsWith(`${APPROVED_DASHBOARD_PATH}/`))
        && products.length === 1
        && products[0] === expectedProjectId) {
      return url.href
    }
  } catch {
    // Invalid URLs are not exposed as links or iframe sources.
  }
  return ''
}

function defaultReason(capabilityState) {
  if (capabilityState === 'inapplicable') return 'The published project profile marks this source as inapplicable.'
  if (capabilityState === 'empty') return 'The source is supported, but no operational metrics have been published.'
  if (capabilityState === 'inaccessible') return 'The configured operational metrics source could not be accessed.'
  if (capabilityState === 'disabled') return 'The operational metrics source is disabled for this project.'
  if (capabilityState === 'source-only') return 'A source is configured, but it is not served as an operational dashboard.'
  if (capabilityState === 'error') return 'The latest operational metrics refresh failed.'
  return 'The published project profile does not mark this source as supported.'
}

watch(projectId, loadCapability, { flush: 'sync', immediate: true })
</script>

<template>
  <div class="flex flex-col -mx-6 -my-6 lg:-mx-8 min-h-[calc(100vh-4rem)]">
    <div class="px-6 lg:px-8 pt-3 pb-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shrink-0">
      <div class="flex items-center justify-between gap-4">
        <h1 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Operational Metrics</h1>
        <a
          v-if="state === 'supported' && dashboardUrl"
          :href="dashboardUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="shrink-0 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
        >Open in new tab</a>
      </div>
    </div>

    <div v-if="state === 'loading'" class="px-6 lg:px-8 py-10 text-sm text-gray-500 dark:text-gray-400" role="status">
      Loading operational metrics availability…
    </div>

    <section
      v-else-if="state === 'supported' && dashboardUrl"
      class="flex flex-col min-h-0 flex-1"
      aria-label="Supported operational metrics"
    >
      <div class="px-6 lg:px-8 py-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700" role="status">
        <span>Project: {{ projectName }}</span>
        <span>State: supported</span>
        <span>Freshness: {{ freshnessLabel }}</span>
      </div>
      <iframe
        :key="`${projectId}:${dashboardUrl}`"
        :src="dashboardUrl"
        :title="dashboardTitle"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        class="w-full flex-1 border-0 block min-h-0 h-[calc(100vh-9rem)]"
      />
    </section>

    <section
      v-else-if="state === 'inapplicable'"
      class="m-6 lg:m-8 max-w-2xl rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6"
      role="status"
    >
      <h2 class="text-base font-semibold text-gray-900 dark:text-gray-100">
        Operational Metrics is not applicable to {{ projectName || 'this project' }}
      </h2>
      <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">{{ reason }}</p>
      <p class="mt-3 text-xs text-gray-500 dark:text-gray-400">State: inapplicable · Freshness: {{ freshnessLabel }}</p>
    </section>

    <section
      v-else
      class="m-6 lg:m-8 max-w-2xl rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6"
      role="status"
    >
      <h2 class="text-base font-semibold text-gray-900 dark:text-gray-100">{{ statusHeading }}</h2>
      <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">{{ reason }}</p>
      <p class="mt-3 text-xs text-gray-500 dark:text-gray-400">
        State: {{ state }} · Freshness: {{ freshnessLabel }}
      </p>
    </section>
  </div>
</template>

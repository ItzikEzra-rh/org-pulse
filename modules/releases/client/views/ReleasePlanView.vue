<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { apiRequest } from '@shared/client/services/api.js'
import { useProjectId, projectQuery } from '@shared/client/composables/useProjectId.js'

const versions = ref([])
const versionEntries = ref([])
const selectedVersion = ref('')
const plan = ref(null)
const indexPublication = ref(null)
const planPublication = ref(null)
const loading = ref(true)
const error = ref(null)
const selectedProjectName = ref('')
const projectId = useProjectId()

const selectedVersionEntry = computed(() =>
  versionEntries.value.find(entry => entry.version === selectedVersion.value) || null
)
const isEvidencePlan = computed(() => Array.isArray(plan.value?.planEntries))
const publicationState = computed(() =>
  planPublication.value?.state || selectedVersionEntry.value?.state || indexPublication.value?.state || 'unknown'
)
const publicationFreshness = computed(() =>
  planPublication.value?.freshness || selectedVersionEntry.value?.freshness || indexPublication.value?.freshness || 'unknown'
)
const publicationPartial = computed(() => {
  const value = planPublication.value?.partial ?? selectedVersionEntry.value?.partial ?? indexPublication.value?.partial
  return typeof value === 'boolean' ? value : null
})
const publicationGeneratedAt = computed(() =>
  planPublication.value?.generatedAt || plan.value?.metadata?.generatedAt || plan.value?.generatedAt ||
  selectedVersionEntry.value?.generatedAt || indexPublication.value?.generatedAt || null
)
const publicationSources = computed(() => Array.isArray(planPublication.value?.sourceRefs)
  ? planPublication.value.sourceRefs
  : [])
const planTitle = computed(() => plan.value?.displayName ||
  [selectedProjectName.value || 'Release', plan.value?.metadata?.version || plan.value?.version || selectedVersion.value]
    .filter(Boolean).join(' ')
)

function jiraLink(key) {
  return `https://redhat.atlassian.net/browse/${key}`
}

function hasProjectIdentityMismatch(publication, requestedProjectId) {
  if (!requestedProjectId) return false
  return [publication?.projectId, publication?.data?.projectId]
    .some(responseProjectId => responseProjectId != null && responseProjectId !== requestedProjectId)
}

let bootstrapRequestId = 0
let planRequestId = 0
let projectNameRequestId = 0
let settingVersionFromBootstrap = false

async function loadProjectName(requestedProjectId) {
  const requestId = ++projectNameRequestId
  selectedProjectName.value = ''
  try {
    const data = await apiRequest('/projects')
    if (requestId !== projectNameRequestId || projectId.value !== requestedProjectId) return
    const projects = Array.isArray(data?.projects) ? data.projects : []
    const selectedProject = requestedProjectId
      ? projects.find(project => project?.projectId === requestedProjectId)
      : projects.length === 1
        ? projects[0]
        : null
    selectedProjectName.value = typeof selectedProject?.displayName === 'string'
      ? selectedProject.displayName
      : ''
  } catch {
    // Keep the heading generic when project discovery is unavailable.
  }
}

async function loadPlan(version, requestedProjectId = projectId.value) {
  const requestId = ++planRequestId
  if (!version) {
    plan.value = null
    loading.value = false
    return
  }
  loading.value = true
  error.value = null
  plan.value = null
  planPublication.value = null
  try {
    const params = new URLSearchParams({ version })
    if (requestedProjectId) params.set('projectId', requestedProjectId)
    const nextPublication = await apiRequest(`/modules/releases/release-plan?${params.toString()}`)
    if (requestId !== planRequestId || projectId.value !== requestedProjectId) return
    if (hasProjectIdentityMismatch(nextPublication, requestedProjectId)) {
      throw new Error('Release plan response project identity mismatch')
    }
    planPublication.value = nextPublication?.data && typeof nextPublication.data === 'object'
      ? nextPublication
      : null
    plan.value = planPublication.value ? nextPublication.data : nextPublication
  } catch (e) {
    if (requestId === planRequestId && projectId.value === requestedProjectId) {
      error.value = e.message || 'Failed to load release plan'
      plan.value = null
    }
  } finally {
    if (requestId === planRequestId && projectId.value === requestedProjectId) loading.value = false
  }
}

watch(selectedVersion, (version) => {
  if (!settingVersionFromBootstrap) loadPlan(version, projectId.value)
}, { flush: 'sync' })

async function bootstrap() {
  const requestedProjectId = projectId.value
  const requestId = ++bootstrapRequestId
  planRequestId += 1
  void loadProjectName(requestedProjectId)
  versions.value = []
  versionEntries.value = []
  indexPublication.value = null
  plan.value = null
  planPublication.value = null
  error.value = null
  settingVersionFromBootstrap = true
  selectedVersion.value = ''
  settingVersionFromBootstrap = false
  loading.value = true
  try {
    const publication = await apiRequest(`/modules/releases/release-plans${projectQuery(requestedProjectId)}`)
    if (requestId !== bootstrapRequestId || projectId.value !== requestedProjectId) return
    if (hasProjectIdentityMismatch(publication, requestedProjectId)) {
      throw new Error('Release plan index project identity mismatch')
    }
    indexPublication.value = publication?.data && typeof publication.data === 'object'
      ? publication
      : null
    const data = indexPublication.value ? publication.data : publication
    // Index entries are version-metadata objects ({ version, generatedAt, ...}),
    // not bare strings — normalize to the version string the picker/API need.
    versionEntries.value = Array.isArray(data?.versions)
      ? data.versions.map(value => typeof value === 'string' ? { version: value } : value).filter(value => value?.version)
      : []
    versions.value = versionEntries.value.map(entry => entry.version)
    if (versions.value.length === 0) {
      loading.value = false
      return
    }

    const latestVersion = versions.value[versions.value.length - 1]
    settingVersionFromBootstrap = true
    selectedVersion.value = latestVersion
    settingVersionFromBootstrap = false
    await loadPlan(latestVersion, requestedProjectId)
  } catch (e) {
    if (requestId !== bootstrapRequestId || projectId.value !== requestedProjectId) return
    error.value = e.message || 'Failed to load release plan versions'
    versions.value = []
    versionEntries.value = []
    indexPublication.value = null
    plan.value = null
    planPublication.value = null
    loading.value = false
  }
}

function retry() {
  if (selectedVersion.value) {
    loadPlan(selectedVersion.value)
  } else {
    bootstrap()
  }
}

onMounted(bootstrap)

// Re-bootstrap when the project context changes
watch(projectId, () => bootstrap(), { flush: 'sync' })

const matrixCells = computed(() => {
  if (!plan.value) return {}
  const services = plan.value.serviceMatrix?.services || []
  const rows = plan.value.serviceMatrix?.rows || []
  const result = {}
  for (const row of rows) {
    result[row.dimension] = services.map((service) => ({
      service,
      value: row.cells?.[service]
    }))
  }
  return result
})

// Version strings look like "0.1", "0.2", or "+<TARGET>" — strip the
// leading "+" and compare dotted segments numerically so cumulative
// items/cells render oldest-first regardless of producer ordering.
function versionSortKey(version) {
  return (version || '').replace(/^\+/, '').split('.').map((n) => parseInt(n, 10) || 0)
}

function compareVersions(a, b) {
  const ka = versionSortKey(a)
  const kb = versionSortKey(b)
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    const diff = (ka[i] || 0) - (kb[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

const sortedUseCaseCards = computed(() => {
  const cards = plan.value?.useCaseCards || []
  return cards.map((card) => ({
    ...card,
    items: [...(card.items || [])].sort((a, b) => compareVersions(a.version, b.version))
  }))
})

// Prior-version items are fetched regardless of Jira status, so a
// not-yet-finished feature can appear alongside shipped ones. Flag it
// only when it isn't the target version and its status isn't Closed/Done
// -- a target-version item being Planned/In Progress is expected.
function isUnfinishedPriorWork(item) {
  if (item.isTarget) return false
  const status = item.status || ''
  return status !== '' && !status.startsWith('Done') && !status.startsWith('Closed')
}

function policyStateLabel(policy) {
  if (!policy || typeof policy.state !== 'string') return 'Unknown'
  if (policy.state === 'supported' && typeof policy.value === 'boolean') return policy.value ? 'Yes' : 'No'
  if (policy.state === 'empty') return 'No evidence'
  if (policy.state === 'inapplicable') return 'Not applicable'
  return 'Unknown'
}

function issueStatus(entry) {
  return entry?.status?.raw?.name || entry?.status?.name || 'Unknown'
}

function issueType(entry) {
  return entry?.issueType?.name || entry?.issueType || 'Unknown'
}
</script>

<template>
  <div class="max-w-6xl mx-auto py-6 px-4 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Release Plan</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          <template v-if="isEvidencePlan">Observed release scope and linked evidence for the selected project.</template>
          <template v-else>Forward-looking view of what a version will deliver for the selected project.</template>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <label for="release-plan-version" class="text-sm font-medium text-gray-700 dark:text-gray-300">Version:</label>
        <select
          id="release-plan-version"
          v-model="selectedVersion"
          class="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
        >
          <option v-if="versions.length === 0" value="">No versions available</option>
          <option v-for="v in versions" :key="v" :value="v">{{ v }}</option>
        </select>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-12 text-sm text-gray-500 dark:text-gray-400">
      Loading release plan...
    </div>

    <!-- Error -->
    <div
      v-else-if="error"
      class="text-center py-16 bg-white dark:bg-gray-800 rounded-lg border border-red-200 dark:border-red-700/50"
    >
      <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">Failed to load release plan</h3>
      <p class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>
      <button
        @click="retry"
        class="mt-4 px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
      >Try again</button>
    </div>

    <!-- Empty -->
    <div
      v-else-if="!plan"
      class="text-center py-16 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
    >
      <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">No release plan published</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        No release-plan version is available yet.
      </p>
    </div>

    <template v-else>
      <section class="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-xs text-gray-600 dark:text-gray-300" aria-label="Release plan publication status">
        <span><strong class="font-semibold">Publication:</strong> {{ publicationState }}</span>
        <span><strong class="font-semibold">Freshness:</strong> {{ publicationFreshness }}</span>
        <span v-if="publicationPartial === true" class="font-semibold text-amber-700 dark:text-amber-300">Partial evidence</span>
        <span v-else-if="publicationPartial === false">Completeness: complete</span>
        <span v-else>Completeness: unknown</span>
        <span class="ml-auto">Generated {{ publicationGeneratedAt || 'unknown' }}</span>
      </section>

      <details v-if="publicationSources.length" class="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <summary class="cursor-pointer px-4 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300">Source evidence freshness ({{ publicationSources.length }})</summary>
        <ul class="divide-y divide-gray-100 dark:divide-gray-700 border-t border-gray-200 dark:border-gray-700 px-4">
          <li v-for="(source, index) in publicationSources" :key="`${source.name || source.artifactKey || 'source'}:${index}`" class="flex flex-wrap gap-x-3 py-2 text-xs">
            <span class="font-medium text-gray-800 dark:text-gray-200">{{ source.name || source.source?.id || source.artifactKey }}</span>
            <span class="text-gray-600 dark:text-gray-300">{{ source.state || 'unknown' }} · freshness {{ source.freshness || 'unknown' }}</span>
            <span v-if="source.partial === true" class="text-amber-700 dark:text-amber-300">partial</span>
          </li>
        </ul>
      </details>

      <template v-if="isEvidencePlan">
        <section class="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ plan.displayName || selectedVersion }}</h2>
              <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">Evidence-derived Jira scope and traceability. This view does not infer release readiness.</p>
            </div>
            <span class="rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-300">
              Registry state: {{ plan.release?.state || 'unknown' }}
            </span>
          </div>
          <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div class="rounded-md bg-gray-50 dark:bg-gray-900/40 p-3">
              <div class="text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ plan.planEntryCount ?? 'Unknown' }}</div>
              <div class="text-[11px] text-gray-500 dark:text-gray-400">Jira plan entries</div>
            </div>
            <div class="rounded-md bg-gray-50 dark:bg-gray-900/40 p-3">
              <div class="text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ plan.explicitTargetCount ?? 'Unknown' }}</div>
              <div class="text-[11px] text-gray-500 dark:text-gray-400">Explicit Fix Version targets</div>
            </div>
            <div class="rounded-md bg-gray-50 dark:bg-gray-900/40 p-3">
              <div class="text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ plan.derivedTargetCount ?? 'Unknown' }}</div>
              <div class="text-[11px] text-gray-500 dark:text-gray-400">Hierarchy-derived targets</div>
            </div>
            <div class="rounded-md bg-gray-50 dark:bg-gray-900/40 p-3">
              <div class="text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ plan.mergedPRCount ?? 'Unknown' }}</div>
              <div class="text-[11px] text-gray-500 dark:text-gray-400">Traceable merged PRs</div>
            </div>
          </div>
          <div class="mt-4 grid gap-3 sm:grid-cols-3">
            <div v-for="name in ['freeze', 'readiness', 'shipped']" :key="name" class="rounded-md border border-gray-200 dark:border-gray-700 p-3">
              <div class="text-xs font-semibold capitalize text-gray-700 dark:text-gray-300">{{ name }}</div>
              <div class="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{{ policyStateLabel(plan.derived?.[name]) }}</div>
              <p v-if="plan.derived?.[name]?.reason" class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ plan.derived[name].reason }}</p>
            </div>
          </div>
        </section>

        <details v-if="plan.planEntries?.length" class="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <summary class="cursor-pointer px-5 py-3 text-sm font-semibold text-gray-800 dark:text-gray-200">
            Jira plan entries ({{ plan.planEntries.length }})
          </summary>
          <div class="max-h-[32rem] overflow-auto border-t border-gray-200 dark:border-gray-700">
            <table class="w-full text-sm">
              <thead class="sticky top-0 bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500">Issue</th>
                  <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500">Type</th>
                  <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500">Status</th>
                  <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500">Membership</th>
                  <th class="px-4 py-2 text-left text-xs font-semibold text-gray-500">Traceable PRs</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="entry in plan.planEntries" :key="entry.issueKey" class="border-t border-gray-100 dark:border-gray-700">
                  <td class="px-4 py-2">
                    <a :href="jiraLink(entry.issueKey)" target="_blank" rel="noopener noreferrer" class="font-mono text-xs text-primary-600 dark:text-primary-400 hover:underline">{{ entry.issueKey }}</a>
                    <div class="mt-0.5 text-xs text-gray-700 dark:text-gray-300">{{ entry.summary || 'Summary unavailable' }}</div>
                  </td>
                  <td class="px-4 py-2 text-xs text-gray-600 dark:text-gray-300">{{ issueType(entry) }}</td>
                  <td class="px-4 py-2 text-xs text-gray-600 dark:text-gray-300">{{ issueStatus(entry) }}</td>
                  <td class="px-4 py-2 text-xs text-gray-600 dark:text-gray-300">{{ entry.membership?.kind || 'unknown' }}</td>
                  <td class="px-4 py-2 text-xs text-gray-600 dark:text-gray-300">{{ (entry.traceability || []).filter(link => link.pullRequest?.merged === true).length }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </template>

      <template v-else>
      <!-- Vision -->
      <section class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
        <div class="flex items-center gap-2 mb-2">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ planTitle }}</h2>
          <span
            v-if="plan.metadata?.badge"
            class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300"
          >{{ plan.metadata.badge }}</span>
        </div>
        <p
          v-if="plan.metadata?.generatedAt"
          class="text-xs text-gray-400 dark:text-gray-500 mb-2"
        >Generated: {{ plan.metadata.generatedAt }}</p>
        <p class="text-sm text-gray-700 dark:text-gray-300 mb-4">{{ plan.vision?.summary }}</p>
        <div class="flex flex-wrap gap-4">
          <div
            v-for="m in plan.vision?.metrics || []"
            :key="m.label"
            class="min-w-[120px] text-center px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40"
          >
            <div class="text-2xl font-bold text-primary-600 dark:text-primary-400">{{ m.num }}</div>
            <div class="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mt-1">{{ m.label }}</div>
          </div>
        </div>
      </section>

      <!-- Service Offering Matrix -->
      <section v-if="plan.serviceMatrix?.rows?.length" class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <h2 class="px-5 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700">
          Service Offering Matrix
        </h2>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50">
                <th class="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Dimension</th>
                <th
                  v-for="service in plan.serviceMatrix.services"
                  :key="service"
                  class="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >{{ service }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in plan.serviceMatrix.rows"
                :key="row.dimension"
                class="border-b border-gray-100 dark:border-gray-800 last:border-0 align-top"
              >
                <td class="px-4 py-3 font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{{ row.dimension }}</td>
                <td
                  v-for="cell in matrixCells[row.dimension]"
                  :key="cell.service"
                  class="px-4 py-3"
                >
                  <span v-if="cell.value === '—' || !cell.value || cell.value.length === 0" class="text-gray-300 dark:text-gray-600">—</span>
                  <ul v-else class="space-y-1">
                    <li v-for="(entry, i) in cell.value" :key="i" class="text-xs">
                      <span
                        class="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold mr-1"
                        :class="entry.isTarget
                          ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'"
                      >{{ entry.version }}</span>
                      <span class="text-gray-700 dark:text-gray-300">{{ entry.text }}</span>
                    </li>
                  </ul>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Use Case Cards -->
      <section v-if="plan.useCaseCards?.length">
        <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Use Cases</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            v-for="card in sortedUseCaseCards"
            :key="card.key"
            class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
          >
            <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">{{ card.title }}</h3>
            <ul class="space-y-1.5">
              <li v-for="item in card.items" :key="item.jira" class="text-xs flex items-start gap-1.5 flex-wrap">
                <span
                  v-if="item.version"
                  class="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0"
                  :class="item.isTarget
                    ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'"
                >{{ item.version }}</span>
                <a
                  :href="jiraLink(item.jira)"
                  target="_blank"
                  class="text-primary-600 dark:text-blue-400 hover:underline font-mono flex-shrink-0"
                >{{ item.jira }}</a>
                <span class="text-gray-700 dark:text-gray-300">{{ item.title }}</span>
                <span
                  v-if="isUnfinishedPriorWork(item)"
                  class="text-amber-600 dark:text-amber-400 text-[10px] font-medium flex-shrink-0"
                >({{ item.status }})</span>
                <span
                  v-for="c in item.customers || []"
                  :key="c"
                  class="px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 flex-shrink-0"
                >{{ c }}</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <!-- Customer Requirements Coverage -->
      <section v-if="plan.customerCoverage?.ncp?.length || plan.customerCoverage?.byCustomer?.length" class="space-y-4">
        <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Customer Requirements Coverage</h2>

        <div v-if="plan.customerCoverage?.ncp?.length" class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <h3 class="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">NCP</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50">
                  <th class="px-4 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Req</th>
                  <th class="px-4 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Requirement</th>
                  <th class="px-4 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Coverage</th>
                  <th class="px-4 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Version</th>
                  <th class="px-4 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in plan.customerCoverage.ncp" :key="row.req" class="border-b border-gray-100 dark:border-gray-800 last:border-0">
                  <td class="px-4 py-2 font-mono text-xs text-gray-500 dark:text-gray-400">{{ row.req }}</td>
                  <td class="px-4 py-2 text-gray-900 dark:text-gray-100">{{ row.requirement }}</td>
                  <td class="px-4 py-2 text-gray-700 dark:text-gray-300">{{ row.coverage }}</td>
                  <td class="px-4 py-2 text-gray-700 dark:text-gray-300">{{ row.version }}</td>
                  <td class="px-4 py-2 text-gray-700 dark:text-gray-300">{{ row.status }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div
          v-for="group in plan.customerCoverage?.byCustomer || []"
          :key="group.customer"
          class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
        >
          <h3 class="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">{{ group.customer }}</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50">
                  <th class="px-4 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Key</th>
                  <th class="px-4 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Feature</th>
                  <th class="px-4 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Version</th>
                  <th class="px-4 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in group.rows" :key="row.key" class="border-b border-gray-100 dark:border-gray-800 last:border-0">
                  <td class="px-4 py-2">
                    <a :href="jiraLink(row.key)" target="_blank" class="text-primary-600 dark:text-blue-400 hover:underline font-mono text-xs">{{ row.key }}</a>
                  </td>
                  <td class="px-4 py-2 text-gray-900 dark:text-gray-100">{{ row.feature }}</td>
                  <td class="px-4 py-2 text-gray-700 dark:text-gray-300">{{ row.version }}</td>
                  <td class="px-4 py-2 text-gray-700 dark:text-gray-300">{{ row.status }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- Cumulative Capability Progression -->
      <section v-if="plan.cumulativeProgression?.length" class="space-y-4">
        <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Cumulative Capability Progression</h2>
        <div
          v-for="progress in plan.cumulativeProgression"
          :key="progress.useCase"
          class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
        >
          <h3 class="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">{{ progress.useCase }}</h3>
          <table class="w-full text-sm">
            <tbody>
              <tr
                v-for="v in progress.versions"
                :key="v.version"
                class="border-b border-gray-100 dark:border-gray-800 last:border-0 align-top"
                :class="v.isTarget ? 'bg-green-50/60 dark:bg-green-900/10' : ''"
              >
                <td class="px-4 py-2 font-semibold whitespace-nowrap" :class="v.isTarget ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'">{{ v.version }}</td>
                <td class="px-4 py-2">
                  <ul class="space-y-1">
                    <li v-for="item in v.items" :key="item.jira" class="text-xs">
                      <a :href="jiraLink(item.jira)" target="_blank" class="text-primary-600 dark:text-blue-400 hover:underline font-mono mr-1">{{ item.jira }}</a>
                      <span class="text-gray-700 dark:text-gray-300">{{ item.text }}</span>
                    </li>
                  </ul>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Feature Inventory -->
      <section v-if="plan.featureInventory?.length" class="space-y-4">
        <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Feature Inventory</h2>
        <div
          v-for="group in plan.featureInventory"
          :key="group.group"
          class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
        >
          <h3 class="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">{{ group.group }}</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50">
                  <th class="px-4 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Key</th>
                  <th class="px-4 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Feature</th>
                  <th class="px-4 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Customers</th>
                  <th class="px-4 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="f in group.features" :key="f.key" class="border-b border-gray-100 dark:border-gray-800 last:border-0">
                  <td class="px-4 py-2">
                    <a :href="jiraLink(f.key)" target="_blank" class="text-primary-600 dark:text-blue-400 hover:underline font-mono text-xs">{{ f.key }}</a>
                  </td>
                  <td class="px-4 py-2 text-gray-900 dark:text-gray-100">{{ f.summary }}</td>
                  <td class="px-4 py-2 text-gray-700 dark:text-gray-300">{{ (f.customers || []).join(', ') }}</td>
                  <td class="px-4 py-2 text-gray-700 dark:text-gray-300">{{ f.status }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- Notes & Action Items -->
      <section
        v-if="plan.notes?.needsDecomposition?.length || plan.notes?.spikes?.length || plan.notes?.backlog?.length"
        class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 space-y-4"
      >
        <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Notes &amp; Action Items</h2>

        <div v-if="plan.notes?.needsDecomposition?.length">
          <h3 class="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Needs Decomposition</h3>
          <ul class="space-y-1">
            <li v-for="n in plan.notes.needsDecomposition" :key="n.jira" class="text-xs">
              <a :href="jiraLink(n.jira)" target="_blank" class="text-primary-600 dark:text-blue-400 hover:underline font-mono mr-1">{{ n.jira }}</a>
              <span class="text-gray-700 dark:text-gray-300">{{ n.title }}</span>
              <span class="text-gray-400 dark:text-gray-500"> — {{ n.note }}</span>
            </li>
          </ul>
        </div>

        <div v-if="plan.notes?.spikes?.length">
          <h3 class="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Spikes</h3>
          <ul class="space-y-1">
            <li v-for="s in plan.notes.spikes" :key="s.jira" class="text-xs">
              <a :href="jiraLink(s.jira)" target="_blank" class="text-primary-600 dark:text-blue-400 hover:underline font-mono mr-1">{{ s.jira }}</a>
              <span class="text-gray-700 dark:text-gray-300">{{ s.title }}</span>
              <span class="text-gray-400 dark:text-gray-500"> — {{ s.note }}</span>
            </li>
          </ul>
        </div>

        <div v-if="plan.notes?.backlog?.length">
          <h3 class="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Backlog / Future Versions</h3>
          <ul class="space-y-1">
            <li v-for="b in plan.notes.backlog" :key="b.jira" class="text-xs flex items-start gap-1.5">
              <a :href="jiraLink(b.jira)" target="_blank" class="text-primary-600 dark:text-blue-400 hover:underline font-mono flex-shrink-0">{{ b.jira }}</a>
              <span class="text-gray-700 dark:text-gray-300">{{ b.title }}</span>
              <span
                v-for="c in b.customers || []"
                :key="c"
                class="px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 flex-shrink-0"
              >{{ c }}</span>
            </li>
          </ul>
        </div>
      </section>
      </template>
    </template>
  </div>
</template>

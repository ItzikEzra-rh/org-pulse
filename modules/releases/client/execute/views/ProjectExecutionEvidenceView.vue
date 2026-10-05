<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { apiRequest } from '@shared/client/services/api.js'
import { useProjectId, projectQuery } from '@shared/client/composables/useProjectId.js'

const projectId = useProjectId()
const envelope = ref(null)
const loading = ref(true)
const error = ref(null)
const selectedRelease = ref('')
let sequence = 0
const data = computed(() => envelope.value?.data || null)
const supported = computed(() => ['supported', 'empty'].includes(envelope.value?.state) && data.value)
const releases = computed(() => data.value?.releases || [])
const selected = computed(() => releases.value.find(row => row.releaseId === selectedRelease.value))
const groups = computed(() => [
  { key: 'workflowRuns', label: 'Workflow runs', ids: 'workflowRunIds' },
  { key: 'jobs', label: 'Jobs', ids: 'jobIds' },
  { key: 'artifacts', label: 'Artifacts', ids: 'artifactIds' }
].map(group => {
  const rows = data.value?.[group.key] || []
  const ids = selected.value?.execution?.[group.ids] || []
  return { ...group, rows: selected.value ? rows.filter(row => ids.includes(row.id)) : rows }
}))
const unmatched = computed(() => releases.value.filter(row => row.unmatched?.length))
function safeLink(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && ['github.com', 'api.github.com'].includes(url.hostname) ? url.href : null
  } catch { return null }
}
function sourceName(row) { return row.name || row.tagName || row.version || row.id }
function outcome(row) { return row.conclusion || row.status || 'unknown' }
function formatDate(value) {
  if (!value) return 'unknown'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'unknown' : date.toLocaleString()
}
async function load() {
  const requestedProject = projectId.value
  const request = ++sequence
  envelope.value = null
  selectedRelease.value = ''
  error.value = null
  loading.value = true
  try {
    const result = await apiRequest(`/modules/releases/execution/evidence${projectQuery(requestedProject)}`)
    if (request !== sequence || requestedProject !== projectId.value) return
    if (result?.projectId !== requestedProject || (result?.data && result.data.projectId !== requestedProject)) {
      throw new Error('Release execution response project identity mismatch')
    }
    envelope.value = result
  } catch (e) {
    if (request === sequence && requestedProject === projectId.value) error.value = e.message || 'Failed to load release execution evidence'
  } finally {
    if (request === sequence && requestedProject === projectId.value) loading.value = false
  }
}
onMounted(load)
watch(projectId, load, { flush: 'sync' })
</script>

<template>
  <div class="p-6 space-y-5" data-testid="project-execution-evidence">
    <header>
      <h1 class="text-xl font-semibold">{{ envelope?.projectDisplayName || projectId }} — Release Execution</h1>
      <p class="text-sm text-gray-500 mt-1">Collected releases and bounded GitHub Actions evidence. Feature completion and release readiness are unknown.</p>
    </header>
    <p v-if="loading" role="status">Loading release execution evidence…</p>
    <div v-else-if="error" role="alert" class="text-red-600">
      {{ error }} <button class="underline ml-2" @click="load">Retry</button>
    </div>
    <template v-else>
      <p class="text-sm text-gray-500">
        State: {{ envelope?.state || 'unavailable' }} · Freshness: {{ envelope?.freshness || 'unknown' }} · Generated: {{ formatDate(envelope?.generatedAt) }}
      </p>
      <p v-if="envelope?.partial" class="p-3 rounded bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300" role="status">
        Partial coverage: this publication is bounded and does not contain every workflow run, job or artifact.
      </p>
      <p v-if="!supported" role="status">{{ envelope?.message || envelope?.error?.message || 'Release execution evidence is unavailable for this project.' }}</p>
      <template v-else>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div v-for="key in ['releases', 'workflowRuns', 'jobs', 'artifacts']" :key="key" class="border rounded p-3">
            <div class="text-2xl font-semibold">{{ (data[key] || []).length }}</div>
            <div class="text-sm">{{ { releases: 'Releases', workflowRuns: 'Workflow runs', jobs: 'Jobs', artifacts: 'Artifacts' }[key] }}</div>
          </div>
        </div>
        <label class="block text-sm">
          Release
          <select v-model="selectedRelease" class="ml-3 border rounded px-3 py-2 dark:bg-gray-800" data-testid="execution-release-filter">
            <option value="">All collected evidence</option>
            <option v-for="release in releases" :key="release.releaseId" :value="release.releaseId">{{ release.version }}</option>
          </select>
        </label>
        <p v-if="!releases.length" role="status">No releases have been collected.</p>
        <p v-if="unmatched.length" class="text-sm text-amber-700 dark:text-amber-300">
          {{ unmatched.length }} release versions have unmatched evidence: {{ unmatched.map(row => row.version).join(', ') }}.
        </p>
        <section v-if="selected" class="border rounded p-4 space-y-2">
          <h2 class="font-semibold">Release {{ selected.version }}</h2>
          <p class="text-sm">Readiness: unknown · Feature completion: unknown</p>
          <p v-if="selected.unmatched?.length" class="text-sm">Unmatched: {{ selected.unmatched.join(', ') }}</p>
          <div v-for="(row, index) in [...(selected.tags || []), ...(selected.githubReleases || [])]" :key="row.sourceUrl || index" class="text-sm">
            <a v-if="safeLink(row.sourceUrl)" :href="safeLink(row.sourceUrl)" target="_blank" rel="noopener noreferrer" class="text-primary-600 underline">{{ row.repository }} · {{ sourceName(row) }}</a>
            <span v-else>{{ row.repository }} · {{ sourceName(row) }}</span>
            <span class="text-gray-500"> · {{ row.match || 'match unknown' }}</span>
          </div>
        </section>
        <section v-for="group in groups" :key="group.key" class="border rounded overflow-hidden">
          <h2 class="font-semibold px-4 py-3 border-b">{{ group.label }} ({{ group.rows.length }})</h2>
          <p v-if="!group.rows.length" class="p-4 text-sm text-gray-500">
            {{ selected ? 'No evidence linked to this release in the collected window; execution status is unknown.' : 'No evidence in the collected window.' }}
          </p>
          <div v-else class="max-h-80 overflow-auto divide-y">
            <div v-for="row in group.rows" :key="`${row.repository}:${row.id}`" class="px-4 py-3 flex flex-wrap justify-between gap-2 text-sm">
              <div>
                <a v-if="safeLink(row.sourceUrl)" :href="safeLink(row.sourceUrl)" target="_blank" rel="noopener noreferrer" class="text-primary-600 underline">{{ sourceName(row) }}</a>
                <span v-else>{{ sourceName(row) }}</span>
                <p class="text-gray-500">{{ row.repository }}</p>
              </div>
              <div class="text-right">
                <span v-if="group.key !== 'artifacts'">{{ outcome(row) }}</span>
                <span v-else>{{ row.expired ? 'Expired' : 'Collected artifact' }}</span>
                <p class="text-gray-500">{{ formatDate(row.createdAt || row.startedAt) }}</p>
              </div>
            </div>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>

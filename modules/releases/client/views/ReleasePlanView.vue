<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { apiRequest } from '@shared/client/services/api.js'

const versions = ref([])
const selectedVersion = ref('')
const plan = ref(null)
const loading = ref(true)
const error = ref(null)

function jiraLink(key) {
  return `https://redhat.atlassian.net/browse/${key}`
}

async function loadVersions() {
  try {
    const data = await apiRequest('/modules/releases/release-plans')
    versions.value = data.versions || []
  } catch (e) {
    error.value = e.message || 'Failed to load release plan versions'
    versions.value = []
  }
}

let planRequestId = 0

async function loadPlan(version) {
  const requestId = ++planRequestId
  if (!version) {
    plan.value = null
    return
  }
  loading.value = true
  error.value = null
  try {
    const nextPlan = await apiRequest(`/modules/releases/release-plan?version=${encodeURIComponent(version)}`)
    if (requestId === planRequestId) plan.value = nextPlan
  } catch (e) {
    if (requestId === planRequestId) {
      error.value = e.message || 'Failed to load release plan'
      plan.value = null
    }
  } finally {
    if (requestId === planRequestId) loading.value = false
  }
}

watch(selectedVersion, (v) => {
  loadPlan(v)
})

async function bootstrap() {
  loading.value = true
  error.value = null
  await loadVersions()
  if (error.value) {
    loading.value = false
    return
  }
  if (versions.value.length > 0) {
    selectedVersion.value = versions.value[versions.value.length - 1]
  } else {
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
</script>

<template>
  <div class="max-w-6xl mx-auto py-6 px-4 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Release Plan</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Forward-looking view of what an OSAC version will deliver
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
      <!-- Vision -->
      <section class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
        <div class="flex items-center gap-2 mb-2">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">OSAC {{ plan.metadata?.version }}</h2>
          <span
            v-if="plan.metadata?.badge"
            class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300"
          >{{ plan.metadata.badge }}</span>
        </div>
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
                  <span v-if="cell.value === '—' || !cell.value" class="text-gray-300 dark:text-gray-600">—</span>
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
            v-for="card in plan.useCaseCards"
            :key="card.key"
            class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
          >
            <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">{{ card.title }}</h3>
            <ul class="space-y-1.5">
              <li v-for="item in card.items" :key="item.jira" class="text-xs flex items-start gap-1.5">
                <a
                  :href="jiraLink(item.jira)"
                  target="_blank"
                  class="text-primary-600 dark:text-blue-400 hover:underline font-mono flex-shrink-0"
                >{{ item.jira }}</a>
                <span class="text-gray-700 dark:text-gray-300">{{ item.title }}</span>
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
  </div>
</template>

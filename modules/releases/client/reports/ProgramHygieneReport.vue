<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { apiRequest } from '@shared/client/services/api.js'
import { useProjectId, projectQuery } from '@shared/client/composables/useProjectId.js'
import HygieneSelect from '../execute/components/hygiene/HygieneSelect.vue'

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000
const PAGE_SIZE = 75

const loading = ref(true)
const notPublished = ref(false)
const loadError = ref('')
const contract = ref(null)

const activeTab = ref('issues')
const activeRuleFilter = ref(null)
const teamFilter = ref([])
const componentFilter = ref([])
const issueTypeFilter = ref([])
const currentPage = ref(1)
const projectId = useProjectId()
let latestRequestId = 0

async function fetchReport() {
  const requestId = ++latestRequestId
  const requestedProjectId = projectId.value
  loading.value = true
  loadError.value = ''
  notPublished.value = false
  contract.value = null
  try {
    const data = await apiRequest(`/modules/releases/hygiene/project-hygiene${projectQuery(requestedProjectId)}`)
    if (requestId !== latestRequestId || projectId.value !== requestedProjectId) return
    if (!requestedProjectId || data?.projectId !== requestedProjectId) {
      throw new Error('Jira Hygiene response project identity mismatch')
    }
    if (data?.state === 'unavailable') {
      notPublished.value = true
      loadError.value = data.message || 'Jira Hygiene data is unavailable for this project.'
      return
    }
    contract.value = data
  } catch (e) {
    if (requestId !== latestRequestId || projectId.value !== requestedProjectId) return
    contract.value = null
    if (e.status === 404) {
      notPublished.value = true
      loadError.value = (e.data && e.data.error) || 'Jira Hygiene data has not been published for this project.'
    } else {
      loadError.value = e.message || 'Project hygiene data is currently unavailable.'
    }
  } finally {
    if (requestId === latestRequestId && projectId.value === requestedProjectId) loading.value = false
  }
}
onMounted(fetchReport)

watch(projectId, () => {
  activeTab.value = 'issues'
  activeRuleFilter.value = null
  teamFilter.value = []
  componentFilter.value = []
  issueTypeFilter.value = []
  currentPage.value = 1
  fetchReport()
}, { flush: 'sync' })

// ── Project selection (single-project rendering; no multi-project nav in this iteration) ──

const projectEntries = computed(() => {
  const results = contract.value && contract.value.results
  if (!results || typeof results !== 'object') return []
  return Object.entries(results)
})

const hasMultipleProjects = computed(() => projectEntries.value.length > 1)
const project = computed(() => (projectEntries.value.length === 1 ? projectEntries.value[0][1] : null))
const rules = computed(() => (project.value && project.value.rules) || [])
const summary = computed(() => (project.value && project.value.summary) || null)
const configuration = computed(() => (contract.value && contract.value.configuration) || null)
const disabledRules = computed(() => (configuration.value?.rules || []).filter(rule => rule.enabled === false))
const configuredRuleCount = computed(() => (configuration.value?.rules || []).length)
const evaluatedRuleCount = computed(() => (configuration.value?.enabledRuleIds || contract.value?.evaluatedRuleIds || []).length)
const hasTeamField = computed(() => Boolean(configuration.value?.fieldMappings?.team))
const latestCollectionFailure = computed(() => contract.value?.collectionFailure || null)

// ── Header / freshness ──

const generatedAt = computed(() => (summary.value && summary.value.generatedAt) || (contract.value && contract.value.generatedAt) || null)

const freshness = computed(() => contract.value?.freshness || 'unknown')

const isStale = computed(() => {
  if (freshness.value === 'stale') return true
  if (!generatedAt.value) return false
  const then = new Date(generatedAt.value).getTime()
  if (Number.isNaN(then)) return false
  return (Date.now() - then) > STALE_THRESHOLD_MS
})

function formatRelativeTime(iso) {
  if (!iso) return 'unknown'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'unknown'
  const diff = Date.now() - then
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return minutes + 'm ago'
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours + 'h ago'
  const days = Math.floor(hours / 24)
  return days + 'd ago'
}

function categoryLabel(key) {
  if (!key) return 'Other'
  return key.charAt(0).toUpperCase() + key.slice(1)
}

function ruleState(rule) {
  if (rule.count === -1) return 'failed'
  if (rule.count === 0) return 'zero'
  return 'nonzero'
}

function ruleNameById(id) {
  const rule = rules.value.find(r => r.id === id)
  return (rule && rule.name) || id
}

// ── Issue deduplication (one row per unique Jira key, rules aggregated) ──

const dedupedIssues = computed(() => {
  const byKey = new Map()
  for (const rule of rules.value) {
    if (rule.count === -1) continue
    for (const issue of rule.issues || []) {
      if (!issue || !issue.key) continue
      let entry = byKey.get(issue.key)
      if (!entry) {
        entry = { ...issue, rules: [] }
        byKey.set(issue.key, entry)
      }
      entry.rules.push({ id: rule.id, name: rule.name, category: rule.category })
    }
  }
  return [...byKey.values()]
})

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort()
}

const teamOptions = computed(() => hasTeamField.value
  ? uniqueSorted(dedupedIssues.value.map(i => i.team || 'Unassigned'))
  : [])
const componentOptions = computed(() => uniqueSorted(dedupedIssues.value.flatMap(i => i.components || [])))
const issueTypeOptions = computed(() => uniqueSorted(dedupedIssues.value.map(i => i.issueType)))

const filteredIssues = computed(() => {
  let list = dedupedIssues.value
  if (activeRuleFilter.value) {
    list = list.filter(i => i.rules.some(r => r.id === activeRuleFilter.value))
  }
  if (teamFilter.value.length) {
    list = list.filter(i => teamFilter.value.includes(i.team || 'Unassigned'))
  }
  if (componentFilter.value.length) {
    list = list.filter(i => (i.components || []).some(c => componentFilter.value.includes(c)))
  }
  if (issueTypeFilter.value.length) {
    list = list.filter(i => issueTypeFilter.value.includes(i.issueType))
  }
  return list
})

watch([activeRuleFilter, teamFilter, componentFilter, issueTypeFilter], () => {
  currentPage.value = 1
})

function toggleRuleFilter(ruleId) {
  activeRuleFilter.value = activeRuleFilter.value === ruleId ? null : ruleId
  activeTab.value = 'issues'
}

// ── Pagination ──

const totalPages = computed(() => Math.max(1, Math.ceil(filteredIssues.value.length / PAGE_SIZE)))
watch(totalPages, (pages) => {
  if (currentPage.value > pages) currentPage.value = pages
})
const paginatedIssues = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return filteredIssues.value.slice(start, start + PAGE_SIZE)
})
const needsPagination = computed(() => filteredIssues.value.length > PAGE_SIZE)

function goToPage(page) {
  if (page >= 1 && page <= totalPages.value) currentPage.value = page
}

// ── Charts ──

const sortedRuleViolations = computed(() => rules.value
  .filter(r => r.count >= 0)
  .map(r => ({ id: r.id, name: r.name, category: r.category, count: r.count }))
  .sort((a, b) => b.count - a.count))

const maxRuleCount = computed(() => sortedRuleViolations.value[0]?.count || 1)

const sortedTeamViolations = computed(() => {
  if (!hasTeamField.value) return []
  const byTeam = {}
  for (const issue of dedupedIssues.value) {
    const team = issue.team || 'Unassigned'
    byTeam[team] = (byTeam[team] || 0) + 1
  }
  return Object.entries(byTeam)
    .map(([team, count]) => ({ team, count }))
    .sort((a, b) => b.count - a.count)
})

const maxTeamCount = computed(() => sortedTeamViolations.value[0]?.count || 1)

// ── Team Accountability ──

const teamAccountability = computed(() => {
  if (!hasTeamField.value) return []
  const teamMap = {}
  for (const issue of dedupedIssues.value) {
    const team = issue.team || 'Unassigned'
    if (!teamMap[team]) teamMap[team] = { team, totalAffected: 0, byRule: {} }
    teamMap[team].totalAffected++
  }
  for (const rule of rules.value) {
    if (rule.count === -1) continue
    for (const issue of rule.issues || []) {
      const team = issue.team || 'Unassigned'
      if (!teamMap[team]) teamMap[team] = { team, totalAffected: 0, byRule: {} }
      teamMap[team].byRule[rule.id] = (teamMap[team].byRule[rule.id] || 0) + 1
    }
  }
  return Object.values(teamMap).sort((a, b) => b.totalAffected - a.totalAffected)
})

function teamRuleCell(team, rule) {
  if (rule.count === -1) return null
  return team.byRule[rule.id] || 0
}

const tabs = [
  { id: 'issues', label: 'Issues' },
  { id: 'teams', label: 'Team Accountability' }
]
const visibleTabs = computed(() => tabs.filter(tab => tab.id !== 'teams' || hasTeamField.value))
</script>

<template>
  <div>
    <h2 class="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Jira Hygiene</h2>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-12 text-gray-500 dark:text-gray-400">
      Loading hygiene report...
    </div>

    <!-- Not published -->
    <div v-else-if="notPublished" class="text-center py-12 text-gray-500 dark:text-gray-400">
      {{ loadError }}
    </div>

    <!-- Generic error -->
    <div v-else-if="loadError" class="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-4 text-red-700 dark:text-red-400 text-sm">
      <div class="mb-2">{{ loadError }}</div>
      <button
        class="px-3 py-1.5 text-xs font-medium rounded-md border border-red-300 dark:border-red-500/40 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-500/20"
        @click="fetchReport"
      >Retry</button>
    </div>

    <div v-else-if="contract?.state === 'inapplicable'" class="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-gray-700 dark:text-gray-300 text-sm">
      {{ contract.message || 'Jira Hygiene is not applicable to this project.' }}
    </div>

    <!-- Multiple projects — not supported in this iteration, do not silently pick one -->
    <div
      v-else-if="hasMultipleProjects"
      class="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg p-4 text-blue-800 dark:text-blue-300 text-sm"
    >
      Multiple projects ({{ projectEntries.length }}) are available in this dataset, but project selection is not supported in this iteration.
    </div>

    <!-- No project data -->
    <div v-else-if="!project" class="text-center py-12 text-gray-500 dark:text-gray-400">
      No hygiene results are available yet.
    </div>

    <template v-else>
      <!-- Header: project identity + freshness + summary metrics -->
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 mb-6">
        <div class="flex items-baseline justify-between flex-wrap gap-2 mb-4">
          <div class="flex items-center gap-2">
            <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">
              {{ project.displayName || project.projectKey }}
            </h3>
            <span class="px-1.5 py-0.5 text-[10px] font-mono rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
              {{ project.projectKey }}
            </span>
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
            <span v-if="contract.source">Source: {{ contract.source.id || contract.source }}</span>
            <span>Last updated {{ formatRelativeTime(generatedAt) }}</span>
            <span
              class="px-1.5 py-0.5 text-[10px] font-medium rounded"
              :class="isStale
                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                : freshness === 'fresh'
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'"
            >{{ isStale ? 'Stale' : freshness === 'fresh' ? 'Fresh' : `Freshness ${freshness}` }}</span>
          </div>
        </div>

        <div class="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Evaluated {{ evaluatedRuleCount }} of {{ configuredRuleCount }} configured rules
          <span v-if="disabledRules.length"> · {{ disabledRules.length }} disabled by project policy</span>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Unique Affected Issues</div>
            <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">{{ summary?.uniqueIssueCount ?? 0 }}</div>
          </div>
          <div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Rule Matches</div>
            <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">{{ summary?.totalRuleMatches ?? 0 }}</div>
          </div>
          <div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Rules with Matches</div>
            <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">{{ summary?.affectedRuleCount ?? 0 }}</div>
          </div>
          <div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Rules Failed</div>
            <div class="text-2xl font-bold" :class="(summary?.failedRuleCount ?? 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'">
              {{ summary?.failedRuleCount ?? 0 }}
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="disabledRules.length"
        data-testid="hygiene-disabled-rule-scope"
        class="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg p-4 mb-6 text-blue-800 dark:text-blue-300 text-sm"
      >
        <div class="font-medium mb-2">Rules disabled pending policy confirmation</div>
        <ul class="list-disc list-inside space-y-1">
          <li v-for="rule in disabledRules" :key="rule.id">
            <span class="font-medium">{{ rule.name }}</span>: {{ rule.disabledReason }}
          </li>
        </ul>
      </div>

      <div
        v-if="contract.state === 'empty'"
        data-testid="hygiene-empty-results"
        class="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-lg p-4 mb-6 text-green-800 dark:text-green-300 text-sm"
      >
        Collection succeeded at {{ formatRelativeTime(generatedAt) }}. No issues matched the enabled rules.
      </div>

      <!-- Partial-failure banner -->
      <div
        v-if="project.partial || latestCollectionFailure"
        class="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg p-4 mb-6 text-amber-800 dark:text-amber-300 text-sm"
      >
        <div class="font-medium mb-1">Some hygiene rules could not be collected</div>
        <div v-if="latestCollectionFailure" class="mb-1">
          Latest collection failed: {{ latestCollectionFailure.message || latestCollectionFailure }}
          <span v-if="contract.attemptedAt"> ({{ formatRelativeTime(contract.attemptedAt) }})</span>
        </div>
        <ul v-if="(project.errors || []).length" class="list-disc list-inside space-y-0.5">
          <li v-for="err in project.errors || []" :key="err.ruleId">
            <span class="font-medium">{{ ruleNameById(err.ruleId) }}</span>: {{ err.message }}
          </li>
        </ul>
      </div>

      <!-- No rules configured -->
      <div v-if="rules.length === 0" class="text-center py-12 text-gray-500 dark:text-gray-400">
        No hygiene rules are configured for this project.
      </div>

      <template v-else>
        <!-- Rule summary cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <button
            v-for="rule in rules"
            :key="rule.id"
            type="button"
            :title="rule.description"
            class="text-left bg-white dark:bg-gray-800 rounded-lg border p-4 transition-colors"
            :class="activeRuleFilter === rule.id
              ? 'border-primary-400 dark:border-primary-500 ring-2 ring-primary-200 dark:ring-primary-800'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'"
            @click="toggleRuleFilter(rule.id)"
          >
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{{ rule.name }}</span>
              <span class="px-1.5 py-0.5 text-[9px] font-medium rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 shrink-0">
                {{ categoryLabel(rule.category) }}
              </span>
            </div>
            <div
              class="text-2xl font-bold"
              :class="{
                'text-green-600 dark:text-green-400': ruleState(rule) === 'zero',
                'text-red-600 dark:text-red-400': ruleState(rule) === 'nonzero',
                'text-gray-400 dark:text-gray-500': ruleState(rule) === 'failed'
              }"
            >
              <span v-if="ruleState(rule) === 'failed'">—</span>
              <span v-else>{{ rule.count }}</span>
            </div>
            <div v-if="ruleState(rule) === 'failed'" class="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
              Collection failed
            </div>
          </button>
        </div>

        <!-- Two-column layout: by rule + by team bar charts -->
        <div class="grid grid-cols-1 gap-6 mb-8" :class="hasTeamField ? 'lg:grid-cols-2' : 'lg:grid-cols-1'">
          <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Violations by Rule</h3>
            <div v-if="sortedRuleViolations.length === 0" class="text-sm text-gray-400">No violations found.</div>
            <div v-else class="space-y-2.5">
              <div v-for="rule in sortedRuleViolations" :key="rule.id" class="flex items-center gap-3">
                <div class="flex-1 min-w-0">
                  <div class="text-xs font-medium text-gray-700 dark:text-gray-300 truncate mb-0.5">{{ rule.name }}</div>
                  <div class="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      class="h-full bg-red-500 dark:bg-red-400 rounded-full transition-all"
                      :style="{ width: (rule.count / maxRuleCount * 100) + '%' }"
                    />
                  </div>
                </div>
                <span class="text-sm font-semibold text-gray-900 dark:text-gray-100 w-10 text-right shrink-0">{{ rule.count }}</span>
              </div>
            </div>
          </div>

          <div v-if="hasTeamField" class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Violations by Team</h3>
            <div v-if="sortedTeamViolations.length === 0" class="text-sm text-gray-400">No violations found.</div>
            <div v-else class="space-y-2.5">
              <div v-for="team in sortedTeamViolations" :key="team.team" class="flex items-center gap-3">
                <div class="flex-1 min-w-0">
                  <div class="text-xs font-medium text-gray-700 dark:text-gray-300 truncate mb-0.5">{{ team.team }}</div>
                  <div class="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      class="h-full bg-orange-500 dark:bg-orange-400 rounded-full transition-all"
                      :style="{ width: (team.count / maxTeamCount * 100) + '%' }"
                    />
                  </div>
                </div>
                <span class="text-sm font-semibold text-gray-900 dark:text-gray-100 w-10 text-right shrink-0">{{ team.count }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Tabbed detail section -->
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div class="border-b border-gray-200 dark:border-gray-700 px-4">
            <div class="flex gap-4">
              <button
                v-for="tab in visibleTabs"
                :key="tab.id"
                @click="activeTab = tab.id"
                class="py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors"
                :class="activeTab === tab.id
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
              >{{ tab.label }}</button>
            </div>
          </div>

          <!-- Tab: Issues -->
          <div v-if="activeTab === 'issues'">
            <div class="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <HygieneSelect v-if="hasTeamField" v-model="teamFilter" :options="teamOptions" placeholder="Team" mode="multi" />
              <HygieneSelect v-model="componentFilter" :options="componentOptions" placeholder="Component" mode="multi" />
              <HygieneSelect v-model="issueTypeFilter" :options="issueTypeOptions" placeholder="Issue Type" mode="multi" />
              <button
                v-if="activeRuleFilter"
                class="px-2.5 py-1 text-xs font-medium rounded-full border bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border-primary-300 dark:border-primary-600"
                @click="activeRuleFilter = null"
              >
                Rule: {{ ruleNameById(activeRuleFilter) }} ✕
              </button>
            </div>

            <div v-if="filteredIssues.length === 0" class="p-6 text-center text-sm text-gray-400">
              No issues match the current filters.
            </div>
            <div v-else class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                    <th class="px-4 py-2 font-medium">Key</th>
                    <th class="px-4 py-2 font-medium">Summary</th>
                    <th class="px-4 py-2 font-medium">Issue Type</th>
                    <th class="px-4 py-2 font-medium">Status</th>
                    <th class="px-4 py-2 font-medium">Assignee</th>
                    <th v-if="hasTeamField" class="px-4 py-2 font-medium">Team</th>
                    <th class="px-4 py-2 font-medium">Components</th>
                    <th class="px-4 py-2 font-medium">Matched Rules</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                  <tr v-for="issue in paginatedIssues" :key="issue.key" class="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td class="px-4 py-2 whitespace-nowrap">
                      <a
                        :href="issue.jiraUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="font-mono text-xs text-primary-600 dark:text-primary-400 hover:underline"
                      >{{ issue.key }}</a>
                    </td>
                    <td class="px-4 py-2 text-gray-900 dark:text-gray-100 max-w-md truncate">{{ issue.summary }}</td>
                    <td class="px-4 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">{{ issue.issueType || '—' }}</td>
                    <td class="px-4 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">{{ issue.status || '—' }}</td>
                    <td class="px-4 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">{{ issue.assignee || 'Unassigned' }}</td>
                    <td v-if="hasTeamField" class="px-4 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">{{ issue.team || 'Unassigned' }}</td>
                    <td class="px-4 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">{{ (issue.components || []).join(', ') || '—' }}</td>
                    <td class="px-4 py-2">
                      <div class="flex flex-wrap gap-1">
                        <span
                          v-for="r in issue.rules"
                          :key="r.id"
                          :title="r.name"
                          class="px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                        >{{ r.name }}</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-if="filteredIssues.length > 0" class="flex items-center justify-between px-4 py-2 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400">
              <span>
                Showing {{ (currentPage - 1) * PAGE_SIZE + 1 }}-{{ Math.min(currentPage * PAGE_SIZE, filteredIssues.length) }}
                of {{ filteredIssues.length }} issue{{ filteredIssues.length !== 1 ? 's' : '' }}
              </span>
              <div v-if="needsPagination" class="flex items-center gap-1">
                <button
                  :disabled="currentPage <= 1"
                  @click="goToPage(currentPage - 1)"
                  class="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >Prev</button>
                <span class="px-2">Page {{ currentPage }} of {{ totalPages }}</span>
                <button
                  :disabled="currentPage >= totalPages"
                  @click="goToPage(currentPage + 1)"
                  class="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >Next</button>
              </div>
            </div>
          </div>

          <!-- Tab: Team Accountability -->
          <div v-if="activeTab === 'teams'">
            <div v-if="teamAccountability.length === 0" class="p-6 text-center text-sm text-gray-400">
              No issues in selected scope.
            </div>
            <div v-else class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                    <th class="px-4 py-2 font-medium">Team</th>
                    <th class="px-4 py-2 font-medium text-right">Affected Issues</th>
                    <th v-for="rule in rules" :key="rule.id" class="px-4 py-2 font-medium text-right">{{ rule.name }}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                  <tr v-for="team in teamAccountability" :key="team.team" class="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td class="px-4 py-2.5 font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{{ team.team }}</td>
                    <td class="px-4 py-2.5 text-right">
                      <span :class="team.totalAffected > 0 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-400'">
                        {{ team.totalAffected }}
                      </span>
                    </td>
                    <td v-for="rule in rules" :key="rule.id" class="px-4 py-2.5 text-right">
                      <span v-if="teamRuleCell(team, rule) === null" class="text-gray-300 dark:text-gray-600" title="Collection failed">—</span>
                      <span v-else :class="teamRuleCell(team, rule) > 0 ? 'text-gray-700 dark:text-gray-300' : 'text-gray-300 dark:text-gray-600'">
                        {{ teamRuleCell(team, rule) }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="teamAccountability.length > 0" class="px-4 py-2 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400">
              {{ teamAccountability.length }} team{{ teamAccountability.length !== 1 ? 's' : '' }}
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

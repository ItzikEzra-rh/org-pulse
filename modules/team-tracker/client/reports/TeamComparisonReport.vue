<template>
  <div>
    <!-- Report-specific controls -->
    <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-6 flex flex-wrap items-start gap-6">
      <!-- Metrics -->
      <div>
        <h3 class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">Metrics</h3>
        <div class="space-y-1">
          <label
            v-for="metric in METRICS_LIST"
            :key="metric.key"
            class="flex items-center gap-2 px-2 py-1.5 rounded"
            :class="isMetricDisabled(metric) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50'"
            :title="isMetricDisabled(metric) ? 'Unsupported for this project' : undefined"
          >
            <input
              type="checkbox"
              :value="metric.key"
              v-model="selectedMetrics"
              :disabled="isMetricDisabled(metric)"
              class="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
            />
            <span class="text-sm text-gray-700 dark:text-gray-300">{{ metric.label }}</span>
            <span v-if="isMetricDisabled(metric)" class="text-xs text-gray-400 dark:text-gray-500">(Unsupported for this project)</span>
          </label>
        </div>
      </div>

      <!-- Chart type -->
      <div>
        <h3 class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">Chart Type</h3>
        <div class="inline-flex rounded-md shadow-sm">
          <button
            v-for="(option, i) in CHART_TYPES"
            :key="option.value"
            @click="chartType = option.value"
            :aria-pressed="chartType === option.value"
            class="px-3 py-1.5 text-sm font-medium border"
            :class="[
              chartType === option.value
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50',
              i === 0 ? 'rounded-l-md' : '',
              i === CHART_TYPES.length - 1 ? 'rounded-r-md' : '',
              i > 0 ? 'border-l-0' : ''
            ]"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <!-- Run button -->
      <div class="self-end">
        <button
          @click="run"
          :disabled="loading || selectedTeamKeys.length === 0 || selectedMetrics.length === 0"
          :title="selectedTeamKeys.length === 0 || selectedMetrics.length === 0 ? 'Select teams and metrics to run' : undefined"
          class="px-4 py-2 bg-primary-600 text-white rounded-md font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          <svg v-if="loading" class="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {{ loading ? 'Loading...' : 'Run' }}
        </button>
      </div>
    </div>

    <!-- Charts -->
    <div v-if="metricsUnavailable" class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center text-gray-400 dark:text-gray-500" role="status" aria-live="polite">
      <p class="text-lg mb-2">Jira metrics are not available for this project</p>
      <p class="text-sm">{{ metricsUnavailableReason }}</p>
    </div>
    <div v-else-if="charts.length === 0" class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center text-gray-400 dark:text-gray-500">
      <p class="text-lg">Select teams and metrics, then click Run</p>
    </div>
    <div v-else class="space-y-6">
      <div
        v-for="(chart, idx) in charts"
        :key="chart.metricKey + '-' + idx"
        class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
      >
        <div v-if="chart.data.length === 0 && chart.unavailableTeams?.length" class="text-sm text-gray-400 dark:text-gray-500">
          {{ chart.title }}: not published for the selected team(s).
        </div>
        <template v-else>
          <p v-if="chart.unavailableTeams?.length" class="text-xs text-gray-400 dark:text-gray-500 mb-2">
            Not published for: {{ chart.unavailableTeams.join(', ') }}
          </p>
          <p v-if="chart.coverageNote" class="text-xs text-amber-600 dark:text-amber-400 mb-2">
            {{ chart.coverageNote }}
          </p>
          <ReportChart
            :type="chartType"
            :labels="chart.labels"
            :data="chart.data"
            :title="chart.title"
            :unit="chart.unit"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import ReportChart from '../components/ReportChart.vue'
import { useGithubStats } from '@shared/client/composables/useGithubStats'
import { useGitlabStats } from '@shared/client/composables/useGitlabStats'
import { useProjectId } from '@shared/client/composables/useProjectId.js'
import { getTeamMetrics } from '@shared/client/services/api'
import { useReportFilters } from '../composables/useReportFilters'

const { selectedTeamKeys, availableTeams } = useReportFilters()
const { getContributions } = useGithubStats()
const { getContributions: getGitlabContributions } = useGitlabStats()
const projectId = useProjectId()

const isProjectMode = computed(() => !!projectId.value && projectId.value !== 'osac')

const selectedMetrics = ref([])
const chartType = ref('bar')
const loading = ref(false)
// Component-local cache -- resets on navigation (intentional, avoids stale data)
const metricsData = ref({})
const charts = ref([])
const metricsUnavailable = ref(false)
const metricsUnavailableReason = ref('')

const PROJECT_UNAVAILABLE_MESSAGES = {
  'missing-publication': 'Jira metrics have not been published for this project yet.',
  disabled: 'Jira metrics are disabled for this project.',
  unavailable: 'Jira metrics are currently unavailable for this project.',
  error: 'Jira metrics publication failed for this project.',
  inapplicable: 'Jira metrics are not applicable for this project.'
}

const METRICS_LIST = [
  { key: 'teamSize', label: 'Team Size' },
  { key: 'resolvedCount', label: 'Issues Resolved' },
  { key: 'avgCycleTime', label: 'Avg Cycle Time' },
  { key: 'resolvedPerMember', label: 'Issues Resolved per Member' },
  { key: 'githubContributions', label: 'GitHub Contributions (1yr)' },
  { key: 'githubPerMember', label: 'Avg GitHub Contributions per Member (1yr)' },
  // osacOnly: GitLab has no project-qualified publication; Unsupported in project mode (see isMetricDisabled).
  { key: 'gitlabContributions', label: 'GitLab Contributions (1yr)', osacOnly: true },
  { key: 'gitlabPerMember', label: 'Avg GitLab Contributions per Member (1yr)', osacOnly: true },
]

// Disabled, not removed, so the capability stays discoverable.
function isMetricDisabled(metric) {
  return isProjectMode.value && metric.osacOnly
}

const CHART_TYPES = [
  { value: 'bar', label: 'Bar' },
  { value: 'horizontalBar', label: 'Horizontal' },
  { value: 'doughnut', label: 'Doughnut' },
]

// Appends the real lookback window, only when every active team has a known,
// agreeing lookbackDays -- an unknown window is disagreement, not absence.
function lookbackSuffix(keys) {
  const values = new Set()
  for (const k of keys) {
    const lookbackDays = metricsData.value[k]?.aggregate?.lookbackDays
    if (typeof lookbackDays !== 'number') return ''
    values.add(lookbackDays)
  }
  return values.size === 1 ? ` (${[...values][0]}d)` : ''
}

// `aggregate.github === null` means unavailable for that team -- omit it rather than charting a fabricated zero.
function partitionByGithubAvailability(keys) {
  const available = []
  const unavailable = []
  for (const k of keys) {
    if (metricsData.value[k]?.aggregate?.github) available.push(k)
    else unavailable.push(k)
  }
  return [available, unavailable]
}

// Members without a published GitHub measurement are unknown, not zero, so a
// team with `contributorCount < memberCount` is reported as partial coverage.
function githubCoverageNote(keys, teamLookup, scope) {
  const partial = keys
    .map(k => ({ name: teamLookup[k]?.displayName ?? k, github: metricsData.value[k].aggregate.github }))
    .filter(({ github }) => github.contributorCount < github.memberCount)
    .map(({ name, github }) => `${name} (${github.contributorCount} of ${github.memberCount} members)`)
  return partial.length ? `Partial coverage, ${scope} measured members only: ${partial.join(', ')}` : ''
}

const METRIC_DEFS = {
  teamSize: {
    label: 'Team Size',
    unit: '',
    extract: (d) => d.memberCount ?? 0
  },
  resolvedCount: {
    label: 'Issues Resolved',
    unit: '',
    extract: (d) => d.aggregate?.resolvedCount ?? 0
  },
  avgCycleTime: {
    label: 'Avg Cycle Time',
    unit: 'days',
    extract: (d) => d.aggregate?.avgCycleTimeDays ?? 0
  },
  resolvedPerMember: {
    label: 'Issues Resolved per Member',
    unit: '',
    extract: (d) => {
      const count = d.aggregate?.resolvedCount ?? 0
      const members = d.memberCount ?? 0
      return members > 0 ? Math.round((count / members) * 10) / 10 : 0
    }
  },
  githubContributions: { label: 'GitHub Contributions (1yr)', unit: '', extract: null },
  githubPerMember: { label: 'Avg GitHub Contributions per Member (1yr)', unit: '', extract: null },
  gitlabContributions: { label: 'GitLab Contributions (1yr)', unit: '', extract: null },
  gitlabPerMember: { label: 'Avg GitLab Contributions per Member (1yr)', unit: '', extract: null },
}

let runVersion = 0

async function run() {
  const version = ++runVersion
  const runProjectId = projectId.value
  loading.value = true
  metricsUnavailable.value = false
  try {
    // An unavailable placeholder isn't valid cached data; retry it every run.
    const keysToFetch = selectedTeamKeys.value.filter(k => {
      const cached = metricsData.value[k]
      return !cached || cached.available === false
    })
    const results = await Promise.all(
      keysToFetch.map(async (key) => {
        try {
          const data = await getTeamMetrics(key, runProjectId)
          return { key, data }
        } catch (err) {
          console.error(`Failed to fetch metrics for ${key}:`, err)
          return { key, data: null }
        }
      })
    )
    // A newer run or project switch has superseded this one; don't commit stale results.
    if (version !== runVersion) return
    for (const { key, data } of results) {
      if (data) {
        metricsData.value[key] = data
      }
    }

    // Surface an unavailable Jira-metrics source once, not as a fabricated zero per team.
    if (isProjectMode.value) {
      const activeData = selectedTeamKeys.value.map(k => metricsData.value[k]).filter(Boolean)
      const unavailableEntry = activeData.find(d => d.available === false)
      if (unavailableEntry) {
        metricsUnavailable.value = true
        metricsUnavailableReason.value = PROJECT_UNAVAILABLE_MESSAGES[unavailableEntry.reason]
          || 'Jira team metrics are not available for this project.'
        charts.value = []
        return
      }
    }

    // Build team lookup from availableTeams (includes members for GitHub/GitLab metrics)
    const teamLookup = {}
    for (const t of availableTeams.value) {
      teamLookup[t.key] = t
    }

    const activeKeys = selectedTeamKeys.value.filter(k => metricsData.value[k])
    const activeMetrics = selectedMetrics.value.filter(
      k => !isMetricDisabled(METRICS_LIST.find(m => m.key === k))
    )
    const newCharts = []

    for (const metricKey of activeMetrics) {
      const def = METRIC_DEFS[metricKey]

      if (metricKey === 'githubPerMember') {
        if (isProjectMode.value) {
          const [availableKeys, unavailableKeys] = partitionByGithubAvailability(activeKeys)
          newCharts.push({
            metricKey,
            title: def.label,
            unit: '',
            labels: availableKeys.map(k => teamLookup[k]?.displayName ?? k),
            data: availableKeys.map(k => {
              const github = metricsData.value[k].aggregate.github
              return Math.round((github.total / github.contributorCount) * 10) / 10
            }),
            unavailableTeams: unavailableKeys.map(k => teamLookup[k]?.displayName ?? k),
            coverageNote: githubCoverageNote(availableKeys, teamLookup, 'averaged over')
          })
        } else {
          newCharts.push({
            metricKey,
            title: def.label,
            unit: '',
            labels: activeKeys.map(k => teamLookup[k]?.displayName ?? k),
            data: activeKeys.map(k => {
              const team = teamLookup[k]
              if (!team?.members?.length) return 0
              const total = team.members.reduce((sum, m) => {
                const c = m.githubUsername ? getContributions(m.githubUsername) : null
                return sum + (c?.totalContributions ?? 0)
              }, 0)
              return Math.round((total / team.members.length) * 10) / 10
            })
          })
        }
      } else if (metricKey === 'githubContributions') {
        if (isProjectMode.value) {
          const [availableKeys, unavailableKeys] = partitionByGithubAvailability(activeKeys)
          newCharts.push({
            metricKey,
            title: def.label,
            unit: def.unit,
            labels: availableKeys.map(k => teamLookup[k]?.displayName ?? k),
            data: availableKeys.map(k => metricsData.value[k].aggregate.github.total),
            unavailableTeams: unavailableKeys.map(k => teamLookup[k]?.displayName ?? k),
            coverageNote: githubCoverageNote(availableKeys, teamLookup, 'totals cover')
          })
        } else {
          newCharts.push({
            metricKey,
            title: def.label,
            unit: def.unit,
            labels: activeKeys.map(k => teamLookup[k]?.displayName ?? k),
            data: activeKeys.map(k => {
              const team = teamLookup[k]
              if (!team?.members) return 0
              return team.members.reduce((sum, m) => {
                const c = m.githubUsername ? getContributions(m.githubUsername) : null
                return sum + (c?.totalContributions ?? 0)
              }, 0)
            })
          })
        }
      } else if (metricKey === 'gitlabPerMember') {
        newCharts.push({
          metricKey,
          title: def.label,
          unit: '',
          labels: activeKeys.map(k => teamLookup[k]?.displayName ?? k),
          data: activeKeys.map(k => {
            const team = teamLookup[k]
            if (!team?.members?.length) return 0
            const configured = team.members.filter(m => m.gitlabUsername)
            if (configured.length === 0) return 0
            const total = configured.reduce((sum, m) => {
              const c = getGitlabContributions(m.gitlabUsername)
              return sum + (c?.totalContributions ?? 0)
            }, 0)
            return Math.round((total / configured.length) * 10) / 10
          })
        })
      } else if (metricKey === 'gitlabContributions') {
        newCharts.push({
          metricKey,
          title: def.label,
          unit: def.unit,
          labels: activeKeys.map(k => teamLookup[k]?.displayName ?? k),
          data: activeKeys.map(k => {
            const team = teamLookup[k]
            if (!team?.members) return 0
            return team.members.reduce((sum, m) => {
              const c = m.gitlabUsername ? getGitlabContributions(m.gitlabUsername) : null
              return sum + (c?.totalContributions ?? 0)
            }, 0)
          })
        })
      } else {
        const suffix = (metricKey === 'resolvedCount' || metricKey === 'resolvedPerMember')
          ? lookbackSuffix(activeKeys)
          : ''
        newCharts.push({
          metricKey,
          title: def.label + suffix,
          unit: def.unit,
          labels: activeKeys.map(k => teamLookup[k]?.displayName ?? k),
          data: activeKeys.map(k => def.extract(metricsData.value[k]))
        })
      }
    }

    charts.value = newCharts
  } finally {
    if (version === runVersion) loading.value = false
  }
}

// Clear stale rendered output on project switch rather than waiting for Run.
watch(projectId, () => {
  runVersion++
  charts.value = []
  metricsData.value = {}
  metricsUnavailable.value = false
})
</script>

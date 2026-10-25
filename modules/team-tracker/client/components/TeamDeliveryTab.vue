<template>
  <div>
    <!-- Team Metrics -->
    <div class="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-2">
      <MetricCard
        label="Issues Resolved"
        :value="teamMetrics?.aggregate?.resolvedCount"
        :subtitle="deliveryWindowSubtitle"
        clickable
        @click="showResolvedIssues = true"
      />
      <MetricCard
        label="Story Points"
        :value="teamMetrics?.aggregate?.resolvedPoints"
        unit="pts"
        :subtitle="deliveryWindowSubtitle"
      />
      <MetricCard
        label="In Progress"
        :value="teamMetrics?.aggregate?.inProgressCount"
        :warning="teamMetrics?.aggregate?.inProgressCount != null && teamMetrics.aggregate.inProgressCount > uniqueCount"
        clickable
        @click="showInProgressIssues = true"
      />
      <MetricCard
        label="Avg Cycle Time"
        :value="teamMetrics?.aggregate?.avgCycleTimeDays"
        unit="days"
      />
      <MetricCard
        label="GitHub Contributions"
        :value="teamGithubTotal"
        :subtitle="githubSubtitle"
      />
      <MetricCard
        v-if="!isNormalizedModel"
        label="GitLab Contributions"
        :value="teamGitlabTotal"
        :subtitle="gitlabConfiguredCount < uniqueCount ? `${gitlabConfiguredCount}/${uniqueCount} members configured` : 'Last year'"
      >
        <template v-if="Object.keys(teamGitlabByInstance).length > 1" #footer>
          <div class="mt-1 space-y-0.5">
            <div
              v-for="(count, baseUrl) in teamGitlabByInstance"
              :key="baseUrl"
              class="flex justify-between text-xs text-gray-400 dark:text-gray-500"
            >
              <span class="truncate mr-2">{{ baseUrl.replace(/^https?:\/\//, '') }}</span>
              <span class="font-medium tabular-nums">{{ count }}</span>
            </div>
          </div>
        </template>
      </MetricCard>
      <MetricCard
        v-else
        label="GitLab Contributions"
        value="Unsupported"
        tooltip="GitLab contributions are not yet published for canonical (project-qualified) teams."
      />
    </div>

    <div v-if="!isNormalizedModel" class="mb-4 pl-1">
      <button
        @click="openTeamHistory"
        class="text-xs text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
      >
        View History
      </button>
    </div>

    <!-- Export -->
    <div class="flex justify-end mb-3">
      <button
        @click="exportCsv"
        :disabled="!teamMetrics"
        class="px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
      >
        <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Export CSV
      </button>
    </div>

    <!-- Content -->
    <PersonTable
      :members="uniqueMembers"
      :multiTeamMembers="multiTeamMembers"
      :getTeamsForPerson="getTeamsForPerson"
      :memberMetrics="memberMetricsMap"
      :teamKey="team?.key"
      :getGithubContribution="isNormalizedModel ? getProjectContribution : null"
      :gitlabSupported="!isNormalizedModel"
      :showHistory="!isNormalizedModel"
      @select="$emit('select-person', $event)"
      @view-history="openPersonHistory"
    />

    <!-- In-Progress Issues Modal -->
    <InProgressIssuesModal
      v-if="showInProgressIssues"
      :title="`${teamDisplayName} — In-Progress Issues`"
      :issues="inProgressIssuesForModal"
      @close="showInProgressIssues = false"
    />

    <!-- Resolved Issues Modal -->
    <ResolvedIssuesModal
      v-if="showResolvedIssues"
      :title="`${teamDisplayName} — Resolved Issues`"
      :issues="resolvedIssuesForModal"
      @close="showResolvedIssues = false"
    />

    <SnapshotHistoryModal
      v-if="showSnapshotHistory"
      :title="snapshotHistoryTitle"
      :snapshots="snapshotHistoryData"
      :loading="snapshotHistoryLoading"
      :mode="snapshotHistoryMode"
      @close="showSnapshotHistory = false"
    />
  </div>
</template>

<script setup>
import { computed, ref, onMounted, watch } from 'vue'
import PersonTable from './PersonTable.vue'
import MetricCard from './MetricCard.vue'
import ResolvedIssuesModal from './ResolvedIssuesModal.vue'
import InProgressIssuesModal from './InProgressIssuesModal.vue'
import SnapshotHistoryModal from './SnapshotHistoryModal.vue'
import { useRoster } from '@shared/client/composables/useRoster'
import { useProjectId } from '@shared/client/composables/useProjectId'
import { useGithubStats } from '@shared/client/composables/useGithubStats'
import { useGitlabStats } from '@shared/client/composables/useGitlabStats'
import { useProjectContributions } from '@shared/client/composables/useProjectContributions'
import { getTeamSnapshots, getPersonSnapshots } from '@shared/client/services/api'

const props = defineProps({
  team: { type: Object, required: true },
  teamMetrics: { type: Object, default: null },
  teamDisplayName: { type: String, default: '' }
})

defineEmits(['select-person'])

const { multiTeamMembers, getTeamsForPerson, visibleFields, isNormalizedModel } = useRoster()
const { getContributions } = useGithubStats()
const { getContributions: getGitlabContributions } = useGitlabStats()
const { getByAccountId: getProjectContribution, loadContributions: loadProjectContributions } = useProjectContributions()
const projectId = useProjectId()

// No-op for legacy OSAC (no project context); shares its cache with any other
// view that already loaded this project's contributions this session.
onMounted(loadProjectContributions)
watch(projectId, loadProjectContributions)

const showResolvedIssues = ref(false)
const showInProgressIssues = ref(false)
const showSnapshotHistory = ref(false)
const snapshotHistoryData = ref([])
const snapshotHistoryLoading = ref(false)
const snapshotHistoryTitle = ref('')
const snapshotHistoryMode = ref('team')

const uniqueMembers = computed(() => {
  if (!props.team) return []
  const seen = new Set()
  return props.team.members.filter(m => {
    const key = m.accountId || m.jiraDisplayName
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
})

const uniqueCount = computed(() => uniqueMembers.value.length)

const memberMetricsMap = computed(() => {
  const map = new Map()
  if (props.teamMetrics?.members) {
    for (const m of props.teamMetrics.members) {
      if (m.metrics) {
        map.set(m.accountId || m.jiraDisplayName, m.metrics)
      }
    }
  }
  return map
})

const accountIdToName = computed(() => {
  const map = new Map()
  for (const m of uniqueMembers.value) {
    if (m.accountId) map.set(m.accountId, m.name || m.jiraDisplayName)
  }
  return map
})

// Canonical issues carry accountId, not a display name; resolve it here from the roster join.
function withResolvedAssignee(issues) {
  if (!isNormalizedModel.value) return issues
  return issues.map(issue => ({
    ...issue,
    assignee: accountIdToName.value.get(issue.accountId) || issue.accountId || null
  }))
}

const resolvedIssuesForModal = computed(() => withResolvedAssignee(props.teamMetrics?.resolvedIssues || []))
const inProgressIssuesForModal = computed(() => withResolvedAssignee(props.teamMetrics?.inProgressIssues || []))

// Canonical total only counts members with a resolved identity; null (not 0) when none resolved.
const teamGithubTotal = computed(() => {
  if (!isNormalizedModel.value) {
    return uniqueMembers.value.reduce((sum, m) => {
      const c = m.githubUsername ? getContributions(m.githubUsername) : null
      return sum + (c?.totalContributions ?? 0)
    }, 0)
  }
  let sum = 0
  let any = false
  for (const m of uniqueMembers.value) {
    const total = getProjectContribution(m.accountId)?.github?.totalContributions
    if (typeof total === 'number') {
      sum += total
      any = true
    }
  }
  return any ? sum : null
})

// The aggregate spans the whole team, so a window is only asserted when every
// roster member has a published record reporting the same known lookback.
const canonicalLookbackDays = computed(() => {
  const metrics = props.teamMetrics
  if (!metrics?.members) return null
  const published = new Map()
  for (const m of metrics.members) {
    if (m.metrics) published.set(m.accountId, m.metrics.lookbackDays)
  }
  if (typeof metrics.memberCount === 'number' && metrics.memberCount > published.size) return null
  let window = null
  for (const member of uniqueMembers.value) {
    const days = published.get(member.accountId)
    if (typeof days !== 'number') return null
    if (window !== null && days !== window) return null
    window = days
  }
  return window
})

const deliveryWindowSubtitle = computed(() => {
  if (!isNormalizedModel.value) return 'Last year'
  const days = canonicalLookbackDays.value
  if (days == null) return ''
  return days === 365 ? 'Last year' : `Last ${days} days`
})

const githubSubtitle = computed(() => {
  if (!isNormalizedModel.value) return 'Last year'
  const availableCount = uniqueMembers.value.filter(m => typeof getProjectContribution(m.accountId)?.github?.totalContributions === 'number').length
  return availableCount < uniqueCount.value ? `${availableCount}/${uniqueCount.value} with data` : 'Last year'
})

const teamGitlabTotal = computed(() => {
  return uniqueMembers.value.reduce((sum, m) => {
    const c = m.gitlabUsername ? getGitlabContributions(m.gitlabUsername) : null
    return sum + (c?.totalContributions ?? 0)
  }, 0)
})

const gitlabConfiguredCount = computed(() => uniqueMembers.value.filter(m => m.gitlabUsername).length)

const teamGitlabByInstance = computed(() => {
  const totals = {}
  for (const m of uniqueMembers.value) {
    if (!m.gitlabUsername) continue
    const instances = getGitlabContributions(m.gitlabUsername)?.instances || {}
    for (const [baseUrl, data] of Object.entries(instances)) {
      totals[baseUrl] = (totals[baseUrl] || 0) + (data.totalContributions || 0)
    }
  }
  return totals
})

async function openPersonHistory(member) {
  // Snapshot history is OSAC-only; never call it for a canonical team.
  if (isNormalizedModel.value) return
  showSnapshotHistory.value = true
  snapshotHistoryLoading.value = true
  snapshotHistoryTitle.value = `${member.jiraDisplayName || member.name} - Metric History`
  snapshotHistoryMode.value = 'person'
  snapshotHistoryData.value = []
  try {
    const result = await getPersonSnapshots(props.team.key, member.jiraDisplayName || member.name)
    snapshotHistoryData.value = result.snapshots || []
  } catch (err) {
    console.error('Failed to load person snapshots:', err)
  } finally {
    snapshotHistoryLoading.value = false
  }
}

async function openTeamHistory() {
  if (isNormalizedModel.value) return
  showSnapshotHistory.value = true
  snapshotHistoryLoading.value = true
  snapshotHistoryTitle.value = `${props.teamDisplayName} - Metric History`
  snapshotHistoryMode.value = 'team'
  snapshotHistoryData.value = []
  try {
    const result = await getTeamSnapshots(props.team.key)
    snapshotHistoryData.value = result.snapshots || []
  } catch (err) {
    console.error('Failed to load team snapshots:', err)
  } finally {
    snapshotHistoryLoading.value = false
  }
}

function exportCsv() {
  const customFieldHeaders = visibleFields.value.map(f => f.label)
  const headers = ['Name', ...customFieldHeaders, 'Issues Resolved', 'Story Points', 'Avg Cycle Time (days)', 'In Progress', 'GitHub Contributions (1yr)', 'GitLab Contributions (1yr)', 'Teams']
  const rows = uniqueMembers.value.map(member => {
    const metrics = memberMetricsMap.value.get(member.accountId || member.jiraDisplayName)
    const teamCount = getTeamsForPerson(member.accountId || member.jiraDisplayName).length
    const ghCount = isNormalizedModel.value
      ? (getProjectContribution(member.accountId)?.github?.totalContributions ?? '')
      : (getContributions(member.githubUsername)?.totalContributions ?? '')
    const glCount = isNormalizedModel.value ? 'Unsupported' : (getGitlabContributions(member.gitlabUsername)?.totalContributions ?? '')
    const customFieldValues = visibleFields.value.map(f => member.customFields?.[f.key] || '')
    return [
      member.name,
      ...customFieldValues,
      metrics?.resolvedCount ?? '',
      metrics?.resolvedPoints ?? '',
      metrics?.avgCycleTimeDays ?? '',
      metrics?.inProgressCount ?? '',
      ghCount,
      glCount,
      teamCount
    ]
  })

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const teamSlug = props.teamDisplayName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const date = new Date().toISOString().slice(0, 10)
  a.download = `${teamSlug}-${date}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

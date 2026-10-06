<script setup>
import { computed, ref, watch } from 'vue'
import HygieneSelect from './HygieneSelect.vue'

const props = defineProps({
  hygiene: { type: Object, required: true },
  projectName: { type: String, default: '' },
  generatedAt: { type: String, default: null },
  freshness: { type: String, default: 'unknown' },
  partial: { type: Boolean, default: false }
})

const selectedReleases = ref([])

const releases = computed(() => Array.isArray(props.hygiene?.releases) ? props.hygiene.releases : [])
const releaseOptions = computed(() => releases.value.map(release => ({
  value: release.displayName,
  label: release.state === 'archived' ? `${release.displayName} (archived)` : release.displayName
})))
const visibleReleases = computed(() => selectedReleases.value.length === 0
  ? releases.value
  : releases.value.filter(release => selectedReleases.value.includes(release.displayName)))

watch(() => props.hygiene, () => { selectedReleases.value = [] })

const features = computed(() => {
  const byKey = new Map()
  for (const release of visibleReleases.value) {
    for (const feature of Array.isArray(release.features) ? release.features : []) {
      if (!feature?.key) continue
      const existing = byKey.get(feature.key)
      if (!existing) {
        byKey.set(feature.key, {
          ...feature,
          releaseNames: [release.displayName],
          violations: [...(feature.violations || [])]
        })
        continue
      }
      if (!existing.releaseNames.includes(release.displayName)) existing.releaseNames.push(release.displayName)
      for (const violation of feature.violations || []) {
        const duplicate = existing.violations.some(item =>
          item.id === violation.id && item.sourceIssueKey === violation.sourceIssueKey
        )
        if (!duplicate) existing.violations.push(violation)
      }
      existing.releaseEvidence = [
        ...(existing.releaseEvidence || []),
        ...(feature.releaseEvidence || [])
      ].filter((item, index, values) => values.findIndex(candidate =>
        candidate.issueKey === item.issueKey && candidate.fixVersion === item.fixVersion && candidate.source === item.source
      ) === index)
    }
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key))
})

const unassignedFindings = computed(() => {
  const byKey = new Map()
  for (const release of visibleReleases.value) {
    for (const finding of Array.isArray(release.unassignedFindings) ? release.unassignedFindings : []) {
      if (!finding?.key) continue
      const existing = byKey.get(finding.key)
      if (!existing) {
        byKey.set(finding.key, {
          ...finding,
          releaseNames: [release.displayName],
          violations: [...(finding.violations || [])]
        })
        continue
      }
      if (!existing.releaseNames.includes(release.displayName)) existing.releaseNames.push(release.displayName)
      for (const violation of finding.violations || []) {
        if (!existing.violations.some(item => item.id === violation.id)) existing.violations.push(violation)
      }
    }
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key))
})

const columns = computed(() => {
  const groups = new Map()
  for (const feature of features.value) {
    const status = typeof feature.status === 'string' && feature.status.trim()
      ? feature.status.trim()
      : 'Status unknown'
    if (!groups.has(status)) groups.set(status, [])
    groups.get(status).push(feature)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === 'Status unknown') return 1
      if (b === 'Status unknown') return -1
      return a.localeCompare(b)
    })
    .map(([status, items]) => ({ status, items }))
})

const violationFeatureCount = computed(() => features.value.filter(feature => (feature.violations || []).length > 0).length)
const violationCount = computed(() => features.value.reduce((total, feature) => total + (feature.violations || []).length, 0))
const selectedIssueCount = computed(() => {
  const keys = new Set(unassignedFindings.value.map(issue => issue.key))
  for (const feature of features.value) {
    for (const violation of feature.violations || []) {
      if (violation.sourceIssueKey) keys.add(violation.sourceIssueKey)
    }
  }
  return keys.size
})
const coverage = computed(() => props.hygiene?.summary || {})
const sourceRefs = computed(() => props.hygiene?.sourceRefs || {})
const unattributedIssues = computed(() => Array.isArray(props.hygiene?.unattributedIssues)
  ? props.hygiene.unattributedIssues
  : [])
const isEmpty = computed(() => props.hygiene?.state === 'empty' && releases.value.length === 0)
const hasVisibleFindings = computed(() => features.value.length > 0 || unassignedFindings.value.length > 0)

function issueHref(item) {
  const value = item?.jiraUrl
  if (!value) return null
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

function formatDate(value) {
  if (!value) return 'unknown'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function freshnessLabel(value) {
  return ['fresh', 'stale', 'unknown'].includes(value) ? value : 'unknown'
}
</script>

<template>
  <div class="space-y-5">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 class="text-lg font-bold text-gray-900 dark:text-gray-100">{{ projectName || 'Project' }} Jira Hygiene</h2>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Release findings are attributed only through Jira Fix Version and the configured Feature hierarchy.
        </p>
      </div>
      <div class="w-full sm:w-auto">
        <div class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Release filter</div>
        <HygieneSelect
          :model-value="selectedReleases"
          :options="releaseOptions"
          placeholder="All releases"
          @update:model-value="selectedReleases = $event"
        />
      </div>
    </header>

    <div
      v-if="partial || hygiene.partial"
      role="status"
      class="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300"
    >
      Evidence is partial. These counts describe the published records and may omit unavailable source evidence.
    </div>

    <section class="grid grid-cols-2 lg:grid-cols-5 gap-3" aria-label="Jira Hygiene coverage">
      <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div class="text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ coverage.totalUniqueIssueCount ?? 'Unknown' }}</div>
        <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">Project Jira findings</div>
      </div>
      <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div class="text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ coverage.attributedUniqueIssueCount ?? 'Unknown' }}</div>
        <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">Attributed to a registered release</div>
      </div>
      <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div class="text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ coverage.unattributedUniqueIssueCount ?? 'Unknown' }}</div>
        <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">Without release attribution</div>
      </div>
      <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div class="text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ coverage.unmatchedFixVersionIssueCount ?? 'Unknown' }}</div>
        <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">Unmatched/ambiguous Fix Versions</div>
      </div>
      <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div class="text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{{ coverage.unassignedFeatureFindingCount ?? 'Unknown' }}</div>
        <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">Release findings without a Feature ancestor</div>
      </div>
    </section>

    <div v-if="Object.keys(coverage.unattributedReasons || {}).length" class="flex flex-wrap gap-2 text-xs text-gray-600 dark:text-gray-300">
      <span class="font-semibold">No-release attribution reasons:</span>
      <span v-for="(count, reason) in coverage.unattributedReasons" :key="reason" class="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-1">
        {{ reason }}: {{ count }}
      </span>
    </div>

    <section class="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
      <span><strong class="font-semibold">Selected releases:</strong> {{ selectedReleases.length || releases.length }}</span>
      <span><strong class="font-semibold">Features:</strong> {{ features.length }}</span>
      <span><strong class="font-semibold">Features with findings:</strong> {{ violationFeatureCount }}</span>
      <span><strong class="font-semibold">Rule matches:</strong> {{ violationCount }}</span>
      <span><strong class="font-semibold">Finding issues in selected releases:</strong> {{ selectedIssueCount }}</span>
      <span class="ml-auto">Published {{ formatDate(generatedAt) }} · freshness {{ freshnessLabel(hygiene.freshness || freshness) }}</span>
    </section>

    <section class="grid gap-3 sm:grid-cols-2" aria-label="Hygiene source freshness">
      <div
        v-for="(source, name) in sourceRefs"
        :key="name"
        class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-4 py-3 text-xs text-gray-600 dark:text-gray-300"
      >
        <strong class="font-semibold">{{ name === 'jiraIssues' ? 'Jira issue snapshot' : name === 'releaseRegistry' ? 'Jira release registry' : name }}</strong>
        <span class="ml-2">{{ freshnessLabel(source?.freshness) }}</span>
        <span v-if="source?.partial" class="ml-2 text-amber-700 dark:text-amber-300">partial</span>
        <span class="ml-2 text-gray-400 dark:text-gray-500">{{ formatDate(source?.generatedAt) }}</span>
      </div>
    </section>

    <div v-if="isEmpty" role="status" class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-6 text-sm text-gray-600 dark:text-gray-300">
      Collection completed successfully and found no Jira Hygiene findings or release Feature hierarchy for this project.
    </div>

    <div v-else-if="hygiene.state === 'unavailable'" role="status" class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-6 text-sm text-gray-600 dark:text-gray-300">
      Release Hygiene attribution is unavailable{{ hygiene.reason ? `: ${hygiene.reason}` : '.' }}
    </div>

    <div v-else-if="releases.length === 0" role="status" class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-6 text-sm text-gray-600 dark:text-gray-300">
      Release attribution is unavailable for this publication.
    </div>

    <div v-else-if="visibleReleases.length === 0" role="status" class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-6 text-sm text-gray-600 dark:text-gray-300">
      No release matches the selected filter.
    </div>

    <div v-else-if="!hasVisibleFindings" role="status" class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-6 text-sm text-gray-600 dark:text-gray-300">
      The selected releases have no Feature hierarchy or release-attributed Hygiene findings in this publication.
    </div>

    <div v-else class="space-y-6">
      <section aria-label="Release Feature Hygiene">
        <h3 class="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-200">Features by Jira status</h3>
        <div class="flex gap-3 overflow-x-auto pb-2">
          <div
            v-for="column in columns"
            :key="column.status"
            class="flex min-w-[15rem] max-w-[19rem] flex-1 flex-col rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40"
          >
            <div class="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-3 py-2.5">
              <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300">{{ column.status }}</h4>
              <span class="rounded-full bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 text-xs text-gray-600 dark:text-gray-300">{{ column.items.length }}</span>
            </div>
            <div class="max-h-[calc(100vh-340px)] min-h-[8rem] space-y-2 overflow-y-auto p-2">
              <article
                v-for="feature in column.items"
                :key="feature.key"
                class="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shadow-sm"
              >
                <div class="flex items-center justify-between gap-2">
                  <a v-if="issueHref(feature)" :href="issueHref(feature)" target="_blank" rel="noopener noreferrer" class="font-mono text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline">{{ feature.key }}</a>
                  <span v-else class="font-mono text-xs font-semibold text-primary-600 dark:text-primary-400">{{ feature.key }}</span>
                  <span class="text-[10px] text-gray-500 dark:text-gray-400">{{ (feature.violations || []).length }} findings</span>
                </div>
                <p class="mt-1 line-clamp-3 text-xs font-medium text-gray-900 dark:text-gray-100">{{ feature.summary || 'Summary unavailable' }}</p>
                <div class="mt-2 space-y-1 text-[11px] text-gray-600 dark:text-gray-300">
                  <div><span class="text-gray-400 dark:text-gray-500">Status:</span> {{ feature.status || 'Unknown' }}</div>
                  <div><span class="text-gray-400 dark:text-gray-500">Assignee:</span> {{ feature.assignee || 'Unassigned' }}</div>
                  <div><span class="text-gray-400 dark:text-gray-500">Release evidence:</span> {{ [...new Set((feature.releaseEvidence || []).map(item => item.fixVersion))].join(', ') || 'Not recorded' }}</div>
                </div>
                <ul v-if="feature.violations?.length" class="mt-2 space-y-1 border-t border-gray-100 dark:border-gray-700 pt-2">
                  <li v-for="violation in feature.violations" :key="`${violation.id}:${violation.sourceIssueKey}`" class="text-[11px] text-orange-700 dark:text-orange-300">
                    {{ violation.name || violation.id }}
                  </li>
                </ul>
              </article>
              <div v-if="column.items.length === 0" class="py-6 text-center text-xs text-gray-400 dark:text-gray-500">No Features</div>
            </div>
          </div>
        </div>
      </section>

      <section v-if="unassignedFindings.length" class="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/10 p-4">
        <div class="mb-3">
          <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Release findings without a Feature ancestor</h3>
          <p class="mt-1 text-xs text-gray-600 dark:text-gray-400">These issues match a release Fix Version, but the configured Jira hierarchy does not place them under a Feature.</p>
        </div>
        <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <article v-for="issue in unassignedFindings" :key="issue.key" class="rounded-md border border-amber-200 dark:border-amber-800 bg-white dark:bg-gray-800 p-3">
            <a v-if="issueHref(issue)" :href="issueHref(issue)" target="_blank" rel="noopener noreferrer" class="font-mono text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline">{{ issue.key }}</a>
            <span v-else class="font-mono text-xs font-semibold text-primary-600 dark:text-primary-400">{{ issue.key }}</span>
            <p class="mt-1 text-xs text-gray-800 dark:text-gray-200">{{ issue.summary || 'Summary unavailable' }}</p>
            <p class="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{{ issue.violations.map(item => item.name || item.id).join(', ') }}</p>
          </article>
        </div>
      </section>

      <details v-if="unattributedIssues.length" class="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <summary class="cursor-pointer px-4 py-3 text-sm font-medium text-gray-800 dark:text-gray-200">
          Findings without a release assignment ({{ unattributedIssues.length }})
        </summary>
        <div class="max-h-80 overflow-y-auto border-t border-gray-200 dark:border-gray-700 px-4 py-2">
          <div v-for="issue in unattributedIssues" :key="issue.key" class="flex flex-wrap items-baseline gap-x-3 border-b border-gray-100 dark:border-gray-700 py-2 text-xs last:border-0">
            <a v-if="issueHref(issue)" :href="issueHref(issue)" target="_blank" rel="noopener noreferrer" class="font-mono font-semibold text-primary-600 dark:text-primary-400 hover:underline">{{ issue.key }}</a>
            <span v-else class="font-mono font-semibold text-gray-700 dark:text-gray-300">{{ issue.key }}</span>
            <span class="min-w-0 flex-1 text-gray-600 dark:text-gray-300">{{ issue.summary || 'Summary unavailable' }}</span>
            <span class="text-gray-500 dark:text-gray-400">{{ issue.reason }}</span>
          </div>
        </div>
      </details>
    </div>
  </div>
</template>

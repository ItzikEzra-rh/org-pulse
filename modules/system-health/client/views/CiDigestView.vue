<script setup>
import { ref, computed, onMounted } from 'vue'
import { ExternalLinkIcon } from 'lucide-vue-next'
import { apiRequest } from '@shared/client/services/api.js'
import { formatRelativeTime } from '../composables/useDisconnectedReadiness.js'
import InfraFailureDonuts from '../components/ci-digest/InfraFailureDonuts.vue'
import RepoWindowBarChart from '../components/ci-digest/RepoWindowBarChart.vue'
import JobsHistogramChart from '../components/ci-digest/JobsHistogramChart.vue'
import OutcomesChart from '../components/ci-digest/OutcomesChart.vue'

// A daily digest that's more than this many hours old is flagged stale --
// generous enough to absorb one missed/delayed run of the upstream
// ci-daily-digest.yml workflow (nominally every 24h) without false alarms.
const STALE_THRESHOLD_HOURS = 36

const envelope = ref(null)
const loading = ref(true)
const error = ref(null)
const notFound = ref(false)

async function load() {
  loading.value = true
  error.value = null
  notFound.value = false
  try {
    envelope.value = await apiRequest('/modules/system-health/ci-digest')
  } catch (e) {
    if (e.status === 404) {
      notFound.value = true
    } else {
      error.value = e.message || 'Failed to load CI digest'
    }
    envelope.value = null
  } finally {
    loading.value = false
  }
}

onMounted(load)

const digest = computed(() => envelope.value?.digest || null)
const source = computed(() => envelope.value?.source || null)

// digest.now is producer-formatted ("2026-09-13 08:00 UTC"), not ISO --
// normalize to something Date can parse.
function parseDigestNow(now) {
  if (!now) return null
  const iso = now.replace(' UTC', 'Z').replace(' ', 'T')
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

const generatedAt = computed(() => parseDigestNow(digest.value?.now))

const staleHours = computed(() => {
  if (!generatedAt.value) return null
  return (Date.now() - generatedAt.value.getTime()) / (1000 * 60 * 60)
})

const isStale = computed(() => staleHours.value != null && staleHours.value > STALE_THRESHOLD_HOURS)

function decisiveRate(counts) {
  if (!counts || counts.success + counts.failure === 0) return null
  return counts.success_rate
}

function pct(rate) {
  return rate == null ? 'n/a' : `${(rate * 100).toFixed(1)}%`
}

function statusColorClass(rate) {
  if (rate == null) return 'text-gray-500 dark:text-gray-400'
  if (rate < 0.5) return 'text-red-600 dark:text-red-400'
  if (rate < 0.8) return 'text-amber-600 dark:text-amber-400'
  return 'text-green-600 dark:text-green-400'
}

const headlineTiles = computed(() => {
  if (!digest.value) return []
  const r24 = decisiveRate(digest.value.periodic_24h)
  const r72 = decisiveRate(digest.value.periodic_72h)
  const flake = digest.value.flake_rate
  const mttr = digest.value.mttr
  return [
    {
      label: 'Periodic success (24h)',
      value: pct(r24),
      sub: `${digest.value.periodic_24h.success}/${digest.value.periodic_24h.success + digest.value.periodic_24h.failure} runs`,
      colorClass: statusColorClass(r24)
    },
    {
      label: 'Periodic success (72h)',
      value: pct(r72),
      sub: `${digest.value.periodic_72h.success}/${digest.value.periodic_72h.success + digest.value.periodic_72h.failure} runs`,
      colorClass: statusColorClass(r72)
    },
    {
      // null here means zero e2e successes recorded in the 7d window at all
      // (no data to compute a rate from) -- not a 0% flake rate, which would
      // mean plenty of successes and none of them flaky.
      label: 'Flake rate (7d)',
      value: flake == null ? 'n/a' : pct(flake),
      sub: flake == null ? 'no successes yet' : 'retry-to-green',
      colorClass: 'text-blue-600 dark:text-blue-400'
    },
    {
      label: 'MTTR (7d)',
      value: mttr ? mttr.mttr_display : 'n/a',
      sub: mttr ? `${mttr.num_recoveries} recoveries` : 'no recoveries yet',
      colorClass: 'text-teal-600 dark:text-teal-400'
    }
  ]
})

function buildRepoRows(window7d, window24h, { secKey, dispKey, countKey }) {
  const by7dMap = Object.fromEntries((window7d?.by_repo || []).map(r => [r.repo, r]))
  const by24hMap = Object.fromEntries((window24h?.by_repo || []).map(r => [r.repo, r]))
  const repoNames = new Set([...Object.keys(by7dMap), ...Object.keys(by24hMap)])

  const rows = [...repoNames].map(repo => {
    const r7 = by7dMap[repo]
    const r24 = by24hMap[repo]
    const has7 = r7 && r7[secKey] != null
    const has24 = r24 && r24[secKey] != null
    return {
      repo,
      hours7d: has7 ? r7[secKey] / 3600 : null,
      label7d: has7 ? r7[dispKey] : null,
      count7d: has7 ? r7[countKey] : null,
      hours24: has24 ? r24[secKey] / 3600 : null,
      label24: has24 ? r24[dispKey] : null,
      count24: has24 ? r24[countKey] : null
    }
  }).filter(row => row.hours7d != null || row.hours24 != null)

  rows.sort((a, b) => {
    const sortA = a.hours7d ?? a.hours24
    const sortB = b.hours7d ?? b.hours24
    if (sortA == null) return sortB == null ? 0 : 1
    if (sortB == null) return -1
    return sortA - sortB
  })

  return rows
}

const mergeTimeRows = computed(() => {
  if (!digest.value) return []
  return buildRepoRows(digest.value.merge_time, digest.value.merge_time_24h, {
    secKey: 'median_approval_to_merge_seconds',
    dispKey: 'median_approval_to_merge_display',
    countKey: 'approved_count'
  })
})

const queueWaitRows = computed(() => {
  if (!digest.value) return []
  return buildRepoRows(digest.value.merge_time, digest.value.merge_time_24h, {
    secKey: 'median_queue_wait_seconds',
    dispKey: 'median_queue_wait_display',
    countKey: 'via_merge_queue_count'
  })
})

const mergeDesc = computed(() => {
  const m = digest.value?.merge_time
  const m24 = digest.value?.merge_time_24h
  if (!m || !m24) return ''
  return `7d median ${m.median_approval_to_merge_display} / avg ${m.avg_approval_to_merge_display} overall `
    + `(${m.approved_count}/${m.count} with an approval) · `
    + `24h median ${m24.median_approval_to_merge_display} / avg ${m24.avg_approval_to_merge_display} overall `
    + `(${m24.approved_count}/${m24.count})`
})

const queueDesc = computed(() => {
  const m = digest.value?.merge_time
  const m24 = digest.value?.merge_time_24h
  if (!m || !m24) return ''
  return `7d median ${m.median_queue_wait_display} / avg ${m.avg_queue_wait_display} overall `
    + `(${m.via_merge_queue_count}/${m.count} via queue) · `
    + `24h median ${m24.median_queue_wait_display} / avg ${m24.avg_queue_wait_display} overall `
    + `(${m24.via_merge_queue_count}/${m24.count})`
})

const jobsPerPr = computed(() => digest.value?.jobs_per_pr || null)

const prTiles = computed(() => {
  const jp = jobsPerPr.value
  if (!jp) return []
  return [
    { label: 'PRs with e2e activity', value: jp.distinct_prs },
    { label: 'Total e2e job runs', value: jp.total_jobs },
    { label: 'Avg jobs / PR', value: jp.avg_jobs_per_pr },
    { label: 'Median jobs / PR', value: jp.median_jobs_per_pr }
  ]
})

function prUrl(repo, pr) {
  const num = String(pr).replace(/^#/, '')
  return `https://github.com/osac-project/${encodeURIComponent(repo)}/pull/${encodeURIComponent(num)}`
}

const topFailingText = computed(() => {
  const tf = digest.value?.top_failing
  // null here means no workflow had any failures in the 24h window at all
  // -- a healthy signal, not "unknown" -- so it renders as "None", never
  // the same "n/a" used for genuinely missing/insufficient data elsewhere.
  return tf ? `${tf.workflow} (${tf.failure} failures)` : 'None'
})

function retry() {
  load()
}
</script>

<template>
  <div class="max-w-6xl mx-auto py-6 px-4 space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">CI Daily Digest</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          OSAC end-to-end CI health, from osac-project/osac-test-infra's daily digest report
        </p>
      </div>
      <div v-if="digest" class="text-right">
        <p class="text-xs text-gray-500 dark:text-gray-400">
          Generated {{ digest.now }} ({{ formatRelativeTime(generatedAt?.toISOString()) }})
        </p>
        <p v-if="isStale" class="text-xs font-semibold text-amber-600 dark:text-amber-400 mt-0.5">
          ⚠ Report is more than {{ STALE_THRESHOLD_HOURS }}h old — the daily digest run may have stopped
        </p>
        <a
          v-if="source?.runUrl"
          :href="source.runUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 mt-0.5"
        >Source run <ExternalLinkIcon :size="11" /></a>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div v-for="i in 4" :key="i" class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 animate-pulse">
          <div class="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
          <div class="h-6 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
      <div class="text-center py-8 text-sm text-gray-500 dark:text-gray-400">Loading CI digest…</div>
    </div>

    <!-- Error -->
    <div
      v-else-if="error"
      class="text-center py-16 bg-white dark:bg-gray-800 rounded-lg border border-red-200 dark:border-red-700/50"
    >
      <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">Failed to load CI digest</h3>
      <p class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>
      <button
        @click="retry"
        class="mt-4 px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
      >Try again</button>
    </div>

    <!-- Missing data -->
    <div
      v-else-if="notFound || !digest"
      class="text-center py-16 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
    >
      <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">No CI digest report available</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        Waiting for org-pulse-data to deliver the first OSAC CI daily digest report.
      </p>
    </div>

    <template v-else>
      <!-- Headline -->
      <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          v-for="tile in headlineTiles"
          :key="tile.label"
          class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
        >
          <div class="text-xs text-gray-500 dark:text-gray-400 mb-1.5">{{ tile.label }}</div>
          <div class="text-2xl font-bold tabular-nums" :class="tile.colorClass">{{ tile.value }}</div>
          <div class="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{{ tile.sub }}</div>
        </div>
      </section>

      <!-- E2E Failures -->
      <section>
        <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">E2E Failures — Infra vs. Test</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1" title="Infra = CI's own fault (setup/teardown/provisioning). Test = the product itself.">
              Presubmit (PR-triggered)
            </h3>
            <InfraFailureDonuts :window24="digest.infra_24h" :window72="digest.infra_72h" />
          </div>
          <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1" title="Same infra vs. test breakdown, for periodic (scheduled) e2e runs.">
              Periodic (scheduled)
            </h3>
            <InfraFailureDonuts :window24="digest.periodic_infra_24h" :window72="digest.periodic_infra_72h" />
          </div>
        </div>
      </section>

      <!-- Time to Merge -->
      <section class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
        <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">Time to Merge (24h &amp; 7d)</h2>
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">Median time from first approval to merge, by repo</p>
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">{{ mergeDesc }}</p>
        <RepoWindowBarChart :rows="mergeTimeRows" empty-message="No merged PRs had a human approval in this window." />
      </section>

      <!-- Time in Merge Queue -->
      <section class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
        <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">Time in Merge Queue (24h &amp; 7d)</h2>
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">Median time from entering the merge queue to merge, by repo</p>
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">{{ queueDesc }}</p>
        <RepoWindowBarChart :rows="queueWaitRows" empty-message="No merged PRs went through the merge queue in this window." />
      </section>

      <!-- E2E Jobs per PR -->
      <section>
        <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">E2E Jobs per PR (7d)</h2>
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
          <div
            v-for="tile in prTiles"
            :key="tile.label"
            class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
          >
            <div class="text-xs text-gray-500 dark:text-gray-400 mb-1.5">{{ tile.label }}</div>
            <div class="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{{ tile.value }}</div>
          </div>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 mb-4">
          <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Distribution</h3>
          <JobsHistogramChart :histogram="jobsPerPr?.histogram || []" />
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <h3 class="px-5 pt-4 pb-2 text-sm font-medium text-gray-900 dark:text-gray-100">Top 10 PRs by e2e job count</h3>
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50">
                  <th class="px-4 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Repo</th>
                  <th class="px-4 py-2 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">PR</th>
                  <th class="px-4 py-2 text-right text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Jobs</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in jobsPerPr?.top_prs || []" :key="`${p.repo}-${p.pr}`" class="border-b border-gray-100 dark:border-gray-800 last:border-0">
                  <td class="px-4 py-2 text-gray-700 dark:text-gray-300">{{ p.repo }}</td>
                  <td class="px-4 py-2">
                    <a :href="prUrl(p.repo, p.pr)" target="_blank" rel="noopener noreferrer" class="text-primary-600 dark:text-blue-400 hover:underline">{{ p.pr }}</a>
                  </td>
                  <td class="px-4 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">{{ p.jobs }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
            <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3" title="Every e2e job run in the window, by final conclusion.">E2E job outcomes</h3>
            <OutcomesChart :outcomes="jobsPerPr?.outcomes || []" />
          </div>
        </div>
      </section>

      <!-- Other stability signals -->
      <section class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5">
        <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Other stability signals</h2>
        <dl class="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
          <div class="flex items-center justify-between py-2.5">
            <dt class="text-gray-500 dark:text-gray-400" title="Fraction of e2e runs that failed at least once, then passed on a re-run of the same commit.">Flake rate (7d)</dt>
            <dd class="font-semibold text-gray-900 dark:text-gray-100">{{ digest.flake_rate == null ? 'no successes yet' : pct(digest.flake_rate) }}</dd>
          </div>
          <div class="flex items-center justify-between py-2.5">
            <dt class="text-gray-500 dark:text-gray-400" title="Mean Time To Recovery: average time from a failing e2e run to the next run of that workflow succeeding.">MTTR (7d)</dt>
            <dd class="font-semibold text-gray-900 dark:text-gray-100">{{ digest.mttr ? digest.mttr.mttr_display : 'no recoveries yet' }}</dd>
          </div>
          <div class="flex items-center justify-between py-2.5">
            <dt class="text-gray-500 dark:text-gray-400" title="The e2e workflow with the most failures in the last 24 hours, across all repos.">Top failing workflow (24h)</dt>
            <dd class="font-semibold text-gray-900 dark:text-gray-100">{{ topFailingText }}</dd>
          </div>
          <div class="flex items-center justify-between py-2.5">
            <dt class="text-gray-500 dark:text-gray-400" title="Average number of e2e re-runs a merged PR needed beyond its first attempt.">Retests per PR, avg (7d)</dt>
            <dd class="font-semibold text-gray-900 dark:text-gray-100">{{ digest.merge_time?.avg_retest_count }}</dd>
          </div>
        </dl>
      </section>
    </template>
  </div>
</template>

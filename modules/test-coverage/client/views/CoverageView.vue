<template>
  <div class="max-w-6xl mx-auto px-4 py-6">
    <div class="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Test Coverage</h1>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Nightly OSAC coverage by working group and capability area. For detail, developers run the command in the last column.
        </p>
      </div>
      <div v-if="latest && latest.available && latest.lastRunAt" class="text-right text-xs text-gray-500 dark:text-gray-400">
        <div>Last run <span class="font-medium text-gray-700 dark:text-gray-300">{{ latest.lastRunAt }}</span></div>
        <div v-if="latest.commit" class="font-mono text-gray-400 dark:text-gray-500" :title="latest.commit">{{ shortCommit }}</div>
      </div>
    </div>

    <div v-if="loading" class="space-y-3" data-testid="loading">
      <div class="h-16 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg animate-pulse" />
      <div class="h-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg animate-pulse" />
    </div>

    <div v-else-if="error" class="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-4 text-sm text-red-700 dark:text-red-400">
      {{ error }}
      <button class="ml-2 underline" @click="load">Retry</button>
    </div>

    <div v-else-if="!latest || !latest.available" class="text-center py-16" data-testid="empty-state">
      <ClipboardListIcon :size="44" class="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
      <p class="text-gray-600 dark:text-gray-300 font-medium">No coverage run has been synced yet</p>
      <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">The nightly org-pulse-data coverage job publishes results here.</p>
    </div>

    <template v-else>
      <div v-if="wgs.length" class="mb-4 flex items-center gap-2">
        <label for="wg-selector" class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Working group</label>
        <select
          id="wg-selector"
          data-testid="wg-selector"
          :value="selectedGroup"
          class="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer transition-colors duration-200"
          @change="selectGroup($event.target.value)"
        >
          <option v-for="wg in wgs" :key="wg.key" :value="wg.key">{{ wg.name }}</option>
        </select>
      </div>

      <div
        v-if="stale"
        data-testid="stale-banner"
        class="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300"
      >
        <AlertTriangleIcon :size="16" class="mt-0.5 shrink-0" />
        <div><span class="font-medium">Coverage data may be stale.</span> Last run was {{ age }}; the nightly sync may have failed.</div>
      </div>

      <div class="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <table class="min-w-full text-sm">
          <thead class="bg-gray-50 dark:bg-gray-700/40">
            <tr class="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <th class="px-4 py-2.5 font-semibold">Area</th>
              <th class="px-3 py-2.5 font-semibold">Verdict</th>
              <th class="px-3 py-2.5 font-semibold">Unit</th>
              <th class="px-3 py-2.5 font-semibold">Integration</th>
              <th class="px-3 py-2.5 font-semibold">E2E</th>
              <th class="px-3 py-2.5 font-semibold">Gaps crit/high</th>
              <th class="px-3 py-2.5 font-semibold">Trend</th>
              <th class="px-4 py-2.5 font-semibold">Developer command</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in selectedRows"
              :key="row.key"
              class="border-t border-gray-100 dark:border-gray-700/60 align-top"
              :data-testid="`row-${row.key}`"
            >
              <td class="px-4 py-2.5 font-medium text-gray-900 dark:text-gray-100">{{ row.name }}</td>
              <td class="px-3 py-2.5">
                <span :class="['inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap', verdictMeta(row.verdict).classes]">
                  {{ verdictMeta(row.verdict).label }}
                </span>
                <div v-if="row.reason" class="mt-1 text-xs text-gray-400 dark:text-gray-500">{{ row.reason }}</div>
              </td>
              <td v-for="tier in TIERS" :key="tier" class="px-3 py-2.5">
                <span
                  :class="['inline-flex px-2 py-0.5 rounded text-xs font-medium tabular-nums whitespace-nowrap', row.cell[tier].classes]"
                  :data-state="row[tier].state"
                  :title="row.cell[tier].title"
                >{{ row.cell[tier].label }}</span>
              </td>
              <td class="px-3 py-2.5 whitespace-nowrap">
                <span v-if="row.gaps.total === 0" class="text-gray-400 dark:text-gray-600">—</span>
                <template v-else>
                  <span :class="row.gaps.critical ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-400 dark:text-gray-600'" :title="`${row.gaps.critical} critical gap(s)`">{{ row.gaps.critical }}</span><span class="text-gray-300 dark:text-gray-600"> / </span><span :class="row.gaps.high ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-gray-400 dark:text-gray-600'" :title="`${row.gaps.high} high gap(s)`">{{ row.gaps.high }}</span>
                </template>
              </td>
              <td class="px-3 py-2.5">
                <div class="flex items-center gap-1.5 text-xs font-semibold">
                  <span
                    v-for="tier in TIERS"
                    :key="tier"
                    :class="trendMeta(trends[row.key] && trends[row.key][tier]).classes"
                    :data-testid="`trend-${tier}-${row.key}`"
                    :data-trend="(trends[row.key] && trends[row.key][tier]) || 'none'"
                    :title="`${tier}: ${(trends[row.key] && trends[row.key][tier]) || 'no comparable history'}`"
                  >{{ TIER_LABEL[tier] }}{{ trendMeta(trends[row.key] && trends[row.key][tier]).symbol }}</span>
                </div>
              </td>
              <td class="px-4 py-2.5">
                <code class="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/40 px-1.5 py-0.5 rounded select-all">make coverage-report FEATURE={{ row.key }}</code>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <details
        class="mt-5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
        data-testid="help-panel"
        :open="helpOpen"
        @toggle="toggleHelp($event)"
      >
        <summary class="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300">How to read this page</summary>
        <div class="px-4 pb-4 text-xs text-gray-500 dark:text-gray-400 space-y-2">
          <p><span class="font-semibold text-gray-700 dark:text-gray-300">Verdicts</span> are decided in this order: <span class="font-medium">not ready</span> when there is any critical or high gap; otherwise <span class="font-medium">insufficient evidence</span> when a tier is blocked, na, or unavailable, or a 0% only reflects unreviewed/unmapped test links; otherwise <span class="font-medium">ready</span>. “Not ready” is only shown on real evidence of missing tests.</p>
          <ul class="space-y-0.5">
            <li><span class="font-medium">measured %</span> — statement coverage from Go test profiles.</li>
            <li><span class="font-medium">zero</span> — a measured 0%; “pending review” means drafted links await review.</li>
            <li><span class="font-medium">blocked</span> — evidence incomplete (a mapped package is missing, or cases have no tier).</li>
            <li><span class="font-medium">na</span> — no test plan for this area.</li>
            <li><span class="font-medium">no cases</span> — the test plan has no cases at that tier.</li>
          </ul>
          <p><span class="font-semibold text-gray-700 dark:text-gray-300">What moves a verdict:</span> add tiers to test plan cases (<span class="font-mono">Tier / owner</span>), write a test plan for areas without one, review drafted test links (<span class="font-mono">mappings_reviewed_by</span>), and add unit tests for low packages.</p>
          <p><span class="font-semibold text-gray-700 dark:text-gray-300">Change your working group’s areas:</span> edit <span class="font-mono">config/coverage/&lt;wg&gt;.yaml</span> in <a href="https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/tree/main/config/coverage" target="_blank" rel="noopener noreferrer" class="text-primary-600 dark:text-primary-400 hover:underline">org-pulse-data</a> by MR; field reference in the <a href="https://github.com/osac-project/osac/tree/main/tools/coverage-report" target="_blank" rel="noopener noreferrer" class="text-primary-600 dark:text-primary-400 hover:underline">reporter README</a>.</p>
          <p><span class="font-semibold text-gray-700 dark:text-gray-300">Developer detail:</span> run the command in the last column in the osac repo.</p>
        </div>
      </details>
    </template>
  </div>
</template>

<script setup>
import { computed, inject, onMounted, ref, watch } from 'vue'
import { AlertTriangle as AlertTriangleIcon, ClipboardList as ClipboardListIcon } from 'lucide-vue-next'
import { apiRequest } from '@shared/client/services/api.js'
import { useProjectId, projectQuery } from '@shared/client/composables/useProjectId.js'
import { formatRelativeTime, parseDateValue } from '@shared/client/utils/format.js'
import { filterByGroup } from '../utils/coverage.js'

const TIERS = ['unit', 'integration', 'e2e']
const TIER_LABEL = { unit: 'U', integration: 'I', e2e: 'E' }
const AMBER = 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
const STATE_CLASSES = {
  zero: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  blocked: AMBER,
  unavailable: AMBER,
  na: AMBER,
  none: 'bg-gray-100 text-gray-500 dark:bg-gray-700/40 dark:text-gray-400'
}
const VERDICTS = {
  ready: ['Ready', 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'],
  'not ready': ['Not ready', 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'],
  'insufficient evidence': ['Insufficient evidence', 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800']
}
const TREND = {
  up: { symbol: '↑', classes: 'text-green-600 dark:text-green-400' },
  down: { symbol: '↓', classes: 'text-red-600 dark:text-red-400' },
  flat: { symbol: '→', classes: 'text-gray-400 dark:text-gray-500' }
}
function verdictMeta(verdict) {
  const [label, classes] = VERDICTS[verdict] || VERDICTS['insufficient evidence']
  return { label, classes }
}
function cellMeta(cell) {
  const classes = STATE_CLASSES[cell.state] || 'bg-gray-50 text-gray-900 dark:bg-gray-700/30 dark:text-gray-100'
  const title = cell.detail || cell.display
  if (cell.state === 'zero' && cell.pending > 0) {
    return { classes: AMBER, label: `${cell.display} · ${cell.pending} pending review`, title: 'Drafted test links waiting for review; they count once reviewed' }
  }
  return { classes, label: cell.state === 'none' ? 'no cases' : (cell.display || cell.state), title }
}
/** Compare newest and oldest of the last four snapshots; null if not comparable. */
function trendFor(key, tier, maps) {
  if (maps.length < 2) return null
  const comparable = (cell) => cell && (cell.state === 'value' || cell.state === 'zero')
  const latest = (maps[0].get(key) || {})[tier]
  const oldest = (maps[maps.length - 1].get(key) || {})[tier]
  if (!comparable(latest) || !comparable(oldest)) return null
  const to = parseFloat(latest.display)
  const from = parseFloat(oldest.display)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  if (Math.abs(to - from) < 0.05) return 'flat'
  return to > from ? 'up' : 'down'
}
function isStale(value) {
  const parsed = parseDateValue(value)
  if (!parsed) return false
  const at = parsed.dateOnly ? parsed.at + 86400000 : parsed.at
  return Date.now() - at > 48 * 3600000
}
function trendMeta(value) {
  return TREND[value] || { symbol: '·', classes: 'text-gray-300 dark:text-gray-600' }
}
const nav = inject('moduleNav', null)
const projectId = useProjectId()
const STORAGE_KEY = 'test_coverage_group'
const latest = ref(null)
const history = ref([])
const loading = ref(true)
const error = ref(null)
const selectedGroup = ref('')
const HELP_KEY = 'test_coverage_help_open'
function storedHelp() {
  try { return localStorage.getItem(HELP_KEY) === '1' } catch { return false }
}
const helpOpen = ref(storedHelp())
function toggleHelp(event) {
  helpOpen.value = event.target.open
  try { localStorage.setItem(HELP_KEY, helpOpen.value ? '1' : '0') } catch { /* localStorage unavailable */ }
}

function storedGroup() {
  try { return localStorage.getItem(STORAGE_KEY) || '' } catch { return '' }
}
function pickGroup(list) {
  const requested = (nav && nav.params && nav.params.value && nav.params.value.group) || storedGroup()
  if (list.some((group) => group.key === requested)) return requested
  return list.some((group) => group.key === 'core') ? 'core' : (list[0] ? list[0].key : '')
}
function selectGroup(key) {
  selectedGroup.value = key
  try { localStorage.setItem(STORAGE_KEY, key) } catch { /* localStorage unavailable */ }
  if (nav) nav.updateParams({ group: key })
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const query = projectQuery(projectId.value)
    const [latestData, historyData] = await Promise.all([
      apiRequest(`/modules/test-coverage/latest${query}`),
      apiRequest(`/modules/test-coverage/history${query}`)
    ])
    latest.value = latestData
    history.value = (historyData && historyData.snapshots) || []
    selectedGroup.value = pickGroup((latestData && latestData.groups) || [])
  } catch (err) {
    error.value = err.message || 'Failed to load coverage data'
  } finally {
    loading.value = false
  }
}

onMounted(load)
const wgs = computed(() => (latest.value && latest.value.groups) || [])
watch(() => nav && nav.params && nav.params.value && nav.params.value.group, (group) => {
  if (group && wgs.value.some((wg) => wg.key === group)) selectedGroup.value = group
})
const selectedRows = computed(() => filterByGroup((latest.value && latest.value.overview) || [], selectedGroup.value)
  .map((row) => ({ ...row, cell: Object.fromEntries(TIERS.map((tier) => [tier, cellMeta(row[tier])])) })))
const stale = computed(() => isStale(latest.value && latest.value.lastRunAt))
const age = computed(() => formatRelativeTime(latest.value && latest.value.lastRunAt))
const shortCommit = computed(() => ((latest.value && latest.value.commit) || '').slice(0, 10))
const trends = computed(() => {
  const maps = history.value.slice(0, 4).map((snapshot) => new Map(snapshot.overview.map((row) => [row.key, row])))
  const result = {}
  for (const row of selectedRows.value) {
    result[row.key] = {}
    for (const tier of TIERS) result[row.key][tier] = trendFor(row.key, tier, maps)
  }
  return result
})
</script>

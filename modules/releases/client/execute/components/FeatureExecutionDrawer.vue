<script setup>
import { ref, computed, watch } from 'vue'
import StatusBadge from './StatusBadge.vue'
import AIInfoBubble from './AIInfoBubble.vue'
import { componentDisplayLabel } from '../composables/useComponentStatusFilter'
import { useFocusTrap } from '../../plan/composables/useFocusTrap'
import { isValidProgressCount, PROGRESS_SUPPORTING_TEXT, PROGRESS_HELP_TEXT } from '../utils/progress'

const props = defineProps({
  featureKey: { type: String, default: null },
  card: { type: Object, default: null },
  detail: { type: Object, default: null },
  loading: Boolean,
  error: { type: String, default: null },
  jiraBaseUrl: { type: String, default: 'https://issues.redhat.com/browse' }
})

const emit = defineEmits(['close', 'retry'])

const open = computed(() => props.featureKey !== null)

const drawerRef = ref(null)
const { handleKeydown } = useFocusTrap(drawerRef, open, () => emit('close'))

const expandedEpics = ref(new Set())
const expandedPrep = ref(new Set())

watch(() => props.featureKey, () => {
  expandedEpics.value = new Set()
  expandedPrep.value = new Set()
})

function toggleEpic(key) {
  const next = new Set(expandedEpics.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedEpics.value = next
}

function togglePrep(key) {
  const next = new Set(expandedPrep.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedPrep.value = next
}

// Per-Epic progress reads the producer's own executionIssueCount/doneExecutionIssueCount
// directly — never counted up from issue-level isPreparation flags in this view.
function epicProgress(epic) {
  const total = epic.executionIssueCount
  const done = epic.doneExecutionIssueCount
  if (!isValidProgressCount(total) || !isValidProgressCount(done) || done > total) return { kind: 'unavailable' }
  if (total === 0) return { kind: 'empty', done: 0, total: 0 }
  return { kind: 'available', pct: Math.round((done / total) * 100), done, total }
}

// Anything other than the literal boolean `false` (missing/unrecognized) is
// surfaced as Unclassified rather than silently treated as confirmed execution.
function isUnclassified(issue) {
  return issue.isPreparation !== false
}

function issueMain(epic) {
  if (!Array.isArray(epic.issues)) return []
  return epic.issues.filter(i => i.isPreparation !== true)
}

function issuePrep(epic) {
  if (!Array.isArray(epic.issues)) return []
  return epic.issues.filter(i => i.isPreparation === true)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fed-fade">
      <div
        v-if="open"
        class="fixed inset-0 z-30 bg-black/20 dark:bg-black/50"
        aria-hidden="true"
        @click="emit('close')"
      />
    </Transition>

    <Transition name="fed-slide">
      <aside
        v-if="open"
        ref="drawerRef"
        role="dialog"
        aria-modal="true"
        :aria-label="card ? `Feature details for ${card.feature.key}` : 'Feature details'"
        class="fixed top-0 right-0 z-40 h-full w-full sm:w-[480px] lg:w-[560px] flex flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-2xl"
        @keydown="handleKeydown"
      >
        <template v-if="card">
          <!-- Header -->
          <div class="px-4 pt-4 pb-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 shrink-0">
            <div class="flex items-start gap-2">
              <span class="inline-flex items-center gap-1 shrink-0 mt-0.5">
                <span class="font-mono text-xs font-bold text-gray-900 dark:text-gray-100">{{ card.feature.key }}</span>
                <a
                  :href="`${jiraBaseUrl}/${card.feature.key}`"
                  target="_blank"
                  rel="noopener noreferrer"
                  :aria-label="`Open ${card.feature.key} in Jira`"
                  class="text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-blue-400 transition-colors"
                >
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </span>
              <p class="flex-1 text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug">{{ card.feature.summary }}</p>
              <button
                type="button"
                class="shrink-0 p-1 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
                aria-label="Close detail panel"
                @click="emit('close')"
              >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div class="flex flex-wrap items-center gap-3 mt-2.5">
              <span class="inline-flex items-center gap-1">
                <span class="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Jira status</span>
                <StatusBadge :status="card.feature.status" />
              </span>
              <span class="inline-flex items-center gap-1">
                <span class="inline-flex items-center text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                  Preparation
                  <AIInfoBubble hoverable v-if="card.readiness.help" :text="card.readiness.help" />
                </span>
                <span
                  class="inline-block px-1.5 py-0.5 rounded border text-[10px] font-semibold"
                  :class="card.readiness.class"
                >{{ card.readiness.label }}</span>
              </span>
            </div>
          </div>

          <!-- Scrollable body -->
          <div class="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">

            <!-- Execution Progress -->
            <section class="px-4 py-4">
              <p class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3 flex items-center">
                Execution Progress
                <AIInfoBubble hoverable :text="PROGRESS_HELP_TEXT" />
              </p>
              <template v-if="card.progress.kind === 'available'">
                <div class="flex items-center gap-2">
                  <div class="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div class="h-full rounded-full bg-primary-500" :style="{ width: card.progress.pct + '%' }" />
                  </div>
                </div>
                <p class="text-xs font-semibold text-gray-600 dark:text-gray-300 mt-2">{{ card.progress.done }} of {{ card.progress.total }} tracked execution issues done &middot; {{ card.progress.pct }}%</p>
                <p class="text-[11px] text-gray-400 dark:text-gray-500 mt-2">{{ PROGRESS_SUPPORTING_TEXT }}</p>
              </template>
              <template v-else>
                <p class="text-xs font-semibold text-gray-700 dark:text-gray-300">{{ card.progress.caption }}</p>
                <p class="text-[11px] text-gray-400 dark:text-gray-500 mt-1">{{ card.progress.detail }}</p>
              </template>
            </section>

            <!-- Details -->
            <section class="px-4 py-4">
              <p class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Details</p>
              <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
                <dt class="text-gray-400 dark:text-gray-500">Assignee</dt>
                <dd class="text-gray-700 dark:text-gray-300">{{ card.feature.assignee || 'Unassigned' }}</dd>

                <dt class="text-gray-400 dark:text-gray-500 self-start">Components</dt>
                <dd>
                  <div v-if="(card.feature.components || []).length" class="flex flex-wrap gap-1">
                    <span
                      v-for="c in card.feature.components"
                      :key="c"
                      class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400"
                    >{{ componentDisplayLabel(c) }}</span>
                  </div>
                  <span v-else class="text-gray-400 dark:text-gray-600">&mdash;</span>
                </dd>

                <dt class="text-gray-400 dark:text-gray-500 self-start">Fix Version</dt>
                <dd>
                  <div v-if="(card.feature.fixVersions || []).length" class="flex flex-wrap gap-1">
                    <span
                      v-for="v in card.feature.fixVersions"
                      :key="v"
                      class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400"
                    >{{ v }}</span>
                  </div>
                  <span v-else class="text-gray-400 dark:text-gray-600">&mdash;</span>
                </dd>

                <dt class="text-gray-400 dark:text-gray-500 self-start">Labels</dt>
                <dd>
                  <div v-if="(card.feature.labels || []).length" class="flex flex-wrap gap-1">
                    <span
                      v-for="l in card.feature.labels"
                      :key="l"
                      class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-teal-100 dark:bg-teal-500/15 text-teal-700 dark:text-teal-400"
                    >{{ l }}</span>
                  </div>
                  <span v-else class="text-gray-400 dark:text-gray-600">&mdash;</span>
                </dd>

                <dt class="text-gray-400 dark:text-gray-500">Epics</dt>
                <dd class="text-gray-700 dark:text-gray-300">{{ card.feature.epicCount }}</dd>

                <dt class="text-gray-400 dark:text-gray-500" title="Total tracked child issues, including recognized preparation">Total issues</dt>
                <dd class="text-gray-700 dark:text-gray-300">{{ card.feature.issueCount }}</dd>

                <template v-if="card.feature.blockerCount > 0">
                  <dt class="text-gray-400 dark:text-gray-500">Blockers</dt>
                  <dd class="text-amber-600 dark:text-amber-400 font-semibold">{{ card.feature.blockerCount }}</dd>
                </template>
              </dl>
            </section>

            <!-- Epics -->
            <section class="px-4 py-4">
              <p class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Epics</p>

              <div v-if="loading" class="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">Loading epics&hellip;</div>

              <div v-else-if="error" class="text-sm py-2">
                <p class="text-red-600 dark:text-red-400 mb-2">{{ error }}</p>
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs font-medium rounded-md border border-red-300 dark:border-red-500/40 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                  @click="emit('retry')"
                >Retry</button>
              </div>

              <!-- Missing/malformed detail is distinct from a genuinely empty Epic list. -->
              <p v-else-if="!detail" class="text-xs italic text-gray-400 dark:text-gray-500">Feature detail unavailable.</p>
              <p v-else-if="!Array.isArray(detail.epics)" class="text-xs italic text-gray-400 dark:text-gray-500">Epic data unavailable.</p>
              <p v-else-if="detail.epics.length === 0" class="text-xs italic text-gray-400 dark:text-gray-500">No epics for this feature.</p>

              <div v-else class="space-y-2">
                <div v-for="epic in detail.epics" :key="epic.key" class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <div class="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/60">
                    <span class="flex items-center gap-2 min-w-0 flex-1">
                      <button
                        type="button"
                        class="shrink-0 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded"
                        :aria-expanded="expandedEpics.has(epic.key)"
                        :aria-label="(expandedEpics.has(epic.key) ? 'Collapse' : 'Expand') + ' ' + epic.key"
                        @click="toggleEpic(epic.key)"
                      >
                        <svg
                          class="w-3.5 h-3.5 transition-transform"
                          :class="expandedEpics.has(epic.key) ? 'rotate-90' : ''"
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"
                        ><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
                      </button>
                      <a
                        :href="`${jiraBaseUrl}/${epic.key}`"
                        target="_blank"
                        rel="noopener noreferrer"
                        :aria-label="'Open ' + epic.key + ' in Jira'"
                        class="inline-flex items-center gap-0.5 font-mono text-xs font-semibold text-primary-600 dark:text-blue-400 hover:underline shrink-0 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded"
                      >
                        {{ epic.key }}
                        <svg class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                      <button
                        type="button"
                        class="flex-1 min-w-0 text-left focus:outline-none focus:ring-2 focus:ring-primary-500 rounded"
                        :aria-expanded="expandedEpics.has(epic.key)"
                        @click="toggleEpic(epic.key)"
                      >
                        <span class="text-xs text-gray-700 dark:text-gray-300 truncate block">{{ epic.summary }}</span>
                      </button>
                    </span>
                    <StatusBadge :status="epic.status" />
                  </div>

                  <div class="px-3 pb-2">
                    <template v-if="epicProgress(epic).kind === 'available'">
                      <div class="flex items-center gap-2">
                        <div class="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div class="h-full rounded-full bg-primary-500" :style="{ width: epicProgress(epic).pct + '%' }" />
                        </div>
                        <span class="text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">{{ epicProgress(epic).done }}/{{ epicProgress(epic).total }} &middot; {{ epicProgress(epic).pct }}%</span>
                      </div>
                    </template>
                    <p v-else-if="epicProgress(epic).kind === 'empty'" class="text-[11px] italic text-gray-400 dark:text-gray-500">No tracked execution work</p>
                    <p v-else class="text-[11px] italic text-gray-400 dark:text-gray-500">No issue-level progress available</p>
                  </div>

                  <div v-if="expandedEpics.has(epic.key)" class="border-t border-gray-100 dark:border-gray-800 px-3 py-2 space-y-1">
                    <p v-if="issueMain(epic).length === 0" class="text-[11px] italic text-gray-400 dark:text-gray-500">No execution issues</p>
                    <div v-for="issue in issueMain(epic)" :key="issue.key" class="flex items-center gap-2 text-xs py-1">
                      <a
                        :href="`${jiraBaseUrl}/${issue.key}`"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="font-mono text-primary-600 dark:text-blue-400 hover:underline shrink-0"
                      >{{ issue.key }}</a>
                      <span class="flex-1 truncate text-gray-700 dark:text-gray-300">{{ issue.summary }}</span>
                      <span
                        v-if="isUnclassified(issue)"
                        class="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400"
                        title="Preparation classification missing or unrecognized for this issue"
                      >Unclassified</span>
                      <span class="text-gray-400 dark:text-gray-500 text-[11px] shrink-0">{{ issue.assignee || 'Unassigned' }}</span>
                      <StatusBadge :status="issue.status" />
                    </div>

                    <template v-if="issuePrep(epic).length > 0">
                      <button
                        type="button"
                        class="text-[11px] text-gray-500 dark:text-gray-400 underline decoration-dotted mt-1"
                        :aria-expanded="expandedPrep.has(epic.key)"
                        @click="togglePrep(epic.key)"
                      >{{ expandedPrep.has(epic.key) ? 'Hide' : 'Show' }} preparation ({{ issuePrep(epic).length }})</button>
                      <div v-if="expandedPrep.has(epic.key)" class="space-y-1 mt-1">
                        <div v-for="issue in issuePrep(epic)" :key="issue.key" class="flex items-center gap-2 text-xs py-1 opacity-75">
                          <a
                            :href="`${jiraBaseUrl}/${issue.key}`"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="font-mono text-primary-600 dark:text-blue-400 hover:underline shrink-0"
                          >{{ issue.key }}</a>
                          <span class="flex-1 truncate text-gray-700 dark:text-gray-300">{{ issue.summary }}</span>
                          <span class="text-gray-400 dark:text-gray-500 text-[11px] shrink-0">{{ issue.assignee || 'Unassigned' }}</span>
                          <StatusBadge :status="issue.status" />
                        </div>
                      </div>
                    </template>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </template>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fed-fade-enter-active,
.fed-fade-leave-active { transition: opacity 0.22s ease; }
.fed-fade-enter-from,
.fed-fade-leave-to { opacity: 0; }

.fed-slide-enter-active,
.fed-slide-leave-active { transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
.fed-slide-enter-from,
.fed-slide-leave-to { transform: translateX(100%); }
</style>

<script setup>
import { computed } from 'vue'
import AIInfoBubble from './AIInfoBubble.vue'

const props = defineProps({
  label: { type: String, required: true },
  status: { type: String, default: 'unknown' },
  conflict: { type: Boolean, default: false },
  source: { type: String, default: 'aggregate' } // 'aggregate' | 'scope' | 'mixed' | 'none'
})

const STATUS_META = {
  'not-applicable': { label: 'N/A', class: 'bg-gray-50 dark:bg-gray-800/40 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700' },
  unknown: { label: 'Unknown', class: 'bg-gray-100 dark:bg-gray-500/15 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-500/30' },
  'not-started': { label: 'Not Started', class: 'bg-slate-100 dark:bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-500/30' },
  design: { label: 'Design', class: 'bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-300 dark:border-indigo-500/30' },
  'in-progress': { label: 'In Progress', class: 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-500/30' },
  completed: { label: 'Completed', class: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/30' },
  mixed: { label: 'Mixed', class: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-500/30' }
}

const meta = computed(() => {
  const base = STATUS_META[props.status] || STATUS_META.unknown
  return props.source === 'none' ? { ...base, label: 'No evidence' } : base
})

const SOURCE_HELP = {
  aggregate: 'Feature-wide status across all evidence sources.',
  scope: 'Status for the selected Release/Component.',
  mixed: 'Matching evidence sources disagree for the selected Release/Component.',
  none: 'No evidence recorded for the selected Release/Component.'
}

const helpText = computed(() => {
  const base = SOURCE_HELP[props.source] || SOURCE_HELP.aggregate
  return props.conflict ? `${base} Conflicting evidence detected.` : base
})
</script>

<template>
  <span class="inline-flex items-center gap-1">
    <span v-if="label" class="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">{{ label }}</span>
    <span
      class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold"
      :class="meta.class"
    >
      {{ meta.label }}
      <span v-if="conflict" class="text-amber-600 dark:text-amber-400" title="Conflicting evidence">!</span>
    </span>
    <AIInfoBubble hoverable :text="helpText" />
  </span>
</template>

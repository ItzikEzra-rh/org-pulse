<script setup>
import { computed, onMounted, ref } from 'vue'
import { AlertTriangleIcon, RefreshCwIcon } from 'lucide-vue-next'
import { useComponentMaturity } from '../composables/useComponentMaturity.js'

const { report, loading, error, stale, loadReport } = useComponentMaturity()
const activeView = ref('components')
const stageFilter = ref('all')
const activeStatuses = ref(new Set(['pass', 'fail', 'error', 'unknown', 'na']))
const sortKey = ref('name')
const sortDirection = ref('asc')
const expandedComponents = ref(new Set())
const expandedRules = ref(new Set())

const views = [
  { id: 'components', label: 'Components' },
  { id: 'requirements', label: 'By Requirement' },
  { id: 'mapping', label: 'Mapping Problems' }
]
const stages = [
  { id: 'all', label: 'All' },
  { id: 'dp', label: 'DP' },
  { id: 'tp', label: 'TP' },
  { id: 'ga', label: 'GA' }
]
const statuses = [
  { id: 'pass', label: 'Met' },
  { id: 'fail', label: 'Unmet' },
  { id: 'error', label: 'Error' },
  { id: 'unknown', label: 'Unknown' },
  { id: 'na', label: 'N/A' }
]
const categoryOrder = ['build', 'integration', 'api', 'security', 'testing', 'observability', 'documentation', 'signoff']
const categoryLabels = {
  build: 'Build & Repository',
  integration: 'Operator Integration',
  api: 'API Management',
  security: 'Security & Compliance',
  testing: 'Testing & QE',
  observability: 'Observability & Operations',
  documentation: 'Documentation',
  signoff: 'Signoff & Release'
}

const ruleById = computed(() => new Map((report.value?.rules || []).map(rule => [rule.id, rule])))
const componentById = computed(() => new Map((report.value?.components || []).map(component => [component.id, component])))

function allEvaluationsFor(componentId) {
  return (report.value?.evaluations || []).filter(item => item.componentId === componentId)
}

function technicalEvaluationsFor(componentId) {
  return allEvaluationsFor(componentId).filter(item => !ruleById.value.get(item.ruleId)?.isProcessGate)
}

function visibleEvaluation(evaluation) {
  const rule = ruleById.value.get(evaluation.ruleId)
  return activeStatuses.value.has(evaluation.status) && (stageFilter.value === 'all' || rule?.stage === stageFilter.value)
}

function visibleTechnicalEvaluationsFor(componentId) {
  return technicalEvaluationsFor(componentId).filter(visibleEvaluation)
}

function technicalGapSummary(componentId) {
  const failures = technicalEvaluationsFor(componentId).filter(item => {
    const rule = ruleById.value.get(item.ruleId)
    return ['fail', 'error', 'unknown'].includes(item.status) && rule?.severity === 'blocker'
  })
  return {
    blockers: failures.length,
    root: failures.filter(item => !item.blockedBy?.length).length,
    cascading: failures.filter(item => item.blockedBy?.length).length
  }
}

function stageGaps(componentId, stage) {
  return technicalEvaluationsFor(componentId).filter(item => {
    const rule = ruleById.value.get(item.ruleId)
    return rule?.stage === stage && ['fail', 'error', 'unknown'].includes(item.status)
  }).length
}

function deliverablesReady(component) {
  return (component.deliverables || []).filter(item => item.readiness?.total?.ready).length
}

function selectedScore(component) {
  const key = stageFilter.value === 'all' ? 'total' : stageFilter.value
  return component.complianceReadiness?.[key]?.score || 0
}

function applicableTechnicalEvaluations(componentId) {
  return technicalEvaluationsFor(componentId).filter(item => {
    const rule = ruleById.value.get(item.ruleId)
    return item.status !== 'na' && rule?.disposition !== 'not_applicable' && (stageFilter.value === 'all' || rule?.stage === stageFilter.value)
  })
}

function selectedCoverage(componentId) {
  const evaluations = applicableTechnicalEvaluations(componentId)
  if (!evaluations.length) return 0
  return Math.round(evaluations.filter(item => !['na', 'unknown'].includes(item.status)).length * 100 / evaluations.length)
}

const componentRows = computed(() => [...(report.value?.components || [])].sort((left, right) => {
  let result
  if (sortKey.value === 'score') result = selectedScore(left) - selectedScore(right)
  else if (sortKey.value === 'deliverables') result = deliverablesReady(left) - deliverablesReady(right)
  else if (sortKey.value === 'blockers') result = technicalGapSummary(left.id).blockers - technicalGapSummary(right.id).blockers
  else if (['dp', 'tp', 'ga'].includes(sortKey.value)) result = stageGaps(left.id, sortKey.value) - stageGaps(right.id, sortKey.value)
  else result = left.name.localeCompare(right.name)
  return sortDirection.value === 'asc' ? result : -result
}))

const summary = computed(() => {
  const components = report.value?.components || []
  const applicable = components.flatMap(component => applicableTechnicalEvaluations(component.id))
  return {
    components: components.length,
    score: components.length
      ? Math.round(components.reduce((sum, component) => sum + selectedScore(component), 0) / components.length)
      : 0,
    coverage: applicable.length
      ? Math.round(applicable.filter(item => !['na', 'unknown'].includes(item.status)).length * 100 / applicable.length)
      : 0,
    blockers: components.reduce((sum, component) => sum + technicalGapSummary(component.id).blockers, 0)
  }
})

function groupRules(rules) {
  return categoryOrder.map(category => ({
    id: category,
    label: categoryLabels[category],
    rules: rules.filter(rule => rule.category === category)
  })).filter(group => group.rules.length)
}

function ruleEvaluations(ruleId) {
  return (report.value?.evaluations || []).filter(item => item.ruleId === ruleId)
}

const technicalRuleGroups = computed(() => groupRules((report.value?.rules || []).filter(rule => {
  if (rule.isProcessGate || (stageFilter.value !== 'all' && rule.stage !== stageFilter.value)) return false
  return ruleEvaluations(rule.id).some(visibleEvaluation)
})))

const processRuleGroups = computed(() => groupRules((report.value?.rules || []).filter(rule => {
  if (!rule.isProcessGate || (stageFilter.value !== 'all' && rule.stage !== stageFilter.value)) return false
  return ruleEvaluations(rule.id).some(visibleEvaluation)
})))

function visibleRuleEvaluations(ruleId) {
  return ruleEvaluations(ruleId).filter(visibleEvaluation)
}

function ruleStats(ruleId) {
  const evaluations = ruleEvaluations(ruleId)
  const unmet = evaluations.filter(item => ['fail', 'error'].includes(item.status)).length
  const unknown = evaluations.filter(item => item.status === 'unknown').length
  const notApplicable = evaluations.filter(item => item.status === 'na').length
  return { total: evaluations.length, unmet, unknown, notApplicable }
}

function requirementGroups(componentId) {
  const evaluations = visibleTechnicalEvaluationsFor(componentId)
  return categoryOrder.map(category => ({
    id: category,
    label: categoryLabels[category],
    evaluations: evaluations.filter(item => ruleById.value.get(item.ruleId)?.category === category)
  })).filter(group => group.evaluations.length)
}

function setSort(key) {
  if (sortKey.value === key) sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  else {
    sortKey.value = key
    sortDirection.value = key === 'name' ? 'asc' : 'desc'
  }
}

function sortMarker(key) {
  if (sortKey.value !== key) return '↕'
  return sortDirection.value === 'asc' ? '↑' : '↓'
}

function toggleStatus(status) {
  const next = new Set(activeStatuses.value)
  if (next.has(status)) next.delete(status)
  else next.add(status)
  activeStatuses.value = next
}

function toggleExpandedComponent(id) {
  const next = new Set(expandedComponents.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedComponents.value = next
}

function toggleExpandedRule(id) {
  const next = new Set(expandedRules.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedRules.value = next
}

function statusMeta(status) {
  return {
    pass: { label: 'met', icon: '✓', class: 'text-green-700' },
    fail: { label: 'unmet', icon: '×', class: 'text-red-600' },
    unknown: { label: 'unknown', icon: '?', class: 'text-amber-600' },
    na: { label: 'N/A', icon: '●', class: 'text-gray-500' },
    error: { label: 'error', icon: '×', class: 'text-red-600' }
  }[status]
}

function scoreClass(score) {
  if (score >= 70) return 'text-green-700'
  if (score >= 50) return 'text-amber-500'
  return 'text-red-600'
}

function targetLabel(target) {
  if (!target) return 'Unknown target'
  if (target.kind === 'repository') return target.name.split('/').at(-1)
  if (target.kind === 'container-image') return target.ref
  if (target.kind === 'jira-component') return `${target.project}/${target.componentName}`
  return componentById.value.get(target.componentId)?.name || target.componentId
}

function targetTier(target) {
  return target?.tier || target?.kind?.replace('-', ' ') || 'component'
}

function formatGeneratedAt(value) {
  if (!value) return 'Unknown'
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short', year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short'
  }).format(new Date(value))
}

function calloutText() {
  if (activeView.value === 'requirements') {
    return 'pivots the data by rule instead of by component, showing the evidence state of each OSAC maturity requirement. Technical requirements appear first. Process checkpoints are separated below and remain unknown until OSAC approves a machine-readable Jira evidence convention.'
  }
  if (activeView.value === 'mapping') {
    return 'shows data quality issues detected across the collection pipeline—missing classifications, mappings, ownership, and other structural gaps. Each problem includes the affected entity, severity, and a description of what happened.'
  }
  return 'shows all OSAC product components, including their mapped modules and deliverables, scored against maturity requirements for Dev Preview, Tech Preview, and GA stages. Unknown evidence is not credited and prevents readiness; true N/A requirements are excluded. Signoff and process checkpoints are excluded from the technical score; see By Requirement for their evidence state.'
}

onMounted(loadReport)
</script>

<template>
  <div class="component-maturity-report text-[14px] text-[#333]">
    <div v-if="loading" class="py-24 text-center text-gray-500">
      <RefreshCwIcon class="mx-auto mb-3 h-7 w-7 animate-spin" />
      Loading Component Maturity report…
    </div>

    <div v-else-if="error" class="rounded border border-red-200 bg-white p-8 text-center">
      <AlertTriangleIcon class="mx-auto mb-3 h-8 w-8 text-red-500" />
      <p class="font-medium text-red-700">{{ error }}</p>
      <button class="mt-4 rounded border border-gray-300 bg-gray-50 px-4 py-2 hover:bg-gray-100" @click="loadReport">Retry</button>
    </div>

    <template v-else-if="report">
      <h2 class="mb-6 text-[32px] font-bold leading-tight text-[#242424]">OSAC Component Maturity Report</h2>

      <div v-if="stale" class="mb-4 flex items-center gap-2 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-amber-800">
        <AlertTriangleIcon class="h-4 w-4" />
        This report is more than 36 hours old. Collection may need attention.
      </div>

      <section class="mb-4 flex min-h-20 flex-wrap items-center gap-x-10 gap-y-3 rounded-lg bg-white px-6 py-4 shadow-sm">
        <p class="text-xs text-gray-500">Generated {{ formatGeneratedAt(report.generatedAt) }}</p>
        <div class="text-center"><p class="text-2xl font-bold text-[#333]">{{ summary.components }}</p><p class="text-[11px] uppercase text-gray-500">Components</p></div>
        <div class="text-center"><p class="text-2xl font-bold" :class="scoreClass(summary.score)">{{ summary.score }}%</p><p class="text-[11px] uppercase text-gray-500">Avg score</p></div>
        <div class="text-center"><p class="text-2xl font-bold" :class="scoreClass(summary.coverage)">{{ summary.coverage }}%</p><p class="text-[11px] uppercase text-gray-500">Evidence coverage</p></div>
        <div class="text-center"><p class="text-2xl font-bold text-red-600">{{ summary.blockers }}</p><p class="text-[11px] uppercase text-gray-500">Blocker gaps</p></div>
      </section>

      <nav class="mb-4 flex flex-wrap gap-1" aria-label="Maturity report views">
        <button v-for="view in views" :key="view.id" class="rounded border border-gray-300 px-4 py-2 text-sm" :class="activeView === view.id ? 'border-[#3d3d3d] bg-[#3d3d3d] text-white' : 'bg-white text-[#222] hover:bg-gray-50'" @click="activeView = view.id">{{ view.label }}</button>
      </nav>

      <div class="mb-4 rounded-r border-l-[3px] border-blue-600 bg-[#f8f9fa] px-4 py-4 text-sm leading-6 text-[#555]">
        <strong>{{ views.find(view => view.id === activeView)?.label }}</strong>
        {{ calloutText() }}
      </div>

      <div v-if="activeView !== 'mapping'" class="mb-5 flex flex-wrap items-center gap-x-7 gap-y-2 text-sm">
        <div class="flex flex-wrap items-center gap-3"><strong>Status:</strong><label v-for="status in statuses" :key="status.id" class="flex cursor-pointer items-center gap-1"><input type="checkbox" :checked="activeStatuses.has(status.id)" @change="toggleStatus(status.id)" />{{ status.label }}</label></div>
        <div class="flex items-center gap-1"><strong class="mr-1">Stage:</strong><button v-for="stage in stages" :key="stage.id" class="min-w-10 rounded border px-3 py-1 text-xs" :class="stageFilter === stage.id ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-[#333]'" @click="stageFilter = stage.id">{{ stage.label }}</button></div>
      </div>

      <template v-if="activeView === 'components'">
        <section class="mb-6 overflow-hidden rounded-lg bg-white px-6 py-6 shadow-sm">
          <h3 class="mb-3 border-b border-gray-300 pb-2 text-2xl font-bold">Components</h3>
          <div class="overflow-x-auto">
            <table class="w-full min-w-[780px] border-collapse text-sm">
              <thead class="bg-[#f5f6f7] text-xs uppercase text-[#666]"><tr><th class="px-3 py-3 text-left"><button class="font-bold" @click="setSort('name')">Component {{ sortMarker('name') }}</button></th><th class="px-3 py-3 text-right"><button class="font-bold" @click="setSort('score')">Score {{ sortMarker('score') }}</button></th><th class="px-3 py-3 text-right">Coverage</th><th class="px-3 py-3 text-right"><button class="font-bold" @click="setSort('deliverables')">Deliverables ready {{ sortMarker('deliverables') }}</button></th><th class="px-3 py-3 text-right"><button class="font-bold" @click="setSort('blockers')">Blocker gaps {{ sortMarker('blockers') }}</button></th><th v-for="stage in ['dp', 'tp', 'ga']" :key="stage" class="px-3 py-3 text-center"><button class="font-bold uppercase" @click="setSort(stage)">{{ stage }} {{ sortMarker(stage) }}</button></th></tr></thead>
              <tbody><tr v-for="component in componentRows" :key="component.id" class="border-b border-gray-200 last:border-0"><td class="px-3 py-3"><button class="text-left text-blue-600 hover:underline" @click="toggleExpandedComponent(component.id)">{{ component.name }}</button> <span class="ml-2 text-xs text-gray-400">{{ component.id }}</span></td><td class="px-3 py-3 text-right font-bold" :class="scoreClass(selectedScore(component))">{{ selectedScore(component) }}%</td><td class="px-3 py-3 text-right font-semibold" :class="scoreClass(selectedCoverage(component.id))">{{ selectedCoverage(component.id) }}%</td><td class="px-3 py-3 text-right">{{ deliverablesReady(component) }}/{{ component.deliverables.length }}</td><td class="px-3 py-3 text-right">{{ technicalGapSummary(component.id).blockers }}</td><td v-for="stage in ['dp', 'tp', 'ga']" :key="stage" class="px-3 py-3 text-center font-semibold" :class="stageGaps(component.id, stage) ? 'text-red-600' : 'text-green-700'">{{ stageGaps(component.id, stage) ? `× ${stageGaps(component.id, stage)}` : '✓' }}</td></tr></tbody>
            </table>
          </div>
          <p v-if="!componentRows.length" class="py-8 text-center text-gray-500">This report contains no components.</p>
        </section>

        <div class="space-y-4">
          <article v-for="component in componentRows" :key="`detail-${component.id}`" class="overflow-hidden rounded-lg bg-white shadow-sm">
            <button class="flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4 text-left" :aria-label="`Toggle ${component.name} details`" @click="toggleExpandedComponent(component.id)">
              <span class="text-gray-400">{{ expandedComponents.has(component.id) ? '▼' : '▶' }}</span><strong class="text-base">{{ component.name }}</strong><span class="text-xs text-gray-400">{{ component.id }}</span><span class="text-sm font-bold" :class="scoreClass(component.complianceReadiness.total.score)">{{ component.complianceReadiness.total.score }}% score</span><span class="text-xs font-semibold" :class="scoreClass(selectedCoverage(component.id))">{{ selectedCoverage(component.id) }}% evidence</span><span class="ml-auto rounded bg-red-50 px-2 py-1 text-xs text-red-600">{{ technicalGapSummary(component.id).blockers }} blockers</span><span v-if="technicalGapSummary(component.id).cascading" class="rounded bg-purple-50 px-2 py-1 text-xs text-purple-700">{{ technicalGapSummary(component.id).root }} root, {{ technicalGapSummary(component.id).cascading }} cascading</span><span v-for="stage in ['dp', 'tp', 'ga']" :key="stage" class="text-xs font-semibold uppercase" :class="stageGaps(component.id, stage) ? 'text-red-600' : 'text-green-700'">{{ stage }} {{ stageGaps(component.id, stage) ? '×' : '✓' }}</span><span v-if="component.mappingProblems.length" class="rounded bg-amber-50 px-2 py-1 text-xs text-amber-600">{{ component.mappingProblems.length }} mapping {{ component.mappingProblems.length === 1 ? 'problem' : 'problems' }}</span>
            </button>

            <div v-if="expandedComponents.has(component.id)" class="border-t border-gray-200 px-6 py-5">
              <p class="mb-4 text-xs"><strong>Jira:</strong> <span class="text-blue-600">{{ component.jira.project }}/{{ component.jira.componentName }}</span><span v-if="component.aliases.length"> · <strong>Aliases:</strong> {{ component.aliases.join(', ') }}</span></p>
              <details v-if="component.repositories.length" class="mb-2 rounded bg-[#f7f8f9] px-3 py-2 text-xs"><summary class="cursor-pointer font-medium">Repositories ({{ component.repositories.length }})</summary><ul class="mt-2 space-y-1 pl-5"><li v-for="repository in component.repositories" :key="repository">{{ repository }}</li></ul></details>
              <details v-if="component.images.length" class="mb-4 rounded bg-[#f7f8f9] px-3 py-2 text-xs"><summary class="cursor-pointer font-medium">Images ({{ component.images.length }})</summary><ul class="mt-2 space-y-1 pl-5"><li v-for="image in component.images" :key="image">{{ image }}</li></ul></details>
              <h4 class="mt-5 border-b border-gray-200 pb-1 text-xs uppercase tracking-wide text-gray-500">Stage readiness</h4>
              <div class="my-3 flex flex-wrap gap-6 text-sm font-bold"><span v-for="stage in ['dp', 'tp', 'ga']" :key="stage" class="uppercase" :class="stageGaps(component.id, stage) ? 'text-red-600' : 'text-green-700'">{{ stage }}: {{ component.complianceReadiness[stage].score }}% ({{ stageGaps(component.id, stage) }} unmet)</span></div>
              <h4 class="mt-5 border-b border-gray-200 pb-1 text-xs uppercase tracking-wide text-gray-500">Component requirements</h4>
              <div v-for="group in requirementGroups(component.id)" :key="group.id" class="mt-4">
                <h5 class="mb-2 text-base font-bold">{{ group.label }}</h5>
                <div class="overflow-x-auto"><table class="w-full min-w-[650px] text-xs"><thead class="bg-[#f5f6f7] uppercase text-gray-500"><tr><th class="px-3 py-2 text-left">Status</th><th class="px-3 py-2 text-left">Requirement</th><th class="px-3 py-2 text-left">Target</th><th class="px-3 py-2 text-center">Stage</th></tr></thead><tbody><tr v-for="(evaluation, index) in group.evaluations" :key="`${evaluation.ruleId}-${evaluation.evaluatedFor?.id || 'component'}-${index}`" class="border-b border-gray-200"><td class="px-3 py-2 font-semibold" :class="statusMeta(evaluation.status).class"><span class="mr-1">{{ statusMeta(evaluation.status).icon }}</span>{{ statusMeta(evaluation.status).label }}<a v-if="evaluation.evidence.length" :href="evaluation.evidence[0].url" target="_blank" rel="noopener noreferrer" class="ml-2 text-blue-600" title="Open evidence">🔗</a></td><td class="px-3 py-2"><p>{{ ruleById.get(evaluation.ruleId)?.name }}</p><p class="mt-1 text-[11px] text-gray-500">{{ evaluation.detail }}</p><p v-if="evaluation.blockedBy?.length" class="mt-1 text-[11px] text-purple-700">Blocked by {{ evaluation.blockedBy.join(', ') }}</p></td><td class="px-3 py-2"><span class="text-blue-600">{{ targetLabel(evaluation.target) }}</span> <span class="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{{ targetTier(evaluation.target) }}</span></td><td class="px-3 py-2 text-center"><span class="rounded px-2 py-1 text-[10px] font-bold uppercase" :class="ruleById.get(evaluation.ruleId)?.stage === 'ga' ? 'bg-green-50 text-green-700' : ruleById.get(evaluation.ruleId)?.stage === 'tp' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'">{{ ruleById.get(evaluation.ruleId)?.stage }}</span></td></tr></tbody></table></div>
              </div>
              <p v-if="!visibleTechnicalEvaluationsFor(component.id).length" class="py-5 text-sm text-gray-500">No requirements match the selected filters.</p>
              <template v-if="component.modules.length"><h4 class="mt-5 border-b border-gray-200 pb-1 text-xs uppercase tracking-wide text-gray-500">Operator module requirements</h4><div v-for="module in component.modules" :key="module.id" class="mt-3 rounded border-l-[3px] border-red-500 bg-white px-3 py-2 shadow-sm"><strong>{{ module.name }}</strong> <span class="ml-1 text-red-600">{{ module.readiness.total.fail + module.readiness.total.error + module.readiness.total.unknown }} blockers or unknowns</span></div></template>
              <template v-if="component.deliverables.length"><h4 class="mt-5 border-b border-gray-200 pb-1 text-xs uppercase tracking-wide text-gray-500">Deliverable pipeline status</h4><div v-for="deliverable in component.deliverables" :key="deliverable.id" class="mt-3 flex items-center rounded border-l-[3px] bg-white px-3 py-2 shadow-sm" :class="deliverable.readiness.total.ready ? 'border-green-600' : 'border-red-500'"><strong>{{ deliverable.name }}</strong><span v-if="deliverable.readiness.total.fail + deliverable.readiness.total.error + deliverable.readiness.total.unknown" class="ml-2 text-red-600">{{ deliverable.readiness.total.fail + deliverable.readiness.total.error + deliverable.readiness.total.unknown }} gaps or unknowns</span><span class="ml-auto text-xs font-bold" :class="deliverable.readiness.total.ready ? 'text-green-700' : 'text-red-600'">DP {{ deliverable.readiness.dp.ready ? '✓' : '×' }}&nbsp; TP {{ deliverable.readiness.tp.ready ? '✓' : '×' }}&nbsp; GA {{ deliverable.readiness.ga.ready ? '✓' : '×' }}</span></div></template>
            </div>
          </article>
        </div>
      </template>

      <template v-else-if="activeView === 'requirements'">
        <section v-for="group in technicalRuleGroups" :key="group.id" class="mb-5">
          <h3 class="mb-2 text-lg font-bold">{{ group.label }}</h3>
          <article v-for="rule in group.rules" :key="rule.id" class="mb-2 overflow-hidden rounded-lg bg-white shadow-sm">
            <button class="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left" :aria-label="`Toggle ${rule.name} requirement details`" @click="toggleExpandedRule(rule.id)"><span class="text-gray-400">{{ expandedRules.has(rule.id) ? '▼' : '▶' }}</span><span :class="ruleStats(rule.id).unmet ? 'text-red-500' : ruleStats(rule.id).unknown ? 'text-amber-500' : ruleStats(rule.id).notApplicable === ruleStats(rule.id).total ? 'text-gray-400' : 'text-green-600'">●</span><span class="font-medium text-blue-600">{{ rule.name }}</span><span class="ml-auto rounded bg-indigo-50 px-2 py-1 text-[10px] capitalize text-indigo-600">{{ rule.scope.replace('_', ' ') }}</span><span class="rounded px-2 py-1 text-[10px] font-bold uppercase" :class="rule.stage === 'ga' ? 'bg-green-50 text-green-700' : rule.stage === 'tp' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'">{{ rule.stage }}</span><span class="text-xs text-gray-500">{{ ruleStats(rule.id).unmet }}/{{ ruleStats(rule.id).total }} failing<span v-if="ruleStats(rule.id).unknown"> ({{ ruleStats(rule.id).unknown }} unknown)</span><span v-if="ruleStats(rule.id).notApplicable"> ({{ ruleStats(rule.id).notApplicable }} N/A)</span></span></button>
            <div v-if="expandedRules.has(rule.id)" class="border-t border-gray-200 px-5 py-4"><p class="mb-1 text-sm"><strong>Rationale:</strong> {{ rule.rationale }}</p><p class="mb-3 text-sm"><strong>Remediation:</strong> {{ rule.remediation }}</p><p v-if="rule.dependsOn.length" class="mb-3 text-xs text-purple-700"><strong>Prerequisites:</strong> {{ rule.dependsOn.join(', ') }}</p><div class="overflow-x-auto"><table class="w-full min-w-[650px] text-xs"><thead class="bg-[#f5f6f7] uppercase text-gray-500"><tr><th class="px-3 py-2 text-left">Component</th><th class="px-3 py-2 text-left">Status</th><th class="px-3 py-2 text-left">Target</th><th class="px-3 py-2 text-left">Detail</th></tr></thead><tbody><tr v-for="(evaluation, index) in visibleRuleEvaluations(rule.id)" :key="`${evaluation.componentId}-${evaluation.evaluatedFor?.id || 'component'}-${index}`" class="border-b border-gray-200"><td class="px-3 py-2">{{ componentById.get(evaluation.componentId)?.name || evaluation.componentId }}</td><td class="px-3 py-2 font-semibold" :class="statusMeta(evaluation.status).class">{{ statusMeta(evaluation.status).icon }} {{ statusMeta(evaluation.status).label }}</td><td class="px-3 py-2 text-blue-600">{{ targetLabel(evaluation.target) }}</td><td class="px-3 py-2">{{ evaluation.detail }} <a v-if="evaluation.evidence.length" :href="evaluation.evidence[0].url" target="_blank" rel="noopener noreferrer" class="text-blue-600">evidence</a></td></tr></tbody></table></div></div>
          </article>
        </section>
        <div class="mb-5 rounded-r border-l-[3px] border-indigo-600 bg-indigo-50 px-4 py-3 text-xs text-[#555]"><strong>Process Checkpoints</strong> — These are valid signoff and review questions, but OSAC has no approved machine-readable Jira evidence convention yet. They remain unknown and are excluded from Components view technical scores.</div>
        <section v-for="group in processRuleGroups" :key="`process-${group.id}`" class="mb-5"><h3 class="mb-2 text-lg font-bold">{{ group.label }}</h3><article v-for="rule in group.rules" :key="rule.id" class="mb-2 overflow-hidden rounded-lg bg-white shadow-sm"><button class="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left" :aria-label="`Toggle ${rule.name} requirement details`" @click="toggleExpandedRule(rule.id)"><span class="text-gray-400">{{ expandedRules.has(rule.id) ? '▼' : '▶' }}</span><span :class="ruleStats(rule.id).unmet ? 'text-red-500' : 'text-amber-500'">●</span><span class="font-medium text-blue-600">{{ rule.name }}</span><span class="ml-auto rounded px-2 py-1 text-[10px] font-bold uppercase" :class="rule.stage === 'ga' ? 'bg-green-50 text-green-700' : rule.stage === 'tp' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'">{{ rule.stage }}</span><span class="text-xs text-gray-500">{{ ruleStats(rule.id).unmet }} failing · {{ ruleStats(rule.id).unknown }} unknown</span></button><div v-if="expandedRules.has(rule.id)" class="border-t border-gray-200 px-5 py-4"><p class="mb-3 text-sm">{{ rule.remediation }}</p><div v-for="evaluation in visibleRuleEvaluations(rule.id)" :key="evaluation.componentId" class="border-t border-gray-100 py-2 text-xs"><strong>{{ componentById.get(evaluation.componentId)?.name }}</strong> · <span :class="statusMeta(evaluation.status).class">{{ statusMeta(evaluation.status).label }}</span> — {{ evaluation.detail }}</div></div></article></section>
        <p v-if="!technicalRuleGroups.length && !processRuleGroups.length" class="py-10 text-center text-gray-500">No requirements match the selected filters.</p>
      </template>

      <section v-else class="overflow-hidden rounded-lg bg-white px-6 py-6 shadow-sm">
        <h3 class="mb-2 border-b border-gray-300 pb-2 text-2xl font-bold">Mapping Problems</h3><p class="mb-2 text-sm text-gray-500">{{ report.mappingProblems.length }} problems detected</p>
        <div class="mb-5 grid gap-2 md:grid-cols-2"><div v-for="diagnostic in report.diagnostics" :key="diagnostic.source" class="rounded border px-3 py-2 text-xs" :class="diagnostic.status === 'ok' ? 'border-green-200 bg-green-50 text-green-800' : diagnostic.status === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'"><strong class="capitalize">{{ diagnostic.source.replace('-', ' ') }}: {{ diagnostic.status }}</strong><p class="mt-1">{{ diagnostic.message }}</p></div></div>
        <div class="overflow-x-auto"><table class="w-full min-w-[850px] text-sm"><thead class="bg-[#f5f6f7] text-xs uppercase text-gray-600"><tr><th class="px-3 py-3 text-left">Severity</th><th class="px-3 py-3 text-left">Signal</th><th class="px-3 py-3 text-left">Entity</th><th class="px-3 py-3 text-left">Type</th><th class="px-3 py-3 text-left">Message</th></tr></thead><tbody><tr v-for="(problem, index) in report.mappingProblems" :key="`${problem.signal}-${problem.componentId}-${index}`" class="border-b border-gray-200 align-top"><td class="px-3 py-4"><span :class="problem.severity === 'error' ? 'text-red-600' : 'text-amber-500'" class="text-lg">{{ problem.severity === 'error' ? '×' : '⚠' }}</span><p class="text-xs" :class="problem.severity === 'error' ? 'text-red-600' : 'text-amber-600'">{{ problem.severity }}</p></td><td class="px-3 py-4 font-mono text-xs">{{ problem.signal }}</td><td class="px-3 py-4">{{ componentById.get(problem.componentId)?.name || problem.targetId || '—' }} <span v-if="problem.componentId" class="text-xs text-gray-400">({{ problem.componentId }})</span></td><td class="px-3 py-4 capitalize">{{ problem.scope.replace('_', ' ') }}</td><td class="px-3 py-4">{{ problem.message }}</td></tr></tbody></table></div>
        <p v-if="!report.mappingProblems.length" class="py-10 text-center text-gray-500">No mapping problems detected.</p>
      </section>
    </template>
  </div>
</template>

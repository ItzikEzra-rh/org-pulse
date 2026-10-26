import { ref, computed } from 'vue'
import { matchesComponents } from './useComponentStatusFilter'
import { isClosedStatus } from '../utils/closedStatus'

// Absent uiEvidence/uxEvidence (older payload, or an unconfigured project)
// renders identically to a genuinely empty one.
const EMPTY_EVIDENCE = { status: 'unknown', conflict: false, scopes: [], sources: [] }

export function uiEvidenceOf(feature) {
  return feature?.uiEvidence || EMPTY_EVIDENCE
}

export function uxEvidenceOf(feature) {
  return feature?.uxEvidence || EMPTY_EVIDENCE
}

// Filter-only Epic label provenance (e.g. design-approved/be-completed); never a status input.
export function workflowSourcesOf(feature) {
  return feature?.workflowLabelSources || []
}

// A selected Release matches via fixVersions or (epic-only) epicReleaseVersions.
export function matchesSelectedRelease(feature, selectedVersions) {
  return matchesAnyVersion(feature?.fixVersions, selectedVersions) ||
    matchesAnyVersion(feature?.epicReleaseVersions, selectedVersions)
}

// Features in a terminal status (Closed/Done/Resolved/Cancelled) are hidden
// unless the selected Release matches them.
export function isClosedFeatureVisible(feature, selectedVersions) {
  if (!isClosedStatus(feature?.status)) return true
  if (!selectedVersions || selectedVersions.length === 0) return false
  return matchesSelectedRelease(feature, selectedVersions)
}

function matchesAnyVersion(versions, selectedVersions) {
  return (versions || []).some(v => selectedVersions.includes(v))
}

function hasReleaseOrComponent(selectedVersions, selectedComponents) {
  return (selectedVersions && selectedVersions.length > 0) || (selectedComponents && selectedComponents.length > 0)
}

export function scopeMatchesReleaseComponent(scope, selectedVersions, selectedComponents) {
  const releaseOk = !selectedVersions || selectedVersions.length === 0 ||
    (scope.fixVersions || []).some(v => selectedVersions.includes(v))
  const componentOk = !selectedComponents || selectedComponents.length === 0 ||
    matchesComponents(scope.components, selectedComponents)
  return releaseOk && componentOk
}

// The status to display for a workstream: the feature-wide aggregate with no
// Release/Component selected, or the matching scopes[] status once one is —
// 'none' when no scope matches, 'mixed' when matching scopes disagree, so an
// aggregate is never shown as if it were scope-specific evidence.
export function uiUxStatusForContext(evidence, selectedVersions = [], selectedComponents = []) {
  const e = evidence || EMPTY_EVIDENCE
  if (!hasReleaseOrComponent(selectedVersions, selectedComponents)) {
    return { status: e.status, conflict: e.conflict, source: 'aggregate' }
  }
  const matching = (e.scopes || []).filter(scope => scopeMatchesReleaseComponent(scope, selectedVersions, selectedComponents))
  if (matching.length === 0) return { status: 'unknown', conflict: false, source: 'none' }
  const [first, ...rest] = matching
  const uniform = rest.every(scope => scope.status === first.status && scope.conflict === first.conflict)
  if (uniform) return { status: first.status, conflict: first.conflict, source: 'scope' }
  return { status: 'mixed', conflict: matching.some(scope => scope.conflict), source: 'mixed' }
}

function foldLabel(label) {
  return typeof label === 'string' ? label.trim().toLowerCase() : label
}

function labelSetMatches(labels, foldedSelected) {
  return (labels || []).some(l => foldedSelected.has(foldLabel(l)))
}

// Feature-level Jira labels; Version/Component checked against the Feature
// itself, honoring epicReleaseVersions so a Closed Feature revealed by its
// Epic's release can still match a feature-level label.
function featureLevelLabelMatches(feature, foldedSelected, selectedVersions, selectedComponents) {
  if (!labelSetMatches(feature?.labels, foldedSelected)) return false
  if (!hasReleaseOrComponent(selectedVersions, selectedComponents)) return true
  const releaseOk = !selectedVersions || selectedVersions.length === 0 ||
    matchesSelectedRelease(feature, selectedVersions)
  const componentOk = !selectedComponents || selectedComponents.length === 0 ||
    matchesComponents(feature.components, selectedComponents)
  return releaseOk && componentOk
}

// A label must be carried by a single evidence-source Epic; when Release/
// Component is also selected, that same Epic must carry both (prevents a
// "release on Epic A, label on Epic B" false match).
function labelMatchesInSources(sources, foldedSelected, selectedVersions, selectedComponents) {
  return (sources || []).some(source => {
    const sourceLabels = [...(source.stageLabels || []), ...(source.routingLabels || [])]
    if (!labelSetMatches(sourceLabels, foldedSelected)) return false
    return scopeMatchesReleaseComponent(source, selectedVersions, selectedComponents)
  })
}

// Same single-source safeguard, for Epic workflow-label provenance (workflowLabelSources).
function workflowLabelMatchesInSources(sources, foldedSelected, selectedVersions, selectedComponents) {
  return (sources || []).some(source => {
    if (!labelSetMatches(source.labels, foldedSelected)) return false
    return scopeMatchesReleaseComponent(source, selectedVersions, selectedComponents)
  })
}

// OR across selectedLabels, each checked against its own population (feature-level,
// Epic stage/routing, Epic workflow) with Version/Component folded in per-population.
export function matchesLabelQuery(feature, selectedLabels, { selectedVersions = [], selectedComponents = [] } = {}) {
  if (!selectedLabels || selectedLabels.length === 0) return true
  const folded = new Set(selectedLabels.map(foldLabel))
  return featureLevelLabelMatches(feature, folded, selectedVersions, selectedComponents) ||
    labelMatchesInSources(uiEvidenceOf(feature).sources, folded, selectedVersions, selectedComponents) ||
    labelMatchesInSources(uxEvidenceOf(feature).sources, folded, selectedVersions, selectedComponents) ||
    workflowLabelMatchesInSources(workflowSourcesOf(feature), folded, selectedVersions, selectedComponents)
}

// Presentation-only grouping; no project-specific label names are hardcoded here —
// callers pass project-scoped readinessLabels/readinessPrefixes/customerPrefixes.
const DEFAULT_LABEL_CATEGORY_CONFIG = {
  readinessPrefixes: ['ready-for-'],
  readinessLabels: [],
  customerPrefixes: ['customer:']
}

// readinessLabels matches by exact name (not prefix) so a project can opt in a label
// like "osac-ui" without also sweeping in an unrelated "osac-ui-0.1".
function namedCategory(label, { readinessPrefixes, readinessLabels, customerPrefixes }) {
  const lower = label.toLowerCase()
  if (readinessLabels.includes(lower) || readinessPrefixes.some(p => lower.startsWith(p.toLowerCase()))) return 'Readiness & Tracking'
  if (customerPrefixes.some(p => lower.startsWith(p.toLowerCase()))) return 'Customer'
  return null
}

const CATEGORY_ORDER = ['UI/UX Workflow', 'Readiness & Tracking', 'Customer', 'Other']

// Deduped (case-folded), union of feature-level + Epic stage/routing + Epic
// workflow labels, each tagged with a presentation-only category.
export function collectAllLabelOptions(features, config = {}) {
  const categoryConfig = {
    readinessPrefixes: config.readinessPrefixes || DEFAULT_LABEL_CATEGORY_CONFIG.readinessPrefixes,
    readinessLabels: (config.readinessLabels || DEFAULT_LABEL_CATEGORY_CONFIG.readinessLabels).map(foldLabel),
    customerPrefixes: config.customerPrefixes || DEFAULT_LABEL_CATEGORY_CONFIG.customerPrefixes
  }
  const epicCategory = l => namedCategory(l, categoryConfig) || 'UI/UX Workflow'
  const featureLevelCategory = l => namedCategory(l, categoryConfig) || 'Other'
  const canonical = new Map()

  function record(label, category) {
    if (!label) return
    const key = foldLabel(label)
    if (!canonical.has(key)) canonical.set(key, { value: label, category })
  }

  for (const feature of features || []) {
    for (const source of uiEvidenceOf(feature).sources || []) {
      for (const l of source.stageLabels || []) record(l, epicCategory(l))
      for (const l of source.routingLabels || []) record(l, epicCategory(l))
    }
    for (const source of uxEvidenceOf(feature).sources || []) {
      for (const l of source.stageLabels || []) record(l, epicCategory(l))
      for (const l of source.routingLabels || []) record(l, epicCategory(l))
    }
    for (const source of workflowSourcesOf(feature)) {
      for (const l of source.labels || []) record(l, epicCategory(l))
    }
    for (const l of feature?.labels || []) {
      record(l, featureLevelCategory(l))
    }
  }

  return [...canonical.values()].sort((a, b) => {
    const catDiff = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
    return catDiff !== 0 ? catDiff : a.value.localeCompare(b.value)
  })
}

// Scope-aware card label set: Feature-level labels always show; Epic stage/routing
// and workflow labels show only where their source's scope matches the selected
// Release/Component (all, when nothing is selected). Workflow/UI-UX labels are
// ordered first so the first 3 visible pills are the meaningful ones.
export function featureCardLabels(feature, selectedVersions = [], selectedComponents = []) {
  const seen = new Set()
  const labels = []
  function addLabel(l) {
    const key = foldLabel(l)
    if (!l || seen.has(key)) return
    seen.add(key)
    labels.push(l)
  }

  for (const source of uiEvidenceOf(feature).sources || []) {
    if (!scopeMatchesReleaseComponent(source, selectedVersions, selectedComponents)) continue
    for (const l of [...(source.stageLabels || []), ...(source.routingLabels || [])]) addLabel(l)
  }
  for (const source of uxEvidenceOf(feature).sources || []) {
    if (!scopeMatchesReleaseComponent(source, selectedVersions, selectedComponents)) continue
    for (const l of [...(source.stageLabels || []), ...(source.routingLabels || [])]) addLabel(l)
  }
  for (const source of workflowSourcesOf(feature)) {
    if (!scopeMatchesReleaseComponent(source, selectedVersions, selectedComponents)) continue
    for (const l of source.labels || []) addLabel(l)
  }
  for (const l of feature?.labels || []) addLabel(l)

  return labels
}

export function useUiUxFilter() {
  const selectedLabels = ref([])

  function toggleLabel(value) {
    const idx = selectedLabels.value.indexOf(value)
    if (idx >= 0) selectedLabels.value.splice(idx, 1)
    else selectedLabels.value.push(value)
  }

  function clearFilters() {
    selectedLabels.value = []
  }

  const isFiltered = computed(() => selectedLabels.value.length > 0)

  return {
    selectedLabels,
    toggleLabel,
    clearFilters,
    isFiltered
  }
}

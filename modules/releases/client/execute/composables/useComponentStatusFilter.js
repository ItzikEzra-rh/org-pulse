import { ref, computed } from 'vue'

export const UNASSIGNED_COMPONENT = 'Unassigned'
export const UNKNOWN_STATUS = 'Unknown'
export const UNASSIGNED_TEAM = 'Unassigned'
// Internal sentinel, not the literal "Unassigned" — a person's displayName could collide with that string.
export const UNASSIGNED_ASSIGNEE = '__unassigned__'

// Display-only readability fixes for raw Jira Component values. The raw value
// (map key) stays the contract used for filtering/matching; only the rendered
// label changes.
const COMPONENT_DISPLAY_LABELS = {
  'Connectivity&Fabric': 'Connectivity & Fabric'
}

export function componentDisplayLabel(raw) {
  return COMPONENT_DISPLAY_LABELS[raw] || raw
}

export function collectComponentOptions(items, getComponents) {
  const set = new Set()
  for (const item of items) {
    const comps = getComponents(item)
    if (!comps || comps.length === 0) set.add(UNASSIGNED_COMPONENT)
    else for (const c of comps) set.add(c)
  }
  const sorted = [...set].filter(c => c !== UNASSIGNED_COMPONENT).sort()
  if (set.has(UNASSIGNED_COMPONENT)) sorted.push(UNASSIGNED_COMPONENT)
  return sorted
}

export function collectStatusOptions(items, getStatus) {
  const set = new Set()
  for (const item of items) {
    set.add(getStatus(item) || UNKNOWN_STATUS)
  }
  const sorted = [...set].filter(s => s !== UNKNOWN_STATUS).sort()
  if (set.has(UNKNOWN_STATUS)) sorted.push(UNKNOWN_STATUS)
  return sorted
}

// Multi-component items match when ANY selected Component overlaps (OR semantics).
export function matchesComponents(components, selected) {
  if (!selected || selected.length === 0) return true
  if (!components || components.length === 0) return selected.includes(UNASSIGNED_COMPONENT)
  return components.some(c => selected.includes(c))
}

export function matchesStatus(status, selected) {
  if (!selected || selected.length === 0) return true
  return selected.includes(status || UNKNOWN_STATUS)
}

export function collectTeamOptions(items, getTeam) {
  const set = new Set()
  for (const item of items) {
    set.add(getTeam(item) || UNASSIGNED_TEAM)
  }
  const sorted = [...set].filter(t => t !== UNASSIGNED_TEAM).sort()
  if (set.has(UNASSIGNED_TEAM)) sorted.push(UNASSIGNED_TEAM)
  return sorted
}

export function matchesTeam(team, selected) {
  if (!selected || selected.length === 0) return true
  return selected.includes(team || UNASSIGNED_TEAM)
}

export function assigneeDisplayLabel(raw) {
  return raw === UNASSIGNED_ASSIGNEE ? 'Unassigned' : raw
}

export function collectAssigneeOptions(items, getAssignee) {
  const set = new Set()
  for (const item of items) {
    set.add(getAssignee(item) || UNASSIGNED_ASSIGNEE)
  }
  const sorted = [...set].filter(a => a !== UNASSIGNED_ASSIGNEE).sort()
  if (set.has(UNASSIGNED_ASSIGNEE)) sorted.push(UNASSIGNED_ASSIGNEE)
  return sorted
}

export function matchesAssignee(assignee, selected) {
  if (!selected || selected.length === 0) return true
  return selected.includes(assignee || UNASSIGNED_ASSIGNEE)
}

export function useComponentStatusFilter() {
  const selectedComponents = ref([])
  const selectedStatuses = ref([])
  const selectedTeams = ref([])
  const selectedAssignees = ref([])

  function toggleComponent(value) {
    const idx = selectedComponents.value.indexOf(value)
    if (idx >= 0) selectedComponents.value.splice(idx, 1)
    else selectedComponents.value.push(value)
  }

  function toggleStatus(value) {
    const idx = selectedStatuses.value.indexOf(value)
    if (idx >= 0) selectedStatuses.value.splice(idx, 1)
    else selectedStatuses.value.push(value)
  }

  function toggleTeam(value) {
    const idx = selectedTeams.value.indexOf(value)
    if (idx >= 0) selectedTeams.value.splice(idx, 1)
    else selectedTeams.value.push(value)
  }

  function toggleAssignee(value) {
    const idx = selectedAssignees.value.indexOf(value)
    if (idx >= 0) selectedAssignees.value.splice(idx, 1)
    else selectedAssignees.value.push(value)
  }

  // Overwrites the Assignee selection outright — used by the "Assigned to me" shortcut.
  function setAssignees(values) {
    selectedAssignees.value = [...values]
  }

  function clearFilters() {
    selectedComponents.value = []
    selectedStatuses.value = []
    selectedTeams.value = []
    selectedAssignees.value = []
  }

  const isFiltered = computed(() =>
    selectedComponents.value.length > 0 || selectedStatuses.value.length > 0 ||
    selectedTeams.value.length > 0 || selectedAssignees.value.length > 0
  )

  return {
    selectedComponents,
    selectedStatuses,
    selectedTeams,
    selectedAssignees,
    toggleComponent,
    toggleStatus,
    toggleTeam,
    toggleAssignee,
    setAssignees,
    clearFilters,
    isFiltered
  }
}

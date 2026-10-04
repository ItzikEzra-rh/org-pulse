import { ref, computed, watch } from 'vue'
import { apiRequest } from '@shared/client/services/api.js'
import { useProjectId, projectQuery } from '@shared/client/composables/useProjectId.js'

// Plain YYYY-MM-DD string comparison keeps "today" timezone-safe: both sides
// reduce to date strings before comparing, so no local/UTC boundary skew.
export function todayUtc() {
  return new Date().toISOString().slice(0, 10)
}

export function findCurrentEntry(entries, today) {
  const matches = (entries || []).filter(e => e.startDate <= today && today <= e.endDate)
  if (matches.length === 0) return null
  return matches.reduce((latest, e) => (e.startDate > latest.startDate ? e : latest))
}

export function findNextEntry(entries, today) {
  const upcoming = (entries || []).filter(e => e.startDate > today)
  if (upcoming.length === 0) return null
  return upcoming.reduce((earliest, e) => (e.startDate < earliest.startDate ? e : earliest))
}

export function sortedRotation(entries) {
  return [...(entries || [])].sort((a, b) => a.startDate.localeCompare(b.startDate))
}

// Dates are plain YYYY-MM-DD with no time component; format via UTC fields so
// the displayed date never shifts across the browser's local timezone.
export function formatDutyDate(dateStr) {
  if (!dateStr) return '—'
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

export function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return name.substring(0, 2).toUpperCase()
}

export const WORKGROUP_PALETTE = [
  'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400',
  'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-400',
  'bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-400',
  'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400',
  'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
  'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-400',
  'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400'
]

function hashWorkgroup(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

// Hash-then-probe so distinct workgroups don't share a color when the palette has room.
export function assignWorkgroupColors(workgroups) {
  const distinct = [...new Set((workgroups || []).filter(Boolean))].sort()
  const paletteSize = WORKGROUP_PALETTE.length
  const used = new Set()
  const assignment = {}
  for (const workgroup of distinct) {
    let index = hashWorkgroup(workgroup) % paletteSize
    for (let attempt = 0; attempt < paletteSize && used.has(index); attempt++) {
      index = (index + 1) % paletteSize
    }
    used.add(index)
    assignment[workgroup] = WORKGROUP_PALETTE[index]
  }
  return assignment
}

export function useCiDuty() {
  const projectId = useProjectId()
  const roster = ref(null)
  const loading = ref(true)
  const error = ref(null)
  const notFound = ref(false)
  let requestSequence = 0

  async function load() {
    const requestedProjectId = projectId.value
    const requestId = ++requestSequence
    loading.value = true
    error.value = null
    notFound.value = false
    try {
      const next = await apiRequest(`/modules/system-health/ci-duty${projectQuery(requestedProjectId)}`)
      if (requestId !== requestSequence || projectId.value !== requestedProjectId) return
      roster.value = next
    } catch (e) {
      if (requestId !== requestSequence || projectId.value !== requestedProjectId) return
      if (e.status === 404) {
        notFound.value = true
      } else {
        error.value = e.message || 'Failed to load CI Duty roster'
      }
      roster.value = null
    } finally {
      if (requestId === requestSequence && projectId.value === requestedProjectId) {
        loading.value = false
      }
    }
  }

  watch(projectId, () => load(), { flush: 'sync' })

  const entries = computed(() => roster.value?.entries || [])
  const inapplicable = computed(() => roster.value?.state === 'inapplicable')
  const unavailable = computed(() => roster.value?.state === 'unavailable')
  const currentEntry = computed(() => findCurrentEntry(entries.value, todayUtc()))
  const nextEntry = computed(() => findNextEntry(entries.value, todayUtc()))
  const rotation = computed(() => sortedRotation(entries.value))
  const workgroupColors = computed(() => assignWorkgroupColors(entries.value.map(e => e.workgroup)))

  return { roster, loading, error, notFound, inapplicable, unavailable, load, entries, currentEntry, nextEntry, rotation, workgroupColors }
}

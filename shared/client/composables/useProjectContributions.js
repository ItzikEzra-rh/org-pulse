import { ref, computed, watch } from 'vue'
import { getProjectContributions } from '../services/api'
import { useProjectId } from './useProjectId.js'

const contributionsData = ref(null)
const loading = ref(false)
const error = ref(null)
const projectId = useProjectId()
let dataProjectId = projectId.value
let requestSequence = 0
let pendingRequest = null

// Reset-only on project switch (never fetch): one project's calendars must not
// surface under another, but fetching is driven by the consuming view's lifecycle.
watch(projectId, currentProjectId => {
  dataProjectId = currentProjectId
  contributionsData.value = null
  error.value = null
  loading.value = false
  requestSequence += 1
  pendingRequest = null
}, { flush: 'sync' })

function fetchContributions({ force = false } = {}) {
  const requestedProjectId = projectId.value
  // No explicit project context: the legacy global path owns contributions.
  if (!requestedProjectId) return Promise.resolve(null)
  if (!force && contributionsData.value && dataProjectId === requestedProjectId) {
    return Promise.resolve(contributionsData.value)
  }
  if (!force && pendingRequest?.projectId === requestedProjectId) {
    return pendingRequest.promise
  }

  const requestId = ++requestSequence
  dataProjectId = requestedProjectId
  loading.value = true
  error.value = null

  const promise = (async () => {
    try {
      const fresh = await getProjectContributions(requestedProjectId)
      if (fresh?.projectId !== requestedProjectId) {
        throw new Error('Contributions response project identity mismatch')
      }
      if (requestId === requestSequence && projectId.value === requestedProjectId) {
        contributionsData.value = fresh
        dataProjectId = requestedProjectId
      }
      return fresh
    } catch (err) {
      if (requestId === requestSequence && projectId.value === requestedProjectId) {
        error.value = err.message
        contributionsData.value = null
        console.error('Failed to load project contributions:', err)
      }
      return null
    } finally {
      if (requestId === requestSequence) {
        loading.value = false
        pendingRequest = null
      }
    }
  })()

  pendingRequest = { projectId: requestedProjectId, promise }
  return promise
}

export function useProjectContributions() {
  const peopleByAccountId = computed(() => {
    const map = new Map()
    for (const person of contributionsData.value?.people || []) {
      map.set(person.accountId, person)
    }
    return map
  })

  // Missing (no record) is distinct from a resolved zero-contribution calendar.
  function getByAccountId(accountId) {
    if (!accountId) return null
    return peopleByAccountId.value.get(accountId) || null
  }

  return {
    contributions: contributionsData,
    loading,
    error,
    freshness: computed(() => contributionsData.value?.freshness || null),
    partial: computed(() => contributionsData.value?.partial || false),
    getByAccountId,
    loadContributions: () => fetchContributions(),
    reloadContributions: () => fetchContributions({ force: true })
  }
}

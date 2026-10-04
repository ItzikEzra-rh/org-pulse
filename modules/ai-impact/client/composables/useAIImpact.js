import { ref, watch } from 'vue'
import { apiRequest } from '@shared/client/services/api.js'
import { useProjectId } from '@shared/client/composables/useProjectId.js'

// Singleton state — fetch once, share refs
const rfeData = ref(null)
const loading = ref(true)
const error = ref(null)
const refreshStatus = ref(null)
let hasFetched = false
let requestSequence = 0

const timeWindow = ref('month')
const projectId = useProjectId()

async function load() {
  const tw = timeWindow.value || 'month'
  const requestedProjectId = projectId.value
  const requestId = ++requestSequence
  loading.value = true
  error.value = null
  try {
    const params = new URLSearchParams({ timeWindow: tw })
    if (requestedProjectId) params.set('projectId', requestedProjectId)
    const data = await apiRequest(`/modules/ai-impact/rfe-data?${params}`)
    if (requestedProjectId && requestedProjectId !== 'osac' && data?.projectId !== requestedProjectId) {
      throw new Error('RFE response project identity mismatch')
    }
    // A response is valid only for the project and period that requested it.
    if (requestId !== requestSequence
        || projectId.value !== requestedProjectId
        || (timeWindow.value || 'month') !== tw) return
    rfeData.value = data
  } catch (e) {
    if (requestId !== requestSequence
        || projectId.value !== requestedProjectId
        || (timeWindow.value || 'month') !== tw) return
    error.value = e.message
  } finally {
    if (requestId === requestSequence
        && projectId.value === requestedProjectId
        && (timeWindow.value || 'month') === tw) {
      loading.value = false
    }
  }
}

async function refresh() {
  return apiRequest('/modules/ai-impact/refresh', { method: 'POST' })
}

async function checkRefreshStatus() {
  refreshStatus.value = await apiRequest('/modules/ai-impact/refresh/status')
}

// Re-fetch when time window changes
watch(timeWindow, () => load())
watch(projectId, () => {
  rfeData.value = null
  error.value = null
  refreshStatus.value = null
  load()
}, { flush: 'sync' })

// No caller-supplied time window: consumers that care about the period read
// and write the returned `timeWindow` ref directly (same pattern as
// useFeatures().featureTimeWindow), so there is exactly one source of truth
// instead of a per-caller copy that can drift or get silently overwritten.
export function useAIImpact() {
  if (!hasFetched) {
    hasFetched = true
    load()
  }
  return { rfeData, loading, error, refresh, refreshStatus, checkRefreshStatus, load, timeWindow }
}

export function _resetForTesting() {
  requestSequence += 1
  rfeData.value = null
  loading.value = true
  error.value = null
  refreshStatus.value = null
  timeWindow.value = 'month'
  hasFetched = true // prevent auto-fetch so tests control when loading happens
}

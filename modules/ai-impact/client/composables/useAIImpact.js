import { ref, watch } from 'vue'
import { apiRequest } from '@shared/client/services/api.js'
import { useProjectId, projectQuery } from '@shared/client/composables/useProjectId.js'

// Singleton state — fetch once, share refs
const rfeData = ref(null)
const loading = ref(true)
const error = ref(null)
const refreshStatus = ref(null)
let hasFetched = false

const timeWindow = ref('month')

async function load() {
  const tw = timeWindow.value || 'month'
  loading.value = true
  error.value = null
  try {
    const data = await apiRequest(`/modules/ai-impact/rfe-data?timeWindow=${tw}${projectQuery(useProjectId().value)}`)
    // Ignore a stale response if the window changed while this request was in
    // flight, so an earlier request can't clobber a newer selection's data
    // (or its loading/error state).
    if ((timeWindow.value || 'month') !== tw) return
    rfeData.value = data
  } catch (e) {
    if ((timeWindow.value || 'month') !== tw) return
    error.value = e.message
  } finally {
    if ((timeWindow.value || 'month') === tw) {
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
watch(useProjectId(), () => load())

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
  rfeData.value = null
  loading.value = true
  error.value = null
  refreshStatus.value = null
  timeWindow.value = 'month'
  hasFetched = true // prevent auto-fetch so tests control when loading happens
}

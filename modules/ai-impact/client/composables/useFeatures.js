import { ref, watch } from 'vue'
import { apiRequest } from '@shared/client/services/api.js'
import { useProjectId, projectQuery } from '@shared/client/composables/useProjectId.js'

// Singleton state — fetch once, share refs
const features = ref({})
const featureMeta = ref({ lastSyncedAt: null, totalFeatures: 0 })
const featureLoading = ref(false)
const featureError = ref(null)
const detailCache = ref({})
let hasFetched = false
let featureRequestSequence = 0
let trendRequestSequence = 0

const featureTrendData = ref([])
const featureBreakdown = ref([])
const featureTimeWindow = ref('month')
const projectId = useProjectId()

async function loadFeatures() {
  const requestedProjectId = projectId.value
  const requestId = ++featureRequestSequence
  featureLoading.value = true
  featureError.value = null
  try {
    const data = await apiRequest(`/modules/ai-impact/features${projectQuery(requestedProjectId)}`)
    if (requestedProjectId && requestedProjectId !== 'osac' && data?.projectId !== requestedProjectId) {
      throw new Error('Feature response project identity mismatch')
    }
    if (requestId !== featureRequestSequence || projectId.value !== requestedProjectId) return
    features.value = data.features || {}
    detailCache.value = {}
    featureMeta.value = {
      lastSyncedAt: data.lastSyncedAt,
      totalFeatures: data.totalFeatures
    }
  } catch (e) {
    if (requestId !== featureRequestSequence || projectId.value !== requestedProjectId) return
    featureError.value = e.message
  } finally {
    if (requestId === featureRequestSequence && projectId.value === requestedProjectId) {
      featureLoading.value = false
    }
  }
}

async function loadFeatureTrend() {
  const tw = featureTimeWindow.value || 'month'
  const requestedProjectId = projectId.value
  const requestId = ++trendRequestSequence
  try {
    const params = new URLSearchParams({ timeWindow: tw })
    if (requestedProjectId) params.set('projectId', requestedProjectId)
    const data = await apiRequest(`/modules/ai-impact/features/trend?${params}`)
    if (requestedProjectId && requestedProjectId !== 'osac' && data?.projectId !== requestedProjectId) return
    if (requestId !== trendRequestSequence
        || projectId.value !== requestedProjectId
        || (featureTimeWindow.value || 'month') !== tw) return
    featureTrendData.value = data.trendData || []
    featureBreakdown.value = data.breakdown || []
  } catch {
    // Trend is supplementary; keep it empty/current on failure.
  }
}

async function loadFeatureDetail(key) {
  if (detailCache.value[key]) {
    return detailCache.value[key]
  }
  const requestedProjectId = projectId.value
  try {
    const data = await apiRequest(`/modules/ai-impact/features/${encodeURIComponent(key)}${projectQuery(requestedProjectId)}`)
    if (requestedProjectId && requestedProjectId !== 'osac' && data?.projectId !== requestedProjectId) {
      throw new Error('Feature detail response project identity mismatch')
    }
    if (projectId.value !== requestedProjectId) return null
    detailCache.value[key] = data
    return data
  } catch (e) {
    if (e.message && e.message.includes('404')) {
      return null
    }
    throw e
  }
}

// Re-fetch trend when its time window changes
watch(featureTimeWindow, () => loadFeatureTrend())

// Re-fetch both lists when the project context changes; loadFeatures clears
// the detail cache, so cached details never leak across projects
watch(projectId, () => {
  features.value = {}
  featureMeta.value = { lastSyncedAt: null, totalFeatures: 0 }
  featureLoading.value = false
  featureError.value = null
  detailCache.value = {}
  featureTrendData.value = []
  featureBreakdown.value = []
  loadFeatures()
  loadFeatureTrend()
}, { flush: 'sync' })

export function useFeatures() {
  if (!hasFetched) {
    hasFetched = true
    loadFeatures()
    loadFeatureTrend()
  }
  return {
    features,
    featureMeta,
    featureLoading,
    featureError,
    loadFeatures,
    loadFeatureDetail,
    detailCache,
    featureTrendData,
    featureBreakdown,
    featureTimeWindow,
    loadFeatureTrend
  }
}

export function _resetForTesting() {
  featureRequestSequence += 1
  trendRequestSequence += 1
  features.value = {}
  featureMeta.value = { lastSyncedAt: null, totalFeatures: 0 }
  featureLoading.value = false
  featureError.value = null
  detailCache.value = {}
  featureTrendData.value = []
  featureBreakdown.value = []
  featureTimeWindow.value = 'month'
  hasFetched = true // prevent auto-fetch so tests control when loading happens
}

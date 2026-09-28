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

const featureTrendData = ref([])
const featureBreakdown = ref([])
const featureTimeWindow = ref('month')

async function loadFeatures() {
  featureLoading.value = true
  featureError.value = null
  try {
    const data = await apiRequest(`/modules/ai-impact/features${projectQuery(useProjectId().value)}`)
    features.value = data.features || {}
    detailCache.value = {}
    featureMeta.value = {
      lastSyncedAt: data.lastSyncedAt,
      totalFeatures: data.totalFeatures
    }
  } catch (e) {
    featureError.value = e.message
  } finally {
    featureLoading.value = false
  }
}

async function loadFeatureTrend() {
  const tw = featureTimeWindow.value || 'month'
  try {
    const params = new URLSearchParams({ timeWindow: tw })
    const projectId = useProjectId().value
    if (projectId) params.set('projectId', projectId)
    const data = await apiRequest(`/modules/ai-impact/features/trend?${params}`)
    // Ignore a stale response if the window changed while this request was in
    // flight, so an earlier request can't clobber a newer selection's data.
    if ((featureTimeWindow.value || 'month') !== tw) return
    featureTrendData.value = data.trendData || []
    featureBreakdown.value = data.breakdown || []
  } catch {
    // Trend is a supplementary chart; leave prior data in place on failure.
  }
}

async function loadFeatureDetail(key) {
  if (detailCache.value[key]) {
    return detailCache.value[key]
  }
  try {
    const data = await apiRequest(`/modules/ai-impact/features/${encodeURIComponent(key)}${projectQuery(useProjectId().value)}`)
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
watch(useProjectId(), () => {
  loadFeatures()
  loadFeatureTrend()
})

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

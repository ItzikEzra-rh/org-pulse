import { ref } from 'vue'
import { apiRequest } from '@shared/client/services/api'

export function useFeatureTraffic() {
  const features = ref([])
  const featureCount = ref(0)
  const fetchedAt = ref(null)
  const loading = ref(false)
  const error = ref(null)

  async function loadFeatures(filters = {}) {
    loading.value = true
    error.value = null

    const params = new URLSearchParams()
    if (filters.status) params.set('status', filters.status)
    if (filters.version) params.set('version', filters.version)
    if (filters.health) params.set('health', filters.health)
    if (filters.sortBy) params.set('sortBy', filters.sortBy)
    if (filters.sortDir) params.set('sortDir', filters.sortDir)

    const qs = params.toString()
    const url = `/modules/releases/execution/features${qs ? '?' + qs : ''}`

    try {
      const data = await apiRequest(url)
      features.value = data.features || []
      featureCount.value = data.featureCount || 0
      fetchedAt.value = data.fetchedAt || null
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  return { features, featureCount, fetchedAt, loading, error, loadFeatures }
}

export function useFeatureDetail() {
  const feature = ref(null)
  const loading = ref(false)
  const error = ref(null)

  // Successful loads only — an error must not poison a retry with cached failure.
  const cache = new Map()
  let latestRequestId = 0

  async function loadFeature(key) {
    const requestId = ++latestRequestId
    error.value = null

    if (cache.has(key)) {
      feature.value = cache.get(key)
      loading.value = false
      return
    }

    // Clear immediately so an in-flight fetch for a new key never displays
    // the previously selected feature's detail while loading.
    feature.value = null
    loading.value = true

    try {
      const data = await apiRequest(`/modules/releases/execution/features/${key}`)
      if (requestId !== latestRequestId) return
      cache.set(key, data)
      feature.value = data
    } catch (err) {
      if (requestId !== latestRequestId) return
      error.value = err.message
    } finally {
      if (requestId === latestRequestId) loading.value = false
    }
  }

  return { feature, loading, error, loadFeature }
}

export function useVersions() {
  const versions = ref([])

  // scope: 'epics' also includes versions that only appear on a directly-versioned
  // Epic (see GET /versions) — needed by consumers like Epics by Release that surface
  // context Features via Epic-level milestone membership. Omit for Feature-only scopes
  // (e.g. Overview), where a milestone version /features can't filter on would be a dead end.
  async function loadVersions(scope) {
    try {
      const qs = scope ? `?scope=${encodeURIComponent(scope)}` : ''
      const data = await apiRequest(`/modules/releases/execution/versions${qs}`)
      versions.value = data.versions || []
    } catch {
      versions.value = []
    }
  }

  return { versions, loadVersions }
}

export function useEpicsByRelease() {
  const features = ref([])
  const fetchedAt = ref(null)
  const loading = ref(false)
  const error = ref(null)

  // Guards against out-of-order responses: if the version changes again before an
  // in-flight request resolves, only the most recently requested version may write state.
  let latestRequestId = 0

  async function loadEpicsByRelease(version) {
    const requestId = ++latestRequestId

    if (!version) {
      features.value = []
      fetchedAt.value = null
      loading.value = false
      error.value = null
      return
    }

    loading.value = true
    error.value = null

    try {
      const data = await apiRequest(`/modules/releases/execution/epics?version=${encodeURIComponent(version)}`)
      if (requestId !== latestRequestId) return
      features.value = data.features || []
      fetchedAt.value = data.fetchedAt || null
    } catch (err) {
      if (requestId !== latestRequestId) return
      error.value = err.message
      features.value = []
    } finally {
      if (requestId === latestRequestId) loading.value = false
    }
  }

  return { features, fetchedAt, loading, error, loadEpicsByRelease }
}

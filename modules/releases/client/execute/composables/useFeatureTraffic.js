import { ref } from 'vue'
import { apiRequest } from '@shared/client/services/api'
import { useProjectId, projectQuery } from '@shared/client/composables/useProjectId.js'

export function useFeatureTraffic() {
  const features = ref([])
  const featureCount = ref(0)
  const fetchedAt = ref(null)
  const loading = ref(false)
  const error = ref(null)
  const state = ref(null)
  const message = ref(null)
  const projectId = useProjectId()
  let latestRequestId = 0

  async function loadFeatures(filters = {}) {
    const requestId = ++latestRequestId
    const requestedProjectId = projectId.value
    loading.value = true
    error.value = null
    state.value = null
    message.value = null
    features.value = []
    featureCount.value = 0
    fetchedAt.value = null

    const params = new URLSearchParams()
    if (requestedProjectId) params.set('projectId', requestedProjectId)
    if (filters.status) params.set('status', filters.status)
    if (filters.version) params.set('version', filters.version)
    if (filters.health) params.set('health', filters.health)
    if (filters.sortBy) params.set('sortBy', filters.sortBy)
    if (filters.sortDir) params.set('sortDir', filters.sortDir)

    const qs = params.toString()
    const url = `/modules/releases/execution/features${qs ? '?' + qs : ''}`

    try {
      const data = await apiRequest(url)
      if (requestId !== latestRequestId || projectId.value !== requestedProjectId) return
      features.value = data.features || []
      featureCount.value = data.featureCount || 0
      fetchedAt.value = data.fetchedAt || null
      state.value = data.state || 'supported'
      message.value = data.message || data.error || null
    } catch (err) {
      if (requestId !== latestRequestId || projectId.value !== requestedProjectId) return
      error.value = err.message
    } finally {
      if (requestId === latestRequestId && projectId.value === requestedProjectId) loading.value = false
    }
  }

  return { features, featureCount, fetchedAt, loading, error, state, message, loadFeatures }
}

export function useFeatureDetail() {
  const feature = ref(null)
  const loading = ref(false)
  const error = ref(null)
  const projectId = useProjectId()

  // Successful loads only — an error must not poison a retry with cached failure.
  const cache = new Map()
  let latestRequestId = 0

  async function loadFeature(key) {
    const requestId = ++latestRequestId
    const requestedProjectId = projectId.value
    const cacheKey = `${requestedProjectId || 'legacy'}:${key}`
    error.value = null

    if (cache.has(cacheKey)) {
      feature.value = cache.get(cacheKey)
      loading.value = false
      return
    }

    // Clear immediately so an in-flight fetch for a new key never displays
    // the previously selected feature's detail while loading.
    feature.value = null
    loading.value = true

    try {
      const data = await apiRequest(`/modules/releases/execution/features/${encodeURIComponent(key)}${projectQuery(requestedProjectId)}`)
      if (requestId !== latestRequestId || projectId.value !== requestedProjectId) return
      cache.set(cacheKey, data)
      feature.value = data
    } catch (err) {
      if (requestId !== latestRequestId || projectId.value !== requestedProjectId) return
      error.value = err.message
    } finally {
      if (requestId === latestRequestId && projectId.value === requestedProjectId) loading.value = false
    }
  }

  return { feature, loading, error, loadFeature }
}

export function useVersions() {
  const versions = ref([])
  const state = ref(null)
  const message = ref(null)
  const projectId = useProjectId()
  let latestRequestId = 0

  // scope: 'epics' also includes versions that only appear on a directly-versioned
  // Epic (see GET /versions) — needed by consumers like Epics by Release that surface
  // context Features via Epic-level milestone membership. Omit for Feature-only scopes
  // (e.g. Overview), where a milestone version /features can't filter on would be a dead end.
  async function loadVersions(scope) {
    const requestId = ++latestRequestId
    const requestedProjectId = projectId.value
    versions.value = []
    state.value = null
    message.value = null
    try {
      const params = new URLSearchParams()
      if (requestedProjectId) params.set('projectId', requestedProjectId)
      if (scope) params.set('scope', scope)
      const qs = params.toString()
      const data = await apiRequest(`/modules/releases/execution/versions${qs ? `?${qs}` : ''}`)
      if (requestId !== latestRequestId || projectId.value !== requestedProjectId) return
      versions.value = data.versions || []
      state.value = data.state || 'supported'
      message.value = data.message || data.error || null
    } catch {
      if (requestId === latestRequestId && projectId.value === requestedProjectId) {
        versions.value = []
        state.value = 'unavailable'
      }
    }
  }

  return { versions, state, message, loadVersions }
}

export function useEpicsByRelease() {
  const features = ref([])
  const fetchedAt = ref(null)
  const loading = ref(false)
  const error = ref(null)
  const state = ref(null)
  const message = ref(null)
  const projectId = useProjectId()

  // Guards against out-of-order responses: if the version changes again before an
  // in-flight request resolves, only the most recently requested version may write state.
  let latestRequestId = 0

  async function loadEpicsByRelease(version) {
    const requestId = ++latestRequestId
    const requestedProjectId = projectId.value

    if (!version) {
      features.value = []
      fetchedAt.value = null
      loading.value = false
      error.value = null
      state.value = null
      message.value = null
      return
    }

    loading.value = true
    error.value = null
    state.value = null
    message.value = null
    features.value = []

    try {
      const params = new URLSearchParams({ version })
      if (requestedProjectId) params.set('projectId', requestedProjectId)
      const data = await apiRequest(`/modules/releases/execution/epics?${params.toString()}`)
      if (requestId !== latestRequestId || projectId.value !== requestedProjectId) return
      features.value = data.features || []
      fetchedAt.value = data.fetchedAt || null
      state.value = data.state || 'supported'
      message.value = data.message || data.error || null
    } catch (err) {
      if (requestId !== latestRequestId || projectId.value !== requestedProjectId) return
      error.value = err.message
      features.value = []
    } finally {
      if (requestId === latestRequestId && projectId.value === requestedProjectId) loading.value = false
    }
  }

  return { features, fetchedAt, loading, error, state, message, loadEpicsByRelease }
}

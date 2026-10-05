import { ref } from 'vue'
import { apiRequest } from '@shared/client/services/api'
import { useProjectId, projectQuery } from '@shared/client/composables/useProjectId.js'

const releases = ref([])
const trackingData = ref(null)
const loading = ref(false)
const error = ref(null)
const state = ref(null)
const message = ref(null)
const partial = ref(false)
const indexPartial = ref(false)
const projectId = useProjectId()
let releasesRequestId = 0
let trackingRequestId = 0

export function useFeatureTracking() {
  async function loadReleases() {
    const requestId = ++releasesRequestId
    const requestedProjectId = projectId.value
    releases.value = []
    trackingData.value = null
    state.value = null
    message.value = null
    partial.value = false
    indexPartial.value = false
    error.value = null
    try {
      var data = await apiRequest(`/modules/releases/execution/tracking/releases${projectQuery(requestedProjectId)}`)
      if (requestId !== releasesRequestId || projectId.value !== requestedProjectId) return
      releases.value = data.releases || []
      state.value = data.state || 'supported'
      message.value = data.message || data.error || null
      indexPartial.value = data.partial === true
    } catch (err) {
      if (requestId !== releasesRequestId || projectId.value !== requestedProjectId) return
      releases.value = []
      error.value = err.message
    }
  }

  async function loadTrackingData(releaseId) {
    const requestId = ++trackingRequestId
    const requestedProjectId = projectId.value
    loading.value = true
    error.value = null
    trackingData.value = null
    partial.value = false

    try {
      var params = new URLSearchParams({ releaseId })
      if (requestedProjectId) params.set('projectId', requestedProjectId)
      var url = '/modules/releases/execution/tracking/data?' + params.toString()
      var data = await apiRequest(url)
      if (requestId !== trackingRequestId || projectId.value !== requestedProjectId) return null
      trackingData.value = data
      partial.value = data.partial === true
      return data
    } catch (err) {
      if (requestId !== trackingRequestId || projectId.value !== requestedProjectId) return null
      error.value = err.message
      trackingData.value = null
      partial.value = false
      return null
    } finally {
      if (requestId === trackingRequestId && projectId.value === requestedProjectId) loading.value = false
    }
  }

  return {
    releases,
    trackingData,
    loading,
    error,
    state,
    message,
    partial,
    indexPartial,
    loadReleases,
    loadTrackingData
  }
}

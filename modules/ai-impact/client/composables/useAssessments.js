import { ref, watch } from 'vue'
import { apiRequest } from '@shared/client/services/api.js'
import { useProjectId, projectQuery } from '@shared/client/composables/useProjectId.js'

// Singleton state — fetch once, share refs
const assessments = ref({})
const assessmentMeta = ref({ lastSyncedAt: null, totalAssessed: 0 })
const assessmentLoading = ref(false)
const assessmentError = ref(null)
const detailCache = ref({})
let hasFetched = false
let requestSequence = 0
const projectId = useProjectId()

async function loadAssessments() {
  const requestedProjectId = projectId.value
  const requestId = ++requestSequence
  assessmentLoading.value = true
  assessmentError.value = null
  try {
    const data = await apiRequest(`/modules/ai-impact/assessments${projectQuery(requestedProjectId)}`)
    if (requestedProjectId && requestedProjectId !== 'osac' && data?.projectId !== requestedProjectId) {
      throw new Error('Assessment response project identity mismatch')
    }
    if (requestId !== requestSequence || projectId.value !== requestedProjectId) return
    assessments.value = data.assessments || {}
    assessmentMeta.value = {
      lastSyncedAt: data.lastSyncedAt,
      totalAssessed: data.totalAssessed
    }
  } catch (e) {
    if (requestId !== requestSequence || projectId.value !== requestedProjectId) return
    assessmentError.value = e.message
  } finally {
    if (requestId === requestSequence && projectId.value === requestedProjectId) {
      assessmentLoading.value = false
    }
  }
}

async function loadAssessmentDetail(key) {
  if (detailCache.value[key]) {
    return detailCache.value[key]
  }
  const requestedProjectId = projectId.value
  try {
    const data = await apiRequest(`/modules/ai-impact/assessments/${encodeURIComponent(key)}${projectQuery(requestedProjectId)}`)
    if (requestedProjectId && requestedProjectId !== 'osac' && data?.projectId !== requestedProjectId) {
      throw new Error('Assessment detail response project identity mismatch')
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

watch(projectId, () => {
  assessments.value = {}
  assessmentMeta.value = { lastSyncedAt: null, totalAssessed: 0 }
  assessmentLoading.value = false
  assessmentError.value = null
  detailCache.value = {}
  loadAssessments()
}, { flush: 'sync' })

export function useAssessments() {
  if (!hasFetched) {
    hasFetched = true
    loadAssessments()
  }
  return {
    assessments,
    assessmentMeta,
    assessmentLoading,
    assessmentError,
    loadAssessments,
    loadAssessmentDetail,
    detailCache
  }
}

export function _resetForTesting() {
  requestSequence += 1
  assessments.value = {}
  assessmentMeta.value = { lastSyncedAt: null, totalAssessed: 0 }
  assessmentLoading.value = false
  assessmentError.value = null
  detailCache.value = {}
  hasFetched = true // prevent auto-fetch so tests control when loading happens
}

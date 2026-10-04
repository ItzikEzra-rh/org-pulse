import { ref, watch } from 'vue'
import { apiRequest } from '@shared/client/services/api.js'
import { useProjectId, projectQuery } from '@shared/client/composables/useProjectId.js'

/**
 * Composable for loading and caching test plan quality data.
 * - testPlans: Map<string, SlimTestPlan> (keyed by RHAISTRAT key)
 * - loadTestPlans(): fetches GET /test-plans (slim projection)
 * - loadTestPlanDetail(key): fetches GET /test-plans/:key (full + history)
 */
export function useTestPlans() {
  const projectId = useProjectId()
  const testPlans = ref({})
  const testPlanMeta = ref({ lastSyncedAt: null, totalTestPlans: 0 })
  const testPlanLoading = ref(false)
  const testPlanError = ref(null)

  // Cache for full detail fetches (keyed by RHAISTRAT key)
  const detailCache = ref({})
  let requestSequence = 0

  async function loadTestPlans() {
    const requestedProjectId = projectId.value
    const requestId = ++requestSequence
    testPlanLoading.value = true
    testPlanError.value = null
    testPlans.value = {}
    try {
      const data = await apiRequest(`/modules/ai-impact/test-plans${projectQuery(requestedProjectId)}`)
      if (requestId !== requestSequence || projectId.value !== requestedProjectId) return
      testPlans.value = data.testPlans || {}
      detailCache.value = {}
      testPlanMeta.value = {
        lastSyncedAt: data.lastSyncedAt,
        totalTestPlans: data.totalTestPlans
      }
    } catch (e) {
      if (requestId !== requestSequence || projectId.value !== requestedProjectId) return
      testPlanError.value = e.message
    } finally {
      if (requestId === requestSequence && projectId.value === requestedProjectId) {
        testPlanLoading.value = false
      }
    }
  }

  async function loadTestPlanDetail(key) {
    if (detailCache.value[key]) {
      return detailCache.value[key]
    }
    const requestedProjectId = projectId.value
    try {
      const data = await apiRequest(`/modules/ai-impact/test-plans/${encodeURIComponent(key)}${projectQuery(requestedProjectId)}`)
      if (projectId.value !== requestedProjectId) return null
      detailCache.value[key] = data
      return data
    } catch (e) {
      if (projectId.value !== requestedProjectId) return null
      if (e.message && e.message.includes('404')) {
        return null
      }
      throw e
    }
  }

  watch(projectId, () => {
    testPlans.value = {}
    testPlanMeta.value = { lastSyncedAt: null, totalTestPlans: 0 }
    testPlanError.value = null
    detailCache.value = {}
    testPlanLoading.value = true
    loadTestPlans()
  }, { flush: 'sync' })

  return {
    testPlans,
    testPlanMeta,
    testPlanLoading,
    testPlanError,
    loadTestPlans,
    loadTestPlanDetail
  }
}

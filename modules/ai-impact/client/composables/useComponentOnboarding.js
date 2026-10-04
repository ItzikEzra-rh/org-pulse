import { ref, watch } from 'vue'
import { apiRequest } from '@shared/client/services/api.js'
import { useProjectId, projectQuery } from '@shared/client/composables/useProjectId.js'

export function useComponentOnboarding() {
  const projectId = useProjectId()
  const data = ref(null)
  const loading = ref(true)
  const error = ref(null)
  const detailCache = ref({})
  let requestSequence = 0

  async function load() {
    const requestedProjectId = projectId.value
    const requestId = ++requestSequence
    loading.value = true
    error.value = null
    data.value = null
    try {
      const next = await apiRequest(`/modules/ai-impact/component-onboarding${projectQuery(requestedProjectId)}`)
      if (requestId !== requestSequence || projectId.value !== requestedProjectId) return
      data.value = next
    } catch (e) {
      if (requestId !== requestSequence || projectId.value !== requestedProjectId) return
      error.value = e.message
    } finally {
      if (requestId === requestSequence && projectId.value === requestedProjectId) {
        loading.value = false
      }
    }
  }

  async function loadDetail(key) {
    if (detailCache.value[key]) return
    const requestedProjectId = projectId.value
    try {
      const detail = await apiRequest(`/modules/ai-impact/component-onboarding/${encodeURIComponent(key)}${projectQuery(requestedProjectId)}`)
      if (projectId.value !== requestedProjectId) return null
      detailCache.value = { ...detailCache.value, [key]: detail }
      return detail
    } catch (e) {
      if (projectId.value !== requestedProjectId) return null
      console.error(`[component-onboarding] Failed to load detail for ${key}:`, e.message)
      return null
    }
  }

  watch(projectId, () => {
    data.value = null
    error.value = null
    detailCache.value = {}
    loading.value = true
    load()
  }, { flush: 'sync' })

  load()

  return { data, loading, error, load, loadDetail, detailCache }
}

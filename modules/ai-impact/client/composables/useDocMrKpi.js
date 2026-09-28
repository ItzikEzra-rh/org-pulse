import { ref } from 'vue'
import { apiRequest } from '@shared/client/services/api.js'
import { useProjectId, projectQuery } from '@shared/client/composables/useProjectId.js'

export function useDocMrKpi() {
  const mrKpiData = ref(null)
  const loading = ref(true)
  const error = ref(null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      mrKpiData.value = await apiRequest(`/modules/ai-impact/doc-mr-kpi-data${projectQuery(useProjectId().value)}`)
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  load()

  return { mrKpiData, loading, error, load }
}

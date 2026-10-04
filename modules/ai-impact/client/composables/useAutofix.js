import { ref, watch } from 'vue'
import { apiRequest } from '@shared/client/services/api.js'
import { useProjectId } from '@shared/client/composables/useProjectId.js'

export function useAutofix(timeWindow) {
  const autofixData = ref(null)
  const loading = ref(true)
  const error = ref(null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      const params = new URLSearchParams({ timeWindow: timeWindow.value || 'month' })
      const projectId = useProjectId().value
      if (projectId) params.set('projectId', projectId)
      autofixData.value = await apiRequest(`/modules/ai-impact/autofix-data?${params}`)
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  watch(timeWindow, () => load())
  watch(useProjectId(), () => load())
  load()

  return { autofixData, loading, error, load }
}

import { ref, watch } from 'vue'
import { apiRequest } from '@shared/client/services/api.js'
import { useProjectId, projectQuery } from '@shared/client/composables/useProjectId.js'

export function useAutofix(timeWindow) {
  const autofixData = ref(null)
  const loading = ref(true)
  const error = ref(null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      const tw = timeWindow.value || 'month'
      autofixData.value = await apiRequest(`/modules/ai-impact/autofix-data?timeWindow=${tw}${projectQuery(useProjectId().value)}`)
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

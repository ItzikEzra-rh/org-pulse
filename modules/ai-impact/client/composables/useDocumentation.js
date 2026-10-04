import { ref, watch } from 'vue'
import { apiRequest } from '@shared/client/services/api.js'
import { useProjectId, projectQuery } from '@shared/client/composables/useProjectId.js'

export function useDocumentation() {
  const projectId = useProjectId()
  const docData = ref(null)
  const loading = ref(true)
  const error = ref(null)
  let requestSequence = 0

  async function load() {
    const requestedProjectId = projectId.value
    const requestId = ++requestSequence
    loading.value = true
    error.value = null
    docData.value = null
    try {
      const next = await apiRequest(`/modules/ai-impact/doc-data${projectQuery(requestedProjectId)}`)
      if (requestId !== requestSequence || projectId.value !== requestedProjectId) return
      docData.value = next
    } catch (e) {
      if (requestId !== requestSequence || projectId.value !== requestedProjectId) return
      error.value = e.message
    } finally {
      if (requestId === requestSequence && projectId.value === requestedProjectId) {
        loading.value = false
      }
    }
  }

  load()
  watch(projectId, () => load(), { flush: 'sync' })

  return { docData, loading, error, load }
}

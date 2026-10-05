import { ref } from 'vue'
import { apiRequest } from '@shared/client/services/api'
import { useProjectId } from '@shared/client/composables/useProjectId.js'

const API_BASE = '/modules/releases'

export function useAuditLog() {
  const entries = ref([])
  const total = ref(0)
  const loading = ref(false)
  const error = ref(null)
  const projectId = useProjectId()
  let requestSequence = 0

  async function loadAuditLog(options) {
    const sequence = ++requestSequence
    const requestedProjectId = projectId.value || ''
    loading.value = true
    error.value = null

    const params = new URLSearchParams()
    if (requestedProjectId) params.set('projectId', requestedProjectId)
    if (options && options.version) params.set('version', options.version)
    if (options && options.action) params.set('action', options.action)
    if (options && options.domain) params.set('domain', options.domain)
    if (options && options.limit) params.set('limit', String(options.limit))
    if (options && options.offset) params.set('offset', String(options.offset))

    const qs = params.toString()
    const url = API_BASE + '/audit-log' + (qs ? '?' + qs : '')

    try {
      const data = await apiRequest(url)
      if (sequence !== requestSequence || projectId.value !== requestedProjectId) return
      if (requestedProjectId && data.projectId && data.projectId !== requestedProjectId) {
        throw new Error('Audit log project identity did not match the selected project')
      }
      entries.value = data.entries || []
      total.value = data.total || 0
    } catch (err) {
      if (sequence !== requestSequence || projectId.value !== requestedProjectId) return
      error.value = err.message
      entries.value = []
      total.value = 0
    } finally {
      if (sequence === requestSequence && projectId.value === requestedProjectId) loading.value = false
    }
  }

  return { entries, total, loading, error, loadAuditLog }
}

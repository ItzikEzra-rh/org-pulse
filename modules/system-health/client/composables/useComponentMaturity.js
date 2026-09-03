import { computed, ref } from 'vue'
import { apiRequest } from '@shared/client/services/api'

export function useComponentMaturity() {
  const report = ref(null)
  const loading = ref(false)
  const error = ref(null)

  const stale = computed(() => {
    if (!report.value?.generatedAt) return false
    const generated = new Date(report.value.generatedAt).getTime()
    return Number.isFinite(generated) && Date.now() - generated > 36 * 60 * 60 * 1000
  })

  async function loadReport() {
    loading.value = true
    error.value = null
    try {
      const data = await apiRequest('/modules/system-health/component-maturity/report')
      if (data?.schemaVersion !== 1 || !Array.isArray(data.components) || !Array.isArray(data.evaluations)) {
        throw new Error('Component Maturity report has an unsupported format.')
      }
      report.value = data
    } catch (err) {
      report.value = null
      error.value = err?.data?.code === 'COMPONENT_MATURITY_DATA_UNAVAILABLE'
        ? 'Component Maturity data has not been published yet.'
        : (err.message || 'Failed to load Component Maturity data.')
    } finally {
      loading.value = false
    }
  }

  return { report, loading, error, stale, loadReport }
}

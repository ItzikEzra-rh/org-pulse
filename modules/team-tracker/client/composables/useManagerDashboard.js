import { ref, computed } from 'vue'
import { apiRequest } from '@shared/client/services/api'
import { useProjectId } from '@shared/client/composables/useProjectId.js'

const manager = ref(null)
const directReports = ref([])
const indirectReports = ref([])
const teams = ref([])
const allOrgTeams = ref([])
const allPeople = ref([])
const referencedPeople = ref({})
const fieldDefinitions = ref({ person: [], team: [] })
const fieldExceptions = ref([])
const loading = ref(false)
const error = ref(null)
const reason = ref(null)
const includeIndirect = ref(false)
const availability = ref(null)
const generatedAt = ref(null)
const enrichment = ref(null)
const projectId = useProjectId()

// Guards against a slow earlier request overwriting a later project's state.
let loadSequence = 0

export function useManagerDashboard() {
  const isProjectMode = computed(() => Boolean(projectId.value) && projectId.value !== 'osac')

  function resetState() {
    manager.value = null
    directReports.value = []
    indirectReports.value = []
    teams.value = []
    allOrgTeams.value = []
    allPeople.value = []
    referencedPeople.value = {}
    fieldDefinitions.value = { person: [], team: [] }
    fieldExceptions.value = []
    reason.value = null
    availability.value = null
    generatedAt.value = null
    enrichment.value = null
  }

  async function load() {
    const requestId = ++loadSequence
    const requestedProjectId = projectId.value
    loading.value = true
    error.value = null
    reason.value = null
    try {
      const params = new URLSearchParams()
      if (requestedProjectId) params.set('projectId', requestedProjectId)
      if (includeIndirect.value) params.set('includeIndirect', 'true')
      const query = params.toString() ? `?${params.toString()}` : ''
      const data = await apiRequest(`/modules/team-tracker/manager/dashboard${query}`)
      if (requestId !== loadSequence || projectId.value !== requestedProjectId) return
      manager.value = data.manager || null
      directReports.value = data.directReports || []
      indirectReports.value = data.indirectReports || []
      teams.value = data.teams || []
      allOrgTeams.value = data.allOrgTeams || []
      allPeople.value = data.allPeople || []
      referencedPeople.value = data.referencedPeople || {}
      fieldDefinitions.value = data.fieldDefinitions || { person: [], team: [] }
      fieldExceptions.value = data.fieldExceptions || []
      reason.value = data.reason || null
      availability.value = data.availability || null
      generatedAt.value = data.generatedAt || null
      enrichment.value = data.enrichment || null
    } catch (err) {
      if (requestId !== loadSequence || projectId.value !== requestedProjectId) return
      error.value = err.message
      resetState()
    } finally {
      if (requestId === loadSequence) loading.value = false
    }
  }

  async function refresh() {
    return load()
  }

  return {
    manager,
    directReports,
    indirectReports,
    teams,
    allOrgTeams,
    allPeople,
    referencedPeople,
    fieldDefinitions,
    fieldExceptions,
    loading,
    error,
    reason,
    includeIndirect,
    availability,
    generatedAt,
    enrichment,
    projectId,
    isProjectMode,
    load,
    refresh,
    resetState
  }
}

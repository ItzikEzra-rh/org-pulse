import { ref, computed, watch } from 'vue'
import { apiRequest } from '@shared/client/services/api'
import { useProjectId, projectQuery } from './useProjectId.js'

const permissionData = ref(null)
const loading = ref(true)
const projectId = useProjectId()

let initialized = false
let requestSequence = 0

// Reset immediately on project switch so stale isManager/uid never leaks across projects.
watch(projectId, () => {
  permissionData.value = null
  loading.value = true
  fetchPermissions()
}, { flush: 'sync' })

async function fetchPermissions() {
  const requestId = ++requestSequence
  const requestedProjectId = projectId.value
  try {
    const data = await apiRequest(`/modules/team-tracker/permissions/me${projectQuery(requestedProjectId)}`)
    if (requestId !== requestSequence) return
    permissionData.value = data
  } catch {
    // Server not available
  } finally {
    if (requestId === requestSequence) loading.value = false
  }
}

export function usePermissions() {
  if (!initialized) {
    initialized = true
    fetchPermissions()
  }

  const roles = computed(() => permissionData.value?.roles || [])
  const managedUids = computed(() => new Set(permissionData.value?.managedUids || []))
  const userUid = computed(() => permissionData.value?.uid || null)
  const isAdmin = computed(() => roles.value.includes('admin'))
  const isTeamAdmin = computed(() =>
    roles.value.includes('admin') || roles.value.includes('team-admin')
  )
  const isManager = computed(() =>
    permissionData.value?.isManager || roles.value.includes('admin')
  )
  // Project-mode hierarchy availability signal (absent/partial/expired/unavailable
  // vs available/stale). Separate from isManager: it never grants privileges, it
  // only lets read-only UI explain why a manager view is empty. Legacy OSAC
  // responses omit it, so it reads as null/available (no degraded UI).
  const hierarchyStatus = computed(() => permissionData.value?.hierarchy || null)
  const hierarchyAvailable = computed(() => {
    const status = hierarchyStatus.value
    if (!status) return true
    return status === 'available' || status === 'stale'
  })

  function canEdit(uid) {
    if (isAdmin.value) return true
    if (isTeamAdmin.value) return true
    return managedUids.value.has(uid)
  }

  function canEditTeam(_teamId) {
    return isAdmin.value || isTeamAdmin.value
  }

  return {
    loading,
    roles,
    managedUids,
    userUid,
    isAdmin,
    isTeamAdmin,
    isManager,
    hierarchyStatus,
    hierarchyAvailable,
    canEdit,
    canEditTeam,
    refresh: fetchPermissions
  }
}

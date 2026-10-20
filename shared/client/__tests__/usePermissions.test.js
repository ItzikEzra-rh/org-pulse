import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  projectId: null
}))

vi.mock('../services/api', () => ({
  apiRequest: (...args) => mocks.apiRequest(...args)
}))

vi.mock('../composables/useProjectId.js', () => ({
  useProjectId: () => mocks.projectId,
  projectQuery: projectId => (projectId ? `?projectId=${encodeURIComponent(projectId)}` : '')
}))

async function createPermissions(projectId = '') {
  mocks.projectId = ref(projectId)
  return (await import('../composables/usePermissions.js')).usePermissions()
}

describe('usePermissions project awareness', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.apiRequest.mockReset()
  })

  it('requests the legacy endpoint without a projectId param', async () => {
    mocks.apiRequest.mockResolvedValue({ email: 'a@example.com', uid: 'u1', roles: ['user'], isManager: false, managedUids: [] })
    await createPermissions('')
    await vi.waitFor(() => expect(mocks.apiRequest).toHaveBeenCalled())

    expect(mocks.apiRequest).toHaveBeenCalledWith('/modules/team-tracker/permissions/me')
  })

  it('qualifies the request by projectId and reflects a verified manager', async () => {
    mocks.apiRequest.mockResolvedValue({ email: 'mallory@example.com', uid: 'mgr-1', roles: [], isManager: true, managedUids: ['eng-1'] })
    const perms = await createPermissions('flightctl')
    await vi.waitFor(() => expect(perms.userUid.value).toBe('mgr-1'))

    expect(mocks.apiRequest).toHaveBeenCalledWith('/modules/team-tracker/permissions/me?projectId=flightctl')
    expect(perms.isManager.value).toBe(true)
    expect(perms.managedUids.value.has('eng-1')).toBe(true)
  })

  it('reflects a non-manager or unresolved identity as isManager:false', async () => {
    mocks.apiRequest.mockResolvedValue({ email: 'nobody@example.com', uid: null, roles: [], isManager: false, managedUids: [] })
    const perms = await createPermissions('flightctl')
    await vi.waitFor(() => expect(mocks.apiRequest).toHaveBeenCalled())

    expect(perms.isManager.value).toBe(false)
    expect(perms.userUid.value).toBeNull()
  })

  it('exposes a trustworthy hierarchy for a complete manager (isManager stays true)', async () => {
    mocks.apiRequest.mockResolvedValue({ email: 'm@example.com', uid: 'mgr-1', roles: [], isManager: true, managedUids: ['eng-1'], hierarchy: 'available' })
    const perms = await createPermissions('flightctl')
    await vi.waitFor(() => expect(perms.userUid.value).toBe('mgr-1'))

    expect(perms.isManager.value).toBe(true)
    expect(perms.hierarchyStatus.value).toBe('available')
    expect(perms.hierarchyAvailable.value).toBe(true)
  })

  it('exposes a trustworthy hierarchy for a complete non-manager (isManager stays false)', async () => {
    mocks.apiRequest.mockResolvedValue({ email: 'ic@example.com', uid: 'eng-3', roles: [], isManager: false, managedUids: [], hierarchy: 'available' })
    const perms = await createPermissions('flightctl')
    await vi.waitFor(() => expect(perms.userUid.value).toBe('eng-3'))

    expect(perms.isManager.value).toBe(false)
    expect(perms.hierarchyAvailable.value).toBe(true)
  })

  it('treats an absent hierarchy as unavailable while keeping isManager fail-closed', async () => {
    mocks.apiRequest.mockResolvedValue({ email: 'm@example.com', uid: 'mgr-1', roles: [], isManager: false, managedUids: [], hierarchy: 'absent' })
    const perms = await createPermissions('flightctl')
    await vi.waitFor(() => expect(perms.userUid.value).toBe('mgr-1'))

    expect(perms.isManager.value).toBe(false)
    expect(perms.hierarchyStatus.value).toBe('absent')
    expect(perms.hierarchyAvailable.value).toBe(false)
  })

  it('treats a partial hierarchy as unavailable', async () => {
    mocks.apiRequest.mockResolvedValue({ email: 'm@example.com', uid: 'mgr-1', roles: [], isManager: false, managedUids: [], hierarchy: 'partial' })
    const perms = await createPermissions('flightctl')
    await vi.waitFor(() => expect(mocks.apiRequest).toHaveBeenCalled())

    expect(perms.hierarchyStatus.value).toBe('partial')
    expect(perms.hierarchyAvailable.value).toBe(false)
  })

  it('treats a stale hierarchy as still available', async () => {
    mocks.apiRequest.mockResolvedValue({ email: 'm@example.com', uid: 'mgr-1', roles: [], isManager: true, managedUids: ['eng-1'], hierarchy: 'stale' })
    const perms = await createPermissions('flightctl')
    await vi.waitFor(() => expect(perms.userUid.value).toBe('mgr-1'))

    expect(perms.hierarchyStatus.value).toBe('stale')
    expect(perms.hierarchyAvailable.value).toBe(true)
  })

  it('treats a legacy response with no hierarchy field as available (no degraded UI)', async () => {
    mocks.apiRequest.mockResolvedValue({ email: 'a@example.com', uid: 'u1', roles: ['user'], isManager: false, managedUids: [] })
    const perms = await createPermissions('')
    await vi.waitFor(() => expect(mocks.apiRequest).toHaveBeenCalled())

    expect(perms.hierarchyStatus.value).toBeNull()
    expect(perms.hierarchyAvailable.value).toBe(true)
  })

  it('resets stale state immediately on project switch, before the new response arrives', async () => {
    let resolveFirst
    mocks.apiRequest.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve }))
    const perms = await createPermissions('osac')
    resolveFirst({ email: 'm@example.com', uid: 'osac-uid', roles: [], isManager: true, managedUids: [] })
    await vi.waitFor(() => expect(perms.isManager.value).toBe(true))

    mocks.apiRequest.mockImplementationOnce(() => new Promise(() => {})) // never resolves
    mocks.projectId.value = 'flightctl'

    expect(perms.isManager.value).toBe(false)
    expect(perms.userUid.value).toBeNull()
  })

  it('discards a stale in-flight response that resolves after a newer project switch', async () => {
    let resolveStale
    mocks.apiRequest.mockImplementationOnce(() => new Promise(resolve => { resolveStale = resolve }))
    const perms = await createPermissions('osac')

    mocks.apiRequest.mockResolvedValueOnce({ email: 'f@example.com', uid: 'fc-uid', roles: [], isManager: false, managedUids: [] })
    mocks.projectId.value = 'flightctl'
    await vi.waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledTimes(2))

    // The OSAC request resolves last; it must not overwrite the Flight Control result.
    resolveStale({ email: 'osac@example.com', uid: 'osac-uid', roles: [], isManager: true, managedUids: [] })
    await vi.waitFor(() => expect(perms.userUid.value).toBe('fc-uid'))
    expect(perms.isManager.value).toBe(false)
  })
})

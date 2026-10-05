import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAuditLog } from '../../../client/plan/composables/useAuditLog'

const { projectId, apiRequest } = await vi.hoisted(async () => {
  const { ref } = await import('vue')
  return { projectId: ref('osac'), apiRequest: vi.fn() }
})

vi.mock('@shared/client/composables/useProjectId.js', () => ({ useProjectId: () => projectId }))
vi.mock('@shared/client/services/api', () => ({ apiRequest: (...args) => apiRequest(...args) }))

describe('useAuditLog project context', () => {
  beforeEach(() => {
    projectId.value = 'osac'
    apiRequest.mockReset()
  })

  it('sends projectId and ignores a response from the previous project', async () => {
    let resolveOsac
    let resolveFlightctl
    apiRequest
      .mockImplementationOnce(() => new Promise(resolve => { resolveOsac = resolve }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveFlightctl = resolve }))

    const audit = useAuditLog()
    const oldRequest = audit.loadAuditLog({ limit: 5 })
    projectId.value = 'flightctl'
    const currentRequest = audit.loadAuditLog({ limit: 5 })

    resolveOsac({ projectId: 'osac', entries: [{ id: 'osac-event' }], total: 1 })
    await oldRequest
    expect(audit.entries.value).toEqual([])

    resolveFlightctl({ projectId: 'flightctl', entries: [{ id: 'flightctl-event' }], total: 1 })
    await currentRequest
    expect(audit.entries.value).toEqual([{ id: 'flightctl-event' }])
    expect(apiRequest.mock.calls.map(([url]) => url)).toEqual([
      '/modules/releases/audit-log?projectId=osac&limit=5',
      '/modules/releases/audit-log?projectId=flightctl&limit=5'
    ])
  })
})

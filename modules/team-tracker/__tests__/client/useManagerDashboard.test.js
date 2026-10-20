import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockProjectId, apiRequest } = vi.hoisted(() => {
  const { ref: r } = require('vue')
  return { mockProjectId: r(''), apiRequest: vi.fn() }
})
vi.mock('@shared/client/composables/useProjectId.js', () => ({
  useProjectId: () => mockProjectId
}))
vi.mock('@shared/client/services/api', () => ({
  apiRequest: (...args) => apiRequest(...args)
}))

import { useManagerDashboard } from '../../client/composables/useManagerDashboard'

beforeEach(() => {
  mockProjectId.value = ''
  apiRequest.mockReset()
})

describe('useManagerDashboard', () => {
  it('requests the legacy OSAC endpoint without a projectId param', async () => {
    apiRequest.mockResolvedValue({ manager: { uid: 'm' }, directReports: [] })
    const dash = useManagerDashboard()
    dash.includeIndirect.value = false
    await dash.load()

    expect(apiRequest).toHaveBeenCalledWith('/modules/team-tracker/manager/dashboard')
    expect(dash.isProjectMode.value).toBe(false)
  })

  it('qualifies the request by project and carries includeIndirect', async () => {
    mockProjectId.value = 'flight-control'
    apiRequest.mockResolvedValue({
      mode: 'project',
      availability: 'available',
      manager: { accountId: 'acc_mgr' },
      directReports: [{ accountId: 'acc_eng1', name: 'Erin' }],
      teams: []
    })
    const dash = useManagerDashboard()
    dash.includeIndirect.value = true
    await dash.load()

    expect(apiRequest).toHaveBeenCalledWith('/modules/team-tracker/manager/dashboard?projectId=flight-control&includeIndirect=true')
    expect(dash.isProjectMode.value).toBe(true)
    expect(dash.availability.value).toBe('available')
    expect(dash.directReports.value).toHaveLength(1)
  })

  it('clears state and records the error on failure', async () => {
    const dash = useManagerDashboard()
    dash.directReports.value = [{ uid: 'stale' }]
    apiRequest.mockRejectedValue(new Error('boom'))
    await dash.load()

    expect(dash.error.value).toBe('boom')
    expect(dash.directReports.value).toEqual([])
  })
})

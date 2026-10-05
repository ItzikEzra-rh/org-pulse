import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const mocks = vi.hoisted(() => ({
  getRoster: vi.fn(),
  projectId: null
}))

vi.mock('../services/api', () => ({
  getRoster: mocks.getRoster
}))

vi.mock('../composables/useProjectId.js', () => ({
  useProjectId: () => mocks.projectId
}))

async function createRoster(projectId) {
  mocks.projectId = ref(projectId)
  return (await import('../composables/useRoster.js')).useRoster()
}

describe('useRoster project migration', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.getRoster.mockReset()
  })

  it('does not retry the legacy root route when the OSAC project route is unavailable', async () => {
    const missingPublication = Object.assign(new Error('Project roster publication is unavailable'), {
      status: 404,
      data: { error: 'Project roster publication is unavailable' }
    })
    mocks.getRoster.mockRejectedValueOnce(missingPublication)
    const roster = await createRoster('osac')

    await roster.loadRoster()

    expect(mocks.getRoster).toHaveBeenCalledOnce()
    expect(mocks.getRoster).toHaveBeenCalledWith('osac')
    expect(roster.rosterData.value).toBeNull()
    expect(roster.error.value).toBe('Project roster publication is unavailable')
  })

  it('does not fall back for a missing Flight Control publication', async () => {
    const missingPublication = Object.assign(new Error('Project roster publication is unavailable'), {
      status: 404,
      data: { error: 'Project roster publication is unavailable' }
    })
    mocks.getRoster.mockRejectedValueOnce(missingPublication)
    const roster = await createRoster('flightctl')

    await roster.loadRoster()

    expect(mocks.getRoster).toHaveBeenCalledTimes(1)
    expect(mocks.getRoster).toHaveBeenCalledWith('flightctl')
    expect(roster.error.value).toBe('Project roster publication is unavailable')
  })

  it('does not fall back when the selected OSAC project is unknown', async () => {
    const unknownProject = Object.assign(new Error('Unknown project'), {
      status: 404,
      data: { error: 'Unknown project' }
    })
    mocks.getRoster.mockRejectedValueOnce(unknownProject)
    const roster = await createRoster('osac')

    await roster.loadRoster()

    expect(mocks.getRoster).toHaveBeenCalledTimes(1)
    expect(mocks.getRoster).toHaveBeenCalledWith('osac')
    expect(roster.error.value).toBe('Unknown project')
    expect(roster.rosterData.value).toBeNull()
  })
})

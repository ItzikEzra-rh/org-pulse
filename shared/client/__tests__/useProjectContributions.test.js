import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const mocks = vi.hoisted(() => ({
  getProjectContributions: vi.fn(),
  projectId: null
}))

vi.mock('../services/api', () => ({
  getProjectContributions: mocks.getProjectContributions
}))

vi.mock('../composables/useProjectId.js', () => ({
  useProjectId: () => mocks.projectId
}))

function model(projectId, people) {
  return { projectId, availability: 'available', freshness: 'fresh', partial: false, people }
}

function person(accountId, username, total) {
  return {
    key: `${accountId}`,
    accountId,
    displayName: accountId,
    github: username ? { username, totalContributions: total, months: { '2026-10': total }, fetchedAt: 'x' } : null,
    gitlab: null,
    contributionStatus: username ? 'collected' : 'unresolved'
  }
}

async function createContributions(projectId) {
  mocks.projectId = ref(projectId)
  return (await import('../composables/useProjectContributions.js')).useProjectContributions()
}

describe('useProjectContributions', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.getProjectContributions.mockReset()
  })

  it('joins people by accountId', async () => {
    mocks.getProjectContributions.mockResolvedValue(model('flightctl', [person('acc-1', 'ada-gh', 10)]))
    const c = await createContributions('flightctl')
    await c.loadContributions()
    expect(mocks.getProjectContributions).toHaveBeenCalledWith('flightctl')
    expect(c.getByAccountId('acc-1').github.totalContributions).toBe(10)
  })

  it('returns null for an unresolved person (missing is not zero)', async () => {
    mocks.getProjectContributions.mockResolvedValue(model('flightctl', [person('acc-3', null)]))
    const c = await createContributions('flightctl')
    await c.loadContributions()
    expect(c.getByAccountId('acc-3').github).toBeNull()
    expect(c.getByAccountId('acc-unknown')).toBeNull()
  })

  it('does not leak one project contributions after switching projects', async () => {
    mocks.getProjectContributions.mockImplementation(async projectId =>
      projectId === 'flightctl'
        ? model('flightctl', [person('fc-1', 'fc-gh', 7)])
        : model('osac', [person('osac-1', 'osac-gh', 3)])
    )
    const c = await createContributions('flightctl')
    await c.loadContributions()
    expect(c.getByAccountId('fc-1').github.totalContributions).toBe(7)

    // Switching projects resets synchronously before the new fetch resolves.
    mocks.projectId.value = 'osac'
    expect(c.getByAccountId('fc-1')).toBeNull()

    await c.loadContributions()
    expect(c.getByAccountId('fc-1')).toBeNull()
    expect(c.getByAccountId('osac-1').github.totalContributions).toBe(3)
  })

  it('surfaces a missing publication as an error without fabricating data', async () => {
    mocks.getProjectContributions.mockRejectedValueOnce(
      Object.assign(new Error('Project contributions publication is unavailable'), { status: 404 })
    )
    const c = await createContributions('flightctl')
    await c.loadContributions()
    expect(c.contributions.value).toBeNull()
    expect(c.getByAccountId('acc-1')).toBeNull()
    expect(c.error.value).toBe('Project contributions publication is unavailable')
  })

  it('rejects a response whose projectId does not match the request', async () => {
    mocks.getProjectContributions.mockResolvedValue(model('osac', [person('osac-1', 'osac-gh', 3)]))
    const c = await createContributions('flightctl')
    await c.loadContributions()
    expect(c.contributions.value).toBeNull()
    expect(c.error.value).toBe('Contributions response project identity mismatch')
  })

  it('does not fetch when there is no explicit project context', async () => {
    const c = await createContributions('')
    const result = await c.loadContributions()
    expect(result).toBeNull()
    expect(mocks.getProjectContributions).not.toHaveBeenCalled()
  })

  it('does not fetch merely because the global project selector changed with no active consumer', async () => {
    mocks.getProjectContributions.mockResolvedValue(model('osac', [person('osac-1', 'osac-gh', 3)]))
    const c = await createContributions('flightctl')

    // Importing and using the composable, then switching projects, must not fetch
    // while no consuming view has asked for data.
    mocks.projectId.value = 'osac'
    await Promise.resolve()
    expect(mocks.getProjectContributions).not.toHaveBeenCalled()

    // Active consumption still triggers a fetch for the current project.
    await c.loadContributions()
    expect(mocks.getProjectContributions).toHaveBeenCalledWith('osac')
    expect(c.getByAccountId('osac-1').github.totalContributions).toBe(3)
  })
})

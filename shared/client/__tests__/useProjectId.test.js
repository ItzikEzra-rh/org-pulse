/**
 * Reactive project context regression: the singleton ref must track both
 * real hash changes and shell-rewritten hash params (moduleNav.updateParams
 * uses history.pushState, which does not fire hashchange — without the
 * urlchange signal the selector change never reaches any consumer).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

let useProjectId, projectQuery

describe('useProjectId', () => {
  beforeEach(async () => {
    vi.resetModules()
    window.location.hash = '#/'
    const mod = await import('@shared/client/composables/useProjectId.js')
    useProjectId = mod.useProjectId
    projectQuery = mod.projectQuery
  })

  it('reads the projectId hash param on init', () => {
    window.location.hash = '#/releases/registry?projectId=flightctl'
    const projectId = useProjectId()
    expect(projectId.value).toBe('flightctl')
  })

  it('returns an empty context when no projectId param exists', () => {
    window.location.hash = '#/releases/registry'
    const projectId = useProjectId()
    expect(projectId.value).toBe('')
  })

  it('updates on a real hashchange', async () => {
    const projectId = useProjectId()
    expect(projectId.value).toBe('')
    window.location.hash = '#/releases/registry?projectId=osac'
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(projectId.value).toBe('osac')
  })

  it('updates when the shell rewrites hash params without a hashchange', () => {
    const projectId = useProjectId()
    expect(projectId.value).toBe('')
    history.pushState(null, '', '#/people-and-teams/teams?projectId=flightctl')
    window.dispatchEvent(new Event('urlchange'))
    expect(projectId.value).toBe('flightctl')
  })

  it('shares a single ref across consumers', async () => {
    const a = useProjectId()
    const b = useProjectId()
    expect(b).toBe(a)
    window.location.hash = '#/releases/registry?projectId=osac'
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(a.value).toBe('osac')
    expect(b.value).toBe('osac')
  })

  it('encodes the project query suffix', () => {
    expect(projectQuery('flightctl')).toBe('?projectId=flightctl')
    expect(projectQuery('')).toBe('')
  })
})

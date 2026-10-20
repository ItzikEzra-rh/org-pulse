import { describe, it, expect } from 'vitest'

const { buildProjectManagerDashboard, projectHierarchyStatus, isProjectHierarchyAvailable } = require('../../server/project-manager-dashboard')

function person(accountId, overrides = {}) {
  return {
    key: `${overrides.projectId || 'proj'}::${accountId}`,
    projectId: overrides.projectId || 'proj',
    accountId,
    displayName: overrides.displayName || accountId,
    active: overrides.active !== false,
    email: overrides.email ?? `${accountId}@example.com`,
    teamIds: overrides.teamIds || [],
    manager: null,
    title: overrides.title ?? null,
    geo: null,
    identities: {},
    managerRef: overrides.managerRef ?? null
  }
}

function rosterRef(accountId) {
  return { kind: 'roster', accountId }
}

// Flight Control: director -> two managers -> engineers across two teams,
// plus an externally-managed person and an unresolved-manager person.
function flightControlModel() {
  return {
    projectId: 'flight-control',
    availability: 'available',
    reason: null,
    publicationState: 'supported',
    generatedAt: '2026-10-15T00:00:00.000Z',
    teams: [
      { key: 'flight-control::t_core', projectId: 'flight-control', id: 't_core', displayName: 'Core', memberAccountIds: [] },
      { key: 'flight-control::t_edge', projectId: 'flight-control', id: 't_edge', displayName: 'Edge', memberAccountIds: [] }
    ],
    people: [
      person('acc_dir', { projectId: 'flight-control', displayName: 'Dana Director', email: 'dana@redhat.com', managerRef: null }),
      person('acc_mgr', { projectId: 'flight-control', displayName: 'Morgan Manager', email: 'morgan@redhat.com', managerRef: rosterRef('acc_dir'), teamIds: ['t_core'] }),
      person('acc_eng1', { projectId: 'flight-control', displayName: 'Erin Eng', email: 'erin@redhat.com', managerRef: rosterRef('acc_mgr'), teamIds: ['t_core'] }),
      person('acc_eng2', { projectId: 'flight-control', displayName: 'Evan Eng', email: 'evan@redhat.com', managerRef: rosterRef('acc_mgr'), teamIds: ['t_edge'] }),
      // Another manager's report also on t_core — counts toward member total, not our reports.
      person('acc_other', { projectId: 'flight-control', displayName: 'Olive Other', email: 'olive@redhat.com', managerRef: rosterRef('acc_dir'), teamIds: ['t_core'] }),
      // Externally managed: manager lives outside the project roster.
      person('acc_ext', { projectId: 'flight-control', displayName: 'Xavier External', email: 'xavier@redhat.com', managerRef: { kind: 'external', ldapUid: 'bigboss' }, teamIds: ['t_edge'] }),
      // Unresolved manager.
      person('acc_unres', { projectId: 'flight-control', displayName: 'Uma Unresolved', email: 'uma@redhat.com', managerRef: { kind: 'unresolved', reason: 'no-match' }, teamIds: ['t_edge'] })
    ],
    enrichment: { state: 'fresh', partial: false, generatedAt: '2026-10-15T00:00:00.000Z' }
  }
}

describe('buildProjectManagerDashboard', () => {
  it('resolves the manager by email and returns direct reports and managed teams', () => {
    const { status, body } = buildProjectManagerDashboard(flightControlModel(), { email: 'morgan@redhat.com' })

    expect(status).toBe(200)
    expect(body.mode).toBe('project')
    expect(body.projectId).toBe('flight-control')
    expect(body.manager).toEqual({ accountId: 'acc_mgr', name: 'Morgan Manager', email: 'morgan@redhat.com' })

    const reportIds = body.directReports.map(r => r.accountId).sort()
    expect(reportIds).toEqual(['acc_eng1', 'acc_eng2'])
    expect(body.directReports.every(r => r.indirect === false)).toBe(true)

    const teamIds = body.teams.map(t => t.id).sort()
    expect(teamIds).toEqual(['t_core', 't_edge'])
  })

  it('attributes direct reports and member counts per team', () => {
    const { body } = buildProjectManagerDashboard(flightControlModel(), { email: 'morgan@redhat.com' })

    const core = body.teams.find(t => t.id === 't_core')
    // Only erin is Morgan's direct report on Core...
    expect(core.directReportAccountIds).toEqual(['acc_eng1'])
    expect(core.directReportCount).toBe(1)
    // ...but Morgan, Olive and Erin are all active members of Core.
    expect(core.totalMemberCount).toBe(3)

    const edge = body.teams.find(t => t.id === 't_edge')
    expect(edge.directReportAccountIds).toEqual(['acc_eng2'])
    // evan + xavier + uma are active on Edge.
    expect(edge.totalMemberCount).toBe(3)
  })

  it('includes indirect reports via the roster managerRef chain when requested', () => {
    const { body } = buildProjectManagerDashboard(flightControlModel(), { email: 'dana@redhat.com', includeIndirect: true })

    // Dana directly manages Morgan and Olive.
    expect(body.directReports.map(r => r.accountId).sort()).toEqual(['acc_mgr', 'acc_other'])
    // Erin and Evan report to Morgan -> indirect reports of Dana.
    expect(body.indirectReports.map(r => r.accountId).sort()).toEqual(['acc_eng1', 'acc_eng2'])
    expect(body.indirectReports.every(r => r.indirect === true)).toBe(true)
  })

  it('never fabricates report edges from external or unresolved manager refs', () => {
    const { body } = buildProjectManagerDashboard(flightControlModel(), { email: 'dana@redhat.com', includeIndirect: true })

    const allReportIds = [...body.directReports, ...body.indirectReports].map(r => r.accountId)
    // Externally/unresolved-managed people are not grafted onto the in-roster tree.
    expect(allReportIds).not.toContain('acc_ext')
    expect(allReportIds).not.toContain('acc_unres')
  })

  it('surfaces the typed managerRef on reports without resolving it', () => {
    const { body } = buildProjectManagerDashboard(flightControlModel(), { email: 'morgan@redhat.com' })
    const erin = body.directReports.find(r => r.accountId === 'acc_eng1')
    expect(erin.managerRef).toEqual({ kind: 'roster', accountId: 'acc_mgr' })
  })

  it('isolates to the published project — no identity leaks across models', () => {
    const osacModel = {
      projectId: 'osac',
      availability: 'available',
      generatedAt: null,
      teams: [{ key: 'osac::t1', projectId: 'osac', id: 't1', displayName: 'OSAC Team', memberAccountIds: [] }],
      people: [
        person('osac_mgr', { projectId: 'osac', email: 'morgan@redhat.com', managerRef: null }),
        person('osac_rep', { projectId: 'osac', email: 'rep@redhat.com', managerRef: rosterRef('osac_mgr'), teamIds: ['t1'] })
      ]
    }
    const { body } = buildProjectManagerDashboard(osacModel, { email: 'morgan@redhat.com' })
    expect(body.projectId).toBe('osac')
    expect(body.manager.accountId).toBe('osac_mgr')
    expect(body.directReports.map(r => r.accountId)).toEqual(['osac_rep'])
    // Flight Control accountIds must not appear.
    expect(body.directReports.map(r => r.accountId)).not.toContain('acc_eng1')
  })

  it('returns no-registry-identity when the email matches no active person', () => {
    const { status, body } = buildProjectManagerDashboard(flightControlModel(), { email: 'ghost@redhat.com' })
    expect(status).toBe(200)
    expect(body.reason).toBe('no-registry-identity')
    expect(body.manager).toBeNull()
    expect(body.directReports).toEqual([])
    expect(body.teams).toEqual([])
  })

  it('returns 403 for an authenticated non-manager', () => {
    const { status, body } = buildProjectManagerDashboard(flightControlModel(), { email: 'erin@redhat.com' })
    expect(status).toBe(403)
    expect(body.error).toBe('You are not a manager')
  })

  it('reports hierarchy-unavailable instead of a false 403 when enrichment was never published', () => {
    const model = flightControlModel()
    delete model.enrichment
    const { status, body } = buildProjectManagerDashboard(model, { email: 'erin@redhat.com' })
    expect(status).toBe(200)
    expect(body.reason).toBe('hierarchy-unavailable')
    expect(body.manager.accountId).toBe('acc_eng1')
  })

  it('reports hierarchy-unavailable instead of a false 403 when enrichment is untrusted', () => {
    const model = flightControlModel()
    model.enrichment = { state: 'absent', generatedAt: null }
    const { status, body } = buildProjectManagerDashboard(model, { email: 'erin@redhat.com' })
    expect(status).toBe(200)
    expect(body.reason).toBe('hierarchy-unavailable')
  })

  it('reports hierarchy-unavailable instead of a false 403 when enrichment is partial', () => {
    const model = flightControlModel()
    // Freshness is fine, but some records are missing from the join.
    model.enrichment = { state: 'partial', partial: true, generatedAt: '2026-10-15T00:00:00.000Z' }
    const { status, body } = buildProjectManagerDashboard(model, { email: 'erin@redhat.com' })
    expect(status).toBe(200)
    expect(body.reason).toBe('hierarchy-unavailable')
  })

  it('still returns 403 for a confirmed non-manager when enrichment is complete and fresh', () => {
    const model = flightControlModel()
    model.enrichment = { state: 'fresh', partial: false, generatedAt: '2026-10-15T00:00:00.000Z' }
    const { status, body } = buildProjectManagerDashboard(model, { email: 'erin@redhat.com' })
    expect(status).toBe(403)
    expect(body.error).toBe('You are not a manager')
  })

  it('returns no-direct-reports (200) for a privileged non-manager', () => {
    const { status, body } = buildProjectManagerDashboard(flightControlModel(), { email: 'erin@redhat.com', isPrivileged: true })
    expect(status).toBe(200)
    expect(body.reason).toBe('no-direct-reports')
    expect(body.manager.accountId).toBe('acc_eng1')
    expect(body.directReports).toEqual([])
  })

  it('represents an unavailable publication honestly instead of an empty manager', () => {
    const model = { projectId: 'flight-control', availability: 'unavailable', reason: 'publication-not-fresh', teams: [], people: [] }
    const { status, body } = buildProjectManagerDashboard(model, { email: 'morgan@redhat.com' })
    expect(status).toBe(200)
    expect(body.availability).toBe('unavailable')
    expect(body.reason).toBe('publication-not-fresh')
    expect(body.manager).toBeNull()
  })

  it('excludes inactive reports from the manager tree', () => {
    const model = flightControlModel()
    model.people.find(p => p.accountId === 'acc_eng1').active = false
    const { body } = buildProjectManagerDashboard(model, { email: 'morgan@redhat.com' })
    expect(body.directReports.map(r => r.accountId)).toEqual(['acc_eng2'])
  })
})

describe('projectHierarchyStatus', () => {
  const base = { projectId: 'proj', availability: 'available' }

  it('is "available" for a fresh, complete enrichment join', () => {
    const model = { ...base, enrichment: { state: 'fresh', partial: false } }
    expect(projectHierarchyStatus(model)).toBe('available')
    expect(isProjectHierarchyAvailable(model)).toBe(true)
  })

  it('is "stale" (still available) for a stale join', () => {
    const model = { ...base, enrichment: { state: 'stale', partial: false } }
    expect(projectHierarchyStatus(model)).toBe('stale')
    expect(isProjectHierarchyAvailable(model)).toBe(true)
  })

  it('is "partial" (not available) for a partial join', () => {
    const model = { ...base, enrichment: { state: 'partial', partial: true } }
    expect(projectHierarchyStatus(model)).toBe('partial')
    expect(isProjectHierarchyAvailable(model)).toBe(false)
  })

  it('is "absent" (not available) when enrichment is distrusted (expired/unknown)', () => {
    const model = { ...base, enrichment: { state: 'absent' } }
    expect(projectHierarchyStatus(model)).toBe('absent')
    expect(isProjectHierarchyAvailable(model)).toBe(false)
  })

  it('is "absent" when no enrichment was published at all', () => {
    const model = { ...base }
    expect(projectHierarchyStatus(model)).toBe('absent')
    expect(isProjectHierarchyAvailable(model)).toBe(false)
  })

  it('is "unavailable" when the roster publication itself is unavailable', () => {
    expect(projectHierarchyStatus({ projectId: 'proj', availability: 'unavailable' })).toBe('unavailable')
    expect(projectHierarchyStatus(null)).toBe('unavailable')
    expect(isProjectHierarchyAvailable({ projectId: 'proj', availability: 'unavailable' })).toBe(false)
  })
})

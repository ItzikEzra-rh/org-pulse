import { describe, it, expect } from 'vitest'

const {
  getManagerPurview,
  buildProjectManagerModel,
  resolveProjectManagerAccountId
} = require('../../server/manager-purview')

function makeRegistry(people) {
  return { people }
}

function makeTeams(teams) {
  const teamsMap = {}
  for (const t of teams) {
    teamsMap[t.id] = t
  }
  return { teams: teamsMap }
}

describe('getManagerPurview', () => {
  it('returns both teams when manager has reports on 2 teams', () => {
    const registry = makeRegistry({
      mgr: { uid: 'mgr', status: 'active', managerUid: null },
      alice: { uid: 'alice', status: 'active', managerUid: 'mgr', teamIds: ['team_a'] },
      bob: { uid: 'bob', status: 'active', managerUid: 'mgr', teamIds: ['team_b'] }
    })
    const teamsData = makeTeams([
      { id: 'team_a', name: 'Alpha', orgKey: 'org1', metadata: {}, boards: [] },
      { id: 'team_b', name: 'Beta', orgKey: 'org1', metadata: {}, boards: [] }
    ])

    const result = getManagerPurview('mgr', registry, teamsData)

    expect(result.directReportUids).toEqual(expect.arrayContaining(['alice', 'bob']))
    expect(result.directReportUids).toHaveLength(2)
    expect(result.teams).toHaveLength(2)

    const teamA = result.teams.find(t => t.id === 'team_a')
    expect(teamA.directReportUids).toEqual(['alice'])
    expect(teamA.totalMemberCount).toBe(1)

    const teamB = result.teams.find(t => t.id === 'team_b')
    expect(teamB.directReportUids).toEqual(['bob'])
    expect(teamB.totalMemberCount).toBe(1)
  })

  it('returns reports but empty teams when reports have no team assignments', () => {
    const registry = makeRegistry({
      mgr: { uid: 'mgr', status: 'active', managerUid: null },
      alice: { uid: 'alice', status: 'active', managerUid: 'mgr' },
      bob: { uid: 'bob', status: 'active', managerUid: 'mgr', teamIds: [] }
    })
    const teamsData = makeTeams([
      { id: 'team_a', name: 'Alpha', orgKey: 'org1', metadata: {}, boards: [] }
    ])

    const result = getManagerPurview('mgr', registry, teamsData)

    expect(result.directReportUids).toEqual(expect.arrayContaining(['alice', 'bob']))
    expect(result.directReportUids).toHaveLength(2)
    expect(result.teams).toHaveLength(0)
  })

  it('deduplicates team when multiple reports are on the same team', () => {
    const registry = makeRegistry({
      mgr: { uid: 'mgr', status: 'active', managerUid: null },
      alice: { uid: 'alice', status: 'active', managerUid: 'mgr', teamIds: ['team_a'] },
      bob: { uid: 'bob', status: 'active', managerUid: 'mgr', teamIds: ['team_a'] },
      charlie: { uid: 'charlie', status: 'active', managerUid: 'other', teamIds: ['team_a'] }
    })
    const teamsData = makeTeams([
      { id: 'team_a', name: 'Alpha', orgKey: 'org1', metadata: {}, boards: [] }
    ])

    const result = getManagerPurview('mgr', registry, teamsData)

    expect(result.teams).toHaveLength(1)
    expect(result.teams[0].directReportUids).toEqual(expect.arrayContaining(['alice', 'bob']))
    expect(result.teams[0].directReportUids).toHaveLength(2)
    // totalMemberCount includes charlie (not a direct report but on the team)
    expect(result.teams[0].totalMemberCount).toBe(3)
  })

  it('excludes inactive reports', () => {
    const registry = makeRegistry({
      mgr: { uid: 'mgr', status: 'active', managerUid: null },
      alice: { uid: 'alice', status: 'active', managerUid: 'mgr', teamIds: ['team_a'] },
      bob: { uid: 'bob', status: 'inactive', managerUid: 'mgr', teamIds: ['team_a'] }
    })
    const teamsData = makeTeams([
      { id: 'team_a', name: 'Alpha', orgKey: 'org1', metadata: {}, boards: [] }
    ])

    const result = getManagerPurview('mgr', registry, teamsData)

    expect(result.directReportUids).toEqual(['alice'])
    expect(result.teams).toHaveLength(1)
    expect(result.teams[0].directReportUids).toEqual(['alice'])
  })

  it('reports with no teamIds are in directReportUids but not in any team', () => {
    const registry = makeRegistry({
      mgr: { uid: 'mgr', status: 'active', managerUid: null },
      alice: { uid: 'alice', status: 'active', managerUid: 'mgr', teamIds: ['team_a'] },
      bob: { uid: 'bob', status: 'active', managerUid: 'mgr' }
    })
    const teamsData = makeTeams([
      { id: 'team_a', name: 'Alpha', orgKey: 'org1', metadata: {}, boards: [] }
    ])

    const result = getManagerPurview('mgr', registry, teamsData)

    expect(result.directReportUids).toEqual(expect.arrayContaining(['alice', 'bob']))
    expect(result.directReportUids).toHaveLength(2)
    expect(result.teams).toHaveLength(1)
    expect(result.teams[0].directReportUids).toEqual(['alice'])
  })

  it('handles null teamsData', () => {
    const registry = makeRegistry({
      mgr: { uid: 'mgr', status: 'active', managerUid: null },
      alice: { uid: 'alice', status: 'active', managerUid: 'mgr', teamIds: ['team_a'] }
    })

    const result = getManagerPurview('mgr', registry, null)

    expect(result.directReportUids).toEqual(['alice'])
    expect(result.teams).toHaveLength(0)
  })

  it('handles manager with no reports', () => {
    const registry = makeRegistry({
      mgr: { uid: 'mgr', status: 'active', managerUid: null },
      alice: { uid: 'alice', status: 'active', managerUid: 'other', teamIds: ['team_a'] }
    })
    const teamsData = makeTeams([
      { id: 'team_a', name: 'Alpha', orgKey: 'org1', metadata: {}, boards: [] }
    ])

    const result = getManagerPurview('mgr', registry, teamsData)

    expect(result.directReportUids).toHaveLength(0)
    expect(result.teams).toHaveLength(0)
  })
})

describe('buildProjectManagerModel', () => {
  const model = {
    projectId: 'flight-control',
    people: [
      { accountId: 'm', displayName: 'Mgr', email: 'm@x.io', active: true, managerRef: null, teamIds: [] },
      { accountId: 'a', displayName: 'Alice', email: 'a@x.io', active: true, managerRef: { kind: 'roster', accountId: 'm' }, teamIds: ['t1'] },
      { accountId: 'b', displayName: 'Bob', email: 'b@x.io', active: false, managerRef: { kind: 'roster', accountId: 'm' }, teamIds: ['t1'] },
      { accountId: 'c', displayName: 'Cara', email: 'c@x.io', active: true, managerRef: { kind: 'external', ldapUid: 'boss' }, teamIds: ['t1'] },
      { accountId: 'd', displayName: 'Dan', email: 'd@x.io', active: true, managerRef: { kind: 'roster', accountId: 'ghost' }, teamIds: ['t1'] }
    ],
    teams: [{ id: 't1', displayName: 'Team One' }]
  }

  it('maps roster managerRef to an in-roster managerUid edge', () => {
    const { registry } = buildProjectManagerModel(model)
    expect(registry.people.a.managerUid).toBe('m')
    expect(registry.people.a.status).toBe('active')
    expect(registry.people.b.status).toBe('inactive')
  })

  it('does not fabricate edges for external or dangling roster refs', () => {
    const { registry } = buildProjectManagerModel(model)
    // external ref -> no in-roster manager edge
    expect(registry.people.c.managerUid).toBeNull()
    // roster ref pointing outside the model -> no edge
    expect(registry.people.d.managerUid).toBeNull()
  })

  it('scopes teams to the project with projectId as the org key', () => {
    const { teamsData } = buildProjectManagerModel(model)
    expect(teamsData.teams.t1).toMatchObject({ id: 't1', name: 'Team One', orgKey: 'flight-control' })
  })

  it('feeds getManagerPurview to compute reports without a second engine', () => {
    const { registry, teamsData } = buildProjectManagerModel(model)
    const purview = getManagerPurview('m', registry, teamsData)
    expect(purview.directReportUids).toEqual(['a'])
    const t1 = purview.teams.find(t => t.id === 't1')
    // Active members of t1: alice, cara, dan (bob is inactive).
    expect(t1.totalMemberCount).toBe(3)
  })

  it('excludes people with a missing or blank accountId instead of collapsing them into one entry', () => {
    const malformed = {
      projectId: 'flight-control',
      people: [
        { accountId: 'm', displayName: 'Mgr', email: 'm@x.io', active: true, managerRef: null, teamIds: [] },
        { accountId: undefined, displayName: 'Ghost One', email: 'g1@x.io', active: true, managerRef: null, teamIds: [] },
        { accountId: undefined, displayName: 'Ghost Two', email: 'g2@x.io', active: true, managerRef: null, teamIds: [] },
        { accountId: '', displayName: 'Ghost Three', email: 'g3@x.io', active: true, managerRef: null, teamIds: [] },
        { accountId: 'a', displayName: 'Alice', email: 'a@x.io', active: true, managerRef: { kind: 'roster', accountId: 'm' }, teamIds: [] }
      ],
      teams: []
    }

    const { registry } = buildProjectManagerModel(malformed)

    expect(Object.keys(registry.people).sort()).toEqual(['a', 'm'])
    expect(registry.people.undefined).toBeUndefined()
  })

  it('never resolves a managerRef with a missing or blank accountId into an edge', () => {
    const malformed = {
      projectId: 'flight-control',
      people: [
        { accountId: undefined, displayName: 'Ghost Manager', email: 'ghost@x.io', active: true, managerRef: null, teamIds: [] },
        { accountId: 'a', displayName: 'Alice', email: 'a@x.io', active: true, managerRef: { kind: 'roster', accountId: undefined }, teamIds: [] },
        { accountId: 'b', displayName: 'Bob', email: 'b@x.io', active: true, managerRef: { kind: 'roster', accountId: '' }, teamIds: [] }
      ],
      teams: []
    }

    const { registry } = buildProjectManagerModel(malformed)

    expect(registry.people.a.managerUid).toBeNull()
    expect(registry.people.b.managerUid).toBeNull()
  })
})

describe('resolveProjectManagerAccountId', () => {
  const model = {
    people: [
      { accountId: 'm', email: 'Mgr@X.io', active: true },
      { accountId: 'x', email: 'inactive@x.io', active: false }
    ]
  }

  it('matches by email case-insensitively', () => {
    expect(resolveProjectManagerAccountId(model, 'mgr@x.io')).toBe('m')
  })

  it('ignores inactive people and unknown emails', () => {
    expect(resolveProjectManagerAccountId(model, 'inactive@x.io')).toBeNull()
    expect(resolveProjectManagerAccountId(model, 'nobody@x.io')).toBeNull()
    expect(resolveProjectManagerAccountId(model, null)).toBeNull()
  })

  it('fails closed when the email matches more than one distinct accountId', () => {
    const ambiguous = {
      people: [
        { accountId: 'dup-1', email: 'shared@x.io', active: true },
        { accountId: 'dup-2', email: 'shared@x.io', active: true }
      ]
    }
    expect(resolveProjectManagerAccountId(ambiguous, 'shared@x.io')).toBeNull()
  })

  it('resolves when duplicate active records share the same accountId', () => {
    const sameAccount = {
      people: [
        { accountId: 'm', email: 'same@x.io', active: true },
        { accountId: 'm', email: 'same@x.io', active: true }
      ]
    }
    expect(resolveProjectManagerAccountId(sameAccount, 'same@x.io')).toBe('m')
  })
})

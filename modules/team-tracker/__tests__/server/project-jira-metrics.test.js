/**
 * A malformed or absent publication must degrade to an honest "unavailable"
 * model, never a fabricated zero, and never join cross-project data.
 */
import { describe, it, expect } from 'vitest'
import { ARTIFACT_KEY, readProjectTrends, readProjectTeamMetrics } from '../../server/project-jira-metrics.js'

function mockProjects(publications = {}, profiles = {}) {
  return {
    get: projectId => profiles[projectId] || null,
    readArtifact: (projectId, key) => publications[projectId]?.[key] || null
  }
}

function statusSidecarKey(projectId) {
  return `projects/${projectId}/_publication/${encodeURIComponent(ARTIFACT_KEY)}.status.json`
}

function mockReadFromStorage(files = {}) {
  return key => (key in files ? files[key] : null)
}

function makeProfile(projectId) {
  return { projectId, displayName: projectId === 'flightctl' ? 'Flight Control' : 'OSAC', profileRevision: 'rev' }
}

function makePerson(overrides = {}) {
  return {
    accountId: 'acct-1',
    teamIds: ['team-1'],
    resolved: { count: 0, storyPoints: 0, issues: [] },
    inProgress: { count: 0, storyPoints: 0, issues: [] },
    cycleTime: { avgDays: null, medianDays: null },
    ...overrides
  }
}

function makeTeam(overrides = {}) {
  return {
    id: 'team-1',
    name: 'RHEM-DEV',
    memberCount: 1,
    membersIncluded: 1,
    membersMissing: [],
    resolved: { count: 0, storyPoints: 0 },
    inProgress: { count: 0, storyPoints: 0 },
    cycleTime: { avgDays: null, medianDays: null },
    partial: false,
    ...overrides
  }
}

function makeEnvelope(projectId, overrides = {}) {
  return {
    schemaVersion: 1,
    projectId,
    profileRevision: 'rev',
    artifactKey: ARTIFACT_KEY,
    source: { id: `${projectId}-jira-person-metrics`, kind: 'jira-person-metrics' },
    state: 'supported',
    freshness: 'fresh',
    partial: false,
    error: null,
    lastKnownGood: null,
    generatedAt: '2026-10-14T00:00:00Z',
    data: {
      projectId,
      personCount: 1,
      people: [makePerson()],
      teams: [makeTeam()],
      diagnostics: { missingPeople: [], staleCarryForward: [], freshSuccessCount: 1 }
    },
    ...overrides
  }
}

describe('readProjectTrends', () => {
  it('buckets resolved issues by month and team, surfacing availability', () => {
    const envelope = makeEnvelope('flightctl', {
      data: {
        projectId: 'flightctl',
        personCount: 2,
        people: [
          makePerson({
            accountId: 'acct-1',
            teamIds: ['team-1'],
            resolved: {
              count: 2,
              storyPoints: 8,
              issues: [
                { key: 'RHEM-1', resolutionDate: '2026-09-15T00:00:00Z', storyPoints: 5, cycleTimeDays: 3 },
                { key: 'RHEM-2', resolutionDate: '2026-09-20T00:00:00Z', storyPoints: 3, cycleTimeDays: 1 }
              ]
            }
          }),
          makePerson({
            accountId: 'acct-2',
            teamIds: ['team-2'],
            resolved: {
              count: 1,
              storyPoints: 2,
              issues: [{ key: 'RHEM-3', resolutionDate: '2026-09-25T00:00:00Z', storyPoints: 2, cycleTimeDays: 5 }]
            }
          })
        ],
        teams: [makeTeam(), makeTeam({ id: 'team-2', name: 'RHEM-QE' })],
        diagnostics: { missingPeople: [], staleCarryForward: [], freshSuccessCount: 2 }
      }
    })
    const projects = mockProjects({ flightctl: { [ARTIFACT_KEY]: { value: envelope } } }, { flightctl: makeProfile('flightctl') })

    const { status, model } = readProjectTrends(projects, 'flightctl')

    expect(status).toBe(200)
    expect(model.projectId).toBe('flightctl')
    expect(model.availability).toBe('available')
    expect(model.reason).toBeNull()
    expect(model.github).toBeNull()
    expect(model.gitlab).toBeNull()
    expect(model.jira['2026-09']).toEqual({
      resolved: 3,
      points: 10,
      avgCycleTimeDays: 3,
      byTeam: {
        'flightctl::team-1': { resolved: 2, points: 8, avgCycleTimeDays: 2 },
        'flightctl::team-2': { resolved: 1, points: 2, avgCycleTimeDays: 5 }
      }
    })
  })

  it('reports empty availability when the publication has no people', () => {
    const envelope = makeEnvelope('flightctl', {
      state: 'empty',
      data: { projectId: 'flightctl', personCount: 0, people: [], teams: [], diagnostics: { missingPeople: [], staleCarryForward: [], freshSuccessCount: 0 } }
    })
    const projects = mockProjects({ flightctl: { [ARTIFACT_KEY]: { value: envelope } } }, { flightctl: makeProfile('flightctl') })

    const { model } = readProjectTrends(projects, 'flightctl')

    expect(model.availability).toBe('empty')
    expect(model.reason).toBe('no-published-people')
    expect(model.jira).toEqual({})
  })

  it('passes through the publication-level partial flag', () => {
    const envelope = makeEnvelope('flightctl', { partial: true })
    const projects = mockProjects({ flightctl: { [ARTIFACT_KEY]: { value: envelope } } }, { flightctl: makeProfile('flightctl') })

    const { model } = readProjectTrends(projects, 'flightctl')

    expect(model.partial).toBe(true)
  })

  it('marks the result partial when the status sidecar confirms the current profile\'s latest collection failed', () => {
    const envelope = makeEnvelope('flightctl')
    const projects = mockProjects({ flightctl: { [ARTIFACT_KEY]: { value: envelope } } }, { flightctl: makeProfile('flightctl') })
    const readFromStorage = mockReadFromStorage({
      [statusSidecarKey('flightctl')]: { projectId: 'flightctl', profileRevision: 'rev', artifactKey: ARTIFACT_KEY, state: 'error' }
    })

    const { status, model } = readProjectTrends(projects, 'flightctl', readFromStorage)

    expect(status).toBe(200)
    expect(model.availability).toBe('available')
    expect(model.partial).toBe(true)
  })

  it('ignores a status sidecar for a different profile revision', () => {
    const envelope = makeEnvelope('flightctl')
    const projects = mockProjects({ flightctl: { [ARTIFACT_KEY]: { value: envelope } } }, { flightctl: makeProfile('flightctl') })
    const readFromStorage = mockReadFromStorage({
      [statusSidecarKey('flightctl')]: { projectId: 'flightctl', profileRevision: 'stale-rev', artifactKey: ARTIFACT_KEY, state: 'error' }
    })

    const { model } = readProjectTrends(projects, 'flightctl', readFromStorage)

    expect(model.partial).toBe(false)
  })

  it('ignores a status sidecar that does not report a collection error', () => {
    const envelope = makeEnvelope('flightctl')
    const projects = mockProjects({ flightctl: { [ARTIFACT_KEY]: { value: envelope } } }, { flightctl: makeProfile('flightctl') })
    const readFromStorage = mockReadFromStorage({
      [statusSidecarKey('flightctl')]: { projectId: 'flightctl', profileRevision: 'rev', artifactKey: ARTIFACT_KEY, state: 'supported' }
    })

    const { model } = readProjectTrends(projects, 'flightctl', readFromStorage)

    expect(model.partial).toBe(false)
  })

  it('does not require a status sidecar reader (backward compatible)', () => {
    const envelope = makeEnvelope('flightctl')
    const projects = mockProjects({ flightctl: { [ARTIFACT_KEY]: { value: envelope } } }, { flightctl: makeProfile('flightctl') })

    const { model } = readProjectTrends(projects, 'flightctl')

    expect(model.partial).toBe(false)
  })

  it('surfaces a status sidecar read failure as an error rather than ignoring it', () => {
    const envelope = makeEnvelope('flightctl')
    const projects = mockProjects({ flightctl: { [ARTIFACT_KEY]: { value: envelope } } }, { flightctl: makeProfile('flightctl') })
    const readFromStorage = () => { throw new Error('storage unavailable') }

    const { status, error } = readProjectTrends(projects, 'flightctl', readFromStorage)

    expect(status).toBe(502)
    expect(error).toMatch(/storage unavailable/)
  })

  it.each(['missing-publication'])('degrades to unavailable when the publication is absent', (expectedReason) => {
    const projects = mockProjects({}, { flightctl: makeProfile('flightctl') })

    const { status, model } = readProjectTrends(projects, 'flightctl')

    expect(status).toBe(200)
    expect(model.availability).toBe('unavailable')
    expect(model.reason).toBe(expectedReason)
    expect(model.jira).toBeNull()
    expect(model.github).toBeNull()
    expect(model.gitlab).toBeNull()
  })

  it.each(['inapplicable', 'disabled', 'unavailable', 'error'])(
    'degrades to unavailable with the publication state as the reason: %s',
    (state) => {
      const envelope = makeEnvelope('flightctl', { state, data: null })
      const projects = mockProjects({ flightctl: { [ARTIFACT_KEY]: { value: envelope } } }, { flightctl: makeProfile('flightctl') })

      const { status, model } = readProjectTrends(projects, 'flightctl')

      expect(status).toBe(200)
      expect(model.availability).toBe('unavailable')
      expect(model.reason).toBe(state)
      expect(model.publicationState).toBe(state)
    }
  )

  it.each(['expired', 'unknown'])('distrusts stale/untrusted freshness: %s', (freshness) => {
    const envelope = makeEnvelope('flightctl', { freshness })
    const projects = mockProjects({ flightctl: { [ARTIFACT_KEY]: { value: envelope } } }, { flightctl: makeProfile('flightctl') })

    const { model } = readProjectTrends(projects, 'flightctl')

    expect(model.availability).toBe('unavailable')
    expect(model.reason).toBe('publication-not-fresh')
  })

  it('uses stale (last-known-good) data rather than distrusting it', () => {
    const envelope = makeEnvelope('flightctl', { freshness: 'stale' })
    const projects = mockProjects({ flightctl: { [ARTIFACT_KEY]: { value: envelope } } }, { flightctl: makeProfile('flightctl') })

    const { model } = readProjectTrends(projects, 'flightctl')

    expect(model.availability).toBe('available')
    expect(model.publicationState).toBe('supported')
    expect(model.jira).toEqual({})
  })

  it('rejects a publication whose top-level projectId does not match the request', () => {
    const envelope = makeEnvelope('flightctl')
    const projects = mockProjects({ flightctl: { [ARTIFACT_KEY]: { value: { ...envelope, projectId: 'osac' } } } }, { flightctl: makeProfile('flightctl') })

    const { status, error } = readProjectTrends(projects, 'flightctl')

    expect(status).toBe(502)
    expect(error).toMatch(/identity mismatch/)
  })

  it('rejects a publication whose nested data.projectId does not match the request', () => {
    const envelope = makeEnvelope('flightctl')
    envelope.data.projectId = 'osac'
    const projects = mockProjects({ flightctl: { [ARTIFACT_KEY]: { value: envelope } } }, { flightctl: makeProfile('flightctl') })

    const { status, error } = readProjectTrends(projects, 'flightctl')

    expect(status).toBe(502)
    expect(error).toMatch(/identity mismatch/)
  })

  it('rejects a mismatched schemaVersion', () => {
    const envelope = makeEnvelope('flightctl', { schemaVersion: 2 })
    const projects = mockProjects({ flightctl: { [ARTIFACT_KEY]: { value: envelope } } }, { flightctl: makeProfile('flightctl') })

    const { status, error } = readProjectTrends(projects, 'flightctl')

    expect(status).toBe(502)
    expect(error).toMatch(/identity mismatch/)
  })

  it.each([
    ['missing accountId', { accountId: undefined }],
    ['non-array teamIds', { teamIds: 'team-1' }],
    ['non-string teamIds entry', { teamIds: ['team-1', null] }],
    ['empty-string teamIds entry', { teamIds: ['team-1', ''] }],
    ['duplicate teamIds entries', { teamIds: ['team-1', 'team-1'] }],
    ['missing resolved', { resolved: undefined }],
    ['missing inProgress', { inProgress: undefined }],
    ['missing cycleTime', { cycleTime: undefined }]
  ])('rejects a malformed person record: %s', (_label, overrides) => {
    const person = { ...makePerson(), ...overrides }
    const envelope = makeEnvelope('flightctl', {
      data: { projectId: 'flightctl', personCount: 1, people: [person], teams: [makeTeam()], diagnostics: { missingPeople: [], staleCarryForward: [], freshSuccessCount: 1 } }
    })
    const projects = mockProjects({ flightctl: { [ARTIFACT_KEY]: { value: envelope } } }, { flightctl: makeProfile('flightctl') })

    const { status, error } = readProjectTrends(projects, 'flightctl')

    expect(status).toBe(502)
    expect(error).toMatch(/Invalid project Jira metrics publication/)
  })

  it('rejects duplicate accountIds', () => {
    const envelope = makeEnvelope('flightctl', {
      data: {
        projectId: 'flightctl',
        personCount: 2,
        people: [makePerson(), makePerson()],
        teams: [makeTeam()],
        diagnostics: { missingPeople: [], staleCarryForward: [], freshSuccessCount: 2 }
      }
    })
    const projects = mockProjects({ flightctl: { [ARTIFACT_KEY]: { value: envelope } } }, { flightctl: makeProfile('flightctl') })

    const { status, error } = readProjectTrends(projects, 'flightctl')

    expect(status).toBe(502)
    expect(error).toMatch(/Invalid project Jira metrics publication/)
  })

  it('rejects duplicate team ids', () => {
    const envelope = makeEnvelope('flightctl', {
      data: {
        projectId: 'flightctl',
        personCount: 1,
        people: [makePerson()],
        teams: [makeTeam(), makeTeam()],
        diagnostics: { missingPeople: [], staleCarryForward: [], freshSuccessCount: 1 }
      }
    })
    const projects = mockProjects({ flightctl: { [ARTIFACT_KEY]: { value: envelope } } }, { flightctl: makeProfile('flightctl') })

    const { status, error } = readProjectTrends(projects, 'flightctl')

    expect(status).toBe(502)
    expect(error).toMatch(/Invalid project Jira metrics publication/)
  })

  it('never joins a publication from one project into a response for another (isolation)', () => {
    const flightctlEnvelope = makeEnvelope('flightctl')
    const osacEnvelope = makeEnvelope('osac', {
      data: {
        projectId: 'osac',
        personCount: 1,
        people: [makePerson({ accountId: 'osac-secret-acct' })],
        teams: [makeTeam({ id: 'osac-secret-team' })],
        diagnostics: { missingPeople: [], staleCarryForward: [], freshSuccessCount: 1 }
      }
    })
    const projects = mockProjects(
      { flightctl: { [ARTIFACT_KEY]: { value: flightctlEnvelope } }, osac: { [ARTIFACT_KEY]: { value: osacEnvelope } } },
      { flightctl: makeProfile('flightctl'), osac: makeProfile('osac') }
    )

    const { model } = readProjectTrends(projects, 'flightctl')

    expect(JSON.stringify(model)).not.toContain('osac-secret')
  })

  it('attributes a multi-team person to each of their teams without duplicating the overall total', () => {
    const envelope = makeEnvelope('flightctl', {
      data: {
        projectId: 'flightctl',
        personCount: 1,
        people: [
          makePerson({
            accountId: 'acct-1',
            teamIds: ['team-1', 'team-2'],
            resolved: {
              count: 1,
              storyPoints: 5,
              issues: [{ key: 'RHEM-1', resolutionDate: '2026-09-15T00:00:00Z', storyPoints: 5, cycleTimeDays: 4 }]
            }
          })
        ],
        teams: [makeTeam(), makeTeam({ id: 'team-2', name: 'RHEM-QE' })],
        diagnostics: { missingPeople: [], staleCarryForward: [], freshSuccessCount: 1 }
      }
    })
    const projects = mockProjects({ flightctl: { [ARTIFACT_KEY]: { value: envelope } } }, { flightctl: makeProfile('flightctl') })

    const { model } = readProjectTrends(projects, 'flightctl')

    expect(model.jira['2026-09'].resolved).toBe(1);
    expect(model.jira['2026-09'].points).toBe(5);
    expect(model.jira['2026-09'].byTeam).toEqual({
      'flightctl::team-1': { resolved: 1, points: 5, avgCycleTimeDays: 4 },
      'flightctl::team-2': { resolved: 1, points: 5, avgCycleTimeDays: 4 }
    })
  })

  it('returns 404 for an unknown project', () => {
    const projects = mockProjects({}, {})

    const { status, error } = readProjectTrends(projects, 'flightctl')

    expect(status).toBe(404)
    expect(error).toBe('Unknown project')
  })

  it('returns 400 for an invalid project id', () => {
    const projects = mockProjects({}, { flightctl: makeProfile('flightctl') })

    const { status, error } = readProjectTrends(projects, '')

    expect(status).toBe(400)
    expect(error).toMatch(/Invalid project id/)
  })

  it('returns 503 when the project publication reader is unavailable', () => {
    const { status, error } = readProjectTrends(null, 'flightctl')

    expect(status).toBe(503)
    expect(error).toMatch(/unavailable/)
  })
})

describe('readProjectTeamMetrics', () => {
  it('builds the aggregate model for a published team', () => {
    const envelope = makeEnvelope('flightctl', {
      data: {
        projectId: 'flightctl',
        personCount: 1,
        people: [makePerson()],
        teams: [makeTeam({
          memberCount: 3,
          resolved: { count: 5, storyPoints: 13 },
          inProgress: { count: 2, storyPoints: 3 },
          cycleTime: { avgDays: 2.5, medianDays: 2 },
          partial: true
        })],
        diagnostics: { missingPeople: [], staleCarryForward: [], freshSuccessCount: 1 }
      }
    })
    const projects = mockProjects({ flightctl: { [ARTIFACT_KEY]: { value: envelope } } }, { flightctl: makeProfile('flightctl') })

    const { status, model } = readProjectTeamMetrics(projects, 'flightctl', 'team-1')

    expect(status).toBe(200)
    expect(model).toEqual({
      teamKey: 'flightctl::team-1',
      available: true,
      memberCount: 3,
      aggregate: { resolvedCount: 5, resolvedPoints: 13, inProgressCount: 2, avgCycleTimeDays: 2.5 },
      partial: true
    })
  })

  it('marks the team result partial when the status sidecar confirms the current profile\'s latest collection failed', () => {
    const envelope = makeEnvelope('flightctl', {
      data: {
        projectId: 'flightctl',
        personCount: 1,
        people: [makePerson()],
        teams: [makeTeam({ partial: false })],
        diagnostics: { missingPeople: [], staleCarryForward: [], freshSuccessCount: 1 }
      }
    })
    const projects = mockProjects({ flightctl: { [ARTIFACT_KEY]: { value: envelope } } }, { flightctl: makeProfile('flightctl') })
    const readFromStorage = mockReadFromStorage({
      [statusSidecarKey('flightctl')]: { projectId: 'flightctl', profileRevision: 'rev', artifactKey: ARTIFACT_KEY, state: 'error' }
    })

    const { model } = readProjectTeamMetrics(projects, 'flightctl', 'team-1', readFromStorage)

    expect(model.available).toBe(true)
    expect(model.partial).toBe(true)
  })

  it('returns 404 when the team is not present in the publication', () => {
    const envelope = makeEnvelope('flightctl')
    const projects = mockProjects({ flightctl: { [ARTIFACT_KEY]: { value: envelope } } }, { flightctl: makeProfile('flightctl') })

    const { status, error } = readProjectTeamMetrics(projects, 'flightctl', 'nonexistent-team')

    expect(status).toBe(404)
    expect(error).toMatch(/not found/)
  })

  it.each(['inapplicable', 'disabled', 'unavailable', 'error'])(
    'degrades to an unavailable, non-fabricated model: %s',
    (state) => {
      const envelope = makeEnvelope('flightctl', { state, data: null })
      const projects = mockProjects({ flightctl: { [ARTIFACT_KEY]: { value: envelope } } }, { flightctl: makeProfile('flightctl') })

      const { status, model } = readProjectTeamMetrics(projects, 'flightctl', 'team-1')

      expect(status).toBe(200)
      expect(model).toEqual({
        teamKey: 'flightctl::team-1',
        available: false,
        reason: state,
        publicationState: state,
        generatedAt: '2026-10-14T00:00:00Z',
        partial: false
      })
    }
  )

  it('degrades to unavailable when the publication is missing entirely', () => {
    const projects = mockProjects({}, { flightctl: makeProfile('flightctl') })

    const { status, model } = readProjectTeamMetrics(projects, 'flightctl', 'team-1')

    expect(status).toBe(200)
    expect(model.available).toBe(false)
    expect(model.reason).toBe('missing-publication')
  })

  it('rejects a publication whose top-level projectId does not match the request', () => {
    const envelope = makeEnvelope('flightctl')
    const projects = mockProjects({ flightctl: { [ARTIFACT_KEY]: { value: { ...envelope, projectId: 'osac' } } } }, { flightctl: makeProfile('flightctl') })

    const { status, error } = readProjectTeamMetrics(projects, 'flightctl', 'team-1')

    expect(status).toBe(502)
    expect(error).toMatch(/identity mismatch/)
  })

  it('rejects a publication whose nested data.projectId does not match the request', () => {
    const envelope = makeEnvelope('flightctl')
    envelope.data.projectId = 'osac'
    const projects = mockProjects({ flightctl: { [ARTIFACT_KEY]: { value: envelope } } }, { flightctl: makeProfile('flightctl') })

    const { status, error } = readProjectTeamMetrics(projects, 'flightctl', 'team-1')

    expect(status).toBe(502)
    expect(error).toMatch(/identity mismatch/)
  })

  it('never joins a team from one project into a response for another (isolation)', () => {
    const flightctlEnvelope = makeEnvelope('flightctl')
    const osacEnvelope = makeEnvelope('osac', {
      data: {
        projectId: 'osac',
        personCount: 1,
        people: [makePerson({ accountId: 'osac-secret-acct' })],
        teams: [makeTeam({ id: 'team-1', name: 'osac-secret-team' })],
        diagnostics: { missingPeople: [], staleCarryForward: [], freshSuccessCount: 1 }
      }
    })
    const projects = mockProjects(
      { flightctl: { [ARTIFACT_KEY]: { value: flightctlEnvelope } }, osac: { [ARTIFACT_KEY]: { value: osacEnvelope } } },
      { flightctl: makeProfile('flightctl'), osac: makeProfile('osac') }
    )

    const { model } = readProjectTeamMetrics(projects, 'flightctl', 'team-1')

    expect(JSON.stringify(model)).not.toContain('osac-secret')
  })
})

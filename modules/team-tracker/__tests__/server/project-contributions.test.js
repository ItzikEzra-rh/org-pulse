/**
 * Project-qualified GitHub contribution reads: joins by (projectId, accountId),
 * never falls back to the legacy OSAC caches, and reports carried-forward /
 * stale / unresolved data honestly instead of flattening it to zero.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  readProjectContributions,
  readProjectContributionsTrends,
  readProjectTeamContributions,
  ARTIFACT_KEY,
  PUBLICATION_STATUS_KEY
} from '../../server/project-contributions.js'

function mockProjects(publications = {}, profiles = {}) {
  return {
    get: projectId => profiles[projectId] || null,
    readArtifact: (projectId, key) => publications[projectId]?.[key] || null
  }
}

function makeProfile(projectId) {
  return { projectId, displayName: projectId === 'flightctl' ? 'Flight Control' : 'OSAC', profileRevision: 'rev' }
}

function githubRecord(username, total, months = { '2026-09': 5, '2026-10': 0 }) {
  return { username, totalContributions: total, months, fetchedAt: '2026-10-15T07:00:00Z' }
}

function makeEnvelope(projectId, overrides = {}) {
  const { data: dataOverrides, ...envelopeOverrides } = overrides
  return {
    schemaVersion: 1,
    projectId,
    profileRevision: 'rev',
    artifactKey: ARTIFACT_KEY,
    source: { id: 'github-contributions', kind: 'github-contributions' },
    generatedAt: '2026-10-15T07:00:00Z',
    fetchedAt: '2026-10-15T07:00:00Z',
    state: 'supported',
    freshness: 'fresh',
    partial: false,
    error: null,
    data: {
      projectId,
      personCount: 3,
      resolvedCount: 2,
      metric: { name: 'githubContributionCalendar', scope: 'github-wide', unit: 'contributionCount', buckets: 'month' },
      people: [
        { accountId: 'acc-1', displayName: 'Ada', active: true, teamIds: ['t1'], github: githubRecord('ada-gh', 10), gitlab: null },
        { accountId: 'acc-2', displayName: 'Alan', active: true, teamIds: ['t1'], github: githubRecord('alan-gh', 11), gitlab: null },
        { accountId: 'acc-3', displayName: 'No Identity', active: true, teamIds: ['t1'], github: null, gitlab: null }
      ],
      diagnostics: {
        unresolvedIdentities: ['acc-3'],
        identityConflicts: [],
        carriedForward: [],
        failedFetch: [],
        gitlab: { state: 'unavailable', reason: 'no reusable GitLab contribution collector' }
      },
      ...dataOverrides
    },
    ...envelopeOverrides
  }
}

describe('readProjectContributions', () => {
  let publications
  let profiles

  beforeEach(() => {
    publications = {
      flightctl: { [ARTIFACT_KEY]: { value: makeEnvelope('flightctl') } }
    }
    profiles = { flightctl: makeProfile('flightctl'), osac: makeProfile('osac') }
  })

  it('joins contributions by accountId and keeps a stable per-person shape', () => {
    const result = readProjectContributions(mockProjects(publications, profiles), 'flightctl')
    expect(result.status).toBe(200)
    expect(result.model.projectId).toBe('flightctl')
    expect(result.model.availability).toBe('available')
    expect(result.model.freshness).toBe('fresh')
    const ada = result.model.people.find(p => p.accountId === 'acc-1')
    expect(ada).toEqual({
      key: 'flightctl::acc-1',
      projectId: 'flightctl',
      accountId: 'acc-1',
      displayName: 'Ada',
      active: true,
      teamIds: ['t1'],
      github: { username: 'ada-gh', totalContributions: 10, months: { '2026-09': 5, '2026-10': 0 }, fetchedAt: '2026-10-15T07:00:00Z' },
      gitlab: null,
      contributionStatus: 'collected'
    })
  })

  it('treats a person with no resolved identity as missing, never zero', () => {
    const result = readProjectContributions(mockProjects(publications, profiles), 'flightctl')
    const noId = result.model.people.find(p => p.accountId === 'acc-3')
    expect(noId.github).toBeNull()
    expect(noId.contributionStatus).toBe('unresolved')
    expect(result.model.diagnostics.unresolvedIdentities).toEqual(['acc-3'])
  })

  it('preserves GitHub-wide monthly counts and total for a resolved person', () => {
    publications.flightctl[ARTIFACT_KEY].value = makeEnvelope('flightctl', {
      data: {
        people: [
          { accountId: 'acc-1', displayName: 'Ada', active: true, teamIds: ['t1'],
            github: githubRecord('ada-gh', 42, { '2026-08': 12, '2026-09': 30 }), gitlab: null }
        ]
      }
    })
    const result = readProjectContributions(mockProjects(publications, profiles), 'flightctl')
    const ada = result.model.people[0]
    expect(ada.github.totalContributions).toBe(42)
    expect(ada.github.months).toEqual({ '2026-08': 12, '2026-09': 30 })
  })

  it('never fabricates GitLab data: gitlab is always null', () => {
    const result = readProjectContributions(mockProjects(publications, profiles), 'flightctl')
    expect(result.model.people.every(p => p.gitlab === null)).toBe(true)
    expect(result.model.diagnostics.gitlab.state).toBe('unavailable')
  })

  it('badges a carried-forward person as stale but still serves the last-known-good value', () => {
    publications.flightctl[ARTIFACT_KEY].value = makeEnvelope('flightctl', {
      freshness: 'stale',
      partial: true,
      data: {
        people: [
          { accountId: 'acc-1', displayName: 'Ada', active: true, teamIds: ['t1'], github: githubRecord('ada-gh', 10), gitlab: null }
        ],
        diagnostics: { unresolvedIdentities: [], identityConflicts: [], carriedForward: ['acc-1'], failedFetch: [], gitlab: { state: 'unavailable' } }
      }
    })
    const result = readProjectContributions(mockProjects(publications, profiles), 'flightctl')
    expect(result.model.freshness).toBe('stale')
    expect(result.model.partial).toBe(true)
    const ada = result.model.people[0]
    expect(ada.github.totalContributions).toBe(10)
    expect(ada.contributionStatus).toBe('carried-forward')
  })

  it('reports a failed-fetch person as failed with no fabricated value', () => {
    publications.flightctl[ARTIFACT_KEY].value = makeEnvelope('flightctl', {
      freshness: 'stale',
      partial: true,
      data: {
        people: [
          { accountId: 'acc-2', displayName: 'Alan', active: true, teamIds: ['t1'], github: null, gitlab: null }
        ],
        diagnostics: { unresolvedIdentities: [], identityConflicts: [], carriedForward: [], failedFetch: ['acc-2'], gitlab: { state: 'unavailable' } }
      }
    })
    const result = readProjectContributions(mockProjects(publications, profiles), 'flightctl')
    const alan = result.model.people[0]
    expect(alan.github).toBeNull()
    expect(alan.contributionStatus).toBe('failed')
  })

  it('surfaces an identity collision as conflicted without attributing it to either account', () => {
    publications.flightctl[ARTIFACT_KEY].value = makeEnvelope('flightctl', {
      data: {
        people: [
          { accountId: 'acc-1', displayName: 'Ada', active: true, teamIds: ['t1'], github: null, gitlab: null },
          { accountId: 'acc-2', displayName: 'Alan', active: true, teamIds: ['t1'], github: null, gitlab: null }
        ],
        diagnostics: {
          unresolvedIdentities: [],
          identityConflicts: [{ github: 'shared-gh', accountIds: ['acc-1', 'acc-2'] }],
          carriedForward: [], failedFetch: [], gitlab: { state: 'unavailable' }
        }
      }
    })
    const result = readProjectContributions(mockProjects(publications, profiles), 'flightctl')
    expect(result.model.people.every(p => p.contributionStatus === 'conflicted')).toBe(true)
    expect(result.model.people.every(p => p.github === null)).toBe(true)
    expect(result.model.diagnostics.identityConflicts).toEqual([{ github: 'shared-gh', accountIds: ['acc-1', 'acc-2'] }])
  })

  it('never attributes a github object to a conflicted identity, leaving valid identities intact', () => {
    publications.flightctl[ARTIFACT_KEY].value = makeEnvelope('flightctl', {
      data: {
        people: [
          { accountId: 'acc-1', displayName: 'Ada', active: true, teamIds: ['t1'], github: githubRecord('shared-gh', 99), gitlab: null },
          { accountId: 'acc-2', displayName: 'Alan', active: true, teamIds: ['t1'], github: githubRecord('shared-gh', 77), gitlab: null },
          { accountId: 'acc-3', displayName: 'Grace', active: true, teamIds: ['t1'], github: githubRecord('grace-gh', 5), gitlab: null }
        ],
        diagnostics: {
          unresolvedIdentities: [],
          identityConflicts: [{ github: 'shared-gh', accountIds: ['acc-1', 'acc-2'] }],
          carriedForward: [], failedFetch: [], gitlab: { state: 'unavailable' }
        }
      }
    })
    const result = readProjectContributions(mockProjects(publications, profiles), 'flightctl')
    const byId = id => result.model.people.find(p => p.accountId === id)
    expect(byId('acc-1').github).toBeNull()
    expect(byId('acc-1').contributionStatus).toBe('conflicted')
    expect(byId('acc-2').github).toBeNull()
    expect(byId('acc-2').contributionStatus).toBe('conflicted')
    // An unrelated, uncontested identity keeps its contributions.
    expect(byId('acc-3').github.totalContributions).toBe(5)
    expect(byId('acc-3').contributionStatus).toBe('collected')
  })

  it('normalizes github totals: a genuine zero stays zero; missing, null and invalid become null', () => {
    publications.flightctl[ARTIFACT_KEY].value = makeEnvelope('flightctl', {
      data: {
        people: [
          { accountId: 'zero', displayName: 'Zero', active: true, teamIds: ['t1'], github: githubRecord('zero-gh', 0), gitlab: null },
          { accountId: 'missing', displayName: 'Missing', active: true, teamIds: ['t1'], github: { username: 'missing-gh', months: {}, fetchedAt: null }, gitlab: null },
          { accountId: 'nullish', displayName: 'Null', active: true, teamIds: ['t1'], github: { username: 'null-gh', totalContributions: null, months: {}, fetchedAt: null }, gitlab: null },
          { accountId: 'invalid', displayName: 'Invalid', active: true, teamIds: ['t1'], github: { username: 'invalid-gh', totalContributions: 'NaN', months: {}, fetchedAt: null }, gitlab: null }
        ],
        diagnostics: { unresolvedIdentities: [], identityConflicts: [], carriedForward: [], failedFetch: [], gitlab: { state: 'unavailable' } }
      }
    })
    const result = readProjectContributions(mockProjects(publications, profiles), 'flightctl')
    const total = id => result.model.people.find(p => p.accountId === id).github.totalContributions
    expect(total('zero')).toBe(0)
    expect(total('missing')).toBeNull()
    expect(total('nullish')).toBeNull()
    expect(total('invalid')).toBeNull()
  })

  it('requires both github and gitlab to be present: rejects an omitted github', () => {
    publications.flightctl[ARTIFACT_KEY].value = makeEnvelope('flightctl', {
      data: { people: [{ accountId: 'acc-1', displayName: 'Ada', active: true, teamIds: ['t1'], gitlab: null }] }
    })
    const result = readProjectContributions(mockProjects(publications, profiles), 'flightctl')
    expect(result.status).toBe(502)
  })

  it('requires both github and gitlab to be present: rejects an omitted gitlab', () => {
    publications.flightctl[ARTIFACT_KEY].value = makeEnvelope('flightctl', {
      data: { people: [{ accountId: 'acc-1', displayName: 'Ada', active: true, teamIds: ['t1'], github: null }] }
    })
    const result = readProjectContributions(mockProjects(publications, profiles), 'flightctl')
    expect(result.status).toBe(502)
  })

  it('accepts github: null as an unavailable measurement on an otherwise valid record', () => {
    publications.flightctl[ARTIFACT_KEY].value = makeEnvelope('flightctl', {
      data: {
        people: [{ accountId: 'acc-1', displayName: 'Ada', active: true, teamIds: ['t1'], github: null, gitlab: null }],
        diagnostics: { unresolvedIdentities: ['acc-1'], identityConflicts: [], carriedForward: [], failedFetch: [], gitlab: { state: 'unavailable' } }
      }
    })
    const result = readProjectContributions(mockProjects(publications, profiles), 'flightctl')
    expect(result.status).toBe(200)
    expect(result.model.people[0].github).toBeNull()
  })

  it('downgrades freshness to stale when a pending failed re-collection status sidecar is present', () => {
    publications.flightctl[PUBLICATION_STATUS_KEY] = {
      value: {
        schemaVersion: 1, projectId: 'flightctl', artifactKey: ARTIFACT_KEY,
        state: 'error', freshness: 'stale', partial: true,
        error: { code: 'GITHUB_CONTRIBUTION_FETCH_FAILED', message: 'boom' }
      }
    }
    const result = readProjectContributions(mockProjects(publications, profiles), 'flightctl')
    expect(result.model.freshness).toBe('stale')
    expect(result.model.publicationError).toEqual({ code: 'GITHUB_CONTRIBUTION_FETCH_FAILED', message: 'boom' })
    // The prior good values are still served.
    expect(result.model.people.find(p => p.accountId === 'acc-1').github.totalContributions).toBe(10)
  })

  it('downgrades freshness to stale when the artifact predates the current profile revision', () => {
    profiles.flightctl = { ...profiles.flightctl, profileRevision: 'newer-rev' }
    const result = readProjectContributions(mockProjects(publications, profiles), 'flightctl')
    expect(result.model.freshness).toBe('stale')
    // Still served as the best available data, not hidden as unavailable.
    expect(result.model.availability).toBe('available')
    expect(result.model.people.find(p => p.accountId === 'acc-1').github.totalContributions).toBe(10)
  })

  it('ignores a status sidecar that belongs to a different artifact', () => {
    publications.flightctl[PUBLICATION_STATUS_KEY] = {
      value: { schemaVersion: 1, projectId: 'flightctl', artifactKey: 'sources/roster/registry.json', state: 'error', error: { code: 'X' } }
    }
    const result = readProjectContributions(mockProjects(publications, profiles), 'flightctl')
    expect(result.model.freshness).toBe('fresh')
    expect(result.model.publicationError).toBeNull()
  })

  it('reports an empty-state publication as empty, not unavailable', () => {
    publications.flightctl[ARTIFACT_KEY].value = makeEnvelope('flightctl', {
      state: 'empty',
      data: { personCount: 0, resolvedCount: 0, people: [], diagnostics: { unresolvedIdentities: [], identityConflicts: [], carriedForward: [], failedFetch: [], gitlab: { state: 'unavailable' } } }
    })
    const result = readProjectContributions(mockProjects(publications, profiles), 'flightctl')
    expect(result.status).toBe(200)
    expect(result.model.availability).toBe('empty')
    expect(result.model.reason).toBe('no-roster-people')
  })

  it('rejects a cross-project publication for the requested projectId without leaking data', () => {
    publications.flightctl[ARTIFACT_KEY].value = makeEnvelope('osac')
    const result = readProjectContributions(mockProjects(publications, profiles), 'flightctl')
    expect(result.status).toBe(502)
    expect(result.error).toBe('Project contributions publication identity mismatch')
  })

  it('rejects a publication whose data.projectId disagrees with the envelope', () => {
    publications.flightctl[ARTIFACT_KEY].value.data.projectId = 'osac'
    const result = readProjectContributions(mockProjects(publications, profiles), 'flightctl')
    expect(result.status).toBe(502)
  })

  it('rejects duplicate accountIds', () => {
    publications.flightctl[ARTIFACT_KEY].value = makeEnvelope('flightctl', {
      data: {
        people: [
          { accountId: 'acc-1', displayName: 'Ada', active: true, teamIds: ['t1'], github: null, gitlab: null },
          { accountId: 'acc-1', displayName: 'Ada again', active: true, teamIds: ['t1'], github: null, gitlab: null }
        ]
      }
    })
    const result = readProjectContributions(mockProjects(publications, profiles), 'flightctl')
    expect(result.status).toBe(502)
  })

  it('rejects a person whose gitlab field is fabricated (non-null)', () => {
    publications.flightctl[ARTIFACT_KEY].value = makeEnvelope('flightctl', {
      data: {
        people: [
          { accountId: 'acc-1', displayName: 'Ada', active: true, teamIds: ['t1'], github: null, gitlab: { username: 'nope' } }
        ]
      }
    })
    const result = readProjectContributions(mockProjects(publications, profiles), 'flightctl')
    expect(result.status).toBe(502)
  })

  it('reports a non-supported publication state as unavailable with a stable shape', () => {
    publications.flightctl[ARTIFACT_KEY].value.state = 'error'
    const result = readProjectContributions(mockProjects(publications, profiles), 'flightctl')
    expect(result.status).toBe(200)
    expect(result.model.availability).toBe('unavailable')
    expect(result.model.reason).toBe('publication-not-supported')
    expect(result.model.people).toEqual([])
  })

  it('reports a never-published project as unavailable (200), never falling back to a legacy cache', () => {
    const result = readProjectContributions(mockProjects({}, profiles), 'osac')
    expect(result.status).toBe(200)
    expect(result.model.availability).toBe('unavailable')
    expect(result.model.reason).toBe('not-collected')
    expect(result.model.publicationState).toBeNull()
    expect(result.model.people).toEqual([])
  })

  it('rejects an unknown project', () => {
    const result = readProjectContributions(mockProjects(publications, profiles), 'nonexistent')
    expect(result.status).toBe(404)
    expect(result.error).toBe('Unknown project')
  })

  it('rejects a malformed project id', () => {
    expect(readProjectContributions(mockProjects(publications, profiles), '').status).toBe(400)
  })

  it('reports a missing reader as unavailable (503)', () => {
    expect(readProjectContributions(null, 'flightctl').status).toBe(503)
  })
})

describe('readProjectContributionsTrends', () => {
  let publications
  let profiles

  beforeEach(() => {
    publications = {
      flightctl: { [ARTIFACT_KEY]: { value: makeEnvelope('flightctl') } }
    }
    profiles = { flightctl: makeProfile('flightctl') }
  })

  it('buckets monthly totals overall and per team, keyed by projectId::teamId', () => {
    const result = readProjectContributionsTrends(mockProjects(publications, profiles), 'flightctl')
    expect(result.status).toBe(200)
    expect(result.model.availability).toBe('available')
    // acc-1 and acc-2 are both on t1 with default months {09:5, 10:0} -> summed.
    expect(result.model.overall).toEqual({ '2026-09': 10, '2026-10': 0 })
    expect(result.model.byTeam).toEqual({ 'flightctl::t1': { '2026-09': 10, '2026-10': 0 } })
  })

  it('credits a multi-team member to every team they belong to, without inflating the overall total', () => {
    publications.flightctl[ARTIFACT_KEY].value = makeEnvelope('flightctl', {
      data: {
        people: [
          { accountId: 'acc-1', displayName: 'Ada', active: true, teamIds: ['t1', 't2'], github: githubRecord('ada-gh', 10, { '2026-09': 7 }), gitlab: null }
        ]
      }
    })
    const result = readProjectContributionsTrends(mockProjects(publications, profiles), 'flightctl')
    expect(result.model.overall).toEqual({ '2026-09': 7 })
    expect(result.model.byTeam).toEqual({
      'flightctl::t1': { '2026-09': 7 },
      'flightctl::t2': { '2026-09': 7 }
    })
  })

  it('excludes a person with no github data from the series, rather than charting a fabricated zero month', () => {
    publications.flightctl[ARTIFACT_KEY].value = makeEnvelope('flightctl', {
      data: {
        people: [
          { accountId: 'acc-1', displayName: 'No Identity', active: true, teamIds: ['t1'], github: null, gitlab: null }
        ]
      }
    })
    const result = readProjectContributionsTrends(mockProjects(publications, profiles), 'flightctl')
    expect(result.model.overall).toEqual({})
    expect(result.model.byTeam).toEqual({})
  })

  it('reports unavailable with null series when the publication has never been collected', () => {
    const result = readProjectContributionsTrends(mockProjects({}, profiles), 'flightctl')
    expect(result.status).toBe(200)
    expect(result.model.availability).toBe('unavailable')
    expect(result.model.overall).toBeNull()
    expect(result.model.byTeam).toBeNull()
  })
})

describe('readProjectTeamContributions', () => {
  let publications
  let profiles

  beforeEach(() => {
    publications = {
      flightctl: { [ARTIFACT_KEY]: { value: makeEnvelope('flightctl') } }
    }
    profiles = { flightctl: makeProfile('flightctl') }
  })

  it('sums contributions for a team, scoped to its own membership in this publication', () => {
    const result = readProjectTeamContributions(mockProjects(publications, profiles), 'flightctl', 't1')
    expect(result.status).toBe(200)
    // acc-1 (10) + acc-2 (11); acc-3 has no resolved identity and is excluded from the total.
    expect(result.model).toMatchObject({ total: 21, memberCount: 3, contributorCount: 2 })
  })

  it('reports null, not a fabricated zero, when the publication is unavailable', () => {
    const result = readProjectTeamContributions(mockProjects({}, profiles), 'flightctl', 't1')
    expect(result.status).toBe(200)
    expect(result.model).toBeNull()
  })

  it('reports null, not a fabricated zero, when the team has no members in this publication', () => {
    const result = readProjectTeamContributions(mockProjects(publications, profiles), 'flightctl', 'nonexistent-team')
    expect(result.status).toBe(200)
    expect(result.model).toBeNull()
  })

  it('reports null, not a fabricated zero, when no team member has a resolved GitHub identity', () => {
    publications.flightctl[ARTIFACT_KEY].value = makeEnvelope('flightctl', {
      data: {
        people: [
          { accountId: 'acc-3', displayName: 'No Identity', active: true, teamIds: ['t1'], github: null, gitlab: null }
        ]
      }
    })
    const result = readProjectTeamContributions(mockProjects(publications, profiles), 'flightctl', 't1')
    expect(result.status).toBe(200)
    expect(result.model).toBeNull()
  })

  it('preserves a genuine zero contribution count instead of treating it as missing', () => {
    publications.flightctl[ARTIFACT_KEY].value = makeEnvelope('flightctl', {
      data: {
        people: [
          { accountId: 'acc-1', displayName: 'Ada', active: true, teamIds: ['t1'], github: githubRecord('ada-gh', 0), gitlab: null }
        ]
      }
    })
    const result = readProjectTeamContributions(mockProjects(publications, profiles), 'flightctl', 't1')
    expect(result.status).toBe(200)
    expect(result.model).toMatchObject({ total: 0, memberCount: 1, contributorCount: 1 })
  })
})

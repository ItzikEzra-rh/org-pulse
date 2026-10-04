/**
 * Project-qualified People and Teams roster reads: an unknown project never
 * falls back to the legacy OSAC roster file; unavailable publications stay
 * truthful.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readProjectRoster } from '../../server/project-roster.js'

function mockProjects(publications = {}, profiles = {}) {
  return {
    get: projectId => profiles[projectId] || null,
    readArtifact: (projectId, key) => publications[projectId]?.[key] || null
  }
}

function makeProfile(projectId) {
  return { projectId, displayName: projectId === 'flightctl' ? 'Flight Control' : 'OSAC', profileRevision: 'rev' }
}

function makeRosterEnvelope(projectId, overrides = {}) {
  return {
    schemaVersion: 1,
    projectId,
    profileRevision: 'rev',
    artifactKey: 'sources/roster/registry.json',
    source: { id: `${projectId}-roster`, kind: 'atlassian-teams' },
    state: 'supported',
    freshness: 'fresh',
    partial: false,
    error: null,
    generatedAt: '2026-09-28T00:00:00Z',
    data: {
      projectId,
      teams: [
        { id: 'team-1', name: 'RHEM-QE', orgKey: projectId },
        { id: 'team-2', name: 'RHEM-DEV', orgKey: projectId }
      ],
      people: [
        { accountId: 'acct-1', displayName: 'Alice', active: true, teamIds: ['team-1', 'team-2'] },
        { accountId: 'acct-2', displayName: 'Bob', active: false, teamIds: ['team-2'] }
      ],
      ...overrides
    }
  }
}

describe('readProjectRoster', () => {
  let publications;
  let profiles;

  beforeEach(() => {
    publications = {
      flightctl: { 'sources/roster/registry.json': { value: makeRosterEnvelope('flightctl') } }
    };
    profiles = { flightctl: makeProfile('flightctl'), osac: makeProfile('osac') };
  });

  it('derives teams and members from person.teamIds', () => {
    const result = readProjectRoster(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(200);
    const org = result.roster.orgs[0];
    expect(org.key).toBe('flightctl');
    expect(org.teams['RHEM-QE'].members).toEqual([
      { accountId: 'acct-1', name: 'Alice', jiraDisplayName: 'Alice', customFields: {} }
    ]);
    expect(org.teams['RHEM-DEV'].members.map(m => m.name)).toEqual(['Alice']);
    expect(result.roster.people).toEqual([
      {
        accountId: 'acct-1',
        name: 'Alice',
        status: 'active',
        orgRoot: 'flightctl',
        orgDisplayName: 'Flight Control',
        teamIds: ['team-1', 'team-2'],
        teams: ['RHEM-QE', 'RHEM-DEV']
      },
      {
        accountId: 'acct-2',
        name: 'Bob',
        status: 'inactive',
        orgRoot: 'flightctl',
        orgDisplayName: 'Flight Control',
        teamIds: ['team-2'],
        teams: ['RHEM-DEV']
      }
    ]);
    expect(result.roster.teamDataSource).toBe('project-publication');
    expect(result.roster.availability).toBe('available');
  });

  it('returns 404 for an unknown project and never OSAC fallback', () => {
    const result = readProjectRoster(mockProjects(publications, profiles), 'nonexistent');
    expect(result.status).toBe(404);
    expect(result.error).toBe('Unknown project');
  });

  it('returns 404 when the project roster publication is missing', () => {
    const result = readProjectRoster(mockProjects(publications, profiles), 'osac');
    expect(result.status).toBe(404);
    expect(result.error).toBe('Project roster publication is unavailable');
  });

  it('returns truthful unavailable for a stale publication', () => {
    publications.flightctl['sources/roster/registry.json'].value = makeRosterEnvelope('flightctl', { state: 'supported' });
    publications.flightctl['sources/roster/registry.json'].value.freshness = 'stale';
    const result = readProjectRoster(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(200);
    expect(result.roster.state).toBe('unavailable');
    expect(result.roster.reason).toBe('publication-not-fresh');
  });

  it('returns truthful unavailable for a partial publication', () => {
    publications.flightctl['sources/roster/registry.json'].value = makeRosterEnvelope('flightctl');
    publications.flightctl['sources/roster/registry.json'].value.partial = true;
    const result = readProjectRoster(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(200);
    expect(result.roster.reason).toBe('publication-partial');
    expect(result.roster.publication.partial).toBe(true);
  });

  it('rejects identity mismatched publications', () => {
    publications.flightctl['sources/roster/registry.json'].value = makeRosterEnvelope('osac');
    const result = readProjectRoster(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(502);
    expect(result.error).toBe('Project roster publication identity mismatch');
  });

  it('rejects duplicate accounts', () => {
    publications.flightctl['sources/roster/registry.json'].value = makeRosterEnvelope('flightctl', {
      people: [
        { accountId: 'acct-1', displayName: 'Alice', active: true, teamIds: ['team-1'] },
        { accountId: 'acct-1', displayName: 'Alice again', active: true, teamIds: ['team-2'] }
      ]
    });
    const result = readProjectRoster(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(502);
  });
});

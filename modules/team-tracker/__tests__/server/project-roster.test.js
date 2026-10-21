/**
 * Project-qualified People and Teams roster reads: an unknown project never
 * falls back to the legacy OSAC roster file; unavailable publications stay
 * truthful.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readProjectPeopleTeams, ENRICHMENT_ARTIFACT_KEY } from '../../server/project-roster.js'

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

// Person records carry matchStatus, no displayName; auxiliaryManagers is a
// ldapUid-keyed object, not an array.
function makeEnrichmentEnvelope(projectId, overrides = {}) {
  return {
    schemaVersion: 1,
    projectId,
    profileRevision: 'rev',
    artifactKey: ENRICHMENT_ARTIFACT_KEY,
    source: { id: 'ipa-ldap', kind: 'ipa-ldap' },
    state: 'supported',
    freshness: 'fresh',
    partial: false,
    error: null,
    lastKnownGood: null,
    generatedAt: '2026-10-05T00:00:00Z',
    data: {
      projectId,
      people: [
        {
          accountId: 'acct-1',
          matchStatus: 'matched',
          ldapUid: 'alice',
          title: 'Senior Engineer',
          city: 'Cork',
          country: 'IE',
          geo: 'EMEA',
          location: 'Cork, Ireland',
          officeLocation: null,
          costCenter: null,
          identities: { github: { username: 'alice', source: 'ldap' }, gitlab: null },
          managerRef: { kind: 'external', ldapUid: 'mhicks' }
        },
        {
          accountId: 'acct-2',
          matchStatus: 'unmatched',
          title: null,
          city: null,
          country: null,
          geo: null,
          location: null,
          officeLocation: null,
          costCenter: null,
          identities: { github: null, gitlab: null },
          managerRef: null
        }
      ],
      auxiliaryManagers: {
        mhicks: {
          ldapUid: 'mhicks',
          displayName: 'Mark Hicks',
          title: 'VP Engineering',
          city: 'Westford',
          country: 'US',
          geo: 'AMER',
          location: 'Westford, MA',
          officeLocation: null,
          costCenter: null,
          identities: { github: null, gitlab: null },
          managerRef: null
        }
      },
      diagnostics: { unmatched: [], ambiguous: [], duplicateLdapUid: [], unresolvedManagers: [] },
      ...overrides
    }
  }
}

describe('readProjectPeopleTeams', () => {
  let publications;
  let profiles;

  beforeEach(() => {
    publications = {
      flightctl: { 'sources/roster/registry.json': { value: makeRosterEnvelope('flightctl') } }
    };
    profiles = { flightctl: makeProfile('flightctl'), osac: makeProfile('osac') };
  });

  it('keys people and teams by (projectId, id) and keeps a stable shape', () => {
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(200);
    expect(result.model.projectId).toBe('flightctl');
    expect(result.model.teams).toEqual([
      {
        key: 'flightctl::team-1',
        projectId: 'flightctl',
        id: 'team-1',
        displayName: 'RHEM-QE',
        description: null,
        state: null,
        teamType: null,
        memberAccountIds: ['acct-1']
      },
      {
        key: 'flightctl::team-2',
        projectId: 'flightctl',
        id: 'team-2',
        displayName: 'RHEM-DEV',
        description: null,
        state: null,
        teamType: null,
        // acct-2 is inactive and must not appear in team membership.
        memberAccountIds: ['acct-1']
      }
    ]);
    expect(result.model.people).toEqual([
      {
        key: 'flightctl::acct-1',
        projectId: 'flightctl',
        accountId: 'acct-1',
        displayName: 'Alice',
        active: true,
        email: null,
        teamIds: ['team-1', 'team-2'],
        title: null,
        manager: null,
        managerRef: null,
        geo: null,
        city: null,
        country: null,
        location: null,
        ldapUid: null,
        identities: {}
      },
      {
        key: 'flightctl::acct-2',
        projectId: 'flightctl',
        accountId: 'acct-2',
        displayName: 'Bob',
        active: false,
        email: null,
        teamIds: ['team-2'],
        title: null,
        manager: null,
        managerRef: null,
        geo: null,
        city: null,
        country: null,
        location: null,
        ldapUid: null,
        identities: {}
      }
    ]);
  });

  it('propagates email when the publication includes one', () => {
    publications.flightctl['sources/roster/registry.json'].value = makeRosterEnvelope('flightctl', {
      people: [
        { accountId: 'acct-1', displayName: 'Alice', active: true, email: 'alice@example.com', teamIds: ['team-1'] }
      ]
    });
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(200);
    expect(result.model.people[0].email).toBe('alice@example.com');
  });

  it('keeps a missing email as null, not absent', () => {
    publications.flightctl['sources/roster/registry.json'].value = makeRosterEnvelope('flightctl', {
      people: [
        { accountId: 'acct-1', displayName: 'Alice', active: true, teamIds: ['team-1'] }
      ]
    });
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    const [person] = result.model.people;
    expect('email' in person).toBe(true);
    expect(person.email).toBeNull();
  });

  it('surfaces already-published team metadata without fabricating missing fields', () => {
    publications.flightctl['sources/roster/registry.json'].value = makeRosterEnvelope('flightctl', {
      teams: [
        { id: 'team-1', name: 'RHEM-QE', orgKey: 'flightctl', description: 'Quality', state: 'ACTIVE', teamType: 'open' },
        { id: 'team-2', name: 'RHEM-DEV', orgKey: 'flightctl' }
      ],
      people: []
    });
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    const [qe, dev] = result.model.teams;
    expect(qe).toMatchObject({ description: 'Quality', state: 'ACTIVE', teamType: 'open' });
    expect(dev).toMatchObject({ description: null, state: null, teamType: null });
  });

  it('is empty when every published person is inactive', () => {
    publications.flightctl['sources/roster/registry.json'].value = makeRosterEnvelope('flightctl', {
      people: [
        { accountId: 'acct-1', displayName: 'Alice', active: false, teamIds: ['team-1'] }
      ]
    });
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(200);
    expect(result.model.availability).toBe('empty');
    expect(result.model.reason).toBe('no-active-team-memberships');
    // Inactive people still appear in the people collection.
    expect(result.model.people).toHaveLength(1);
    expect(result.model.teams[0].memberAccountIds).toEqual([]);
  });

  it('is empty when the only active person has no team assignment', () => {
    publications.flightctl['sources/roster/registry.json'].value = makeRosterEnvelope('flightctl', {
      people: [
        { accountId: 'acct-1', displayName: 'Alice', active: true, teamIds: [] }
      ]
    });
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(200);
    expect(result.model.availability).toBe('empty');
    expect(result.model.reason).toBe('no-active-team-memberships');
  });

  it('is available when at least one active person belongs to a team', () => {
    publications.flightctl['sources/roster/registry.json'].value = makeRosterEnvelope('flightctl', {
      people: [
        { accountId: 'acct-1', displayName: 'Alice', active: true, teamIds: ['team-1'] },
        { accountId: 'acct-2', displayName: 'Bob', active: false, teamIds: ['team-1'] }
      ]
    });
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(200);
    expect(result.model.availability).toBe('available');
    expect(result.model.reason).toBeNull();
    expect(result.model.teams[0].memberAccountIds).toEqual(['acct-1']);
  });

  it('represents a stale publication as unavailable with the same stable shape', () => {
    publications.flightctl['sources/roster/registry.json'].value = makeRosterEnvelope('flightctl');
    publications.flightctl['sources/roster/registry.json'].value.freshness = 'stale';
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(200);
    expect(result.model).toEqual({
      projectId: 'flightctl',
      availability: 'unavailable',
      reason: 'publication-not-fresh',
      publicationState: 'supported',
      generatedAt: '2026-09-28T00:00:00Z',
      teams: [],
      people: []
    });
  });

  it('represents a partial publication as unavailable', () => {
    publications.flightctl['sources/roster/registry.json'].value = makeRosterEnvelope('flightctl');
    publications.flightctl['sources/roster/registry.json'].value.partial = true;
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(200);
    expect(result.model.availability).toBe('unavailable');
    expect(result.model.reason).toBe('publication-partial');
  });

  it('accepts two distinct team IDs that share the same team name', () => {
    publications.flightctl['sources/roster/registry.json'].value = makeRosterEnvelope('flightctl', {
      teams: [
        { id: 'team-1', name: 'Platform', orgKey: 'flightctl' },
        { id: 'team-2', name: 'Platform', orgKey: 'flightctl' }
      ],
      people: [
        { accountId: 'acct-1', displayName: 'Alice', active: true, teamIds: ['team-1'] },
        { accountId: 'acct-2', displayName: 'Bob', active: true, teamIds: ['team-2'] }
      ]
    });
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(200);
    expect(result.model.teams.map(t => t.key)).toEqual(['flightctl::team-1', 'flightctl::team-2']);
    expect(result.model.teams.every(t => t.displayName === 'Platform')).toBe(true);
  });

  it('rejects duplicate team IDs', () => {
    publications.flightctl['sources/roster/registry.json'].value = makeRosterEnvelope('flightctl', {
      teams: [
        { id: 'team-1', name: 'Platform', orgKey: 'flightctl' },
        { id: 'team-1', name: 'Platform Again', orgKey: 'flightctl' }
      ]
    });
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(502);
  });

  it('rejects duplicate accounts', () => {
    publications.flightctl['sources/roster/registry.json'].value = makeRosterEnvelope('flightctl', {
      people: [
        { accountId: 'acct-1', displayName: 'Alice', active: true, teamIds: ['team-1'] },
        { accountId: 'acct-1', displayName: 'Alice again', active: true, teamIds: ['team-2'] }
      ]
    });
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(502);
  });

  it('rejects an unknown project', () => {
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'nonexistent');
    expect(result.status).toBe(404);
    expect(result.error).toBe('Unknown project');
  });

  it('rejects a malformed project id', () => {
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), '');
    expect(result.status).toBe(400);
  });

  it('never returns another project data for the requested projectId', () => {
    publications.flightctl['sources/roster/registry.json'].value = makeRosterEnvelope('osac');
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(502);
    expect(result.error).toBe('Project roster publication identity mismatch');
  });

  it('does not fall back to the legacy OSAC roster when a project publication is missing', () => {
    const result = readProjectPeopleTeams(mockProjects({}, profiles), 'osac');
    expect(result.status).toBe(404);
    expect(result.error).toBe('Project roster publication is unavailable');
  });
});

describe('readProjectPeopleTeams enrichment join', () => {
  let publications;
  let profiles;

  beforeEach(() => {
    publications = {
      flightctl: {
        'sources/roster/registry.json': { value: makeRosterEnvelope('flightctl') },
        [ENRICHMENT_ARTIFACT_KEY]: { value: makeEnrichmentEnvelope('flightctl') }
      }
    };
    profiles = { flightctl: makeProfile('flightctl'), osac: makeProfile('osac') };
  });

  it('joins a matched person and passes through the typed external managerRef', () => {
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    const alice = result.model.people.find(p => p.accountId === 'acct-1');
    expect(alice).toMatchObject({
      title: 'Senior Engineer',
      geo: 'EMEA',
      city: 'Cork',
      country: 'IE',
      location: 'Cork, Ireland',
      ldapUid: 'alice',
      identities: { github: { username: 'alice', source: 'ldap' }, gitlab: null },
      managerRef: { kind: 'external', ldapUid: 'mhicks' }
    });
  });

  it('leaves an unmatched person fully null, distinct from a matched root', () => {
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    const bob = result.model.people.find(p => p.accountId === 'acct-2');
    expect(bob).toMatchObject({ title: null, geo: null, city: null, country: null, location: null, ldapUid: null, identities: {}, managerRef: null });
  });

  it('trims surrounding whitespace from a matched ldapUid, and nulls a whitespace-only one', () => {
    publications.flightctl[ENRICHMENT_ARTIFACT_KEY].value = makeEnrichmentEnvelope('flightctl', {
      people: [
        {
          accountId: 'acct-1',
          matchStatus: 'matched',
          ldapUid: '  alice  ',
          title: null, city: null, country: null, geo: null, location: null,
          officeLocation: null, costCenter: null,
          identities: { github: null, gitlab: null },
          managerRef: null
        },
        {
          accountId: 'acct-2',
          matchStatus: 'matched',
          ldapUid: '   ',
          title: null, city: null, country: null, geo: null, location: null,
          officeLocation: null, costCenter: null,
          identities: { github: null, gitlab: null },
          managerRef: null
        }
      ],
      auxiliaryManagers: {}
    });
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    const alice = result.model.people.find(p => p.accountId === 'acct-1');
    const bob = result.model.people.find(p => p.accountId === 'acct-2');
    expect(alice.ldapUid).toBe('alice');
    expect(bob.ldapUid).toBeNull();
  });

  it('gives a matched root person managerRef:null while still populating other fields', () => {
    publications.flightctl[ENRICHMENT_ARTIFACT_KEY].value = makeEnrichmentEnvelope('flightctl', {
      people: [
        {
          accountId: 'acct-1',
          matchStatus: 'matched',
          title: 'VP Engineering',
          city: 'Westford',
          country: 'US',
          geo: 'AMER',
          location: null,
          officeLocation: null,
          costCenter: null,
          identities: { github: null, gitlab: null },
          managerRef: null
        }
      ],
      auxiliaryManagers: {}
    });
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    const root = result.model.people.find(p => p.accountId === 'acct-1');
    expect(root).toMatchObject({ title: 'VP Engineering', geo: 'AMER', managerRef: null });
    // Unmatched (acct-2) also has managerRef:null, but no other enriched fields.
    const unmatched = result.model.people.find(p => p.accountId === 'acct-2');
    expect(unmatched).toMatchObject({ title: null, geo: null, identities: {} });
  });

  it('treats an ambiguous match the same as unmatched', () => {
    publications.flightctl[ENRICHMENT_ARTIFACT_KEY].value = makeEnrichmentEnvelope('flightctl', {
      people: [
        {
          accountId: 'acct-1',
          matchStatus: 'ambiguous',
          title: null, city: null, country: null, geo: null, location: null,
          officeLocation: null, costCenter: null,
          identities: { github: null, gitlab: null },
          managerRef: null
        }
      ],
      auxiliaryManagers: {}
    });
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    const alice = result.model.people.find(p => p.accountId === 'acct-1');
    expect(alice).toMatchObject({ title: null, geo: null, identities: {}, managerRef: null });
  });

  it('passes through auxiliaryManagers as a ldapUid-keyed object, not an array', () => {
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(Array.isArray(result.model.auxiliaryManagers)).toBe(false);
    expect(result.model.auxiliaryManagers).toEqual({
      mhicks: expect.objectContaining({ ldapUid: 'mhicks', displayName: 'Mark Hicks' })
    });
  });

  it('surfaces enrichment state and generatedAt when the publication is fresh', () => {
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.model.enrichment).toEqual({ state: 'fresh', partial: false, generatedAt: '2026-10-05T00:00:00Z' });
  });

  it('badges a stale (last-known-good) enrichment publication but still joins its data', () => {
    publications.flightctl[ENRICHMENT_ARTIFACT_KEY].value.freshness = 'stale';
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.model.enrichment.state).toBe('stale');
    expect(result.model.enrichment.partial).toBe(false);
    const alice = result.model.people.find(p => p.accountId === 'acct-1');
    expect(alice.title).toBe('Senior Engineer');
  });

  it('badges a partial enrichment publication but still joins present records', () => {
    publications.flightctl[ENRICHMENT_ARTIFACT_KEY].value.partial = true;
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.model.enrichment.state).toBe('partial');
    expect(result.model.enrichment.partial).toBe(true);
    const alice = result.model.people.find(p => p.accountId === 'acct-1');
    expect(alice.title).toBe('Senior Engineer');
  });

  it('preserves the partial signal on a stale publication instead of collapsing it', () => {
    publications.flightctl[ENRICHMENT_ARTIFACT_KEY].value.freshness = 'stale';
    publications.flightctl[ENRICHMENT_ARTIFACT_KEY].value.partial = true;
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.model.enrichment).toEqual({ state: 'stale', partial: true, generatedAt: '2026-10-05T00:00:00Z' });
    const alice = result.model.people.find(p => p.accountId === 'acct-1');
    expect(alice.title).toBe('Senior Engineer');
  });

  it('distrusts an expired enrichment publication: surfaces absent state, joins nothing', () => {
    publications.flightctl[ENRICHMENT_ARTIFACT_KEY].value.freshness = 'expired';
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.model.enrichment).toEqual({ state: 'absent', generatedAt: '2026-10-05T00:00:00Z' });
    const alice = result.model.people.find(p => p.accountId === 'acct-1');
    expect(alice).toMatchObject({ title: null, geo: null, identities: {}, managerRef: null });
    expect(result.model.auxiliaryManagers).toBeUndefined();
  });

  it('distrusts an unknown-freshness enrichment publication the same as expired', () => {
    publications.flightctl[ENRICHMENT_ARTIFACT_KEY].value.freshness = 'unknown';
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.model.enrichment.state).toBe('absent');
  });

  it('omits enrichment entirely when the publication is missing, preserving today’s response', () => {
    delete publications.flightctl[ENRICHMENT_ARTIFACT_KEY];
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(200);
    expect(result.model.enrichment).toBeUndefined();
    expect(result.model.auxiliaryManagers).toBeUndefined();
    expect(result.model.people).toEqual([
      {
        key: 'flightctl::acct-1', projectId: 'flightctl', accountId: 'acct-1', displayName: 'Alice',
        active: true, email: null, teamIds: ['team-1', 'team-2'],
        title: null, manager: null, geo: null, city: null, country: null, location: null, ldapUid: null, identities: {}, managerRef: null
      },
      {
        key: 'flightctl::acct-2', projectId: 'flightctl', accountId: 'acct-2', displayName: 'Bob',
        active: false, email: null, teamIds: ['team-2'],
        title: null, manager: null, geo: null, city: null, country: null, location: null, ldapUid: null, identities: {}, managerRef: null
      }
    ]);
  });

  it('keeps the legacy manager field null and unaffected when enrichment is present and joined', () => {
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    const alice = result.model.people.find(p => p.accountId === 'acct-1');
    // acct-1 has a real enrichment join (title/geo/identities/managerRef populated below),
    // but `manager` — the pre-enrichment field — must stay null regardless.
    expect(alice.manager).toBeNull();
    expect(alice.title).toBe('Senior Engineer');
    expect(alice.managerRef).toEqual({ kind: 'external', ldapUid: 'mhicks' });
  });

  it('omits enrichment on an invalid schemaVersion, warns, and does not fail the roster', () => {
    publications.flightctl[ENRICHMENT_ARTIFACT_KEY].value.schemaVersion = 2;
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(200);
    expect(result.model.enrichment).toBeUndefined();
  });

  it('omits enrichment on an invalid publication state', () => {
    publications.flightctl[ENRICHMENT_ARTIFACT_KEY].value.state = 'unsupported';
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(200);
    expect(result.model.enrichment).toBeUndefined();
  });

  it('omits enrichment on a malformed person record without failing the roster', () => {
    publications.flightctl[ENRICHMENT_ARTIFACT_KEY].value.data.people = [{ matchStatus: 'matched' }];
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(200);
    expect(result.model.enrichment).toBeUndefined();
  });

  it('omits enrichment on a duplicate accountId without failing the roster', () => {
    publications.flightctl[ENRICHMENT_ARTIFACT_KEY].value.data.people = [
      { accountId: 'acct-1', matchStatus: 'matched', title: null, geo: null, identities: {}, managerRef: null },
      { accountId: 'acct-1', matchStatus: 'matched', title: null, geo: null, identities: {}, managerRef: null }
    ];
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(200);
    expect(result.model.enrichment).toBeUndefined();
  });

  it('omits enrichment when auxiliaryManagers is not an object', () => {
    publications.flightctl[ENRICHMENT_ARTIFACT_KEY].value.data.auxiliaryManagers = ['mhicks'];
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(200);
    expect(result.model.enrichment).toBeUndefined();
  });

  it('drops a malformed auxiliaryManagers entry but keeps the join and other entries', () => {
    publications.flightctl[ENRICHMENT_ARTIFACT_KEY].value.data.auxiliaryManagers = {
      mhicks: {
        ldapUid: 'mhicks', displayName: 'Mark Hicks', title: null, city: null, country: null,
        geo: null, location: null, officeLocation: null, costCenter: null,
        identities: { github: null, gitlab: null }, managerRef: null
      },
      // Missing displayName — malformed, dropped individually.
      broken: { ldapUid: 'broken', title: null }
    };
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(200);
    expect(result.model.enrichment).toBeDefined();
    expect(result.model.auxiliaryManagers).toEqual({
      mhicks: expect.objectContaining({ ldapUid: 'mhicks', displayName: 'Mark Hicks' })
    });
  });

  it('drops an auxiliaryManagers entry whose ldapUid field disagrees with its map key', () => {
    publications.flightctl[ENRICHMENT_ARTIFACT_KEY].value.data.auxiliaryManagers = {
      mhicks: {
        ldapUid: 'someone-else', displayName: 'Mark Hicks', title: null, city: null, country: null,
        geo: null, location: null, officeLocation: null, costCenter: null,
        identities: { github: null, gitlab: null }, managerRef: null
      }
    };
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(200);
    expect(result.model.enrichment).toBeDefined();
    expect(result.model.auxiliaryManagers).toEqual({});
  });

  it('drops an auxiliaryManagers entry missing ldapUid without failing the join', () => {
    publications.flightctl[ENRICHMENT_ARTIFACT_KEY].value.data.auxiliaryManagers = {
      mhicks: { displayName: 'Mark Hicks' }
    };
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(200);
    expect(result.model.enrichment).toBeDefined();
    expect(result.model.auxiliaryManagers).toEqual({});
  });

  it('sanitizes an invalid managerRef on an auxiliaryManagers entry without dropping the entry', () => {
    publications.flightctl[ENRICHMENT_ARTIFACT_KEY].value.data.auxiliaryManagers = {
      mhicks: {
        ldapUid: 'mhicks', displayName: 'Mark Hicks', title: null, city: null, country: null,
        geo: null, location: null, officeLocation: null, costCenter: null,
        identities: { github: null, gitlab: null }, managerRef: { kind: 'roster' } // missing accountId
      }
    };
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.model.auxiliaryManagers.mhicks).toMatchObject({ displayName: 'Mark Hicks', managerRef: null });
  });

  describe('managerRef kind validation', () => {
    it.each([
      ['an unrecognized kind', { kind: 'root-of-org' }],
      ['a roster kind missing accountId', { kind: 'roster' }],
      ['a roster kind with an empty accountId', { kind: 'roster', accountId: '' }],
      ['an external kind missing ldapUid', { kind: 'external' }],
      ['an unresolved kind missing reason', { kind: 'unresolved', ldapUid: 'mhicks' }]
    ])('degrades %s to null without dropping the rest of the person', (_label, managerRef) => {
      publications.flightctl[ENRICHMENT_ARTIFACT_KEY].value.data.people[0].managerRef = managerRef;
      const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
      const alice = result.model.people.find(p => p.accountId === 'acct-1');
      expect(alice.managerRef).toBeNull();
      expect(alice.title).toBe('Senior Engineer');
    });

    // "no-manager-before-root" means the chain ran out of LDAP data *without*
    // reaching a configured root — distinct from a real root, which the
    // producer represents as managerRef:null (see the root-person test above).
    it('accepts a well-formed unresolved managerRef with no ldapUid', () => {
      publications.flightctl[ENRICHMENT_ARTIFACT_KEY].value.data.people[0].managerRef =
        { kind: 'unresolved', reason: 'no-manager-before-root' };
      const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
      const alice = result.model.people.find(p => p.accountId === 'acct-1');
      expect(alice.managerRef).toEqual({ kind: 'unresolved', reason: 'no-manager-before-root' });
    });

    it('does not conflate a resolved chain root (managerRef:null) with an unresolved chain (managerRef.kind:"unresolved")', () => {
      publications.flightctl[ENRICHMENT_ARTIFACT_KEY].value.data.people[0].managerRef = null;
      const root = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl')
        .model.people.find(p => p.accountId === 'acct-1');
      expect(root.managerRef).toBeNull();

      publications.flightctl[ENRICHMENT_ARTIFACT_KEY].value.data.people[0].managerRef =
        { kind: 'unresolved', reason: 'no-manager-before-root' };
      const unresolved = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl')
        .model.people.find(p => p.accountId === 'acct-1');
      expect(unresolved.managerRef).toEqual({ kind: 'unresolved', reason: 'no-manager-before-root' });
    });
  });

  it('rejects a cross-project enrichment publication without joining or leaking data', () => {
    publications.flightctl[ENRICHMENT_ARTIFACT_KEY].value = makeEnrichmentEnvelope('osac');
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(200);
    expect(result.model.enrichment).toBeUndefined();
    expect(result.model.auxiliaryManagers).toBeUndefined();
    const alice = result.model.people.find(p => p.accountId === 'acct-1');
    expect(alice).toMatchObject({ title: null, geo: null, identities: {}, managerRef: null });
  });

  it('rejects an enrichment publication whose data.projectId does not match the envelope projectId', () => {
    publications.flightctl[ENRICHMENT_ARTIFACT_KEY].value.data.projectId = 'osac';
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'flightctl');
    expect(result.status).toBe(200);
    expect(result.model.enrichment).toBeUndefined();
  });

  it('keeps managerRef present on every person regardless of enrichment state', () => {
    publications.osac = { 'sources/roster/registry.json': { value: makeRosterEnvelope('osac') } };
    const result = readProjectPeopleTeams(mockProjects(publications, profiles), 'osac');
    expect(result.status).toBe(200);
    expect(result.model.people.every(p => 'managerRef' in p)).toBe(true);
  });
});

/**
 * Product Builds project publication reads: the artifact key comes from the
 * published profile's capabilities block; AIPCC dashboard data never reaches a
 * non-OSAC project.
 */
import { describe, it, expect } from 'vitest'
import { readProjectPublication, capabilityArtifactKey } from '../../server/project-publication.js'

function mockProjects(publications = {}, profiles = {}) {
  return {
    get: projectId => profiles[projectId] || null,
    readArtifact: (projectId, key) => publications[projectId]?.[key] || null
  }
}

function makeProfile(projectId) {
  return {
    projectId,
    displayName: 'Flight Control',
    profileRevision: 'rev',
    capabilities: {
      buildRegistry: { state: 'supported', artifactKey: 'sources/build-artifacts/registry.json' }
    }
  }
}

function makeEnvelope(projectId, artifactKey) {
  return {
    schemaVersion: 1,
    projectId,
    profileRevision: 'rev',
    artifactKey,
    source: { id: 'flightctl-release-sources', kind: 'github' },
    state: 'supported',
    freshness: 'fresh',
    partial: false,
    error: null,
    generatedAt: '2026-09-28T00:00:00Z',
    data: { projectId, records: [] }
  }
}

describe('capabilityArtifactKey', () => {
  it('returns the capability artifact key from the profile', () => {
    expect(capabilityArtifactKey(makeProfile('flightctl'), 'buildRegistry'))
      .toBe('sources/build-artifacts/registry.json');
  });

  it('returns null when the capability is not configured', () => {
    const profile = makeProfile('flightctl');
    profile.capabilities = {};
    expect(capabilityArtifactKey(profile, 'buildRegistry')).toBeNull();
    expect(capabilityArtifactKey(null, 'buildRegistry')).toBeNull();
  });
});

describe('readProjectPublication', () => {
  it('reads the capability-driven artifact and returns publication metadata', () => {
    const publications = {
      flightctl: {
        'sources/build-artifacts/registry.json': { value: makeEnvelope('flightctl', 'sources/build-artifacts/registry.json') }
      }
    };
    const result = readProjectPublication(
      mockProjects(publications, { flightctl: makeProfile('flightctl') }),
      'flightctl', 'buildRegistry'
    );
    expect(result.status).toBe(200);
    expect(result.publication.projectId).toBe('flightctl');
    expect(result.publication.artifactKey).toBe('sources/build-artifacts/registry.json');
    expect(result.publication.data.records).toEqual([]);
  });

  it('returns 404 for an unknown project', () => {
    const result = readProjectPublication(mockProjects(), 'nonexistent', 'buildRegistry');
    expect(result.status).toBe(404);
    expect(result.error).toBe('Unknown project');
  });

  it('returns truthful unavailable when the capability is not supported', () => {
    const profile = makeProfile('flightctl');
    profile.capabilities.buildRegistry = { state: 'unavailable', artifactKey: 'x.json' };
    const result = readProjectPublication(
      mockProjects({}, { flightctl: profile }), 'flightctl', 'buildRegistry'
    );
    expect(result.status).toBe(200);
    expect(result.publication.state).toBe('unavailable');
    expect(result.publication.reason).toBe('capability-not-supported');
  });

  it('returns 404 when the publication artifact is missing', () => {
    const result = readProjectPublication(
      mockProjects({}, { flightctl: makeProfile('flightctl') }), 'flightctl', 'buildRegistry'
    );
    expect(result.status).toBe(404);
  });

  it('rejects identity mismatched publications', () => {
    const publications = {
      flightctl: {
        'sources/build-artifacts/registry.json': { value: makeEnvelope('osac', 'sources/build-artifacts/registry.json') }
      }
    };
    const result = readProjectPublication(
      mockProjects(publications, { flightctl: makeProfile('flightctl') }),
      'flightctl', 'buildRegistry'
    );
    expect(result.status).toBe(502);
    expect(result.error).toBe('Project publication identity mismatch');
  });
});

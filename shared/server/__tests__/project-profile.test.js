import { describe, it, expect } from 'vitest'

const {
  normalizeArtifactKey,
  normalizeProjectProfile,
  createPublicationEnvelope,
  createProjectProfileRegistry,
  createProjectProfileReader
} = require('../project-profile')

const FLIGHTCTL = {
  profileRevision: 'flightctl-test-1',
  projectId: 'flightctl',
  displayName: 'Flight Control',
  jiraProjectKey: 'EDM',
  jiraProjectName: 'Flight Control',
  repositories: [
    { fullName: 'flightctl/flightctl', role: 'delivery' },
    { fullName: 'flightctl/design-docs', role: 'planning' }
  ],
  teamIds: ['team-a', 'team-b']
}

function makeStorage(initial = {}, write = null) {
  const data = { ...initial }
  return {
    data,
    readFromStorage: key => data[key] || null,
    writeToStorageAtomic: (key, value) => {
      if (write) return write(key, value, data)
      data[key] = value
    }
  }
}

describe('project-profile', () => {
  it('reads published profiles and artifacts from direct data-repo paths', () => {
    const data = {
      'projects/index.json': { projects: [{ projectId: 'flightctl' }] },
      'projects/flightctl/profile.json': {
        schemaVersion: 1,
        profileRevision: 'flightctl-published-1',
        projectId: 'flightctl',
        displayName: 'Flight Control',
        jiraProjectKey: 'EDM',
        jiraProjectName: 'Flight Control',
        repositories: [],
        capabilities: {}
      },
      'projects/flightctl/releases/registry.json': {
        schemaVersion: 1,
        projectId: 'flightctl',
        profileRevision: 'flightctl-published-1',
        data: { schemaVersion: 1, projectId: 'flightctl', releases: [] }
      }
    }
    const reader = createProjectProfileReader({
      readFromStorage: key => Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null
    })

    expect(reader.list().map(profile => profile.projectId)).toEqual(['flightctl'])
    expect(reader.readArtifact('flightctl', 'releases/registry.json').value.projectId).toBe('flightctl')
    expect(reader.get('osac')).toBeNull()
  })

  it('resolves one immutable generation through the current pointer', () => {
    const data = {
      'projects/flightctl/current.json': { schemaVersion: 1, projectId: 'flightctl', generationId: 'abc123' },
      'projects/flightctl/generations/abc123/profile.json': {
        schemaVersion: 1,
        profileRevision: 'flightctl-published-2',
        projectId: 'flightctl',
        displayName: 'Flight Control',
        jiraProjectKey: 'EDM',
        jiraProjectName: 'Flight Control',
        repositories: [],
        capabilities: {}
      },
      'projects/flightctl/generations/abc123/releases/registry.json': {
        schemaVersion: 1,
        projectId: 'flightctl',
        data: { schemaVersion: 1, projectId: 'flightctl', releases: [{ id: 'flightctl-1.4.0' }] }
      }
    }
    const reader = createProjectProfileReader({
      readFromStorage: key => Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null
    })

    const artifact = reader.readArtifact('flightctl', 'releases/registry.json')
    expect(artifact.generationId).toBe('abc123')
    expect(artifact.storageKey).toBe('projects/flightctl/generations/abc123/releases/registry.json')
  })

  it('normalizes and freezes project identity and source metadata', () => {
    const profile = normalizeProjectProfile(FLIGHTCTL)

    expect(profile.projectId).toBe('flightctl')
    expect(profile.jiraProjectKey).toBe('EDM')
    expect(profile.repositories).toEqual([
      { fullName: 'flightctl/flightctl', role: 'delivery', authority: null },
      { fullName: 'flightctl/design-docs', role: 'planning', authority: null }
    ])
    expect(Object.isFrozen(profile)).toBe(true)
    expect(Object.isFrozen(profile.repositories)).toBe(true)
  })

  it('rejects unsafe identities and duplicate source members', () => {
    expect(() => normalizeProjectProfile({ ...FLIGHTCTL, projectId: 'Flightctl' })).toThrow('lowercase kebab-case')
    expect(() => normalizeProjectProfile({ ...FLIGHTCTL, repositories: ['not-a-repository'] })).toThrow('org/name')
    expect(() => normalizeProjectProfile({ ...FLIGHTCTL, teamIds: ['team-a', 'team-a'] })).toThrow('duplicate team IDs')
  })

  it('rejects traversal and ambiguous publication keys', () => {
    expect(normalizeArtifactKey('releases/1.4.0.json')).toBe('releases/1.4.0.json')
    expect(() => normalizeArtifactKey('../osac.json')).toThrow()
    expect(() => normalizeArtifactKey('/absolute.json')).toThrow()
    expect(() => normalizeArtifactKey('releases//1.4.0.json')).toThrow()
  })

  it('qualifies identical version names by project', () => {
    const registry = createProjectProfileRegistry([
      FLIGHTCTL,
      { ...FLIGHTCTL, projectId: 'osac', displayName: 'OSAC', jiraProjectKey: 'OSAC', jiraProjectName: 'OSAC' }
    ])

    expect(registry.qualifyStorageKey('flightctl', 'release-plans/1.4.0.json'))
      .toBe('projects/flightctl/release-plans/1.4.0.json')
    expect(registry.qualifyStorageKey('osac', 'release-plans/1.4.0.json'))
      .toBe('projects/osac/release-plans/1.4.0.json')
  })

  it('creates envelopes with project, source, freshness, and error metadata', () => {
    const profile = normalizeProjectProfile(FLIGHTCTL)
    const envelope = createPublicationEnvelope(profile, 'ci/run-1.json', { passed: 3 }, {
      sourceId: 'flightctl-core-actions',
      sourceKind: 'github-actions',
      sourceRevision: 'abc123',
      runId: '35722329385',
      generatedAt: '2026-09-22T11:00:00.000Z',
      fetchedAt: '2026-09-22T11:01:00.000Z',
      state: 'supported',
      freshness: 'fresh',
      partial: true
    })

    expect(envelope).toMatchObject({
      schemaVersion: 1,
      projectId: 'flightctl',
      profileRevision: 'flightctl-test-1',
      artifactKey: 'ci/run-1.json',
      source: {
        id: 'flightctl-core-actions',
        kind: 'github-actions',
        revision: 'abc123',
        runId: '35722329385'
      },
      state: 'supported',
      freshness: 'fresh',
      partial: true,
      data: { passed: 3 }
    })
  })

  it('publishes atomically under the project-qualified key', () => {
    const registry = createProjectProfileRegistry([FLIGHTCTL])
    const storage = makeStorage()
    const result = registry.publish(storage, 'flightctl', 'release-plans/1.4.0.json', { features: [] }, {
      sourceId: 'flightctl-release-plan',
      sourceRevision: 'design-docs@abc123'
    })

    expect(result.ok).toBe(true)
    expect(Object.keys(storage.data)).toEqual(['projects/flightctl/release-plans/1.4.0.json'])
    expect(storage.data[result.key].projectId).toBe('flightctl')
  })

  it('preserves last-known-good data and publishes stale error metadata on failure', () => {
    const registry = createProjectProfileRegistry([FLIGHTCTL])
    const key = 'projects/flightctl/ci/run-1.json'
    const previous = {
      schemaVersion: 1,
      projectId: 'flightctl',
      generatedAt: '2026-09-22T10:00:00.000Z',
      source: { revision: 'old-sha', runId: 'old-run' },
      data: { passed: 3 }
    }
    const storage = makeStorage({ [key]: previous }, (writeKey, value, data) => {
      if (writeKey === key) throw Object.assign(new Error('source timeout'), { code: 'ETIMEDOUT' })
      data[writeKey] = value
    })

    const result = registry.publish(storage, 'flightctl', 'ci/run-1.json', { passed: 4 })

    expect(result.ok).toBe(false)
    expect(result.preserved).toBe(true)
    expect(storage.data[key]).toBe(previous)
    expect(storage.data[result.statusKey]).toMatchObject({
      state: 'error',
      freshness: 'stale',
      partial: true,
      error: { code: 'ETIMEDOUT', message: 'source timeout' },
      lastKnownGood: {
        available: true,
        key,
        generatedAt: '2026-09-22T10:00:00.000Z',
        sourceRevision: 'old-sha',
        sourceRunId: 'old-run'
      },
      data: { passed: 3 }
    })
  })
})

import { describe, it, expect } from 'vitest'

const {
  normalizeArtifactKey,
  resolveProjectSelection,
  normalizeProjectProfile,
  createPublicationEnvelope,
  createProjectProfileRegistry,
  createProjectProfileReader,
  ProjectProfileIndexError
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
const FLIGHTCTL_INDEX_ENTRY = {
  projectId: 'flightctl',
  displayName: 'Flight Control',
  profileRevision: 'd773101e2e07c378',
  profileKey: 'projects/flightctl/profile.json'
}
const OSAC_INDEX_ENTRY = {
  projectId: 'osac',
  displayName: 'OSAC',
  profileRevision: '1ba4e768d512d277',
  profileKey: 'projects/osac/profile.json'
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
      'projects/index.json': { schemaVersion: 1, projects: [FLIGHTCTL_INDEX_ENTRY] },
      'projects/flightctl/profile.json': {
        schemaVersion: 1,
        profileRevision: FLIGHTCTL_INDEX_ENTRY.profileRevision,
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

  it('preserves a valid single-project OSAC publication', () => {
    const data = {
      'projects/index.json': { schemaVersion: 1, projects: [OSAC_INDEX_ENTRY] },
      'projects/osac/profile.json': {
        schemaVersion: 1,
        profileRevision: OSAC_INDEX_ENTRY.profileRevision,
        projectId: 'osac',
        displayName: 'OSAC',
        jiraProjectKey: 'OSAC',
        jiraProjectName: 'Open Source as a Cloud',
        repositories: [],
        capabilities: {}
      }
    }
    const reader = createProjectProfileReader({
      readFromStorage: key => Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null
    })

    expect(reader.list().map(profile => profile.projectId)).toEqual(['osac'])
  })

  it.each([
    ['missing index', {}, 'PROJECT_INDEX_MISSING'],
    ['non-object index', { 'projects/index.json': [] }, 'PROJECT_INDEX_INVALID'],
    ['missing schemaVersion', { 'projects/index.json': { projects: [OSAC_INDEX_ENTRY] } }, 'PROJECT_INDEX_INVALID'],
    ['unsupported schemaVersion', { 'projects/index.json': { schemaVersion: 2, projects: [OSAC_INDEX_ENTRY] } }, 'PROJECT_INDEX_INVALID'],
    ['missing projects array', { 'projects/index.json': {} }, 'PROJECT_INDEX_INVALID'],
    ['empty projects array', { 'projects/index.json': { projects: [] } }, 'PROJECT_INDEX_INVALID'],
    ['invalid index entry', { 'projects/index.json': { projects: [{ projectId: 'Bad ID' }] } }, 'PROJECT_INDEX_INVALID'],
    ['index entry without a display name', { 'projects/index.json': { schemaVersion: 1, projects: [{ ...OSAC_INDEX_ENTRY, displayName: '' }] } }, 'PROJECT_INDEX_INVALID'],
    ['index entry without a valid revision', { 'projects/index.json': { schemaVersion: 1, projects: [{ ...OSAC_INDEX_ENTRY, profileRevision: 'old' }] } }, 'PROJECT_INDEX_INVALID'],
    ['index entry with a mismatched profile key', { 'projects/index.json': { schemaVersion: 1, projects: [{ ...OSAC_INDEX_ENTRY, profileKey: 'projects/flightctl/profile.json' }] } }, 'PROJECT_INDEX_INVALID'],
    ['duplicate project entries', { 'projects/index.json': { schemaVersion: 1, projects: [OSAC_INDEX_ENTRY, OSAC_INDEX_ENTRY] } }, 'PROJECT_INDEX_INVALID'],
    ['missing published profile', { 'projects/index.json': { schemaVersion: 1, projects: [OSAC_INDEX_ENTRY] } }, 'PROJECT_PROFILE_MISSING'],
    ['stale profile revision', {
      'projects/index.json': { schemaVersion: 1, projects: [{ ...FLIGHTCTL_INDEX_ENTRY, profileRevision: '0000000000000000' }] },
      'projects/flightctl/profile.json': FLIGHTCTL
    }, 'PROJECT_PROFILE_REVISION_MISMATCH'],
    ['mismatched profile display name', {
      'projects/index.json': { schemaVersion: 1, projects: [{ ...FLIGHTCTL_INDEX_ENTRY, displayName: 'Flight Control Other' }] },
      'projects/flightctl/profile.json': { ...FLIGHTCTL, profileRevision: FLIGHTCTL_INDEX_ENTRY.profileRevision }
    }, 'PROJECT_PROFILE_DISPLAY_NAME_MISMATCH']
  ])('rejects %s instead of hiding it as an empty project list', (_caseName, data, code) => {
    const reader = createProjectProfileReader({
      readFromStorage: key => Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null
    })

    let caught
    try {
      reader.list()
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(ProjectProfileIndexError)
    expect(caught.code).toBe(code)
  })

  it('reports an unreadable JSON index as a discovery error', () => {
    const reader = createProjectProfileReader({
      readFromStorage: key => {
        if (key === 'projects/index.json') throw new SyntaxError('Unexpected token')
        return null
      }
    })

    expect(() => reader.list()).toThrow(expect.objectContaining({
      name: 'ProjectProfileIndexError',
      code: 'PROJECT_INDEX_INVALID'
    }))
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

  it('normalizes registry lookups and resolves optional project query selections', () => {
    const registry = createProjectProfileRegistry([FLIGHTCTL])
    expect(registry.get(' flightctl ')).toMatchObject({ projectId: 'flightctl' })

    expect(resolveProjectSelection(registry, {})).toEqual({ provided: false })
    expect(resolveProjectSelection(registry, { projectId: 'flightctl' })).toMatchObject({
      provided: true,
      projectId: 'flightctl',
      profile: { projectId: 'flightctl' }
    })
    expect(resolveProjectSelection(registry, { projectId: ' flightctl ' })).toMatchObject({
      provided: true,
      status: 400
    })
    expect(resolveProjectSelection(registry, { projectId: 'missing' })).toMatchObject({
      provided: true,
      status: 404,
      error: 'Unknown project'
    })
    expect(resolveProjectSelection(registry, { projectId: '' })).toMatchObject({
      provided: true,
      status: 400
    })
  })

  it('reports unavailable readers and profile read errors without hiding them as unknown IDs', () => {
    expect(resolveProjectSelection(null, { projectId: 'flightctl' })).toMatchObject({
      provided: true,
      status: 503
    })
    expect(resolveProjectSelection({ get() { throw new Error('storage unavailable') } }, { projectId: 'flightctl' }))
      .toMatchObject({ provided: true, status: 500, error: 'storage unavailable' })
  })

  it('creates envelopes with project, source, freshness, and error metadata', () => {
    const profile = normalizeProjectProfile(FLIGHTCTL)
    const envelope = createPublicationEnvelope(profile, 'ci/run-1.json', { passed: 3 }, {
      sourceId: 'flightctl-core-actions',
      sourceKind: 'github-actions',
      sourceEndpoint: 'https://api.github.com/repos/flightctl/flightctl/actions/runs',
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
        endpoint: 'https://api.github.com/repos/flightctl/flightctl/actions/runs',
        revision: 'abc123',
        runId: '35722329385'
      },
      observedAt: '2026-09-22T11:01:00.000Z',
      state: 'supported',
      freshness: 'fresh',
      partial: true,
      data: { passed: 3 }
    })
  })

  it('uses explicit nulls for an unknown endpoint and an unsuccessful observation', () => {
    const envelope = createPublicationEnvelope(FLIGHTCTL, 'ci/status.json', null, {
      state: 'error'
    })

    expect(envelope.source.endpoint).toBeNull()
    expect(envelope.observedAt).toBeNull()
  })

  it.each([
    ['supported without a fetch timestamp', 'supported', {}, null],
    ['empty without a fetch timestamp', 'empty', {}, null],
    ['supported with blank timestamps', 'supported', { observedAt: '', fetchedAt: '' }, null],
    ['supported with a fetch timestamp', 'supported', { fetchedAt: '2026-09-22T11:01:00.000Z' }, '2026-09-22T11:01:00.000Z'],
    ['empty with a fetch timestamp', 'empty', { fetchedAt: '2026-09-22T11:01:00.000Z' }, '2026-09-22T11:01:00.000Z'],
    ['unavailable with a fetch timestamp', 'unavailable', { fetchedAt: '2026-09-22T11:01:00.000Z' }, null],
    ['source-only with a fetch timestamp', 'source-only', { fetchedAt: '2026-09-22T11:01:00.000Z' }, null],
    ['error with a fetch timestamp', 'error', { fetchedAt: '2026-09-22T11:01:00.000Z' }, null],
    ['unavailable with an explicit observation', 'unavailable', { observedAt: '2026-09-22T11:02:00.000Z' }, '2026-09-22T11:02:00.000Z'],
    ['supported with an explicit observation', 'supported', {
      fetchedAt: '2026-09-22T11:01:00.000Z', observedAt: '2026-09-22T11:02:00.000Z'
    }, '2026-09-22T11:02:00.000Z']
  ])('sets observedAt for %s', (_description, state, timestamps, expected) => {
    const envelope = createPublicationEnvelope(FLIGHTCTL, 'ci/status.json', null, {
      state,
      ...timestamps
    })

    expect(envelope.observedAt).toBe(expected)
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
      fetchedAt: '2026-09-22T10:01:00.000Z',
      observedAt: '2026-09-22T10:01:00.000Z',
      attemptedAt: '2026-09-22T10:01:00.000Z',
      source: {
        id: 'old-source',
        kind: 'github-actions',
        endpoint: 'https://api.github.com/repos/flightctl/flightctl/actions/runs/old-run',
        revision: 'old-sha',
        runId: 'old-run'
      },
      data: { passed: 3 }
    }
    const storage = makeStorage({ [key]: previous }, (writeKey, value, data) => {
      if (writeKey === key) throw Object.assign(new Error('source timeout'), { code: 'ETIMEDOUT' })
      data[writeKey] = value
    })

    const result = registry.publish(storage, 'flightctl', 'ci/run-1.json', { passed: 4 }, {
      sourceId: 'new-source',
      sourceKind: 'gitlab',
      sourceEndpoint: 'https://example.com/new-run',
      sourceRevision: 'new-sha',
      runId: 'new-run',
      generatedAt: '2026-09-22T11:00:00.000Z',
      fetchedAt: '2026-09-22T11:01:00.000Z',
      observedAt: '2026-09-22T11:01:00.000Z',
      attemptedAt: '2026-09-22T11:02:00.000Z'
    })

    expect(result.ok).toBe(false)
    expect(result.preserved).toBe(true)
    expect(storage.data[key]).toBe(previous)
    expect(storage.data[result.statusKey].source).toEqual(previous.source)
    expect(storage.data[result.statusKey]).toMatchObject({
      state: 'error',
      freshness: 'stale',
      partial: true,
      error: { code: 'ETIMEDOUT', message: 'source timeout' },
      generatedAt: '2026-09-22T10:00:00.000Z',
      fetchedAt: '2026-09-22T10:01:00.000Z',
      observedAt: '2026-09-22T10:01:00.000Z',
      attemptedAt: '2026-09-22T11:02:00.000Z',
      source: previous.source,
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

  it('writes null source and data timestamps when publication fails without a previous artifact', () => {
    const registry = createProjectProfileRegistry([FLIGHTCTL])
    const key = 'projects/flightctl/ci/run-1.json'
    const storage = makeStorage({}, (writeKey, value, data) => {
      if (writeKey === key) throw new Error('storage unavailable')
      data[writeKey] = value
    })

    const result = registry.publish(storage, 'flightctl', 'ci/run-1.json', { passed: 4 }, {
      sourceId: 'new-source',
      sourceEndpoint: 'https://example.com/new-run',
      generatedAt: '2026-09-22T11:00:00.000Z',
      fetchedAt: '2026-09-22T11:01:00.000Z',
      observedAt: '2026-09-22T11:01:00.000Z',
      attemptedAt: '2026-09-22T11:02:00.000Z'
    })

    expect(result.ok).toBe(false)
    expect(result.preserved).toBe(false)
    expect(storage.data[result.statusKey]).toMatchObject({
      source: { id: null, kind: null, endpoint: null, revision: null, runId: null },
      generatedAt: null,
      fetchedAt: null,
      observedAt: null,
      attemptedAt: '2026-09-22T11:02:00.000Z',
      lastKnownGood: null,
      data: null
    })
  })
})

import { describe, it, expect } from 'vitest'

const { buildMapping } = require('../../../../../shared/server/anonymize')
const releasesExport = require('../../../server/export')

const FIXTURE_ROSTER = {
  vp: { name: 'Demo VP', uid: 'demovp' },
  orgs: {
    demoorg1: {
      leader: {
        name: 'Alice Chen', uid: 'achen', email: 'achen@example.com',
        githubUsername: 'alicechen', gitlabUsername: 'alicechen'
      },
      members: []
    }
  }
}

function makeStorage(data = {}) {
  return {
    readFromStorage(key) {
      return data[key] ? JSON.parse(JSON.stringify(data[key])) : null
    },
    writeToStorage() {},
    listStorageFiles(dir) {
      return Object.keys(data)
        .filter(k => k.startsWith(dir + '/') || k.startsWith(dir))
        .map(k => k.split('/').pop())
    }
  }
}

function makeProjectPublication({ detailGenerationId = 'flightctl-generation-1' } = {}) {
  const profile = {
    schemaVersion: 1,
    profileRevision: '1111111111111111',
    executeRevision: '2222222222222222',
    projectId: 'flightctl',
    displayName: 'Flight Control',
    jiraProjectKey: 'EDM',
    jiraProjectName: 'Flight Control',
    repositories: [],
    capabilities: { execute: { state: 'supported', artifactKey: 'releases/execution/index.json' } }
  }
  const generationId = 'flightctl-generation-1'
  const root = `projects/flightctl/generations/${generationId}`
  const envelope = (artifactKey, data, id = generationId) => ({
    schemaVersion: 1,
    projectId: 'flightctl',
    profileRevision: profile.profileRevision,
    executeRevision: profile.executeRevision,
    generationId: id,
    artifactKey,
    state: 'supported',
    freshness: 'fresh',
    partial: false,
    data
  })
  const feature = { key: 'EDM-100', summary: 'Real Flight Control feature', team: null, issueCount: null }
  const detail = {
    ...feature,
    epics: [{ key: 'EDM-200', summary: 'Real Flight Control epic', parentFeatureKey: 'EDM-100', issues: [] }]
  }
  const releaseId = 'MVP Q1CY25'
  const trackingKey = 'releases/execution/tracking-data-MVP%20Q1CY25.json'
  const tracking = { releaseId, features: [{ key: 'EDM-100', summary: 'Real Flight Control feature', team: null }] }
  const index = {
    projectId: 'flightctl',
    features: [feature],
    trackingReleases: [{ releaseId, artifactKey: trackingKey }]
  }
  const registry = envelope('releases/registry.json', { releases: [{ id: releaseId }] })
  return {
    profile,
    generationId,
    root,
    projectIndex: {
      schemaVersion: 1,
      projects: [{
        projectId: profile.projectId,
        displayName: profile.displayName,
        profileRevision: profile.profileRevision,
        executeRevision: profile.executeRevision,
        profileKey: 'projects/flightctl/profile.json'
      }]
    },
    current: { projectId: profile.projectId, generationId },
    registry,
    index: envelope('releases/execution/index.json', index),
    detail: envelope('releases/execution/features/EDM-100.json', detail, detailGenerationId),
    trackingKey,
    tracking: envelope(trackingKey, tracking)
  }
}

describe('releasesExport — execution data', () => {
  it('anonymizes index.json feature keys and summaries', async () => {
    const files = []
    const addFile = (path, data) => files.push({ path, data })
    const mapping = buildMapping(FIXTURE_ROSTER)

    const storage = makeStorage({
      'releases/execution/index.json': {
        fetchedAt: '2026-01-01',
        featureCount: 1,
        features: [
          { key: 'RHAISTRAT-123', summary: 'Real feature summary', status: 'In Progress' }
        ]
      }
    })

    await releasesExport(addFile, storage, mapping)

    const indexFile = files.find(f => f.path === 'releases/execution/index.json')
    expect(indexFile).toBeDefined()
    expect(indexFile.data.features[0].key).not.toBe('RHAISTRAT-123')
    expect(indexFile.data.features[0].summary).not.toBe('Real feature summary')
  })

  it('anonymizes feature detail files', async () => {
    const files = []
    const addFile = (path, data) => files.push({ path, data })
    const mapping = buildMapping(FIXTURE_ROSTER)

    const storage = makeStorage({
      'releases/execution/index.json': {
        fetchedAt: '2026-01-01',
        featureCount: 1,
        features: [{ key: 'RHAISTRAT-1', summary: 'Test' }]
      },
      'releases/execution/features/RHAISTRAT-1.json': {
        key: 'RHAISTRAT-1',
        summary: 'Real summary',
        epics: [
          { key: 'EPIC-1', summary: 'Epic summary', assignee: 'Alice Chen', accountId: 'acc123' }
        ]
      }
    })

    await releasesExport(addFile, storage, mapping)

    const featureFile = files.find(f => f.path.startsWith('releases/execution/features/') && !f.path.includes('RHAISTRAT-1'))
    expect(featureFile).toBeDefined()
    expect(featureFile.data.key).not.toBe('RHAISTRAT-1')
    expect(featureFile.data.epics[0].key).not.toBe('EPIC-1')
    expect(featureFile.data.epics[0].assignee).not.toBe('Alice Chen')
    expect(featureFile.data.epics[0].accountId).not.toBe('acc123')
  })

  it('skips execution export when no index.json exists', async () => {
    const files = []
    const addFile = (path, data) => files.push({ path, data })
    const mapping = buildMapping(FIXTURE_ROSTER)
    const storage = makeStorage({})

    await releasesExport(addFile, storage, mapping)

    const executionFiles = files.filter(f => f.path.startsWith('releases/execution/'))
    expect(executionFiles).toHaveLength(0)
  })

  it('preserves non-PII fields', async () => {
    const files = []
    const addFile = (path, data) => files.push({ path, data })
    const mapping = buildMapping(FIXTURE_ROSTER)

    const storage = makeStorage({
      'releases/execution/index.json': {
        fetchedAt: '2026-01-01',
        schemaVersion: '1.0',
        featureCount: 1,
        features: [
          { key: 'RHAISTRAT-1', summary: 'Test', status: 'In Progress', health: 'green', completionPct: 75 }
        ]
      }
    })

    await releasesExport(addFile, storage, mapping)

    const indexFile = files.find(f => f.path === 'releases/execution/index.json')
    expect(indexFile.data.fetchedAt).toBe('2026-01-01')
    expect(indexFile.data.schemaVersion).toBe('1.0')
    expect(indexFile.data.features[0].status).toBe('In Progress')
    expect(indexFile.data.features[0].health).toBe('green')
    expect(indexFile.data.features[0].completionPct).toBe(75)
  })

  it('exports registry when present', async () => {
    const files = []
    const addFile = (path, data) => files.push({ path, data })
    const mapping = buildMapping(FIXTURE_ROSTER)

    const storage = makeStorage({
      'releases/registry.json': { versions: ['1.0', '2.0'] }
    })

    await releasesExport(addFile, storage, mapping)

    const registryFile = files.find(f => f.path === 'releases/registry.json')
    expect(registryFile).toBeDefined()
    expect(registryFile.data.versions).toEqual(['1.0', '2.0'])
  })

  it('exports project Execute artifacts under the selected immutable project generation and keeps legacy OSAC output', async () => {
    const fixture = makeProjectPublication()
    const files = []
    const addFile = (path, data) => files.push({ path, data })
    const mapping = buildMapping(FIXTURE_ROSTER)
    const storage = makeStorage({
      'projects/index.json': fixture.projectIndex,
      'projects/flightctl/profile.json': fixture.profile,
      'projects/flightctl/current.json': fixture.current,
      [`${fixture.root}/profile.json`]: fixture.profile,
      [`${fixture.root}/releases/registry.json`]: fixture.registry,
      [`${fixture.root}/releases/execution/index.json`]: fixture.index,
      [`${fixture.root}/releases/execution/features/EDM-100.json`]: fixture.detail,
      [`${fixture.root}/${fixture.trackingKey}`]: fixture.tracking,
      'releases/execution/index.json': {
        fetchedAt: '2026-01-01',
        featureCount: 1,
        features: [{ key: 'OSAC-1', summary: 'Legacy OSAC feature' }]
      }
    })

    await releasesExport(addFile, storage, mapping)

    const projectIndex = files.find(file => file.path === 'projects/index.json')
    const projectExecuteIndex = files.find(file => file.path === `${fixture.root}/releases/execution/index.json`)
    const detail = files.find(file => file.path === `${fixture.root}/releases/execution/features/EDM-100.json`)
    const tracking = files.find(file => file.path === `${fixture.root}/${fixture.trackingKey}`)
    const legacyOsac = files.find(file => file.path === 'releases/execution/index.json')

    expect(projectIndex).toBeDefined()
    expect(projectExecuteIndex.data.projectId).toBe('flightctl')
    expect(projectExecuteIndex.data.generationId).toBe(fixture.generationId)
    expect(projectExecuteIndex.data.data.features[0].key).not.toBe('EDM-100')
    expect(detail.data.generationId).toBe(fixture.generationId)
    expect(detail.data.data.epics[0].parentFeatureKey).toBe(detail.data.data.key)
    expect(tracking.data.data.features[0].key).not.toBe('EDM-100')
    expect(legacyOsac.data.features[0].key).not.toBe('OSAC-1')
  })

  it('rejects project Execute exports that mix feature detail generations', async () => {
    const fixture = makeProjectPublication({ detailGenerationId: 'old-generation' })
    const mapping = buildMapping(FIXTURE_ROSTER)
    const storage = makeStorage({
      'projects/index.json': fixture.projectIndex,
      'projects/flightctl/profile.json': fixture.profile,
      'projects/flightctl/current.json': fixture.current,
      [`${fixture.root}/profile.json`]: fixture.profile,
      [`${fixture.root}/releases/execution/index.json`]: fixture.index,
      [`${fixture.root}/releases/execution/features/EDM-100.json`]: fixture.detail
    })

    await expect(releasesExport(() => {}, storage, mapping)).rejects.toThrow(/publication identity mismatch/)
  })
})

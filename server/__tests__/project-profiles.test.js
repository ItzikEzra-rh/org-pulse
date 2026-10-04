import { afterEach, describe, it, expect, vi } from 'vitest'

const { createServerProjectProfiles, createProjectListHandler } = require('../project-profiles')
const demoStorage = require('../../shared/server/demo-storage')

const OSAC = {
  schemaVersion: 1,
  profileRevision: '1ba4e768d512d277',
  projectId: 'osac',
  displayName: 'OSAC',
  jiraProjectKey: 'OSAC',
  jiraProjectName: 'Open Source as a Cloud',
  repositories: [],
  sources: [],
  teamIds: [],
  capabilities: { releaseRegistry: { state: 'supported', artifactKey: 'releases/registry.json' } }
}

const FLIGHTCTL = {
  schemaVersion: 1,
  profileRevision: 'd773101e2e07c378',
  projectId: 'flightctl',
  displayName: 'Flight Control',
  jiraProjectKey: 'EDM',
  jiraProjectName: 'Flight Control',
  repositories: [
    { fullName: 'flightctl/flightctl', role: 'delivery', authority: 'core implementation' },
    { fullName: 'flightctl/flightctl-ui', role: 'delivery', authority: 'UI implementation' },
    { fullName: 'flightctl/flightctl-ui-tests', role: 'capability', authority: 'UI test evidence' },
    { fullName: 'flightctl/design-docs', role: 'planning', authority: 'planning documents' }
  ],
  sources: [],
  teamIds: [
    '366df4de-dc38-4f71-9f0d-9916d450c20c',
    '73ce1d26-43fc-4432-92eb-ce48c5e5e200',
    '6c3a5b90-0ac3-454f-ac77-640fa449e76c',
    '98bd1239-df20-437c-ac83-357d4da4288a',
    '374274a4-ea59-4670-8c7a-6a2c9dd848b0',
    '019a7821-0815-4e99-ba07-45ac06e8f9b6'
  ],
  capabilities: {
    releaseRegistry: { state: 'supported', artifactKey: 'releases/registry.json' },
    accessRestrictions: null
  }
}

function makeStorage(overrides = {}) {
  const data = {
    'projects/index.json': {
      schemaVersion: 1,
      projects: [
        {
          projectId: 'osac',
          displayName: OSAC.displayName,
          profileRevision: OSAC.profileRevision,
          profileKey: 'projects/osac/profile.json'
        },
        {
          projectId: 'flightctl',
          displayName: FLIGHTCTL.displayName,
          profileRevision: FLIGHTCTL.profileRevision,
          profileKey: 'projects/flightctl/profile.json'
        }
      ]
    },
    'projects/osac/profile.json': OSAC,
    'projects/flightctl/profile.json': FLIGHTCTL,
    ...overrides
  }
  return { readFromStorage: key => Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null }
}

describe('server project profiles', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads explicit OSAC and Flightctl profiles from published storage', () => {
    const projectProfiles = createServerProjectProfiles(makeStorage())
    expect(projectProfiles.list().map(profile => profile.projectId)).toEqual(['osac', 'flightctl'])
    expect(projectProfiles.get('flightctl')).toMatchObject({
      projectId: 'flightctl',
      jiraProjectKey: 'EDM',
      repositories: FLIGHTCTL.repositories,
      teamIds: FLIGHTCTL.teamIds
    })
  })

  it('does not use the profile reader as an access-control decision', () => {
    const projectProfiles = createServerProjectProfiles(makeStorage())
    expect(projectProfiles.get('flightctl').capabilities.accessRestrictions).toBeNull()
  })

  it('preserves a valid single-project OSAC deployment', () => {
    const projectProfiles = createServerProjectProfiles(makeStorage({
      'projects/index.json': {
        schemaVersion: 1,
        projects: [{
          projectId: 'osac',
          displayName: OSAC.displayName,
          profileRevision: OSAC.profileRevision,
          profileKey: 'projects/osac/profile.json'
        }]
      },
      'projects/flightctl/profile.json': null
    }))
    expect(projectProfiles.list().map(profile => profile.projectId)).toEqual(['osac'])
  })

  it('raises a discovery error when the published index is missing', () => {
    const projectProfiles = createServerProjectProfiles({ readFromStorage: () => null })
    expect(() => projectProfiles.list()).toThrow(expect.objectContaining({
      name: 'ProjectProfileIndexError',
      code: 'PROJECT_INDEX_MISSING'
    }))
  })

  it('has no profile fallback for an unknown project', () => {
    const projectProfiles = createServerProjectProfiles(makeStorage())
    expect(projectProfiles.get('rhoai')).toBeNull()
  })

  it('serves the checked-in single-OSAC discovery fixture through the projects API handler', () => {
    const projectProfiles = createServerProjectProfiles(demoStorage)
    const response = createResponse()
    const handler = createProjectListHandler(projectProfiles)

    handler({}, response)

    expect(response.status).not.toHaveBeenCalled()
    expect(response.json).toHaveBeenCalledWith({
      projects: [{ projectId: 'osac', displayName: 'OSAC' }]
    })
  })

  it('maps missing discovery publication to HTTP 503 through the projects API handler', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const projectProfiles = createServerProjectProfiles({ readFromStorage: () => null })
    const response = createResponse()

    createProjectListHandler(projectProfiles)({}, response)

    expect(response.status).toHaveBeenCalledWith(503)
    expect(response.json).toHaveBeenCalledWith({
      error: 'Failed to list published projects',
      code: 'PROJECT_INDEX_MISSING'
    })
  })
})

function createResponse() {
  return {
    status: vi.fn(function (statusCode) {
      this.statusCode = statusCode
      return this
    }),
    json: vi.fn(function (body) {
      this.body = body
      return this
    })
  }
}

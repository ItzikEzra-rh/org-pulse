import { describe, it, expect } from 'vitest'

const createProjectProfiles = require('../project-profiles')

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
  it('reads explicit OSAC and Flightctl profiles from published storage', () => {
    const projectProfiles = createProjectProfiles(makeStorage())
    expect(projectProfiles.list().map(profile => profile.projectId)).toEqual(['osac', 'flightctl'])
    expect(projectProfiles.get('flightctl')).toMatchObject({
      projectId: 'flightctl',
      jiraProjectKey: 'EDM',
      repositories: FLIGHTCTL.repositories,
      teamIds: FLIGHTCTL.teamIds
    })
  })

  it('does not use the profile reader as an access-control decision', () => {
    const projectProfiles = createProjectProfiles(makeStorage())
    expect(projectProfiles.get('flightctl').capabilities.accessRestrictions).toBeNull()
  })

  it('preserves a valid single-project OSAC deployment', () => {
    const projectProfiles = createProjectProfiles(makeStorage({
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
    const projectProfiles = createProjectProfiles({ readFromStorage: () => null })
    expect(() => projectProfiles.list()).toThrow(expect.objectContaining({
      name: 'ProjectProfileIndexError',
      code: 'PROJECT_INDEX_MISSING'
    }))
  })

  it('has no profile fallback for an unknown project', () => {
    const projectProfiles = createProjectProfiles(makeStorage())
    expect(projectProfiles.get('rhoai')).toBeNull()
  })
})

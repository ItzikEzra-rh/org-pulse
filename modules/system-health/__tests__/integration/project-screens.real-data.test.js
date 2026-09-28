/**
 * Real-data acceptance for shared project readers against the immutable
 * candidate data (ORG_PULSE_REAL_DATA_DIR). Validates the data-backed
 * projects reader resolves both published projects and their
 * capability-driven artifacts from actual collected snapshots.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createProjectProfileReader } from '@shared/server/project-profile'

let reader
let realDataDir

beforeAll(() => {
  realDataDir = process.env.ORG_PULSE_REAL_DATA_DIR
  if (!realDataDir) throw new Error('ORG_PULSE_REAL_DATA_DIR is required for real-data acceptance')
  const storage = {
    readFromStorage: key => {
      try {
        return JSON.parse(readFileSync(join(realDataDir, key), 'utf-8'))
      } catch {
        return null
      }
    }
  }
  reader = createProjectProfileReader(storage)
})

describe('published projects resolve from real collected data', () => {
  it('lists both published projects with identity and capabilities', () => {
    const projects = reader.list()
    const ids = projects.map(p => p.projectId).sort()
    expect(ids).toEqual(['flightctl', 'osac'])
    const flightctl = projects.find(p => p.projectId === 'flightctl')
    expect(flightctl.jiraProjectKey).toBe('EDM')
    expect(flightctl.profileRevision).toMatch(/^[a-f0-9]{16}$/)
  })

  it('resolves the flightctl profile with capability artifact keys', () => {
    const profile = reader.get('flightctl')
    expect(profile.projectId).toBe('flightctl')
    for (const capability of ['releaseRegistry', 'buildRegistry', 'releaseExecution', 'operationalIntegrations']) {
      const entry = profile.capabilities[capability]
      expect(entry.state).toBe('supported')
      expect(typeof entry.artifactKey).toBe('string')
    }
  })

  it('returns 404-equivalent null for an unknown project', () => {
    expect(reader.get('nonexistent')).toBeNull()
  })
})

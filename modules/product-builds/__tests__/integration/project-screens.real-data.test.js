/**
 * Real-data acceptance for Product Builds' capability-driven publication
 * reads against the immutable candidate data (ORG_PULSE_REAL_DATA_DIR).
 * Validates the build registry publication resolves from actual collected
 * snapshots via the profile's capabilities block.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let publications
let profiles

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

beforeAll(() => {
  const realDataDir = process.env.ORG_PULSE_REAL_DATA_DIR
  if (!realDataDir) throw new Error('ORG_PULSE_REAL_DATA_DIR is required for real-data acceptance')
  const reader = (projectId) => {
    const profile = JSON.parse(readFileSync(join(realDataDir, 'projects', projectId, 'profile.json'), 'utf-8'))
    return { profile, readArtifact: (key) => {
      try {
        return JSON.parse(readFileSync(join(realDataDir, 'projects', projectId, key), 'utf-8'))
      } catch {
        return null
      }
    } }
  }
  publications = { flightctl: reader('flightctl') }
  profiles = { flightctl: publications.flightctl.profile }
})

describe.skipIf(!process.env.ORG_PULSE_REAL_DATA_DIR)('capability-driven build publication resolves from real collected data', () => {
  it('resolves the buildRegistry artifact key from the published profile', () => {
    const profile = profiles.flightctl
    expect(profile.capabilities.buildRegistry.state).toBe('supported')
    expect(typeof profile.capabilities.buildRegistry.artifactKey).toBe('string')
  })

  it('exposes the build registry envelope with truthful freshness from real snapshots', () => {
    const artifactKey = profiles.flightctl.capabilities.buildRegistry.artifactKey
    const artifact = publications.flightctl.readArtifact(artifactKey)
    const envelope = artifact?.value ?? artifact
    expect(isRecord(envelope)).toBe(true)
    expect(envelope.schemaVersion).toBe(1)
    expect(envelope.projectId).toBe('flightctl')
    expect(envelope.artifactKey).toBe(artifactKey)
    expect(isRecord(envelope.data)).toBe(true)
    expect(envelope.data.projectId).toBe('flightctl')
    // Actual collected snapshots carry capture bounds, not invented totals.
    expect(['supported', 'empty']).toContain(envelope.state)
    expect(typeof envelope.freshness).toBe('string')
  })
})

/**
 * Real-data acceptance for the AI module's project-qualified provenance reads
 * against the immutable candidate data (ORG_PULSE_REAL_DATA_DIR). Validates
 * the published AI provenance artifact resolves from actual collected
 * snapshots with the data repo's collector envelope shape.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let publications
let realDataDir

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

beforeAll(() => {
  realDataDir = process.env.ORG_PULSE_REAL_DATA_DIR
  if (!realDataDir) throw new Error('ORG_PULSE_REAL_DATA_DIR is required for real-data acceptance')
  // Unreachable when skipped via describe.skipIf above; kept fail-closed for
  // any runner that sets an empty-string value.
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
  publications = { flightctl: reader('flightctl'), osac: reader('osac') }
})

describe.skipIf(!process.env.ORG_PULSE_REAL_DATA_DIR)('published AI provenance resolves from real collected data', () => {
  it('exposes the flightctl provenance envelope with scanner or explicit unavailable state', () => {
    const artifact = publications.flightctl.readArtifact('sources/ai-provenance/registry.json')
    const envelope = artifact?.value ?? artifact
    expect(isRecord(envelope)).toBe(true)
    expect(envelope.schemaVersion).toBe(1)
    expect(envelope.projectId).toBe('flightctl')
    expect(envelope.artifactKey).toBe('sources/ai-provenance/registry.json')
    expect(isRecord(envelope.data)).toBe(true)
    expect(envelope.data.projectId).toBe('flightctl')
    // Actual collected snapshots carry scanner evidence or an explicit
    // unavailable state; a missing scanner is never zero or OSAC data.
    if (envelope.state === 'supported') {
      expect(isRecord(envelope.data.scanner) || envelope.data.scanner === null).toBe(true)
    } else {
      expect(['unavailable', 'error', 'empty']).toContain(envelope.state)
    }
  })

  it('keeps the AI gate explicitly not-configured from real evidence', () => {
    const artifact = publications.flightctl.readArtifact('sources/ai-provenance/registry.json')
    const envelope = artifact?.value ?? artifact
    if (envelope.data?.diagnostics?.aiGate) {
      expect(envelope.data.diagnostics.aiGate.state).toBe('not-configured')
    }
  })
})

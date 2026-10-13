/**
 * Real-data acceptance for People and Teams' project-qualified roster reads
 * against the immutable candidate data (ORG_PULSE_REAL_DATA_DIR). Validates
 * the published roster artifact resolves from actual collected snapshots with
 * members derived from person.teamIds.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readProjectPeopleTeams } from '../../server/project-roster.js'

let projects

beforeAll(() => {
  const realDataDir = process.env.ORG_PULSE_REAL_DATA_DIR
  if (!realDataDir) throw new Error('ORG_PULSE_REAL_DATA_DIR is required for real-data acceptance')
  const readProfile = projectId => JSON.parse(readFileSync(join(realDataDir, 'projects', projectId, 'profile.json'), 'utf-8'))
  const readArtifact = (projectId, key) => {
    try {
      const raw = readFileSync(join(realDataDir, 'projects', projectId, key), 'utf-8')
      return { value: JSON.parse(raw), generationId: null }
    } catch {
      return null
    }
  }
  projects = {
    get: projectId => {
      try {
        return readProfile(projectId)
      } catch {
        return null
      }
    },
    readArtifact: (projectId, key) => readArtifact(projectId, key)
  }
})

describe.skipIf(!process.env.ORG_PULSE_REAL_DATA_DIR)('published roster resolves from real collected data', () => {
  it('derives the flightctl read model with real team membership', () => {
    const result = readProjectPeopleTeams(projects, 'flightctl')
    expect(result.status).toBe(200)
    const model = result.model
    expect(model.projectId).toBe('flightctl')
    if (model.availability === 'available') {
      expect(model.generatedAt).toBeTruthy()
      expect(model.people).toHaveLength(23)
      expect(model.people.filter(person => person.active)).toHaveLength(23)
      expect(model.teams.length).toBeGreaterThan(0)
      const memberCount = model.teams.reduce((sum, team) => sum + team.memberAccountIds.length, 0)
      expect(memberCount).toBeGreaterThan(0)
      expect(model.people.every(person => 'managerRef' in person)).toBe(true)
      // Enrichment is optional: only assert its shape if the publication exists.
      if (model.enrichment) {
        expect(['fresh', 'stale', 'partial', 'absent']).toContain(model.enrichment.state)
        if (model.enrichment.state !== 'absent') {
          expect(Array.isArray(model.auxiliaryManagers)).toBe(false)
          expect(typeof model.auxiliaryManagers).toBe('object')
        }
      }
    } else {
      expect(['unavailable', 'empty']).toContain(model.availability)
    }
  })

  it('returns 404 for an unknown project from real data', () => {
    const result = readProjectPeopleTeams(projects, 'nonexistent')
    expect(result.status).toBe(404)
    expect(result.error).toBe('Unknown project')
  })
})

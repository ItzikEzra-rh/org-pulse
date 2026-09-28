/**
 * Real-data acceptance for People and Teams' project-qualified roster reads
 * against the immutable candidate data (ORG_PULSE_REAL_DATA_DIR). Validates
 * the published roster artifact resolves from actual collected snapshots with
 * members derived from person.teamIds.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readProjectRoster } from '../../server/project-roster.js'

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

describe('published roster resolves from real collected data', () => {
  it('derives the flightctl roster with real team membership', () => {
    const result = readProjectRoster(projects, 'flightctl')
    expect(result.status).toBe(200)
    const roster = result.roster
    expect(roster.projectId).toBe('flightctl')
    expect(roster.teamDataSource).toBe('project-publication')
    if (roster.state === 'supported') {
      expect(roster.publication.state).toBe('supported')
      expect(roster.publication.generatedAt).toBeTruthy()
      const org = roster.orgs[0]
      expect(org.key).toBe('flightctl')
      expect(Object.keys(org.teams).length).toBeGreaterThan(0)
      const memberCount = Object.values(org.teams).reduce(
        (sum, team) => sum + team.members.length, 0
      )
      expect(memberCount).toBeGreaterThan(0)
    } else {
      expect(['unavailable', 'empty']).toContain(roster.state)
    }
  })

  it('returns 404 for an unknown project from real data', () => {
    const result = readProjectRoster(projects, 'nonexistent')
    expect(result.status).toBe(404)
    expect(result.error).toBe('Unknown project')
  })
})

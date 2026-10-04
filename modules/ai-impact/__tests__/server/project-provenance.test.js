/**
 * Project-qualified AI module wiring: OSAC-only pipeline routes never serve
 * OSAC data for a non-OSAC project; the provenance route exposes real
 * published evidence per project.
 */
import { describe, it, expect } from 'vitest'
import { readProjectProvenance } from '../../server/project-provenance.js'

function mockProjects(publications = {}, profiles = {}) {
  return {
    get: projectId => profiles[projectId] || null,
    readArtifact: (projectId, key) => publications[projectId]?.[key] || null
  }
}

function makeProvenanceEnvelope(projectId, overrides = {}) {
  return {
    schemaVersion: 1,
    projectId,
    profileRevision: 'rev',
    artifactKey: 'sources/ai-provenance/registry.json',
    source: { id: `${projectId}-ai-provenance`, kind: 'ai-provenance' },
    state: 'supported',
    freshness: 'fresh',
    partial: false,
    error: null,
    generatedAt: '2026-09-28T00:00:00Z',
    fetchedAt: '2026-09-28T00:00:00Z',
    observedAt: '2026-09-28T00:00:00Z',
    data: {
      projectId,
      scanner: { title: 'AI Commits Scanner', aiSummary: { percent: 84.2 } },
      signals: { jira: [], github: [], designDocs: [] },
      diagnostics: { aiGate: { state: 'not-configured' } },
      ...overrides
    }
  }
}

describe('readProjectProvenance', () => {
  it('exposes the published provenance with publication metadata', () => {
    const projects = mockProjects({
      flightctl: { 'sources/ai-provenance/registry.json': { value: makeProvenanceEnvelope('flightctl') } }
    }, { flightctl: { projectId: 'flightctl' } });
    const result = readProjectProvenance(projects, 'flightctl');
    expect(result.status).toBe(200);
    expect(result.provenance.projectId).toBe('flightctl');
    expect(result.provenance.data.scanner.aiSummary.percent).toBe(84.2);
    expect(result.provenance.publication.generatedAt).toBe('2026-09-28T00:00:00Z');
  });

  it('returns 404 for an unknown project', () => {
    const result = readProjectProvenance(mockProjects(), 'nonexistent');
    expect(result.status).toBe(404);
    expect(result.error).toBe('Unknown project');
  });

  it('returns 404 when the publication is missing', () => {
    const result = readProjectProvenance(mockProjects({}, { osac: { projectId: 'osac' } }), 'osac');
    expect(result.status).toBe(404);
    expect(result.error).toBe('Project AI provenance publication is unavailable');
  });

  it('rejects identity mismatched publications', () => {
    const projects = mockProjects({
      flightctl: { 'sources/ai-provenance/registry.json': { value: makeProvenanceEnvelope('osac') } }
    }, { flightctl: { projectId: 'flightctl' } });
    const result = readProjectProvenance(projects, 'flightctl');
    expect(result.status).toBe(502);
    expect(result.error).toBe('Project AI provenance publication identity mismatch');
  });

  it('rejects malformed publications', () => {
    const projects = mockProjects({
      flightctl: { 'sources/ai-provenance/registry.json': { value: { not: 'an envelope' } } }
    }, { flightctl: { projectId: 'flightctl' } });
    const result = readProjectProvenance(projects, 'flightctl');
    expect(result.status).toBe(502);
  });
});

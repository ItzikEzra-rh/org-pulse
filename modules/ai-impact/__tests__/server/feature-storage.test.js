import { describe, it, expect, vi } from 'vitest';
import {
  readFeatures,
  getLatestProjection,
  countHistoryEntries
} from '../../server/features/storage.js';

function makeReleasesIndex(features = []) {
  return {
    fetchedAt: '2026-04-19T12:00:00Z',
    schemaVersion: 'v2',
    featureCount: features.length,
    features
  };
}

function makeFeatureFile(overrides = {}) {
  return {
    key: 'RHAISTRAT-1168',
    summary: 'GPU-as-a-Service Observability',
    status: 'Refined',
    priority: 'Major',
    labels: ['strat-creator-auto-created'],
    aiReview: {
      title: 'GPU-as-a-Service Observability',
      sourceRfe: 'RHAIRFE-262',
      size: 'L',
      recommendation: 'approve',
      needsAttention: false,
      humanReviewStatus: 'approved',
      scores: { feasibility: 1, testability: 1, scope: 2, architecture: 2, total: 6 },
      reviewers: { feasibility: 'approve', testability: 'revise', scope: 'approve', architecture: 'approve' },
      reviewedAt: '2026-04-19T12:00:00Z',
      history: [
        { scores: { feasibility: 1, testability: 1, scope: 1, architecture: 1, total: 4 }, recommendation: 'revise', needsAttention: true, humanReviewStatus: 'needs-review', reviewedAt: '2026-04-10T00:00:00Z' }
      ],
      ...overrides
    }
  };
}

describe('readFeatures', () => {
  it('returns features from releases index when aiReview data exists', () => {
    const indexEntry = {
      key: 'RHAISTRAT-1168',
      summary: 'GPU-as-a-Service Observability',
      status: 'Refined',
      priority: 'Major',
      labels: ['strat-creator-auto-created'],
      aiReview: {
        recommendation: 'approve',
        scores: { feasibility: 1, testability: 1, scope: 2, architecture: 2, total: 6 },
        humanReviewStatus: 'approved',
        needsAttention: false,
        reviewedAt: '2026-04-19T12:00:00Z'
      }
    };
    const featureFile = makeFeatureFile();
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') return makeReleasesIndex([indexEntry]);
      if (key === 'releases/execution/features/RHAISTRAT-1168.json') return featureFile;
      return null;
    });

    const result = readFeatures(read);
    expect(result.totalFeatures).toBe(1);
    expect(result.features['RHAISTRAT-1168']).toBeDefined();
    expect(result.features['RHAISTRAT-1168'].latest.recommendation).toBe('approve');
    expect(result.features['RHAISTRAT-1168'].history).toHaveLength(1);
  });

  it('surfaces aiInvolvement, provenanceKind, and created when the pipeline provides them', () => {
    const indexEntry = { key: 'RHAISTRAT-1168', aiReview: { recommendation: 'approve' } };
    const featureFile = makeFeatureFile({ aiInvolvement: 'both', provenanceKind: 'design-workflow' });
    featureFile.created = '2026-03-01T00:00:00Z';
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') return makeReleasesIndex([indexEntry]);
      if (key === 'releases/execution/features/RHAISTRAT-1168.json') return featureFile;
      return null;
    });

    const result = readFeatures(read);
    expect(result.features['RHAISTRAT-1168'].latest.aiInvolvement).toBe('both');
    expect(result.features['RHAISTRAT-1168'].latest.provenanceKind).toBe('design-workflow');
    expect(result.features['RHAISTRAT-1168'].latest.created).toBe('2026-03-01T00:00:00Z');
  });

  it('defaults aiInvolvement, provenanceKind, and created to null when the pipeline has not provided them yet', () => {
    const indexEntry = { key: 'RHAISTRAT-1168', aiReview: { recommendation: 'approve' } };
    const featureFile = makeFeatureFile();
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') return makeReleasesIndex([indexEntry]);
      if (key === 'releases/execution/features/RHAISTRAT-1168.json') return featureFile;
      return null;
    });

    const result = readFeatures(read);
    expect(result.features['RHAISTRAT-1168'].latest.aiInvolvement).toBeNull();
    expect(result.features['RHAISTRAT-1168'].latest.provenanceKind).toBeNull();
    expect(result.features['RHAISTRAT-1168'].latest.created).toBeNull();
  });

  it('does not throw when the per-feature detail file is missing', () => {
    const indexEntry = { key: 'RHAISTRAT-1168', aiReview: { recommendation: 'approve' } };
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') return makeReleasesIndex([indexEntry]);
      return null;
    });

    expect(() => readFeatures(read)).not.toThrow();
    const result = readFeatures(read);
    expect(result.features['RHAISTRAT-1168'].latest.created).toBeNull();
  });

  it('prefers the canonical Jira components field from the releases index entry over the feature file', () => {
    const indexEntry = { key: 'RHAISTRAT-1168', aiReview: { recommendation: 'approve' }, components: ['Storage'] };
    const featureFile = makeFeatureFile();
    // Per-feature detail file can carry an enhancement-proposal-derived slug here;
    // the index entry's Jira-sourced value must win regardless.
    featureFile.components = ['storage-control-plane-osac-2872'];
    featureFile.aiReview.components = ['Legacy Component'];
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') return makeReleasesIndex([indexEntry]);
      if (key === 'releases/execution/features/RHAISTRAT-1168.json') return featureFile;
      return null;
    });

    const result = readFeatures(read);
    expect(result.features['RHAISTRAT-1168'].latest.components).toEqual(['Storage']);
  });

  it('trusts an explicit empty components array on the index entry as authoritative and does not fall back', () => {
    const indexEntry = { key: 'RHAISTRAT-1168', aiReview: { recommendation: 'approve' }, components: [] };
    const featureFile = makeFeatureFile();
    featureFile.components = ['some-slug'];
    featureFile.aiReview.components = ['Legacy Component'];
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') return makeReleasesIndex([indexEntry]);
      if (key === 'releases/execution/features/RHAISTRAT-1168.json') return featureFile;
      return null;
    });

    const result = readFeatures(read);
    expect(result.features['RHAISTRAT-1168'].latest.components).toEqual([]);
  });

  it('falls back to aiReview.components when the index entry has no components field (legacy records)', () => {
    const indexEntry = { key: 'RHAISTRAT-1168', aiReview: { recommendation: 'approve' } };
    const featureFile = makeFeatureFile();
    featureFile.aiReview.components = ['Legacy Component'];
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') return makeReleasesIndex([indexEntry]);
      if (key === 'releases/execution/features/RHAISTRAT-1168.json') return featureFile;
      return null;
    });

    const result = readFeatures(read);
    expect(result.features['RHAISTRAT-1168'].latest.components).toEqual(['Legacy Component']);
  });

  it('returns an empty array when neither the index entry nor aiReview have components', () => {
    const indexEntry = { key: 'RHAISTRAT-1168', aiReview: { recommendation: 'approve' } };
    const featureFile = makeFeatureFile();
    delete featureFile.aiReview.components;
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') return makeReleasesIndex([indexEntry]);
      if (key === 'releases/execution/features/RHAISTRAT-1168.json') return featureFile;
      return null;
    });

    const result = readFeatures(read);
    expect(result.features['RHAISTRAT-1168'].latest.components).toEqual([]);
  });

  it('falls back to legacy store when no releases index', () => {
    const legacyData = {
      lastSyncedAt: '2026-04-19T12:00:00Z',
      totalFeatures: 1,
      features: { A: { latest: { key: 'A' }, history: [] } }
    };
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') return null;
      if (key === 'ai-impact/features.json') return legacyData;
      return null;
    });

    const result = readFeatures(read);
    expect(result).toBe(legacyData);
  });

  it('falls back to legacy store when releases index has no aiReview features', () => {
    const legacyData = {
      lastSyncedAt: '2026-04-19T12:00:00Z',
      totalFeatures: 1,
      features: { A: { latest: { key: 'A' }, history: [] } }
    };
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') return makeReleasesIndex([{ key: 'X', summary: 'No AI' }]);
      if (key === 'ai-impact/features.json') return legacyData;
      return null;
    });

    const result = readFeatures(read);
    expect(result).toBe(legacyData);
  });

  it('returns empty state when both stores are empty', () => {
    const read = vi.fn().mockReturnValue(null);
    expect(readFeatures(read)).toEqual({ lastSyncedAt: null, totalFeatures: 0, features: {} });
  });

  it('returns empty state when releases index exists but no features', () => {
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') return makeReleasesIndex([]);
      return null;
    });
    expect(readFeatures(read)).toEqual({ lastSyncedAt: null, totalFeatures: 0, features: {} });
  });

  it('skips features without aiReview in releases index', () => {
    const indexEntries = [
      { key: 'A', summary: 'With AI', aiReview: { recommendation: 'approve', scores: {}, humanReviewStatus: 'approved', needsAttention: false, reviewedAt: '2026-04-19T12:00:00Z' } },
      { key: 'B', summary: 'Without AI' }
    ];
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') return makeReleasesIndex(indexEntries);
      if (key === 'releases/execution/features/A.json') return { key: 'A', aiReview: { recommendation: 'approve', reviewedAt: '2026-04-19T12:00:00Z', history: [] } };
      return null;
    });

    const result = readFeatures(read);
    expect(result.totalFeatures).toBe(1);
    expect(result.features['A']).toBeDefined();
    expect(result.features['B']).toBeUndefined();
  });
});

describe('getLatestProjection', () => {
  it('returns slim projection without labels, runId, runTimestamp', () => {
    const data = {
      lastSyncedAt: '2026-04-19T12:00:00Z',
      totalFeatures: 1,
      features: {
        'A': {
          latest: {
            key: 'RHAISTRAT-1',
            title: 'Test',
            sourceRfe: 'RHAIRFE-1',
            priority: 'Major',
            status: 'New',
            size: 'M',
            recommendation: 'approve',
            needsAttention: false,
            humanReviewStatus: 'approved',
            scores: { feasibility: 2, testability: 2, scope: 2, architecture: 2, total: 8 },
            reviewers: { feasibility: 'approve', testability: 'approve', scope: 'approve', architecture: 'approve' },
            labels: ['some-label'],
            runId: 'run-1',
            reviewedAt: '2026-04-19T12:00:00Z',
            aiInvolvement: 'created',
            provenanceKind: 'design-workflow',
            created: '2026-03-01T00:00:00Z'
          },
          history: []
        }
      }
    };
    const proj = getLatestProjection(data);
    expect(proj.lastSyncedAt).toBe('2026-04-19T12:00:00Z');
    expect(proj.totalFeatures).toBe(1);
    expect(proj.features['A'].key).toBeDefined();
    expect(proj.features['A'].title).toBeDefined();
    expect(proj.features['A'].scores).toBeDefined();
    expect(proj.features['A'].reviewers).toBeDefined();
    expect(proj.features['A'].reviewedAt).toBeDefined();
    expect(proj.features['A'].aiInvolvement).toBe('created');
    expect(proj.features['A'].provenanceKind).toBe('design-workflow');
    expect(proj.features['A'].created).toBe('2026-03-01T00:00:00Z');
    // Should NOT have these fields
    expect(proj.features['A'].labels).toBeUndefined();
    expect(proj.features['A'].runId).toBeUndefined();
    expect(proj.features['A'].history).toBeUndefined();
  });
});

describe('countHistoryEntries', () => {
  it('counts all history entries across features', () => {
    const data = {
      features: {
        A: { history: [1, 2, 3] },
        B: { history: [1] },
        C: { history: [] }
      }
    };
    expect(countHistoryEntries(data)).toBe(4);
  });

  it('handles missing history arrays', () => {
    const data = { features: { A: {} } };
    expect(countHistoryEntries(data)).toBe(0);
  });
});

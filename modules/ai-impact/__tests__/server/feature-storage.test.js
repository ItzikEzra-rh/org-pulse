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

  it('passes through fixVersions from the releases index entry, defaulting to an empty array', () => {
    const withVersion = { key: 'RHAISTRAT-1168', aiReview: { recommendation: 'approve' }, fixVersions: ['rhoai-3.5'] };
    const withoutVersion = { key: 'RHAISTRAT-2000', aiReview: { recommendation: 'approve' } };
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') return makeReleasesIndex([withVersion, withoutVersion]);
      if (key === 'releases/execution/features/RHAISTRAT-1168.json') return makeFeatureFile();
      if (key === 'releases/execution/features/RHAISTRAT-2000.json') return makeFeatureFile();
      return null;
    });

    const result = readFeatures(read);
    expect(result.features['RHAISTRAT-1168'].latest.fixVersions).toEqual(['rhoai-3.5']);
    expect(result.features['RHAISTRAT-2000'].latest.fixVersions).toEqual([]);
  });

  it('surfaces prdPrStatus and prdPrUrl from the feature file aiReview', () => {
    const indexEntry = { key: 'RHAISTRAT-1168', aiReview: { recommendation: 'approve' } };
    const featureFile = makeFeatureFile({
      prdPrStatus: 'Merged',
      prdPrUrl: 'https://github.com/osac-project/enhancement-proposals/pull/1168'
    });
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') return makeReleasesIndex([indexEntry]);
      if (key === 'releases/execution/features/RHAISTRAT-1168.json') return featureFile;
      return null;
    });

    const result = readFeatures(read);
    expect(result.features['RHAISTRAT-1168'].latest.prdPrStatus).toBe('Merged');
    expect(result.features['RHAISTRAT-1168'].latest.prdPrUrl).toBe('https://github.com/osac-project/enhancement-proposals/pull/1168');
  });

  it('falls back to the index entry aiReview for prdPrStatus/prdPrUrl when the feature file lacks them', () => {
    const indexEntry = {
      key: 'RHAISTRAT-1168',
      aiReview: { recommendation: 'approve', prdPrStatus: 'Open', prdPrUrl: 'https://github.com/osac-project/enhancement-proposals/pull/99' }
    };
    const featureFile = makeFeatureFile();
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') return makeReleasesIndex([indexEntry]);
      if (key === 'releases/execution/features/RHAISTRAT-1168.json') return featureFile;
      return null;
    });

    const result = readFeatures(read);
    expect(result.features['RHAISTRAT-1168'].latest.prdPrStatus).toBe('Open');
    expect(result.features['RHAISTRAT-1168'].latest.prdPrUrl).toBe('https://github.com/osac-project/enhancement-proposals/pull/99');
  });

  it('defaults prdPrStatus and prdPrUrl to null when neither source has them', () => {
    const indexEntry = { key: 'RHAISTRAT-1168', aiReview: { recommendation: 'approve' } };
    const featureFile = makeFeatureFile();
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') return makeReleasesIndex([indexEntry]);
      if (key === 'releases/execution/features/RHAISTRAT-1168.json') return featureFile;
      return null;
    });

    const result = readFeatures(read);
    expect(result.features['RHAISTRAT-1168'].latest.prdPrStatus).toBeNull();
    expect(result.features['RHAISTRAT-1168'].latest.prdPrUrl).toBeNull();
  });

  it('surfaces designPrStatus from the feature file aiReview', () => {
    const indexEntry = { key: 'RHAISTRAT-1168', aiReview: { recommendation: 'approve' } };
    const featureFile = makeFeatureFile({ designPrStatus: 'Merged' });
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') return makeReleasesIndex([indexEntry]);
      if (key === 'releases/execution/features/RHAISTRAT-1168.json') return featureFile;
      return null;
    });

    const result = readFeatures(read);
    expect(result.features['RHAISTRAT-1168'].latest.designPrStatus).toBe('Merged');
  });

  it('falls back to the index entry aiReview for designPrStatus when the feature file lacks it', () => {
    const indexEntry = {
      key: 'RHAISTRAT-1168',
      aiReview: { recommendation: 'approve', designPrStatus: 'Open' }
    };
    const featureFile = makeFeatureFile();
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') return makeReleasesIndex([indexEntry]);
      if (key === 'releases/execution/features/RHAISTRAT-1168.json') return featureFile;
      return null;
    });

    const result = readFeatures(read);
    expect(result.features['RHAISTRAT-1168'].latest.designPrStatus).toBe('Open');
  });

  it('defaults designPrStatus to null when neither source has it (historical fallback: still surfaces as null, not blocking on URL)', () => {
    const indexEntry = { key: 'RHAISTRAT-1168', aiReview: { recommendation: 'approve' } };
    const featureFile = makeFeatureFile({ designPrUrl: null });
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') return makeReleasesIndex([indexEntry]);
      if (key === 'releases/execution/features/RHAISTRAT-1168.json') return featureFile;
      return null;
    });

    const result = readFeatures(read);
    expect(result.features['RHAISTRAT-1168'].latest.designPrStatus).toBeNull();
  });

  it('surfaces prdRecommendation, prdReviewState, and designReviewState from the feature file aiReview', () => {
    const indexEntry = { key: 'RHAISTRAT-1168', aiReview: { recommendation: 'approve' } };
    const featureFile = makeFeatureFile({
      prdRecommendation: 'revise',
      prdReviewState: 'CHANGES_REQUESTED',
      designReviewState: 'APPROVED'
    });
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') return makeReleasesIndex([indexEntry]);
      if (key === 'releases/execution/features/RHAISTRAT-1168.json') return featureFile;
      return null;
    });

    const result = readFeatures(read);
    expect(result.features['RHAISTRAT-1168'].latest.prdRecommendation).toBe('revise');
    expect(result.features['RHAISTRAT-1168'].latest.prdReviewState).toBe('CHANGES_REQUESTED');
    expect(result.features['RHAISTRAT-1168'].latest.designReviewState).toBe('APPROVED');
  });

  it('falls back to the index entry aiReview for prdRecommendation/prdReviewState/designReviewState when the feature file lacks them', () => {
    const indexEntry = {
      key: 'RHAISTRAT-1168',
      aiReview: {
        recommendation: 'approve',
        prdRecommendation: 'revise',
        prdReviewState: 'CHANGES_REQUESTED',
        designReviewState: 'APPROVED'
      }
    };
    const featureFile = makeFeatureFile();
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') return makeReleasesIndex([indexEntry]);
      if (key === 'releases/execution/features/RHAISTRAT-1168.json') return featureFile;
      return null;
    });

    const result = readFeatures(read);
    expect(result.features['RHAISTRAT-1168'].latest.prdRecommendation).toBe('revise');
    expect(result.features['RHAISTRAT-1168'].latest.prdReviewState).toBe('CHANGES_REQUESTED');
    expect(result.features['RHAISTRAT-1168'].latest.designReviewState).toBe('APPROVED');
  });

  it('defaults prdRecommendation, prdReviewState, and designReviewState to null when neither source has them', () => {
    const indexEntry = { key: 'RHAISTRAT-1168', aiReview: { recommendation: 'approve' } };
    const featureFile = makeFeatureFile();
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') return makeReleasesIndex([indexEntry]);
      if (key === 'releases/execution/features/RHAISTRAT-1168.json') return featureFile;
      return null;
    });

    const result = readFeatures(read);
    expect(result.features['RHAISTRAT-1168'].latest.prdRecommendation).toBeNull();
    expect(result.features['RHAISTRAT-1168'].latest.prdReviewState).toBeNull();
    expect(result.features['RHAISTRAT-1168'].latest.designReviewState).toBeNull();
  });

  it('passes through a bare-string assignee from the feature detail file', () => {
    const indexEntry = { key: 'RHAISTRAT-1168', aiReview: { recommendation: 'approve' } };
    const featureFile = makeFeatureFile();
    featureFile.assignee = 'dmanor@redhat.com';
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') return makeReleasesIndex([indexEntry]);
      if (key === 'releases/execution/features/RHAISTRAT-1168.json') return featureFile;
      return null;
    });

    const result = readFeatures(read);
    expect(result.features['RHAISTRAT-1168'].latest.assignee).toBe('dmanor@redhat.com');
  });

  it('extracts displayName from an object-shaped assignee on the feature detail file', () => {
    const indexEntry = { key: 'RHAISTRAT-1168', aiReview: { recommendation: 'approve' } };
    const featureFile = makeFeatureFile();
    featureFile.assignee = { displayName: 'Dan Manor', emailAddress: 'dmanor@redhat.com' };
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') return makeReleasesIndex([indexEntry]);
      if (key === 'releases/execution/features/RHAISTRAT-1168.json') return featureFile;
      return null;
    });

    const result = readFeatures(read);
    expect(result.features['RHAISTRAT-1168'].latest.assignee).toBe('Dan Manor');
  });

  it('defaults assignee to null when the feature detail file has no assignee', () => {
    const indexEntry = { key: 'RHAISTRAT-1168', aiReview: { recommendation: 'approve' } };
    const featureFile = makeFeatureFile();
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') return makeReleasesIndex([indexEntry]);
      if (key === 'releases/execution/features/RHAISTRAT-1168.json') return featureFile;
      return null;
    });

    const result = readFeatures(read);
    expect(result.features['RHAISTRAT-1168'].latest.assignee).toBeNull();
  });

  it('never reads assignee from the releases index entry, even when present there', () => {
    const indexEntry = { key: 'RHAISTRAT-1168', aiReview: { recommendation: 'approve' }, assignee: 'index-shaped@redhat.com' };
    const featureFile = makeFeatureFile();
    featureFile.assignee = { displayName: 'Dan Manor' };
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') return makeReleasesIndex([indexEntry]);
      if (key === 'releases/execution/features/RHAISTRAT-1168.json') return featureFile;
      return null;
    });

    const result = readFeatures(read);
    expect(result.features['RHAISTRAT-1168'].latest.assignee).toBe('Dan Manor');
  });

  it('does not throw and defaults assignee to null when the per-feature detail file is missing', () => {
    const indexEntry = { key: 'RHAISTRAT-1168', aiReview: { recommendation: 'approve' } };
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') return makeReleasesIndex([indexEntry]);
      return null;
    });

    expect(() => readFeatures(read)).not.toThrow();
    expect(readFeatures(read).features['RHAISTRAT-1168'].latest.assignee).toBeNull();
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
    expect(result.lastSyncedAt).toBe(legacyData.lastSyncedAt);
    expect(result.totalFeatures).toBe(legacyData.totalFeatures);
    expect(result.features.A.latest.assignee).toBeNull();
  });

  it('normalizes an object-shaped assignee on a legacy record when there is no releases index', () => {
    const legacyData = {
      lastSyncedAt: '2026-04-19T12:00:00Z',
      totalFeatures: 1,
      features: { A: { latest: { key: 'A', assignee: { displayName: 'Dan Manor' } }, history: [] } }
    };
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') return null;
      if (key === 'ai-impact/features.json') return legacyData;
      return null;
    });

    const result = readFeatures(read);
    expect(result.features.A.latest.assignee).toBe('Dan Manor');
  });

  it('falls back to legacy store when releases index has no aiReview features, backfilling fixVersions by key', () => {
    const legacyData = {
      lastSyncedAt: '2026-04-19T12:00:00Z',
      totalFeatures: 2,
      features: {
        A: { latest: { key: 'A' }, history: [] },
        B: { latest: { key: 'B', fixVersions: ['legacy-existing'] }, history: [] }
      }
    };
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') {
        return makeReleasesIndex([
          { key: 'A', summary: 'No AI', fixVersions: ['0.2'] },
          { key: 'B', summary: 'No AI', fixVersions: ['0.3'] },
          { key: 'C', summary: 'No AI, unrelated key' }
        ]);
      }
      if (key === 'ai-impact/features.json') return legacyData;
      return null;
    });

    const result = readFeatures(read);
    expect(result.lastSyncedAt).toBe(legacyData.lastSyncedAt);
    expect(result.totalFeatures).toBe(legacyData.totalFeatures);
    // Backfilled from the index by key, since the legacy record had none
    expect(result.features.A.latest.fixVersions).toEqual(['0.2']);
    // Legacy's own fixVersions is preserved, not overwritten by the index
    expect(result.features.B.latest.fixVersions).toEqual(['legacy-existing']);
    expect(result.features.A.latest.assignee).toBeNull();
  });

  it('normalizes assignee on the legacy fixVersions-backfill fallback path', () => {
    const legacyData = {
      lastSyncedAt: '2026-04-19T12:00:00Z',
      totalFeatures: 1,
      features: { A: { latest: { key: 'A', assignee: 'dmanor@redhat.com' }, history: [] } }
    };
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') {
        return makeReleasesIndex([{ key: 'A', summary: 'No AI', fixVersions: ['0.2'] }]);
      }
      if (key === 'ai-impact/features.json') return legacyData;
      return null;
    });

    const result = readFeatures(read);
    expect(result.features.A.latest.assignee).toBe('dmanor@redhat.com');
  });

  it('backfills from the index when the legacy record has an empty fixVersions array', () => {
    const legacyData = {
      lastSyncedAt: '2026-04-19T12:00:00Z',
      totalFeatures: 1,
      features: { A: { latest: { key: 'A', fixVersions: [] }, history: [] } }
    };
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') {
        return makeReleasesIndex([{ key: 'A', summary: 'No AI', fixVersions: ['0.2'] }]);
      }
      if (key === 'ai-impact/features.json') return legacyData;
      return null;
    });

    const result = readFeatures(read);
    expect(result.features.A.latest.fixVersions).toEqual(['0.2']);
  });

  it('defaults a legacy record to an empty fixVersions array when no index entry matches its key', () => {
    const legacyData = {
      lastSyncedAt: '2026-04-19T12:00:00Z',
      totalFeatures: 1,
      features: { Z: { latest: { key: 'Z' }, history: [] } }
    };
    const read = vi.fn(function(key) {
      if (key === 'releases/execution/index.json') return makeReleasesIndex([{ key: 'Q', summary: 'unrelated' }]);
      if (key === 'ai-impact/features.json') return legacyData;
      return null;
    });

    const result = readFeatures(read);
    expect(result.features.Z.latest.fixVersions).toEqual([]);
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

  it('carries prdPrStatus and prdPrUrl through, defaulting to null when absent', () => {
    const data = {
      lastSyncedAt: '2026-04-19T12:00:00Z',
      totalFeatures: 2,
      features: {
        'A': { latest: { key: 'RHAISTRAT-1', prdPrStatus: 'Merged', prdPrUrl: 'https://example.com/pr/1' }, history: [] },
        'B': { latest: { key: 'RHAISTRAT-2' }, history: [] }
      }
    };
    const proj = getLatestProjection(data);
    expect(proj.features['A'].prdPrStatus).toBe('Merged');
    expect(proj.features['A'].prdPrUrl).toBe('https://example.com/pr/1');
    expect(proj.features['B'].prdPrStatus).toBeNull();
    expect(proj.features['B'].prdPrUrl).toBeNull();
  });

  it('carries designPrUrl through, defaulting to null when absent', () => {
    const data = {
      lastSyncedAt: '2026-04-19T12:00:00Z',
      totalFeatures: 2,
      features: {
        'A': { latest: { key: 'RHAISTRAT-1', designPrUrl: 'https://github.com/osac-project/enhancement-proposals/pull/231' }, history: [] },
        'B': { latest: { key: 'RHAISTRAT-2' }, history: [] }
      }
    };
    const proj = getLatestProjection(data);
    expect(proj.features['A'].designPrUrl).toBe('https://github.com/osac-project/enhancement-proposals/pull/231');
    expect(proj.features['B'].designPrUrl).toBeNull();
  });

  it('carries designPrStatus through, defaulting to null when absent, independent of designPrUrl', () => {
    const data = {
      lastSyncedAt: '2026-04-19T12:00:00Z',
      totalFeatures: 2,
      features: {
        // Historical fallback: a merged design doc resolved without a discoverable
        // PR still carries a lifecycle-bearing designPrStatus and a null URL.
        'A': { latest: { key: 'RHAISTRAT-1', designPrStatus: 'Merged', designPrUrl: null }, history: [] },
        'B': { latest: { key: 'RHAISTRAT-2' }, history: [] }
      }
    };
    const proj = getLatestProjection(data);
    expect(proj.features['A'].designPrStatus).toBe('Merged');
    expect(proj.features['A'].designPrUrl).toBeNull();
    expect(proj.features['B'].designPrStatus).toBeNull();
  });

  it('carries prdRecommendation, prdReviewState, and designReviewState through, defaulting to null when absent', () => {
    const data = {
      lastSyncedAt: '2026-04-19T12:00:00Z',
      totalFeatures: 2,
      features: {
        'A': { latest: { key: 'RHAISTRAT-1', prdRecommendation: 'revise', prdReviewState: 'CHANGES_REQUESTED', designReviewState: 'APPROVED' }, history: [] },
        'B': { latest: { key: 'RHAISTRAT-2' }, history: [] }
      }
    };
    const proj = getLatestProjection(data);
    expect(proj.features['A'].prdRecommendation).toBe('revise');
    expect(proj.features['A'].prdReviewState).toBe('CHANGES_REQUESTED');
    expect(proj.features['A'].designReviewState).toBe('APPROVED');
    expect(proj.features['B'].prdRecommendation).toBeNull();
    expect(proj.features['B'].prdReviewState).toBeNull();
    expect(proj.features['B'].designReviewState).toBeNull();
  });

  it('carries assignee through, defaulting to null when absent', () => {
    const data = {
      lastSyncedAt: '2026-04-19T12:00:00Z',
      totalFeatures: 2,
      features: {
        'A': { latest: { key: 'RHAISTRAT-1', assignee: 'Dan Manor' }, history: [] },
        'B': { latest: { key: 'RHAISTRAT-2' }, history: [] }
      }
    };
    const proj = getLatestProjection(data);
    expect(proj.features['A'].assignee).toBe('Dan Manor');
    expect(proj.features['B'].assignee).toBeNull();
  });

  it('carries fixVersions through, defaulting to an empty array when absent', () => {
    const data = {
      lastSyncedAt: '2026-04-19T12:00:00Z',
      totalFeatures: 2,
      features: {
        'A': { latest: { key: 'RHAISTRAT-1', fixVersions: ['rhoai-3.5'] }, history: [] },
        'B': { latest: { key: 'RHAISTRAT-2' }, history: [] }
      }
    };
    const proj = getLatestProjection(data);
    expect(proj.features['A'].fixVersions).toEqual(['rhoai-3.5']);
    expect(proj.features['B'].fixVersions).toEqual([]);
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

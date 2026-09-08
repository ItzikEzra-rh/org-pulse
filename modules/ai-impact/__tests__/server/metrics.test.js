import { describe, it, expect } from 'vitest';
import { computeMetrics, buildTrendData, buildBreakdownData, computeAllMetrics } from '../../server/metrics.js';

function makeIssue(daysAgo, aiInvolvement = 'none', { createdLabelDate, revisedLabelDate } = {}) {
  const created = new Date();
  created.setDate(created.getDate() - daysAgo);
  return {
    key: `RFE-${Math.random().toString(36).slice(2, 6)}`,
    summary: 'Test',
    status: 'New',
    created: created.toISOString(),
    aiInvolvement,
    createdLabelDate: createdLabelDate || null,
    revisedLabelDate: revisedLabelDate || null
  };
}

describe('computeMetrics', () => {
  it('computes created percentage for "month" time window', () => {
    const issues = [
      makeIssue(5, 'created'),  // within month
      makeIssue(10, 'both'),    // within month
      makeIssue(15, 'none'),    // within month
      makeIssue(45, 'created'), // in prior period
      makeIssue(50, 'none'),    // in prior period
    ];

    const result = computeMetrics(issues, 'month', { trendThresholdPp: 2 });

    // Current: 3 issues, 2 with created (created + both) = 67%
    expect(result.createdPct).toBe(67);
    expect(result.windowTotal).toBe(3);
    expect(result.totalRFEs).toBe(5);
  });

  it('computes "week" time window', () => {
    const issues = [
      makeIssue(2, 'created'),
      makeIssue(3, 'revised'),
      makeIssue(5, 'none'),
    ];

    const result = computeMetrics(issues, 'week', { trendThresholdPp: 2 });

    expect(result.windowTotal).toBe(3);
    expect(result.createdPct).toBe(33);
  });

  it('computes "3months" time window', () => {
    const issues = [
      makeIssue(10, 'both'),
      makeIssue(30, 'created'),
      makeIssue(60, 'revised'),
      makeIssue(85, 'none'),
    ];

    const result = computeMetrics(issues, '3months', { trendThresholdPp: 2 });

    expect(result.windowTotal).toBe(4);
  });

  it('classifies trend as growing when change > threshold', () => {
    const issues = [
      // Current period: 100% created
      makeIssue(5, 'created'),
      // Prior period: 0% created
      makeIssue(35, 'none'),
    ];

    const result = computeMetrics(issues, 'month', { trendThresholdPp: 2 });

    expect(result.trend).toBe('growing');
  });

  it('classifies trend as declining when change < -threshold', () => {
    const issues = [
      // Current period: 0% created
      makeIssue(5, 'none'),
      // Prior period: 100% created
      makeIssue(35, 'created'),
    ];

    const result = computeMetrics(issues, 'month', { trendThresholdPp: 2 });

    expect(result.trend).toBe('declining');
  });

  it('classifies trend as stable when change within threshold', () => {
    const issues = [
      makeIssue(5, 'created'),
      makeIssue(10, 'none'),
      makeIssue(35, 'created'),
      makeIssue(40, 'none'),
    ];

    const result = computeMetrics(issues, 'month', { trendThresholdPp: 2 });

    expect(result.trend).toBe('stable');
  });

  it('uses configurable threshold', () => {
    const issues = [
      makeIssue(5, 'created'),
      makeIssue(10, 'created'),
      makeIssue(15, 'none'),
      // Prior: all none
      makeIssue(35, 'none'),
      makeIssue(40, 'none'),
      makeIssue(45, 'none'),
    ];

    // With high threshold, same data is "stable"
    const highThreshold = computeMetrics(issues, 'month', { trendThresholdPp: 90 });
    expect(highThreshold.trend).toBe('stable');
  });

  it('handles empty issues', () => {
    const result = computeMetrics([], 'month', { trendThresholdPp: 2 });

    expect(result.createdPct).toBe(0);
    expect(result.revisedCount).toBe(0);
    expect(result.windowTotal).toBe(0);
    expect(result.totalRFEs).toBe(0);
    expect(result.trend).toBe('stable');
  });

  it('handles all same category', () => {
    const issues = [
      makeIssue(5, 'both'),
      makeIssue(10, 'both'),
    ];

    const result = computeMetrics(issues, 'month', { trendThresholdPp: 2 });

    expect(result.createdPct).toBe(100);
  });

  it('uses default threshold of 2 when config is null', () => {
    const result = computeMetrics([], 'month', null);
    expect(result.trend).toBe('stable');
  });

  it('windows issues by created date, not label date', () => {
    // Issue created 60 days ago, label added 5 days ago — should NOT be in the month window
    const labelDate = new Date();
    labelDate.setDate(labelDate.getDate() - 5);
    const issues = [
      makeIssue(60, 'created', { createdLabelDate: labelDate.toISOString() }),
      makeIssue(5, 'none'),
    ];

    const result = computeMetrics(issues, 'month', { trendThresholdPp: 2 });

    // Only the recently-created issue should be in the window
    expect(result.windowTotal).toBe(1);
    expect(result.createdPct).toBe(0);
  });

  it('counts revisions by revisedLabelDate within the window', () => {
    const recentLabel = new Date();
    recentLabel.setDate(recentLabel.getDate() - 3);
    const issues = [
      // Old issue revised recently — should count as a revision in this window
      makeIssue(60, 'revised', { revisedLabelDate: recentLabel.toISOString() }),
      // Recent issue revised recently
      makeIssue(5, 'both', { revisedLabelDate: recentLabel.toISOString() }),
      // Recent issue, no revision
      makeIssue(5, 'none'),
    ];

    const result = computeMetrics(issues, 'month', { trendThresholdPp: 2 });

    expect(result.revisedCount).toBe(2);
    // windowTotal only counts issues created in the window
    expect(result.windowTotal).toBe(2);
  });

  it('falls back to created date when revisedLabelDate is missing', () => {
    const issues = [
      makeIssue(5, 'revised'), // no revisedLabelDate, falls back to created (5 days ago)
    ];

    const result = computeMetrics(issues, 'month', { trendThresholdPp: 2 });

    expect(result.revisedCount).toBe(1);
  });

  it('returns priorRevisedCount for the prior window', () => {
    const priorLabel = new Date();
    priorLabel.setDate(priorLabel.getDate() - 35);
    const issues = [
      makeIssue(60, 'revised', { revisedLabelDate: priorLabel.toISOString() }),
    ];

    const result = computeMetrics(issues, 'month', { trendThresholdPp: 2 });

    expect(result.revisedCount).toBe(0);
    expect(result.priorRevisedCount).toBe(1);
  });

  it('excludes No PR rows from totalRFEs (Total PRDs, all time)', () => {
    const issues = [
      makeIssue(5, 'created'),
      makeIssue(10, 'none'),
      { ...makeIssue(5, 'none'), status: 'No PR' },
    ];

    const result = computeMetrics(issues, 'month', { trendThresholdPp: 2 });

    expect(result.totalRFEs).toBe(2);
  });

  it('counts an eligible PRD created with AI toward createdPct', () => {
    const result = computeMetrics([makeIssue(5, 'created')], 'month', { trendThresholdPp: 2 });

    expect(result.windowTotal).toBe(1);
    expect(result.createdPct).toBe(100);
  });

  it('counts an eligible PRD with no AI toward the denominator only', () => {
    const result = computeMetrics([makeIssue(5, 'none')], 'month', { trendThresholdPp: 2 });

    expect(result.windowTotal).toBe(1);
    expect(result.createdPct).toBe(0);
  });

  it('excludes a "No PR" RFE from the createdPct denominator and numerator', () => {
    const issues = [
      makeIssue(5, 'created'),
      // Would drag createdPct to 50% if not excluded.
      { ...makeIssue(5, 'none'), status: 'No PR' },
    ];

    const result = computeMetrics(issues, 'month', { trendThresholdPp: 2 });

    expect(result.windowTotal).toBe(1);
    expect(result.createdPct).toBe(100);
  });

  it('computes the expected percentage across a mixed eligible population', () => {
    const issues = [
      makeIssue(5, 'created'),
      makeIssue(6, 'both'),
      makeIssue(7, 'revised'),
      makeIssue(8, 'none'),
      { ...makeIssue(5, 'created'), status: 'No PR' },
    ];

    const result = computeMetrics(issues, 'month', { trendThresholdPp: 2 });

    // Eligible: 4 issues (created, both, revised, none); 2 with AI created/both = 50%
    expect(result.windowTotal).toBe(4);
    expect(result.createdPct).toBe(50);
  });
});

describe('buildTrendData', () => {
  it('returns correct number of buckets for each window (daily for week/month, weekly w/ partial oldest bucket for 3months)', () => {
    expect(buildTrendData([], 'week')).toHaveLength(7);
    expect(buildTrendData([], 'month')).toHaveLength(30);
    // 90 days / 7-day buckets = 12 full weeks + a 6-day partial = 13
    expect(buildTrendData([], '3months')).toHaveLength(13);
  });

  it('never expands the week window beyond 7 days, using daily buckets', () => {
    const issues = [
      makeIssue(2, 'created'), // inside the 7-day window
      makeIssue(9, 'created'), // just outside a week, would leak in under weekly buckets
    ];

    const points = buildTrendData(issues, 'week');
    const totalAcrossBuckets = points.reduce((sum, p) => sum + p.total, 0);

    expect(points).toHaveLength(7);
    expect(totalAcrossBuckets).toBe(1); // only the 2-days-ago issue is in range
  });

  it('never expands the month window beyond 30 days (no ~56-day horizon)', () => {
    const issues = [
      makeIssue(25, 'created'), // inside the 30-day window
      makeIssue(40, 'created'), // would have leaked in under the old 8x7=56-day horizon
    ];

    const points = buildTrendData(issues, 'month');
    const totalAcrossBuckets = points.reduce((sum, p) => sum + p.total, 0);

    expect(totalAcrossBuckets).toBe(1);
  });

  it('never expands the 3-month window beyond 90 days', () => {
    const issues = [
      makeIssue(85, 'created'), // inside the 90-day window
      makeIssue(95, 'created'), // outside it
    ];

    const points = buildTrendData(issues, '3months');
    const totalAcrossBuckets = points.reduce((sum, p) => sum + p.total, 0);

    expect(totalAcrossBuckets).toBe(1);
  });

  it('exposes createdWithAI as the tooltip numerator alongside total/createdPct', () => {
    const issues = [
      makeIssue(1, 'created'),
      makeIssue(1, 'both'),
      makeIssue(1, 'none'),
    ];

    const points = buildTrendData(issues, 'week');
    const point = points.find(p => p.total === 3);

    expect(point.createdWithAI).toBe(2);
    expect(point.createdPct).toBe(67);
  });

  it('buckets issues by day using created date', () => {
    // Half a day off the bucket boundary to avoid flaking on ms drift against buildTrendData's own Date.now().
    const recent = new Date(Date.now() - 0.5 * 24 * 60 * 60 * 1000).toISOString();
    const issues = [
      { ...makeIssue(0, 'created'), created: recent },
      makeIssue(2, 'both'),
      makeIssue(10, 'none'),
    ];

    const points = buildTrendData(issues, 'month');

    const lastPoint = points[points.length - 1];
    expect(lastPoint.total).toBeGreaterThan(0);
    expect(lastPoint.date).toBeTruthy();
  });

  it('computes per-bucket created percentages correctly', () => {
    const issues = [
      makeIssue(1, 'created'),
      makeIssue(2, 'created'),
      makeIssue(3, 'none'),
      makeIssue(3, 'none'),
    ];

    const points = buildTrendData(issues, '3months');

    const withData = points.find(p => p.total === 4);
    if (withData) {
      expect(withData.createdPct).toBe(50);
    }
  });

  it('buckets the week window daily, not into a single 7-day bucket', () => {
    const issues = [
      makeIssue(1, 'created'),
      makeIssue(2, 'created'),
      makeIssue(3, 'none'),
      makeIssue(3, 'none'),
    ];

    const points = buildTrendData(issues, 'week');

    // Spread across daily buckets, so no single point holds all 4
    expect(points.every(p => p.total <= 2)).toBe(true);
    expect(points.reduce((sum, p) => sum + p.total, 0)).toBe(4);
  });

  it('returns 0 for weeks with no issues', () => {
    const points = buildTrendData([], 'week');
    for (const p of points) {
      expect(p.createdPct).toBe(0);
      expect(p.revisedCount).toBe(0);
      expect(p.total).toBe(0);
    }
  });

  it('buckets revised count by revisedLabelDate', () => {
    // Created 60 days ago (outside the 30-day 'created' window); labelDate is an hour ago, safely inside the most recent daily bucket.
    const issues = [
      makeIssue(60, 'revised', { revisedLabelDate: new Date(Date.now() - 60 * 60 * 1000).toISOString() }),
    ];

    const points = buildTrendData(issues, 'month');
    const lastPoint = points[points.length - 1];
    expect(lastPoint.revisedCount).toBe(1);
    // Total (created-based) should NOT include this old issue
    expect(lastPoint.total).toBe(0);
  });
});

describe('buildBreakdownData', () => {
  it('counts by AI involvement category', () => {
    const issues = [
      makeIssue(1, 'both'),
      makeIssue(2, 'both'),
      makeIssue(3, 'created'),
      makeIssue(4, 'revised'),
      makeIssue(5, 'none'),
      makeIssue(6, 'none'),
      makeIssue(7, 'none'),
    ];

    const result = buildBreakdownData(issues);

    expect(result).toEqual([
      { name: 'Created & Review', value: 2 },
      { name: 'AI Created', value: 1 },
      { name: 'AI Review', value: 1 },
      { name: 'No AI', value: 3 },
    ]);
  });

  it('handles empty issues', () => {
    const result = buildBreakdownData([]);
    expect(result).toEqual([
      { name: 'Created & Review', value: 0 },
      { name: 'AI Created', value: 0 },
      { name: 'AI Review', value: 0 },
      { name: 'No AI', value: 0 },
    ]);
  });
});

describe('computeAllMetrics', () => {
  it('returns metrics, trendData, breakdown, and pipelineFriction', () => {
    const issues = [makeIssue(5, 'created')];
    const result = computeAllMetrics(issues, 'month', { trendThresholdPp: 2 });

    expect(result).toHaveProperty('metrics');
    expect(result).toHaveProperty('trendData');
    expect(result).toHaveProperty('breakdown');
    expect(result).toHaveProperty('pipelineFriction');
    expect(result.trendData).toHaveLength(30);
    expect(result.pipelineFriction).toHaveProperty('needsAttentionPct');
    expect(result.pipelineFriction).toHaveProperty('feasibilityBlockedPct');
  });

  it('excludes RFEs with no PRD PR yet (status "No PR") from the breakdown', () => {
    const withPRD = makeIssue(5, 'created');
    const noPRD = { ...makeIssue(5, 'none'), status: 'No PR' };
    const result = computeAllMetrics([withPRD, noPRD], 'month', { trendThresholdPp: 2 });

    expect(result.breakdown).toEqual(expect.arrayContaining([
      { name: 'AI Created', value: 1 },
      { name: 'No AI', value: 0 }
    ]));
  });

  it('reports createdPct as null (not 0) for a week with only "No PR" RFEs', () => {
    const noPRD = { ...makeIssue(2, 'created'), status: 'No PR' };
    const result = computeAllMetrics([noPRD], 'week', { trendThresholdPp: 2 });

    for (const point of result.trendData) {
      expect(point.total).toBe(0);
      expect(point.createdPct).toBeNull();
      expect(point.createdWithAI).toBeNull();
    }
  });

  it('reports createdWithAI as the eligible numerator, matching createdPct/total', () => {
    const issues = [
      makeIssue(2, 'created'),
      makeIssue(2, 'both'),
      makeIssue(2, 'none'),
    ];
    const result = computeAllMetrics(issues, 'week', { trendThresholdPp: 2 });

    const point = result.trendData.find(p => p.total > 0);
    expect(point.total).toBe(3);
    expect(point.createdWithAI).toBe(2);
    expect(point.createdPct).toBe(67);
  });

  it('computes trend createdPct from eligible PRDs only, ignoring "No PR" rows in the same week', () => {
    const issues = [
      makeIssue(2, 'created'),
      { ...makeIssue(2, 'created'), status: 'No PR' },
    ];
    const result = computeAllMetrics(issues, 'week', { trendThresholdPp: 2 });

    const point = result.trendData.find(p => p.total > 0);
    expect(point.total).toBe(1);
    expect(point.createdPct).toBe(100);
  });

  it('keeps revisedCount on the full population while Created-with-AI total/createdPct stay eligible-only', () => {
    // Same fixed instant (half a day off an exact daily-bucket boundary, to
    // avoid flaking on the ms of test-execution drift between this Date.now()
    // and buildTrendData's own) so created-total and revisedCount are
    // guaranteed to land in the same daily bucket under the 'week' window.
    const sameInstant = new Date(Date.now() - 2.5 * 24 * 60 * 60 * 1000).toISOString();
    const issues = [
      { ...makeIssue(2, 'created'), created: sameInstant },
      { ...makeIssue(2, 'revised', { revisedLabelDate: sameInstant }), created: sameInstant, status: 'No PR' },
    ];

    const result = computeAllMetrics(issues, 'week', { trendThresholdPp: 2 });

    expect(result.metrics.revisedCount).toBe(1);
    const point = result.trendData.find(p => p.total > 0 || p.revisedCount > 0);
    expect(point.total).toBe(1);
    expect(point.revisedCount).toBe(1);
  });

  it('agrees on the eligible PRD population across windowTotal, the current trend point, and breakdown', () => {
    const issues = [
      makeIssue(2, 'created'),
      makeIssue(2, 'none'),
      { ...makeIssue(2, 'created'), status: 'No PR' },
    ];

    const result = computeAllMetrics(issues, 'week', { trendThresholdPp: 2 });
    const currentPoint = result.trendData.find(p => p.total > 0);
    const breakdownTotal = result.breakdown.reduce((sum, b) => sum + b.value, 0);

    expect(result.metrics.windowTotal).toBe(2);
    expect(currentPoint.total).toBe(2);
    expect(breakdownTotal).toBe(2);
  });
});

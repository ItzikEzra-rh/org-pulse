import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixtureModule from '../../../../tests/helpers/autofix-snapshot.js';

const { createAutofixSnapshotFixture, blockedIssue } = fixtureModule;

describe('AutoFix file-backed snapshot freshness', () => {
  let fixture;
  let handler;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-12T12:00:00Z'));
    fixture = createAutofixSnapshotFixture();
    const route = fixture.router.stack.find(layer => layer.route?.path === '/autofix-data');
    handler = route.route.stack.at(-1).handle;
  });

  afterEach(() => {
    fixture.cleanup();
    vi.useRealTimers();
  });

  function read() {
    const res = { json: vi.fn() };
    handler({ query: { projectId: 'osac', timeWindow: 'week' } }, res);
    return res.json.mock.calls[0][0];
  }

  it('serves a replaced snapshot on the next request without restarting or Jira credentials', () => {
    fixture.publish({ fetchedAt: '2026-10-10T11:15:45Z', issues: [] });
    expect(read()).toMatchObject({ fetchedAt: '2026-10-10T11:15:45Z', issues: [] });

    fixture.publish({
      fetchedAt: '2026-10-12T08:04:04Z',
      issues: [blockedIssue('2026-10-08T18:36:00Z')]
    });
    expect(read()).toMatchObject({
      fetchedAt: '2026-10-12T08:04:04Z',
      metrics: { windowTotal: 1, autofixTotal: 1, autofixStates: { blocked: 1 } },
      issues: [{ key: 'OSAC-6214', pipelineState: 'autofix-blocked' }]
    });
  });

  it('returns the existing empty state when a previously loaded snapshot is removed', () => {
    fixture.publish({ fetchedAt: '2026-10-12T08:04:04Z', issues: [blockedIssue('2026-10-08T18:36:00Z')] });
    expect(read().issues).toHaveLength(1);
    fixture.remove();
    expect(read()).toMatchObject({ fetchedAt: null, issues: [], metrics: { windowTotal: 0 } });
  });

  it('reports a successful no-change collection independently of the snapshot timestamp', () => {
    fixture.publish({ fetchedAt: '2026-10-10T11:15:45Z', issues: [] });
    read();
    const collectionStatus = { schemaVersion: 1, status: 'success', lastSuccessfulRunAt: '2026-10-12T08:04:04Z', contentChanged: false };
    const syncStatus = { schemaVersion: 1, revision: 'b'.repeat(40), lastSuccessfulSyncAt: '2026-10-12T08:12:00Z' };
    fixture.publishStatus(collectionStatus, syncStatus);
    expect(read()).toMatchObject({ fetchedAt: '2026-10-10T11:15:45Z', collectionStatus, syncStatus });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';

const mockApiRequest = vi.fn();
vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: (...args) => mockApiRequest(...args)
}));

import { useAIImpact, _resetForTesting } from '../../client/composables/useAIImpact.js';

// Mirrors RFEReviewView.vue: binds its selector directly to the timeWindow
// ref returned by the composable, with no local copy.
const PRDReviewStub = defineComponent({
  setup() {
    const { rfeData, timeWindow } = useAIImpact();
    return { rfeData, timeWindow };
  },
  render() { return h('div'); }
});

// Mirrors FeatureReviewView.vue / TestPlanView.vue: only wants rfeData
// (for jiraHost), never touches timeWindow.
const NonPeriodConsumerStub = defineComponent({
  setup() {
    const { rfeData } = useAIImpact();
    return { rfeData };
  },
  render() { return h('div'); }
});

describe('useAIImpact', () => {
  beforeEach(() => {
    mockApiRequest.mockReset();
    mockApiRequest.mockResolvedValue({ issues: [] });
    _resetForTesting();
  });

  it('defaults timeWindow to month and load() fetches accordingly', async () => {
    const { timeWindow, load } = useAIImpact();
    expect(timeWindow.value).toBe('month');

    await load();

    expect(mockApiRequest).toHaveBeenCalledWith('/modules/ai-impact/rfe-data?timeWindow=month');
  });

  it('changing the PRD selector from month to week triggers a week refetch', async () => {
    const prd = mount(PRDReviewStub);
    await Promise.resolve();
    mockApiRequest.mockClear();

    const weekData = { issues: [{ key: 'RFE-1' }] };
    mockApiRequest.mockResolvedValue(weekData);

    prd.vm.timeWindow = 'week';
    await Promise.resolve();
    await Promise.resolve();

    expect(mockApiRequest).toHaveBeenCalledWith('/modules/ai-impact/rfe-data?timeWindow=week');
    expect(prd.vm.rfeData).toEqual(weekData);
  });

  it('preserves the selected period across PRD -> non-PRD -> PRD navigation (regression: OSAC-4814)', async () => {
    const prd1 = mount(PRDReviewStub);
    await Promise.resolve();

    prd1.vm.timeWindow = 'week';
    await Promise.resolve();
    await Promise.resolve();
    expect(prd1.vm.timeWindow).toBe('week');

    // Navigate away: unmount PRD Review, mount a Design/Test Plan-style view.
    prd1.unmount();
    mockApiRequest.mockClear();
    const other = mount(NonPeriodConsumerStub);
    await Promise.resolve();
    await Promise.resolve();
    other.unmount();

    // Navigate back to PRD Review.
    const prd2 = mount(PRDReviewStub);
    await Promise.resolve();

    expect(prd2.vm.timeWindow).toBe('week');
  });

  it('mounting a Design/Test Plan-style consumer does not mutate timeWindow or trigger a month refetch', async () => {
    const prd = mount(PRDReviewStub);
    await Promise.resolve();

    prd.vm.timeWindow = 'week';
    await Promise.resolve();
    await Promise.resolve();
    mockApiRequest.mockClear();

    const other = mount(NonPeriodConsumerStub);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockApiRequest).not.toHaveBeenCalled();
    expect(prd.vm.timeWindow).toBe('week');
    expect(other.vm.rfeData).not.toBeNull();
  });

  it('ignores a stale load() response when the time window changed mid-flight (regression: OSAC-4814 P2)', async () => {
    const { rfeData, timeWindow } = useAIImpact();

    // First (slow) request for 'week', triggered by the timeWindow watcher.
    let resolveWeek;
    const weekData = { issues: [{ key: 'RFE-WEEK' }] };
    const threeMonthData = { issues: [{ key: 'RFE-3MONTHS' }] };
    mockApiRequest.mockImplementationOnce(() => new Promise(r => { resolveWeek = () => r(weekData); }));

    timeWindow.value = 'week';
    await Promise.resolve();
    await Promise.resolve();

    // Switch to '3months' (second, faster request) before 'week' resolves.
    mockApiRequest.mockResolvedValueOnce(threeMonthData);
    timeWindow.value = '3months';
    await Promise.resolve();
    await Promise.resolve();

    // Stale 'week' response resolves last.
    resolveWeek();
    await Promise.resolve();
    await Promise.resolve();

    // The stale 'week' response must NOT overwrite the current '3months' data
    // or its loading/error state.
    expect(timeWindow.value).toBe('3months');
    expect(rfeData.value).toEqual(threeMonthData);
  });

  it('the visible selector and the request parameter are driven by the same timeWindow source', async () => {
    const prd = mount(PRDReviewStub);
    await Promise.resolve();

    prd.vm.timeWindow = '3months';
    await Promise.resolve();
    await Promise.resolve();

    const lastCall = mockApiRequest.mock.calls.at(-1)[0];
    expect(lastCall).toBe(`/modules/ai-impact/rfe-data?timeWindow=${prd.vm.timeWindow}`);
  });

  it('fetches the project context with a single ? separator (regression: a second ? made the server ignore projectId)', async () => {
    window.location.hash = '#/releases/registry?projectId=flightctl';
    window.dispatchEvent(new Event('urlchange'));
    await Promise.resolve();
    mockApiRequest.mockClear();

    const { load } = useAIImpact();
    await load();

    const url = mockApiRequest.mock.calls[0][0];
    expect(url).toBe('/modules/ai-impact/rfe-data?timeWindow=month&projectId=flightctl');
    expect((url.match(/\?/g) || []).length).toBe(1);
  });

  it('omits the project context when none is selected', async () => {
    window.location.hash = '#/releases/registry';
    window.dispatchEvent(new Event('urlchange'));
    await Promise.resolve();
    mockApiRequest.mockClear();

    const { load } = useAIImpact();
    await load();

    expect(mockApiRequest).toHaveBeenCalledWith('/modules/ai-impact/rfe-data?timeWindow=month');
  });
});

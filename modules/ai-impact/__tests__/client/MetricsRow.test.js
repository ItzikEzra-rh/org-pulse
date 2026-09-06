import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MetricsRow from '../../client/components/MetricsRow.vue';

const METRICS = { createdPct: 50, createdChange: 0, trend: 'stable', revisedCount: 2, priorRevisedCount: 1, windowTotal: 4, totalRFEs: 10 };

function makeRFE(overrides = {}) {
  return { key: 'OSAC-1', status: 'Merged', ...overrides };
}

function signedOffTileText(wrapper) {
  const tile = wrapper.findAll('.space-y-1').find(el => el.text().includes('Signed Off'));
  return tile.find('span').text();
}

function createdWithAITile(wrapper) {
  return wrapper.findAll('.space-y-1').find(el => el.text().includes('Created with AI'));
}

function trendStatusTile(wrapper) {
  return wrapper.findAll('.space-y-1').find(el => el.text().includes('Trend Status'));
}

describe('MetricsRow Signed Off metric', () => {
  it('counts only Merged verified PRDs as Signed Off', () => {
    const rfes = [
      makeRFE({ key: 'OSAC-1', status: 'Merged' }),
      makeRFE({ key: 'OSAC-2', status: 'Open' }),
      makeRFE({ key: 'OSAC-3', status: 'Closed' }),
      makeRFE({ key: 'OSAC-4', status: 'Merged' })
    ];
    const wrapper = mount(MetricsRow, { props: { metrics: METRICS, rfes } });

    expect(signedOffTileText(wrapper)).toBe('2');
  });

  it('excludes No PR rows from the Signed Off count', () => {
    const rfes = [
      makeRFE({ key: 'OSAC-1', status: 'Merged' }),
      makeRFE({ key: 'OSAC-2', status: 'No PR' }),
      makeRFE({ key: 'OSAC-3', status: 'No PR' })
    ];
    const wrapper = mount(MetricsRow, { props: { metrics: METRICS, rfes } });

    expect(signedOffTileText(wrapper)).toBe('1');
  });

  it('shows zero Signed Off when no PRDs are Merged', () => {
    const rfes = [
      makeRFE({ key: 'OSAC-1', status: 'Open' }),
      makeRFE({ key: 'OSAC-2', status: 'No PR' })
    ];
    const wrapper = mount(MetricsRow, { props: { metrics: METRICS, rfes } });

    expect(signedOffTileText(wrapper)).toBe('0');
  });
});

describe('MetricsRow no-data guard (windowTotal === 0)', () => {
  const ZERO_ELIGIBLE = { createdPct: 0, createdChange: 0, trend: 'stable', revisedCount: 0, priorRevisedCount: 0, windowTotal: 0, totalRFEs: 10 };

  it('shows — for Created with AI and hides the change indicator when there are zero eligible PRDs', () => {
    const wrapper = mount(MetricsRow, { props: { metrics: ZERO_ELIGIBLE, rfes: [] } });
    const tile = createdWithAITile(wrapper);

    expect(tile.find('.text-3xl').text()).toBe('—');
    expect(tile.find('.text-sm.flex.gap-1').exists()).toBe(false);
  });

  it('shows — for Trend Status and renders no trend icon when there are zero eligible PRDs', () => {
    const wrapper = mount(MetricsRow, { props: { metrics: ZERO_ELIGIBLE, rfes: [] } });
    const tile = trendStatusTile(wrapper);

    expect(tile.find('.text-lg').text()).toBe('—');
    expect(tile.find('svg').exists()).toBe(false);
  });

  it('preserves existing Created with AI and Trend Status rendering when windowTotal > 0', () => {
    const wrapper = mount(MetricsRow, { props: { metrics: METRICS, rfes: [] } });
    const createdTile = createdWithAITile(wrapper);

    expect(createdTile.find('.text-3xl').text()).toBe('50%');
    expect(createdTile.find('.text-sm.flex.gap-1').text()).toBe('0%');
    expect(trendStatusTile(wrapper).find('.text-lg').text()).toBe('stable');
  });
});

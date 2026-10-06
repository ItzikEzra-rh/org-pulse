import { describe, it, expect } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import { Bar } from 'vue-chartjs';
import FeatureCharts from '../../client/components/FeatureCharts.vue';
import { SCORE_HEX } from '../../client/utils/score-colors.js';

// shallowMount auto-stubs the vue-chartjs Bar (no canvas needed) while still
// letting us read the `data` prop each chart was rendered with.
function mountCharts(features) {
  return shallowMount(FeatureCharts, { props: { features } });
}

function makeScored(key, total, dims = {}) {
  return {
    key,
    scores: { total, feasibility: 2, testability: 2, scope: 1, architecture: 1, ...dims },
    designStatus: 'reviewed'
  };
}

describe('FeatureCharts excludes unscored features', () => {
  const features = {
    'OSAC-1': makeScored('OSAC-1', 6),
    'OSAC-2': makeScored('OSAC-2', 8),
    // no-design back-filled feature: no scores, must not land in the 0 bucket.
    'OSAC-3': { key: 'OSAC-3', scores: null, designStatus: 'no-design' },
    // pending design (PR but no score yet): also excluded from score charts.
    'OSAC-4': { key: 'OSAC-4', scores: null, designStatus: 'pending' }
  };

  it('Score Distribution buckets only scored features', () => {
    const wrapper = mountCharts(features);
    const bars = wrapper.findAllComponents(Bar);
    const distData = bars[0].props('data');
    const buckets = distData.datasets[0].data;
    const total = buckets.reduce((a, b) => a + b, 0);
    expect(total).toBe(2); // only OSAC-1 and OSAC-2
    expect(buckets[0]).toBe(0); // no false "0" bucket from no-design/pending
    expect(buckets[6]).toBe(1);
    expect(buckets[8]).toBe(1);
  });

  it('Dimension Breakdown totals only scored features per dimension', () => {
    const wrapper = mountCharts(features);
    const bars = wrapper.findAllComponents(Bar);
    const dimData = bars[1].props('data');
    // Each dimension column should sum to the 2 scored features, not 4.
    for (let col = 0; col < dimData.labels.length; col++) {
      const colTotal = dimData.datasets.reduce((acc, ds) => acc + ds.data[col], 0);
      expect(colTotal).toBe(2);
    }
  });

  it('explains when there are no AI marker scores instead of drawing zero-valued charts', () => {
    const wrapper = mountCharts({
      'EDM-371': { key: 'EDM-371', scores: null, designPrStatus: 'Open', designPrUrl: 'https://github.com/flightctl/design-docs/pull/54' }
    });
    expect(wrapper.text()).toContain('No AI marker scores were collected for the Designs in this period.');
    expect(wrapper.findAllComponents(Bar)).toHaveLength(0);
  });
});

describe('FeatureCharts semantic colors', () => {
  it('Dimension Breakdown Pass/Partial/Fail align to the shared green-500/amber-500/red-500 tokens', () => {
    const wrapper = mountCharts({ 'OSAC-1': makeScored('OSAC-1', 6) });
    const dimData = wrapper.findAllComponents(Bar)[1].props('data');
    const [pass, partial, fail] = dimData.datasets;
    expect(pass.backgroundColor).toBe(SCORE_HEX.green);
    expect(partial.backgroundColor).toBe(SCORE_HEX.amber);
    expect(fail.backgroundColor).toBe(SCORE_HEX.red);
  });
});

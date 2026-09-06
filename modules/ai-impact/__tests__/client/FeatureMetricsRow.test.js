import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import FeatureMetricsRow from '../../client/components/FeatureMetricsRow.vue';

function makeFeature(overrides = {}) {
  return {
    key: 'OSAC-1',
    title: 'Some feature',
    priority: 'Major',
    humanReviewStatus: 'awaiting-review',
    recommendation: 'approve',
    scores: { total: 6 },
    designPrStatus: 'Merged',
    components: [],
    ...overrides
  };
}

// Grab a metric tile's value by its label text.
function tileValue(wrapper, label) {
  const tile = wrapper.findAll('.space-y-1').find(d => d.find('p').text() === label);
  return tile.find('span').text();
}

describe('FeatureMetricsRow: features with no Design artifact', () => {
  const features = {
    'OSAC-1': makeFeature({ key: 'OSAC-1', humanReviewStatus: 'approved', recommendation: 'approve', scores: { total: 8 } }),
    'OSAC-2': makeFeature({ key: 'OSAC-2', humanReviewStatus: 'awaiting-review', recommendation: 'revise', scores: { total: 4 } }),
    'OSAC-3': makeFeature({ key: 'OSAC-3', designPrStatus: null, humanReviewStatus: 'awaiting-review', recommendation: null, scores: null }),
    'OSAC-4': makeFeature({ key: 'OSAC-4', designPrStatus: null, humanReviewStatus: 'awaiting-review', recommendation: null, scores: null })
  };

  it('Total Features counts every feature, including ones with no Design artifact', () => {
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Total Features')).toBe('4');
  });

  it('Needs Action excludes features with no Design artifact', () => {
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Needs Action')).toBe('1'); // only OSAC-2
  });

  it('Signed Off counts only features with a Design artifact that are approved', () => {
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Signed Off')).toBe('1'); // only OSAC-1
  });

  it('Avg Score is computed over scored features only', () => {
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Avg Score')).toBe('6.0'); // (8 + 4) / 2
  });

  it('Approval Rate is computed over scored features only', () => {
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Approval Rate')).toBe('50%'); // 1 approve out of 2 scored
  });
});

describe('FeatureMetricsRow: unscored Design artifact', () => {
  it('excludes an existing-but-unscored artifact from Avg Score and Approval Rate', () => {
    const features = {
      A: makeFeature({ key: 'A', humanReviewStatus: 'approved', recommendation: 'approve', scores: { total: 8 } }),
      B: makeFeature({ key: 'B', humanReviewStatus: 'approved', recommendation: null, scores: null })
    };
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Avg Score')).toBe('8.0');
    expect(tileValue(wrapper, 'Approval Rate')).toBe('100%');
  });

  it('still counts every feature in Total Features', () => {
    const features = {
      A: makeFeature({ key: 'A', scores: { total: 8 } }),
      B: makeFeature({ key: 'B', scores: null })
    };
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Total Features')).toBe('2');
  });
});

describe('FeatureMetricsRow: Needs Action / Signed Off use meaningful review status', () => {
  it('existing + unscored + default awaiting-review: not Needs Action', () => {
    const features = { A: makeFeature({ key: 'A', designPrStatus: 'Merged', scores: null, humanReviewStatus: 'awaiting-review' }) };
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Needs Action')).toBe('0');
  });

  it('existing + unscored + approved: Signed Off', () => {
    const features = { A: makeFeature({ key: 'A', designPrStatus: 'Merged', scores: null, humanReviewStatus: 'approved' }) };
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Signed Off')).toBe('1');
  });

  it('existing + unscored + needs-review: Needs Action', () => {
    const features = { A: makeFeature({ key: 'A', designPrStatus: 'Merged', scores: null, humanReviewStatus: 'needs-review' }) };
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Needs Action')).toBe('1');
  });

  it('existing + scored + awaiting-review: Needs Action', () => {
    const features = { A: makeFeature({ key: 'A', designPrStatus: 'Merged', scores: { total: 6 }, humanReviewStatus: 'awaiting-review' }) };
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Needs Action')).toBe('1');
  });

  it('missing Design: neither Needs Action nor Signed Off', () => {
    const features = { A: makeFeature({ key: 'A', designPrStatus: null, humanReviewStatus: 'approved' }) };
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Needs Action')).toBe('0');
    expect(tileValue(wrapper, 'Signed Off')).toBe('0');
  });
});

describe('FeatureMetricsRow allTimeTotal subtext', () => {
  const features = { 'OSAC-1': makeFeature() };

  it('omits the all-time subtext when allTimeTotal is not provided', () => {
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(wrapper.text()).not.toContain('all time');
  });

  it('shows the all-time subtext under Total Features when provided', () => {
    const wrapper = mount(FeatureMetricsRow, { props: { features, allTimeTotal: 251 } });
    expect(wrapper.text()).toContain('251 all time');
  });
});

describe('FeatureMetricsRow empty scored population vs genuine zero', () => {
  it('shows "—" for Approval Rate and Avg Score when there are no scored features', () => {
    const features = {
      'OSAC-1': makeFeature({ key: 'OSAC-1', recommendation: null, scores: null }),
      'OSAC-2': makeFeature({ key: 'OSAC-2', recommendation: null, scores: null })
    };
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Approval Rate')).toBe('—');
    expect(tileValue(wrapper, 'Avg Score')).toBe('—');
  });

  it('shows a genuine 0% Approval Rate when scored features exist but none are approved', () => {
    const features = {
      'OSAC-1': makeFeature({ key: 'OSAC-1', recommendation: 'revise' }),
      'OSAC-2': makeFeature({ key: 'OSAC-2', recommendation: 'revise' })
    };
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Approval Rate')).toBe('0%');
  });

  it('shows a genuine 0 Avg Score when scored features exist but all scored zero', () => {
    const features = {
      'OSAC-1': makeFeature({ key: 'OSAC-1', scores: { total: 0 } }),
      'OSAC-2': makeFeature({ key: 'OSAC-2', scores: { total: 0 } })
    };
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Avg Score')).toBe('0.0');
  });
});

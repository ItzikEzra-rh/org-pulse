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
    designStatus: 'reviewed',
    components: [],
    ...overrides
  };
}

// Grab a metric tile's value by its label text.
function tileValue(wrapper, label) {
  const tile = wrapper.findAll('.space-y-1').find(d => d.find('p').text() === label);
  return tile.find('span').text();
}

describe('FeatureMetricsRow no-design exclusion', () => {
  const features = {
    'OSAC-1': makeFeature({ key: 'OSAC-1', humanReviewStatus: 'approved', recommendation: 'approve', scores: { total: 8 } }),
    'OSAC-2': makeFeature({ key: 'OSAC-2', humanReviewStatus: 'awaiting-review', recommendation: 'revise', scores: { total: 4 } }),
    // Back-filled feature with no design review — must not skew review tiles/averages.
    'OSAC-3': makeFeature({ key: 'OSAC-3', humanReviewStatus: 'awaiting-review', recommendation: null, scores: null, designStatus: 'no-design' }),
    'OSAC-4': makeFeature({ key: 'OSAC-4', humanReviewStatus: 'awaiting-review', recommendation: null, scores: null, designStatus: 'no-design' })
  };

  it('Total Features counts every feature, including no-design ones', () => {
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Total Features')).toBe('4');
  });

  it('Needs Action excludes no-design features', () => {
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    // Only OSAC-2 is a reviewed feature awaiting sign-off; OSAC-3/OSAC-4 are no-design.
    expect(tileValue(wrapper, 'Needs Action')).toBe('1');
  });

  it('Signed Off counts only reviewed approved features', () => {
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Signed Off')).toBe('1');
  });

  it('Avg Score is computed over reviewed features only', () => {
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    // (8 + 4) / 2 = 6.0, unaffected by the two no-design (null-score) features.
    expect(tileValue(wrapper, 'Avg Score')).toBe('6.0');
  });

  it('Approval Rate is computed over reviewed features only', () => {
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    // 1 approve out of 2 reviewed = 50%.
    expect(tileValue(wrapper, 'Approval Rate')).toBe('50%');
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

describe('FeatureMetricsRow empty reviewed population vs genuine zero', () => {
  it('shows "—" for Approval Rate and Avg Score when there are no reviewed features', () => {
    const features = {
      'OSAC-1': makeFeature({ key: 'OSAC-1', designStatus: 'no-design', recommendation: null, scores: null }),
      'OSAC-2': makeFeature({ key: 'OSAC-2', designStatus: 'no-design', recommendation: null, scores: null })
    };
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Approval Rate')).toBe('—');
    expect(tileValue(wrapper, 'Avg Score')).toBe('—');
  });

  it('shows a genuine 0% Approval Rate when reviewed features exist but none are approved', () => {
    const features = {
      'OSAC-1': makeFeature({ key: 'OSAC-1', recommendation: 'revise' }),
      'OSAC-2': makeFeature({ key: 'OSAC-2', recommendation: 'revise' })
    };
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Approval Rate')).toBe('0%');
  });

  it('shows a genuine 0 Avg Score when reviewed features exist but all scored zero', () => {
    const features = {
      'OSAC-1': makeFeature({ key: 'OSAC-1', scores: { total: 0 } }),
      'OSAC-2': makeFeature({ key: 'OSAC-2', scores: { total: 0 } })
    };
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Avg Score')).toBe('0.0');
  });
});

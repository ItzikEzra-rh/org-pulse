import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import FeatureMetricsRow from '../../client/components/FeatureMetricsRow.vue';
import InfoBubble from '../../client/components/InfoBubble.vue';

function makeFeature(overrides = {}) {
  return {
    key: 'OSAC-1',
    title: 'Some feature',
    priority: 'Major',
    humanReviewStatus: 'awaiting-review',
    recommendation: 'approve',
    scores: { total: 6 },
    designPrStatus: 'Merged',
    aiInvolvement: null,
    components: [],
    ...overrides
  };
}

// Grab a metric tile's value by its label text.
function tileValue(wrapper, label) {
  const tile = wrapper.findAll('.space-y-1').find(d => d.find('p').text() === label);
  return tile.find('.text-3xl').text();
}

describe('FeatureMetricsRow: features with no Design artifact', () => {
  const features = {
    'OSAC-1': makeFeature({ key: 'OSAC-1', humanReviewStatus: 'approved', recommendation: 'approve', scores: { total: 8 } }),
    'OSAC-2': makeFeature({ key: 'OSAC-2', humanReviewStatus: 'awaiting-review', recommendation: 'revise', scores: { total: 4 } }),
    'OSAC-3': makeFeature({ key: 'OSAC-3', designPrStatus: null, humanReviewStatus: 'awaiting-review', recommendation: null, scores: null }),
    'OSAC-4': makeFeature({ key: 'OSAC-4', designPrStatus: null, humanReviewStatus: 'awaiting-review', recommendation: null, scores: null })
  };

  it('Total Designs excludes features with no Design artifact', () => {
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Total Designs')).toBe('2'); // only OSAC-1, OSAC-2 have a Design
  });

  it('Needs Action excludes features with no Design artifact', () => {
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Needs Action')).toBe('1'); // only OSAC-2
  });

  it('Signed Off counts only features with a Design artifact that are approved', () => {
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Signed Off')).toBe('1'); // only OSAC-1
  });

  it('Approval Rate is computed over scored, existing Designs only', () => {
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Approval Rate')).toBe('50%'); // 1 approve out of 2 scored
  });
});

describe('FeatureMetricsRow: Created with AI metric', () => {
  it('is the percentage of existing Designs created with AI', () => {
    const features = {
      A: makeFeature({ key: 'A', aiInvolvement: 'created' }),
      B: makeFeature({ key: 'B', aiInvolvement: 'both' }),
      C: makeFeature({ key: 'C', aiInvolvement: 'revised' }),
      D: makeFeature({ key: 'D', aiInvolvement: 'none' })
    };
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Created with AI')).toBe('50%'); // A, B out of 4
  });

  it('excludes features with no Design artifact from the denominator', () => {
    const features = {
      A: makeFeature({ key: 'A', aiInvolvement: 'created' }),
      B: makeFeature({ key: 'B', designPrStatus: null, aiInvolvement: 'created' })
    };
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Created with AI')).toBe('100%'); // only A is an existing Design
  });

  it('shows — when there is no existing-Design population', () => {
    const features = {
      A: makeFeature({ key: 'A', designPrStatus: null })
    };
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Created with AI')).toBe('—');
  });

  it('shows a genuine 0% when existing Designs have no AI provenance', () => {
    const features = {
      A: makeFeature({ key: 'A', aiInvolvement: 'none' }),
      B: makeFeature({ key: 'B', aiInvolvement: null })
    };
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Created with AI')).toBe('0%');
  });
});

describe('FeatureMetricsRow: unscored Design artifact', () => {
  it('excludes an existing-but-unscored artifact from Approval Rate', () => {
    const features = {
      A: makeFeature({ key: 'A', humanReviewStatus: 'approved', recommendation: 'approve', scores: { total: 8 } }),
      B: makeFeature({ key: 'B', humanReviewStatus: 'approved', recommendation: null, scores: null })
    };
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Approval Rate')).toBe('100%');
  });

  it('still counts every existing Design in Total Designs', () => {
    const features = {
      A: makeFeature({ key: 'A', scores: { total: 8 } }),
      B: makeFeature({ key: 'B', scores: null })
    };
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Total Designs')).toBe('2');
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

  it('shows the all-time subtext under Total Designs when provided', () => {
    const wrapper = mount(FeatureMetricsRow, { props: { features, allTimeTotal: 251 } });
    expect(wrapper.text()).toContain('251 all time');
  });
});

describe('FeatureMetricsRow empty scored population vs genuine zero', () => {
  it('shows "—" for Approval Rate when there are no scored features', () => {
    const features = {
      'OSAC-1': makeFeature({ key: 'OSAC-1', recommendation: null, scores: null }),
      'OSAC-2': makeFeature({ key: 'OSAC-2', recommendation: null, scores: null })
    };
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Approval Rate')).toBe('—');
  });

  it('shows a genuine 0% Approval Rate when scored features exist but none are approved', () => {
    const features = {
      'OSAC-1': makeFeature({ key: 'OSAC-1', recommendation: 'revise' }),
      'OSAC-2': makeFeature({ key: 'OSAC-2', recommendation: 'revise' })
    };
    const wrapper = mount(FeatureMetricsRow, { props: { features } });
    expect(tileValue(wrapper, 'Approval Rate')).toBe('0%');
  });
});

describe('FeatureMetricsRow no longer renders removed tiles', () => {
  it('does not render Avg Score', () => {
    const wrapper = mount(FeatureMetricsRow, { props: { features: { A: makeFeature() } } });
    expect(wrapper.text()).not.toContain('Avg Score');
  });
});

describe('FeatureMetricsRow KPI InfoBubbles', () => {
  const EXPECTED_TEXT = {
    'Total Designs': 'Designs that exist in the selected period.',
    'Created with AI': 'Percentage of existing Designs created with AI.',
    'Approval Rate': 'Percentage of AI-assessed Designs that received an Approve recommendation.',
    'Needs Action': 'AI-assessed Designs flagged for action or awaiting human sign-off.',
    'Signed Off': 'Designs explicitly approved by a human reviewer.'
  };

  it.each(Object.entries(EXPECTED_TEXT))('%s has a hover-triggered InfoBubble with the expected copy', (label, text) => {
    const wrapper = mount(FeatureMetricsRow, { props: { features: { A: makeFeature() } } });
    const tile = wrapper.findAll('.space-y-1').find(d => d.find('p').text() === label);
    const bubble = tile.findComponent(InfoBubble);

    expect(bubble.exists()).toBe(true);
    expect(bubble.props('trigger')).toBe('hover');
    expect(bubble.props('text')).toBe(text);
  });
});

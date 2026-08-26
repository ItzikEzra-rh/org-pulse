import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import FeatureList from '../../client/components/FeatureList.vue';
import FeatureListItem from '../../client/components/FeatureListItem.vue';

function makeFeature(overrides = {}) {
  return {
    key: 'RHAISTRAT-1',
    title: 'Some feature',
    sourceRfe: 'RHAIRFE-1',
    priority: 'Major',
    humanReviewStatus: 'awaiting-review',
    recommendation: 'approve',
    components: [],
    ...overrides
  };
}

describe('FeatureList component filter', () => {
  const features = {
    'RHAISTRAT-1': makeFeature({ key: 'RHAISTRAT-1', title: 'Core feature', components: ['Core'] }),
    'RHAISTRAT-2': makeFeature({ key: 'RHAISTRAT-2', title: 'UI feature', components: ['UI'] }),
    'RHAISTRAT-3': makeFeature({ key: 'RHAISTRAT-3', title: 'No component feature', components: [] })
  };

  it('defaults to All Components and shows every feature', () => {
    const wrapper = mount(FeatureList, { props: { features } });
    const selects = wrapper.findAll('select');
    const componentSelect = selects.find(s => s.find('option[value="all"]').text() === 'All Components');
    expect(componentSelect.find('option[value="all"]').text()).toBe('All Components');
    expect(wrapper.text()).toContain('Design List');
    expect(wrapper.text()).toContain('(3 of 3 total)');
  });

  it('lists unique components derived from the data, sorted', () => {
    const wrapper = mount(FeatureList, { props: { features } });
    const selects = wrapper.findAll('select');
    const componentSelect = selects.find(s => s.find('option[value="all"]').text() === 'All Components');
    const options = componentSelect.findAll('option').map(o => o.text());
    expect(options).toEqual(['All Components', 'Core', 'UI']);
  });

  it('filters to only features matching the selected component', () => {
    const wrapper = mount(FeatureList, { props: { features, componentFilter: 'UI' } });
    expect(wrapper.text()).toContain('(1 of 3 total)');
    expect(wrapper.text()).toContain('UI feature');
    expect(wrapper.text()).not.toContain('Core feature');
  });

  it('emits update:componentFilter when a component is selected', async () => {
    const wrapper = mount(FeatureList, { props: { features } });
    const selects = wrapper.findAll('select');
    const componentSelect = selects.find(s => s.find('option[value="all"]').text() === 'All Components');
    await componentSelect.setValue('Core');
    expect(wrapper.emitted('update:componentFilter')[0]).toEqual(['Core']);
  });

  it('restores the full list when switched back to All Components', async () => {
    const filtered = mount(FeatureList, { props: { features, componentFilter: 'Core' } });
    expect(filtered.text()).toContain('(1 of 3 total)');

    await filtered.setProps({ componentFilter: 'all' });
    expect(filtered.text()).toContain('(3 of 3 total)');
  });
});

describe('FeatureList AI Involvement filter (aligned with PRD Review)', () => {
  function renderedKeys(wrapper) {
    return wrapper.findAllComponents(FeatureListItem).map(c => c.props('feature').key);
  }

  const features = {
    A: makeFeature({ key: 'A', aiInvolvement: 'both' }),
    B: makeFeature({ key: 'B', aiInvolvement: 'created' }),
    C: makeFeature({ key: 'C', aiInvolvement: 'none' })
  };

  it('filters by aiInvolvement, matching the PRD tab semantics', () => {
    const wrapper = mount(FeatureList, { props: { features, aiInvolvementFilter: 'created' } });
    expect(renderedKeys(wrapper)).toEqual(['B']);
  });

  it('"all" (default) includes every AI involvement state', () => {
    const wrapper = mount(FeatureList, { props: { features } });
    expect(renderedKeys(wrapper).sort()).toEqual(['A', 'B', 'C']);
  });
});

describe('FeatureList AI Verdict filter', () => {
  function renderedKeys(wrapper) {
    return wrapper.findAllComponents(FeatureListItem).map(c => c.props('feature').key);
  }

  const features = {
    A: makeFeature({ key: 'A', recommendation: 'approve' }),
    B: makeFeature({ key: 'B', recommendation: null, designStatus: null }),
    C: makeFeature({ key: 'C', recommendation: null, designStatus: 'no-design' })
  };

  it('"Not Reviewed" matches unreviewed features but excludes missing-design ones', () => {
    const wrapper = mount(FeatureList, { props: { features, recommendationFilter: 'not-reviewed' } });
    expect(renderedKeys(wrapper)).toEqual(['B']);
  });

  it('filters by a specific recommendation value', () => {
    const wrapper = mount(FeatureList, { props: { features, recommendationFilter: 'approve' } });
    expect(renderedKeys(wrapper)).toEqual(['A']);
  });
});

describe('FeatureList artifact filter (aligned with PRD Review)', () => {
  function renderedKeys(wrapper) {
    return wrapper.findAllComponents(FeatureListItem).map(c => c.props('feature').key);
  }

  const features = {
    A: makeFeature({ key: 'A', designStatus: null }),
    B: makeFeature({ key: 'B', designStatus: 'reviewed' }),
    C: makeFeature({ key: 'C', designStatus: 'no-design' })
  };

  it('"has" excludes rows with no design doc', () => {
    const wrapper = mount(FeatureList, { props: { features, artifactFilter: 'has' } });
    expect(renderedKeys(wrapper).sort()).toEqual(['A', 'B']);
  });

  it('"missing" includes only rows with no design doc', () => {
    const wrapper = mount(FeatureList, { props: { features, artifactFilter: 'missing' } });
    expect(renderedKeys(wrapper)).toEqual(['C']);
  });
});

describe('FeatureList sort (aligned with PRD Review)', () => {
  function renderedKeys(wrapper) {
    return wrapper.findAllComponents(FeatureListItem).map(c => c.props('feature').key);
  }

  const features = {
    A: makeFeature({ key: 'A', created: '2026-01-01', scores: { total: 2 } }),
    B: makeFeature({ key: 'B', created: '2026-03-01', scores: { total: 8 } }),
    C: makeFeature({ key: 'C', created: '2026-02-01', scores: { total: 5 } })
  };

  it('sorts by score using the shared score-asc/score-desc values', () => {
    const asc = mount(FeatureList, { props: { features, sortBy: 'score-asc' } });
    expect(renderedKeys(asc)).toEqual(['A', 'C', 'B']);

    const desc = mount(FeatureList, { props: { features, sortBy: 'score-desc' } });
    expect(renderedKeys(desc)).toEqual(['B', 'C', 'A']);
  });

  it('sorts by created date for the Newest and Oldest options', () => {
    const newest = mount(FeatureList, { props: { features, sortBy: 'newest' } });
    expect(renderedKeys(newest)).toEqual(['B', 'C', 'A']);

    const oldest = mount(FeatureList, { props: { features, sortBy: 'oldest' } });
    expect(renderedKeys(oldest)).toEqual(['A', 'C', 'B']);
  });
});

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import FeatureList from '../../client/components/FeatureList.vue';
import FeatureListItem from '../../client/components/FeatureListItem.vue';
import { FIX_VERSION_FILTER_UNASSIGNED, encodeFixVersionOption } from '../../client/constants.js';

function makeFeature(overrides = {}) {
  return {
    key: 'RHAISTRAT-1',
    title: 'Some feature',
    sourceRfe: 'RHAIRFE-1',
    priority: 'Major',
    humanReviewStatus: 'awaiting-review',
    recommendation: 'approve',
    components: [],
    fixVersions: ['rhoai-3.5'],
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

  // The real API never sends the string 'none' -- aiInvolvement is null
  // until the design-provenance pipeline reviews the feature.
  const features = {
    A: makeFeature({ key: 'A', aiInvolvement: 'both' }),
    B: makeFeature({ key: 'B', aiInvolvement: 'created' }),
    C: makeFeature({ key: 'C', aiInvolvement: null })
  };

  it('filters by aiInvolvement, matching the PRD tab semantics', () => {
    const wrapper = mount(FeatureList, { props: { features, aiInvolvementFilter: 'created' } });
    expect(renderedKeys(wrapper)).toEqual(['B']);
  });

  it('"all" (default) includes every AI involvement state', () => {
    const wrapper = mount(FeatureList, { props: { features } });
    expect(renderedKeys(wrapper).sort()).toEqual(['A', 'B', 'C']);
  });

  it('"No AI" matches a null aiInvolvement (not just the literal string "none")', () => {
    const wrapper = mount(FeatureList, { props: { features, aiInvolvementFilter: 'none' } });
    expect(renderedKeys(wrapper)).toEqual(['C']);
  });

  it('excludes features with no design PR from "No AI", matching the breakdown chart', () => {
    const withNoDesignDoc = {
      ...features,
      D: makeFeature({ key: 'D', aiInvolvement: null, sourceRfe: null })
    };
    const wrapper = mount(FeatureList, { props: { features: withNoDesignDoc, aiInvolvementFilter: 'none' } });
    expect(renderedKeys(wrapper)).toEqual(['C']);
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

describe('FeatureList fixVersion filter', () => {
  function findFixVersionSelect(wrapper) {
    return wrapper.findAll('select').find(s => s.findAll('option').some(o => o.text() === 'All Fix Versions'));
  }

  it('defaults to All Fix Versions and shows features with missing, undefined, or empty fixVersions', () => {
    const features = {
      'RHAISTRAT-1': makeFeature({ key: 'RHAISTRAT-1', title: 'Has version', fixVersions: ['rhoai-3.5'] }),
      'RHAISTRAT-2': makeFeature({ key: 'RHAISTRAT-2', title: 'Empty fixVersions', fixVersions: [] }),
      'RHAISTRAT-3': makeFeature({ key: 'RHAISTRAT-3', title: 'Undefined fixVersions', fixVersions: undefined })
    };

    const wrapper = mount(FeatureList, { props: { features } });
    expect(wrapper.text()).toContain('(3 of 3 total)');
    expect(wrapper.text()).toContain('Has version');
    expect(wrapper.text()).toContain('Empty fixVersions');
    expect(wrapper.text()).toContain('Undefined fixVersions');
  });

  it('lists unique fixVersions sorted, with Unassigned appended when applicable', () => {
    const features = {
      'RHAISTRAT-1': makeFeature({ key: 'RHAISTRAT-1', fixVersions: ['rhoai-3.6'] }),
      'RHAISTRAT-2': makeFeature({ key: 'RHAISTRAT-2', fixVersions: ['rhoai-3.5'] }),
      'RHAISTRAT-3': makeFeature({ key: 'RHAISTRAT-3', fixVersions: [] })
    };
    const wrapper = mount(FeatureList, { props: { features } });
    const select = findFixVersionSelect(wrapper);
    const options = select.findAll('option').map(o => o.text());
    expect(options).toEqual(['All Fix Versions', 'rhoai-3.5', 'rhoai-3.6', 'Unassigned']);
  });

  it('omits Unassigned when every feature has a fixVersion', () => {
    const features = {
      'RHAISTRAT-1': makeFeature({ key: 'RHAISTRAT-1', fixVersions: ['rhoai-3.5'] })
    };
    const wrapper = mount(FeatureList, { props: { features } });
    const select = findFixVersionSelect(wrapper);
    const options = select.findAll('option').map(o => o.text());
    expect(options).toEqual(['All Fix Versions', 'rhoai-3.5']);
  });

  it('filters to features matching the selected fixVersion, including multi-version matches', () => {
    const features = {
      'RHAISTRAT-1': makeFeature({ key: 'RHAISTRAT-1', title: 'Only 3.5', fixVersions: ['rhoai-3.5'] }),
      'RHAISTRAT-2': makeFeature({ key: 'RHAISTRAT-2', title: 'Both versions', fixVersions: ['rhoai-3.5', 'rhoai-3.6'] }),
      'RHAISTRAT-3': makeFeature({ key: 'RHAISTRAT-3', title: 'Only 3.6', fixVersions: ['rhoai-3.6'] })
    };
    const wrapper = mount(FeatureList, { props: { features, fixVersionFilter: encodeFixVersionOption('rhoai-3.5') } });
    expect(wrapper.text()).toContain('(2 of 3 total)');
    expect(wrapper.text()).toContain('Only 3.5');
    expect(wrapper.text()).toContain('Both versions');
    expect(wrapper.text()).not.toContain('Only 3.6');
  });

  it('treats a real fixVersion named like the sentinels as an ordinary, individually selectable version', () => {
    const features = {
      'RHAISTRAT-1': makeFeature({ key: 'RHAISTRAT-1', title: 'Named __all__', fixVersions: ['__all__'] }),
      'RHAISTRAT-2': makeFeature({ key: 'RHAISTRAT-2', title: 'Named __unassigned__', fixVersions: ['__unassigned__'] }),
      'RHAISTRAT-3': makeFeature({ key: 'RHAISTRAT-3', title: 'Other version', fixVersions: ['rhoai-3.5'] })
    };
    const wrapper = mount(FeatureList, { props: { features } });
    const select = findFixVersionSelect(wrapper);
    const options = select.findAll('option').map(o => o.text());
    expect(options).toEqual(['All Fix Versions', '__all__', '__unassigned__', 'rhoai-3.5']);

    const filtered = mount(FeatureList, { props: { features, fixVersionFilter: encodeFixVersionOption('__all__') } });
    expect(filtered.text()).toContain('(1 of 3 total)');
    expect(filtered.text()).toContain('Named __all__');
    expect(filtered.text()).not.toContain('Named __unassigned__');
    expect(filtered.text()).not.toContain('Other version');
  });

  it('filters to only unassigned features when Unassigned is selected', () => {
    const features = {
      'RHAISTRAT-1': makeFeature({ key: 'RHAISTRAT-1', title: 'Has version', fixVersions: ['rhoai-3.5'] }),
      'RHAISTRAT-2': makeFeature({ key: 'RHAISTRAT-2', title: 'No version', fixVersions: [] })
    };
    const wrapper = mount(FeatureList, { props: { features, fixVersionFilter: FIX_VERSION_FILTER_UNASSIGNED } });
    expect(wrapper.text()).toContain('(1 of 2 total)');
    expect(wrapper.text()).toContain('No version');
    expect(wrapper.text()).not.toContain('Has version');
  });

  it('emits update:fixVersionFilter when a fix version is selected', async () => {
    const features = {
      'RHAISTRAT-1': makeFeature({ key: 'RHAISTRAT-1', fixVersions: ['rhoai-3.5'] })
    };
    const wrapper = mount(FeatureList, { props: { features } });
    const select = findFixVersionSelect(wrapper);
    await select.setValue(encodeFixVersionOption('rhoai-3.5'));
    expect(wrapper.emitted('update:fixVersionFilter')[0]).toEqual([encodeFixVersionOption('rhoai-3.5')]);
  });

  it('applies together with the component filter', () => {
    const features = {
      'RHAISTRAT-1': makeFeature({ key: 'RHAISTRAT-1', title: 'Core with version', components: ['Core'], fixVersions: ['rhoai-3.5'] }),
      'RHAISTRAT-2': makeFeature({ key: 'RHAISTRAT-2', title: 'Core no version', components: ['Core'], fixVersions: [] })
    };
    const wrapper = mount(FeatureList, { props: { features, componentFilter: 'Core', fixVersionFilter: encodeFixVersionOption('rhoai-3.5') } });
    expect(wrapper.text()).toContain('(1 of 2 total)');
    expect(wrapper.text()).toContain('Core with version');
    expect(wrapper.text()).not.toContain('Core no version');
  });
});

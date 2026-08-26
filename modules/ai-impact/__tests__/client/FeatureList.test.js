import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import FeatureList from '../../client/components/FeatureList.vue';

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

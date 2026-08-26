import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import RFEList from '../../client/components/RFEList.vue';
import RFEListItem from '../../client/components/RFEListItem.vue';

function makeRFE(overrides = {}) {
  return {
    key: 'RHAIRFE-1',
    summary: 'Some RFE',
    priority: 'Major',
    status: 'New',
    created: '2026-01-01',
    components: [],
    ...overrides
  };
}

describe('RFEList component filter', () => {
  const rfes = [
    makeRFE({ key: 'RHAIRFE-1', summary: 'Core work', components: ['Core'] }),
    makeRFE({ key: 'RHAIRFE-2', summary: 'Storage work', components: ['Storage'] }),
    makeRFE({ key: 'RHAIRFE-3', summary: 'No component', components: [] })
  ];

  it('defaults to All Components and shows every RFE', () => {
    const wrapper = mount(RFEList, { props: { rfes } });
    const selects = wrapper.findAll('select');
    const componentSelect = selects.find(s => s.findAll('option').some(o => o.text() === 'All Components'));
    expect(componentSelect.find('option[value="all"]').text()).toBe('All Components');
    expect(wrapper.text()).toContain('3 of 3 total');
  });

  it('lists unique components derived from the data, sorted', () => {
    const wrapper = mount(RFEList, { props: { rfes } });
    const selects = wrapper.findAll('select');
    const componentSelect = selects.find(s => s.find('option[value="all"]').text() === 'All Components');
    const options = componentSelect.findAll('option').map(o => o.text());
    expect(options).toEqual(['All Components', 'Core', 'Storage']);
  });

  it('filters to only RFEs matching the selected component', async () => {
    const wrapper = mount(RFEList, { props: { rfes, componentFilter: 'Core' } });
    expect(wrapper.text()).toContain('1 of 3 total');
    expect(wrapper.text()).toContain('Core work');
    expect(wrapper.text()).not.toContain('Storage work');
  });

  it('emits update:componentFilter when a component is selected', async () => {
    const wrapper = mount(RFEList, { props: { rfes } });
    const selects = wrapper.findAll('select');
    const componentSelect = selects.find(s => s.find('option[value="all"]').text() === 'All Components');
    await componentSelect.setValue('Storage');
    expect(wrapper.emitted('update:componentFilter')[0]).toEqual(['Storage']);
  });

  it('restores the full list when switched back to All Components', async () => {
    const filtered = mount(RFEList, { props: { rfes, componentFilter: 'Core' } });
    expect(filtered.text()).toContain('1 of 3 total');

    await filtered.setProps({ componentFilter: 'all' });
    expect(filtered.text()).toContain('3 of 3 total');
  });
});

describe('RFEList review status filter', () => {
  function renderedKeys(wrapper) {
    return wrapper.findAllComponents(RFEListItem).map(c => c.props('rfe').key);
  }

  const rfes = [
    makeRFE({ key: 'OSAC-1', status: 'Merged' }),
    makeRFE({ key: 'OSAC-2', status: 'Open' }),
    makeRFE({ key: 'OSAC-3', status: 'Closed' }),
    makeRFE({ key: 'OSAC-4', status: 'No PR' })
  ];

  it('Approved includes only verified PRDs with Merged status', () => {
    const wrapper = mount(RFEList, { props: { rfes, reviewStatusFilter: 'approved' } });
    expect(renderedKeys(wrapper)).toEqual(['OSAC-1']);
  });

  it('Awaiting Sign-off includes verified PRDs with Open or Closed status', () => {
    const wrapper = mount(RFEList, { props: { rfes, reviewStatusFilter: 'awaiting-review' } });
    expect(renderedKeys(wrapper).sort()).toEqual(['OSAC-2', 'OSAC-3']);
  });

  it('excludes No PR from both Approved and Awaiting Sign-off', () => {
    const approved = mount(RFEList, { props: { rfes, reviewStatusFilter: 'approved' } });
    const awaiting = mount(RFEList, { props: { rfes, reviewStatusFilter: 'awaiting-review' } });
    expect(renderedKeys(approved)).not.toContain('OSAC-4');
    expect(renderedKeys(awaiting)).not.toContain('OSAC-4');
  });

  it('applies both the artifact filter and the review status filter together', () => {
    const wrapper = mount(RFEList, { props: { rfes, artifactFilter: 'has', reviewStatusFilter: 'approved' } });
    expect(renderedKeys(wrapper)).toEqual(['OSAC-1']);

    const missing = mount(RFEList, { props: { rfes, artifactFilter: 'missing', reviewStatusFilter: 'approved' } });
    expect(renderedKeys(missing)).toEqual([]);
  });
});

describe('RFEList artifact filter', () => {
  function renderedKeys(wrapper) {
    return wrapper.findAllComponents(RFEListItem).map(c => c.props('rfe').key);
  }

  const rfes = [
    makeRFE({ key: 'OSAC-1', status: 'Merged' }),
    makeRFE({ key: 'OSAC-2', status: 'Open' }),
    makeRFE({ key: 'OSAC-3', status: 'No PR' })
  ];

  it('"has" excludes rows with No PR', () => {
    const wrapper = mount(RFEList, { props: { rfes, artifactFilter: 'has' } });
    expect(renderedKeys(wrapper).sort()).toEqual(['OSAC-1', 'OSAC-2']);
  });

  it('"missing" includes only rows with No PR', () => {
    const wrapper = mount(RFEList, { props: { rfes, artifactFilter: 'missing' } });
    expect(renderedKeys(wrapper)).toEqual(['OSAC-3']);
  });

  it('"all" (default) includes every row', () => {
    const wrapper = mount(RFEList, { props: { rfes } });
    expect(renderedKeys(wrapper)).toHaveLength(3);
  });
});

describe('RFEList default ordering', () => {
  function renderedKeys(wrapper) {
    return wrapper.findAllComponents(RFEListItem).map(c => c.props('rfe').key);
  }

  it('puts verified-PRD rows before missing-PRD rows, each sorted by numeric OSAC id descending', () => {
    const rfes = [
      makeRFE({ key: 'OSAC-63', status: 'No PR' }),
      makeRFE({ key: 'OSAC-4000', status: 'New' }),
      makeRFE({ key: 'OSAC-983', status: 'No PR' }),
      makeRFE({ key: 'OSAC-100', status: 'New' })
    ];

    const wrapper = mount(RFEList, { props: { rfes, sortBy: 'default' } });

    expect(renderedKeys(wrapper)).toEqual(['OSAC-4000', 'OSAC-100', 'OSAC-983', 'OSAC-63']);
  });

  it('uses numeric comparison, not lexical string sorting, within a group', () => {
    const rfes = [
      makeRFE({ key: 'OSAC-63', status: 'New' }),
      makeRFE({ key: 'OSAC-983', status: 'New' }),
      makeRFE({ key: 'OSAC-4000', status: 'New' })
    ];

    const wrapper = mount(RFEList, { props: { rfes, sortBy: 'default' } });

    // Lexical sort would produce ['OSAC-983', 'OSAC-4000', 'OSAC-63'] (string comparison)
    expect(renderedKeys(wrapper)).toEqual(['OSAC-4000', 'OSAC-983', 'OSAC-63']);
  });

  it('does not affect explicit Score sort options', () => {
    const rfes = [
      makeRFE({ key: 'OSAC-63', status: 'No PR' }),
      makeRFE({ key: 'OSAC-4000', status: 'New' })
    ];
    const assessments = {
      'OSAC-63': { total: 2 },
      'OSAC-4000': { total: 8 }
    };

    const ascending = mount(RFEList, { props: { rfes, assessments, sortBy: 'score-asc' } });
    expect(renderedKeys(ascending)).toEqual(['OSAC-63', 'OSAC-4000']);

    const descending = mount(RFEList, { props: { rfes, assessments, sortBy: 'score-desc' } });
    expect(renderedKeys(descending)).toEqual(['OSAC-4000', 'OSAC-63']);
  });

  it('sorts by created date for the Newest and Oldest options', () => {
    const rfes = [
      makeRFE({ key: 'OSAC-1', created: '2026-01-01' }),
      makeRFE({ key: 'OSAC-2', created: '2026-03-01' }),
      makeRFE({ key: 'OSAC-3', created: '2026-02-01' })
    ];

    const newest = mount(RFEList, { props: { rfes, sortBy: 'newest' } });
    expect(renderedKeys(newest)).toEqual(['OSAC-2', 'OSAC-3', 'OSAC-1']);

    const oldest = mount(RFEList, { props: { rfes, sortBy: 'oldest' } });
    expect(renderedKeys(oldest)).toEqual(['OSAC-1', 'OSAC-3', 'OSAC-2']);
  });
});

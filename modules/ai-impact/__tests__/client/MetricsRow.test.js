import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MetricsRow from '../../client/components/MetricsRow.vue';
import InfoBubble from '../../client/components/InfoBubble.vue';

const METRICS = { createdPct: 50, createdChange: 0, trend: 'stable', revisedCount: 2, priorRevisedCount: 1, windowTotal: 4, totalRFEs: 10 };

function makeRFE(overrides = {}) {
  return { key: 'OSAC-1', status: 'Merged', ...overrides };
}

function tileValue(wrapper, label) {
  const tile = wrapper.findAll('.space-y-1').find(d => d.find('p').text() === label);
  return tile.find('.text-3xl').text();
}

function createdWithAITile(wrapper) {
  return wrapper.findAll('.space-y-1').find(el => el.text().includes('Created with AI'));
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

    expect(tileValue(wrapper, 'Signed Off')).toBe('2');
  });

  it('excludes No PR rows from the Signed Off count', () => {
    const rfes = [
      makeRFE({ key: 'OSAC-1', status: 'Merged' }),
      makeRFE({ key: 'OSAC-2', status: 'No PR' }),
      makeRFE({ key: 'OSAC-3', status: 'No PR' })
    ];
    const wrapper = mount(MetricsRow, { props: { metrics: METRICS, rfes } });

    expect(tileValue(wrapper, 'Signed Off')).toBe('1');
  });

  it('shows zero Signed Off when no PRDs are Merged', () => {
    const rfes = [
      makeRFE({ key: 'OSAC-1', status: 'Open' }),
      makeRFE({ key: 'OSAC-2', status: 'No PR' })
    ];
    const wrapper = mount(MetricsRow, { props: { metrics: METRICS, rfes } });

    expect(tileValue(wrapper, 'Signed Off')).toBe('0');
  });
});

describe('MetricsRow Needs Action metric', () => {
  it('counts existing, assessed PRDs that are not yet merged', () => {
    const rfes = [
      makeRFE({ key: 'OSAC-1', status: 'Merged' }),
      makeRFE({ key: 'OSAC-2', status: 'Open' }),
      makeRFE({ key: 'OSAC-3', status: 'In Review' }),
      makeRFE({ key: 'OSAC-4', status: 'No PR' })
    ];
    const assessments = {
      'OSAC-1': { passFail: 'PASS' },
      'OSAC-2': { passFail: 'FAIL' },
      'OSAC-3': { passFail: 'PASS' }
    };
    const wrapper = mount(MetricsRow, { props: { metrics: METRICS, rfes, assessments } });

    expect(tileValue(wrapper, 'Needs Action')).toBe('2'); // OSAC-2, OSAC-3 — No PR excluded, Merged excluded
  });

  it('excludes not-yet-assessed existing PRDs from the denominator', () => {
    const rfes = [
      makeRFE({ key: 'OSAC-1', status: 'Open' }),
      makeRFE({ key: 'OSAC-2', status: 'Open' })
    ];
    const assessments = { 'OSAC-2': { passFail: 'FAIL' } };
    const wrapper = mount(MetricsRow, { props: { metrics: METRICS, rfes, assessments } });

    expect(tileValue(wrapper, 'Needs Action')).toBe('1'); // OSAC-1 has no AI verdict yet
  });
});

describe('MetricsRow Approval Rate metric', () => {
  const rfes = [
    makeRFE({ key: 'OSAC-1', status: 'Merged' }),
    makeRFE({ key: 'OSAC-2', status: 'Open' }),
    makeRFE({ key: 'OSAC-3', status: 'Open' }),
    makeRFE({ key: 'OSAC-4', status: 'No PR' })
  ];

  it('is the percentage of PASS among assessed, existing PRDs', () => {
    const assessments = {
      'OSAC-1': { passFail: 'PASS' },
      'OSAC-2': { passFail: 'FAIL' }
    };
    const wrapper = mount(MetricsRow, { props: { metrics: METRICS, rfes, assessments } });

    expect(tileValue(wrapper, 'Approval Rate')).toBe('50%');
  });

  it('excludes unassessed existing PRDs from the denominator', () => {
    const assessments = { 'OSAC-1': { passFail: 'PASS' } };
    const wrapper = mount(MetricsRow, { props: { metrics: METRICS, rfes, assessments } });

    expect(tileValue(wrapper, 'Approval Rate')).toBe('100%'); // only OSAC-1 is assessed
  });

  it('ignores an assessment on a No PR issue (no artifact exists)', () => {
    const assessments = { 'OSAC-4': { passFail: 'PASS' } };
    const wrapper = mount(MetricsRow, { props: { metrics: METRICS, rfes, assessments } });

    expect(tileValue(wrapper, 'Approval Rate')).toBe('—');
  });

  it('shows — when no existing PRD has been assessed', () => {
    const wrapper = mount(MetricsRow, { props: { metrics: METRICS, rfes, assessments: {} } });

    expect(tileValue(wrapper, 'Approval Rate')).toBe('—');
  });

  it('shows a genuine 0% when assessed PRDs exist but none passed', () => {
    const assessments = { 'OSAC-1': { passFail: 'FAIL' }, 'OSAC-2': { passFail: 'FAIL' } };
    const wrapper = mount(MetricsRow, { props: { metrics: METRICS, rfes, assessments } });

    expect(tileValue(wrapper, 'Approval Rate')).toBe('0%');
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

  it('preserves existing Created with AI rendering when windowTotal > 0', () => {
    const wrapper = mount(MetricsRow, { props: { metrics: METRICS, rfes: [] } });
    const createdTile = createdWithAITile(wrapper);

    expect(createdTile.find('.text-3xl').text()).toBe('50%');
    expect(createdTile.find('.text-sm.flex.gap-1').text()).toBe('0%');
  });
});

describe('MetricsRow no longer renders removed tiles', () => {
  it('does not render Review with AI or Trend Status', () => {
    const wrapper = mount(MetricsRow, { props: { metrics: METRICS, rfes: [] } });

    expect(wrapper.text()).not.toContain('Review with AI');
    expect(wrapper.text()).not.toContain('Trend Status');
  });
});

describe('MetricsRow KPI InfoBubbles', () => {
  const EXPECTED_TEXT = {
    'Total PRDs': 'PRDs that exist in the selected period.',
    'Created with AI': 'Percentage of existing PRDs created with AI.',
    'Approval Rate': 'Percentage of AI-assessed PRDs that passed the AI review.',
    'Needs Action': 'AI-assessed PRDs still awaiting human review and sign-off.',
    'Signed Off': 'PRDs whose pull request has been merged.'
  };

  it.each(Object.entries(EXPECTED_TEXT))('%s has a hover-triggered InfoBubble with the expected copy', (label, text) => {
    const wrapper = mount(MetricsRow, { props: { metrics: METRICS, rfes: [] } });
    const tile = wrapper.findAll('.space-y-1').find(d => d.find('p').text() === label);
    const bubble = tile.findComponent(InfoBubble);

    expect(bubble.exists()).toBe(true);
    expect(bubble.props('trigger')).toBe('hover');
    expect(bubble.props('text')).toBe(text);
  });
});

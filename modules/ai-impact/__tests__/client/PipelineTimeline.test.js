import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PipelineTimeline from '../../client/components/PipelineTimeline.vue';

const PHASES = [
  { id: 'prd-review', name: 'PRD Review' },
  { id: 'design-review', name: 'Design Review' }
];

function makeRFE(overrides = {}) {
  return {
    key: 'OSAC-63',
    summary: 'Some feature',
    aiInvolvement: 'created',
    ...overrides
  };
}

describe('PipelineTimeline prd-review phase', () => {
  it('marks prd-review as the current/active phase for a real PRD', () => {
    const wrapper = mount(PipelineTimeline, {
      props: { rfe: makeRFE(), phases: PHASES }
    });

    expect(wrapper.text()).toContain('AI created');
  });

  it('does not mark prd-review as current or completed when status is No PR', () => {
    const rfe = makeRFE({ status: 'No PR', aiInvolvement: 'none', sourceRfe: null });
    const wrapper = mount(PipelineTimeline, {
      props: { rfe, phases: PHASES }
    });

    // "current" phase renders a blue circle icon with this class; "completed" renders green.
    const prdReviewStep = wrapper.findAll('.rounded-full').find(el => el.classes().includes('w-8'));
    expect(prdReviewStep.classes()).not.toContain('bg-blue-500');
    expect(prdReviewStep.classes()).not.toContain('bg-green-500');
  });

  it('shows "No PRD" text without "No AI involvement" or a PR link when status is No PR', () => {
    const rfe = makeRFE({ status: 'No PR', aiInvolvement: 'none', sourceRfe: null });
    const wrapper = mount(PipelineTimeline, {
      props: { rfe, phases: PHASES }
    });

    expect(wrapper.text()).toContain('No PRD');
    expect(wrapper.text()).not.toContain('No AI involvement');
    expect(wrapper.find('a').exists()).toBe(false);
  });

  it('renders a "PR #N" link for an EP-backed RFE', () => {
    const rfe = makeRFE({ sourceRfe: 'EP-42' });
    const wrapper = mount(PipelineTimeline, {
      props: { rfe, phases: PHASES }
    });

    const link = wrapper.find('a');
    expect(link.exists()).toBe(true);
    expect(link.text()).toContain('PR #42');
    expect(link.attributes('href')).toBe('https://github.com/osac-project/enhancement-proposals/pull/42');
  });

  it('derives an EP PRD link for a feature when prdPrUrl is missing without adding RFE navigation', () => {
    const wrapper = mount(PipelineTimeline, {
      props: {
        feature: makeFeature({ sourceRfe: 'EP-208', prdPrUrl: null }),
        phases: PHASES
      }
    });

    const link = wrapper.find('a');
    expect(link.attributes('href')).toBe('https://github.com/osac-project/enhancement-proposals/pull/208');
    expect(link.text()).toContain('PRD PR');
    expect(wrapper.find('button').exists()).toBe(false);
  });

  it('does not derive an EP PRD link for a feature marked No PR', () => {
    const wrapper = mount(PipelineTimeline, {
      props: {
        feature: makeFeature({ sourceRfe: 'EP-208', status: 'No PR', prdPrUrl: null }),
        phases: PHASES
      }
    });

    expect(wrapper.find('a').exists()).toBe(false);
  });

  it('renders the same resolved PR link for a non-EP RFE with linkedFeature.prdPrUrl', () => {
    const rfe = makeRFE({
      sourceRfe: 'OSAC-99',
      linkedFeature: { key: 'OSAC-100', prdPrUrl: 'https://github.com/org/repo/pull/7' }
    });
    const wrapper = mount(PipelineTimeline, {
      props: { rfe, phases: PHASES }
    });

    const link = wrapper.find('a');
    expect(link.exists()).toBe(true);
    expect(link.attributes('href')).toBe('https://github.com/org/repo/pull/7');
    expect(link.text()).toContain('PRD PR');
  });

  it('renders no PR link when there is no resolvable PRD PR URL', () => {
    const rfe = makeRFE({ sourceRfe: 'OSAC-99', linkedFeature: { key: 'OSAC-100' } });
    const wrapper = mount(PipelineTimeline, {
      props: { rfe, phases: PHASES }
    });

    expect(wrapper.find('a').exists()).toBe(false);
  });
});

function makeFeature(overrides = {}) {
  return {
    key: 'OSAC-1',
    recommendation: 'approve',
    scores: { total: 6 },
    designPrStatus: 'Merged',
    labels: [],
    ...overrides
  };
}

describe('PipelineTimeline design-review phase', () => {
  it('uses the canonical PRD PR URL without treating an EP source as an RFE', () => {
    const wrapper = mount(PipelineTimeline, {
      props: {
        feature: makeFeature({
          sourceRfe: 'EP-208',
          prdPrUrl: 'https://github.com/osac-project/enhancement-proposals/pull/168'
        }),
        phases: PHASES
      }
    });

    const prdLink = wrapper.find('a');
    expect(prdLink.attributes('href')).toBe('https://github.com/osac-project/enhancement-proposals/pull/168');
    expect(prdLink.attributes('title')).toBe('View PRD pull request on GitHub');
    expect(prdLink.text()).toContain('PRD PR');
    expect(wrapper.find('button').exists()).toBe(false);
  });

  it('keeps in-app PRD navigation for a real RFE source', async () => {
    const wrapper = mount(PipelineTimeline, {
      props: {
        feature: makeFeature({
          sourceRfe: 'RHAIRFE-208',
          prdPrUrl: 'https://github.com/osac-project/enhancement-proposals/pull/168'
        }),
        phases: PHASES
      }
    });

    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('navigateToRFE')).toEqual([['RHAIRFE-208']]);
  });

  it('shows recommendation and score for a scored Design', () => {
    const wrapper = mount(PipelineTimeline, { props: { feature: makeFeature(), phases: PHASES } });
    expect(wrapper.text()).toContain('approve — 6/8');
  });

  it('shows only the score when a scored Design has no recommendation', () => {
    const wrapper = mount(PipelineTimeline, {
      props: { feature: makeFeature({ recommendation: null }), phases: PHASES }
    });
    expect(wrapper.text()).toContain('6/8');
    expect(wrapper.text()).not.toContain('null');
    expect(wrapper.text()).not.toContain('undefined');
  });

  it('does not fabricate 0/8 for an existing but unscored Design', () => {
    const wrapper = mount(PipelineTimeline, {
      props: { feature: makeFeature({ scores: null, recommendation: null }), phases: PHASES }
    });
    expect(wrapper.text()).not.toContain('0/8');
    expect(wrapper.text()).toContain('—');
  });

  it('does not fabricate a score for a genuinely missing Design', () => {
    const wrapper = mount(PipelineTimeline, {
      props: { feature: makeFeature({ scores: null, recommendation: null, designPrStatus: null }), phases: PHASES }
    });
    expect(wrapper.text()).not.toContain('0/8');
    expect(wrapper.text()).toContain('No design yet');
  });
});

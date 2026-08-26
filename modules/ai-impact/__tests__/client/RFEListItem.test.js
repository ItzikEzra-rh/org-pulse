import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import RFEListItem from '../../client/components/RFEListItem.vue';

function makeRFE(overrides = {}) {
  return {
    key: 'OSAC-63',
    summary: 'Some feature',
    priority: 'Major',
    status: 'New',
    created: '2026-01-01T00:00:00.000Z',
    creatorDisplayName: 'Alice',
    aiInvolvement: 'created',
    ...overrides
  };
}

describe('RFEListItem', () => {
  it('renders normal AI involvement badge and glanceable metadata for a real PRD', () => {
    const wrapper = mount(RFEListItem, { props: { rfe: makeRFE() } });

    expect(wrapper.text()).toContain('AI Created');
    expect(wrapper.text()).toContain('Priority');
    expect(wrapper.text()).toContain('Score');
    expect(wrapper.text()).not.toContain('Missing PRD');
  });

  it('labels a PRD with both a provenance stamp and an AI review score as Created & Review', () => {
    const wrapper = mount(RFEListItem, { props: { rfe: makeRFE({ aiInvolvement: 'both' }) } });

    expect(wrapper.text()).toContain('AI Created & Review');
  });

  it('labels a PRD with only an AI review score as AI Review', () => {
    const wrapper = mount(RFEListItem, { props: { rfe: makeRFE({ aiInvolvement: 'revised' }) } });

    expect(wrapper.text()).toContain('AI Review');
    expect(wrapper.text()).not.toContain('AI Created');
  });

  it('labels no AI involvement as No AI on a real PRD', () => {
    const wrapper = mount(RFEListItem, { props: { rfe: makeRFE({ aiInvolvement: 'none' }) } });

    expect(wrapper.text()).toContain('No AI');
  });

  it('gives AI Created a solid green pill', () => {
    const wrapper = mount(RFEListItem, { props: { rfe: makeRFE({ aiInvolvement: 'created' }) } });

    const aiPill = wrapper.findAll('span').find(el => el.text() === 'AI Created');
    expect(aiPill.classes()).toContain('bg-green-500');
    expect(aiPill.classes()).toContain('text-white');
  });

  it('gives AI Created & Review a solid blue pill', () => {
    const wrapper = mount(RFEListItem, { props: { rfe: makeRFE({ aiInvolvement: 'both' }) } });

    const aiPill = wrapper.findAll('span').find(el => el.text() === 'AI Created & Review');
    expect(aiPill.classes()).toContain('bg-blue-500');
    expect(aiPill.classes()).toContain('text-white');
  });

  it('gives AI Review a solid amber pill', () => {
    const wrapper = mount(RFEListItem, { props: { rfe: makeRFE({ aiInvolvement: 'revised' }) } });

    const aiPill = wrapper.findAll('span').find(el => el.text() === 'AI Review');
    expect(aiPill.classes()).toContain('bg-amber-500');
    expect(aiPill.classes()).toContain('text-white');
  });

  it('falls back to a neutral gray pill when there is no AI involvement', () => {
    const wrapper = mount(RFEListItem, { props: { rfe: makeRFE({ aiInvolvement: 'none' }) } });

    const aiPill = wrapper.findAll('span').find(el => el.text() === 'No AI');
    expect(aiPill.classes()).toContain('bg-gray-200');
    expect(aiPill.classes()).not.toContain('bg-green-500');
    expect(aiPill.classes()).not.toContain('bg-blue-500');
  });

  it('shows the Created date chip but not an Author chip for a real PRD', () => {
    const rfe = makeRFE();
    const wrapper = mount(RFEListItem, { props: { rfe } });

    expect(wrapper.text()).toContain('Created');
    expect(wrapper.text()).toContain(new Date(rfe.created).toLocaleDateString());
    expect(wrapper.text()).not.toContain('Author');
    expect(wrapper.text()).not.toContain('Alice');
  });

  it('renders an info tooltip next to the Review pill (aligned with Design Review)', () => {
    const wrapper = mount(RFEListItem, { props: { rfe: makeRFE({ status: 'Open' }) } });

    // InfoBubble renders a "More info" button; tooltip text is only shown on click.
    expect(wrapper.find('button[aria-label="More info"]').exists()).toBe(true);
  });

  it('omits the Created chip when the PRD has no creation date but keeps the row', () => {
    // aiInvolvement 'revised' → "AI Review" pill, so "Created" only appears if the chip renders.
    const wrapper = mount(RFEListItem, { props: { rfe: makeRFE({ status: 'Open', created: null, aiInvolvement: 'revised' }) } });

    expect(wrapper.text()).not.toContain('Created');
    expect(wrapper.text()).toContain('Score');
    expect(wrapper.text()).toContain('Priority');
  });

  it('shows a Missing PRD badge instead of the AI involvement badge when status is No PR', () => {
    const rfe = makeRFE({ status: 'No PR', creatorDisplayName: 'Dev One', aiInvolvement: 'none' });
    const wrapper = mount(RFEListItem, { props: { rfe } });

    expect(wrapper.text()).toContain('Missing PRD');
    expect(wrapper.text()).not.toContain('No AI');
  });

  it('gives the Missing PRD pill the same blue treatment as Design Review No Design', () => {
    const rfe = makeRFE({ status: 'No PR', creatorDisplayName: 'Dev One', aiInvolvement: 'none' });
    const wrapper = mount(RFEListItem, { props: { rfe } });

    const pill = wrapper.findAll('span').find(el => el.text() === 'Missing PRD');
    expect(pill.classes()).toContain('bg-blue-100');
    expect(pill.classes()).toContain('text-blue-800');
    expect(pill.classes()).toContain('rounded-full');
  });

  it('does not render Created or Score chips when status is No PR', () => {
    const rfe = makeRFE({ status: 'No PR', creatorDisplayName: 'Dev One', aiInvolvement: 'none' });
    const wrapper = mount(RFEListItem, { props: { rfe } });

    expect(wrapper.text()).not.toContain('Created');
    expect(wrapper.text()).not.toContain('Score');
  });

  it('does not throw on a null created date when status is No PR', () => {
    const rfe = makeRFE({ status: 'No PR', created: null, creatorDisplayName: null, aiInvolvement: 'none' });

    expect(() => mount(RFEListItem, { props: { rfe } })).not.toThrow();
  });

  it('does not show a score for a No PR row even when a stale assessment is passed in', () => {
    const rfe = makeRFE({ status: 'No PR', creatorDisplayName: 'Dev One', aiInvolvement: 'none' });
    const assessment = { passFail: 'PASS', total: 9 };
    const wrapper = mount(RFEListItem, { props: { rfe, assessment } });

    expect(wrapper.text()).not.toContain('Score');
    expect(wrapper.text()).not.toContain('9/10');
  });

  it('shows a Review Approved badge when the PRD PR is Merged', () => {
    const wrapper = mount(RFEListItem, { props: { rfe: makeRFE({ status: 'Merged' }) } });

    expect(wrapper.text()).toContain('Review Approved');
  });

  it('shows a Review Awaiting Sign-off badge when the PRD PR is Open', () => {
    const wrapper = mount(RFEListItem, { props: { rfe: makeRFE({ status: 'Open' }) } });

    expect(wrapper.text()).toContain('Review Awaiting Sign-off');
  });

  it('shows a Review Awaiting Sign-off badge when the PRD PR is Closed without merge', () => {
    const wrapper = mount(RFEListItem, { props: { rfe: makeRFE({ status: 'Closed' }) } });

    expect(wrapper.text()).toContain('Review Awaiting Sign-off');
  });

  it('keeps the AI provenance badge distinct from the review status badge', () => {
    const wrapper = mount(RFEListItem, { props: { rfe: makeRFE({ status: 'Merged', aiInvolvement: 'revised' }) } });

    expect(wrapper.text()).toContain('AI Review');
    expect(wrapper.text()).toContain('Review Approved');
  });

  it('does not show a review status badge for a Missing PRD row', () => {
    const rfe = makeRFE({ status: 'No PR', creatorDisplayName: 'Dev One', aiInvolvement: 'none' });
    const wrapper = mount(RFEListItem, { props: { rfe } });

    expect(wrapper.text()).not.toContain('Approved');
    expect(wrapper.text()).not.toContain('Awaiting Sign-off');
    expect(wrapper.text()).not.toContain('Review');
  });
});

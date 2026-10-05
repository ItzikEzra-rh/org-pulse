import { describe, it, expect, vi } from 'vitest';

vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: vi.fn().mockResolvedValue({})
}));

import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import RFEDetailModal from '../../client/components/RFEDetailModal.vue';
import PipelineTimeline from '../../client/components/PipelineTimeline.vue';
import { apiRequest } from '@shared/client/services/api.js';

async function flushAsyncWatchers() {
  await nextTick();
  await Promise.resolve();
  await nextTick();
}

const PHASES = [
  { id: 'prd-review', name: 'PRD Review' },
  { id: 'design-review', name: 'Design Review' }
];

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

// RFEDetailModal renders via <Teleport to="body">, so assert against document.body
// rather than the wrapper's own (empty) root element.
function mountModal(rfe, assessment = null) {
  return mount(RFEDetailModal, {
    props: { show: true, rfe, phases: PHASES, assessment },
    attachTo: document.body
  });
}

describe('RFEDetailModal', () => {
  it('renders Author/Created/AI Involvement fields for a real PRD', () => {
    const wrapper = mountModal(makeRFE());

    expect(document.body.textContent).toContain('Author');
    expect(document.body.textContent).toContain('Alice');
    expect(document.body.textContent).toContain('AI Involvement');
    expect(document.body.textContent).toContain('Not yet assessed');
    wrapper.unmount();
  });

  it('shows a missing-PRD state instead of Author/Created/AI Involvement when status is No PR', () => {
    const rfe = makeRFE({ status: 'No PR', creatorDisplayName: 'Dev One', sourceRfe: null, aiInvolvement: 'none' });
    const wrapper = mountModal(rfe);

    expect(document.body.textContent).toContain('No PRD has been verified for this feature.');
    expect(document.body.textContent).not.toContain('Author');
    expect(document.body.textContent).not.toContain('AI Involvement');
    expect(document.body.textContent).not.toContain('No AI');
    wrapper.unmount();
  });

  it('shows an unavailable state and suppresses AI/sign-off data when docs linkage is unknown', () => {
    const rfe = makeRFE({ status: 'Unknown', prdArtifactPresence: 'unavailable', aiInvolvement: null });
    const wrapper = mountModal(rfe);

    expect(document.body.textContent).toContain('PRD document and review status are unavailable');
    expect(document.body.textContent).toContain('Assessment unavailable');
    expect(document.body.textContent).not.toContain('AI Involvement');
    expect(document.body.textContent).not.toContain('Review Status');
    expect(document.body.textContent).not.toContain('No AI');
    expect(document.body.textContent).not.toContain('Awaiting Sign-off');
    wrapper.unmount();
  });

  it('keeps unavailable authoritative when a stale payload also says No PR', () => {
    const rfe = makeRFE({ status: 'No PR', prdArtifactPresence: 'unavailable', aiInvolvement: 'none' });
    const wrapper = mountModal(rfe, { passFail: 'PASS', total: 9 });

    expect(document.body.textContent).toContain('PRD document and review status are unavailable');
    expect(document.body.textContent).toContain('Assessment unavailable');
    expect(document.body.textContent).not.toContain('No PRD has been verified');
    expect(document.body.textContent).not.toContain('No PRD to assess');
    expect(document.body.textContent).not.toContain('AI Involvement');
    expect(document.body.textContent).not.toContain('No AI');
    expect(document.body.textContent).not.toContain('Awaiting Sign-off');
    expect(document.body.textContent).not.toContain('9/10');
    wrapper.unmount();
  });

  it('distinguishes a present PRD document with no linked review PR', () => {
    const rfe = makeRFE({ status: 'No PR', prdArtifactPresence: 'present', aiInvolvement: null });
    const wrapper = mountModal(rfe);

    expect(document.body.textContent).toContain('A PRD document exists, but no linked PR is available to review.');
    expect(document.body.textContent).toContain('No PRD to assess');
    wrapper.unmount();
  });

  it('shows a no-PRD assessment placeholder instead of "Not yet assessed" when status is No PR', () => {
    const rfe = makeRFE({ status: 'No PR', creatorDisplayName: 'Dev One', sourceRfe: null, aiInvolvement: 'none' });
    const wrapper = mountModal(rfe);

    expect(document.body.textContent).toContain('No PRD to assess');
    expect(document.body.textContent).not.toContain('Not yet assessed');
    wrapper.unmount();
  });

  it('does not show a stale score when status is No PR even if an assessment is passed in', () => {
    const rfe = makeRFE({ status: 'No PR', creatorDisplayName: 'Dev One', sourceRfe: null, aiInvolvement: 'none' });
    const wrapper = mountModal(rfe, { passFail: 'PASS', total: 9 });

    expect(document.body.textContent).toContain('No PRD to assess');
    expect(document.body.textContent).not.toContain('9/10');
    wrapper.unmount();
  });

  it('does not throw or render an invalid/1970 date when created is null', () => {
    const rfe = makeRFE({ status: 'No PR', created: null, creatorDisplayName: null, sourceRfe: null, aiInvolvement: 'none' });

    let wrapper;
    expect(() => { wrapper = mountModal(rfe); }).not.toThrow();
    expect(document.body.textContent).not.toContain('1970');
    wrapper.unmount();
  });

  it('titles the modal "PRD Details" for a real PRD', () => {
    const wrapper = mountModal(makeRFE());

    expect(document.body.querySelector('h2').textContent).toBe('PRD Details');
    wrapper.unmount();
  });

  it('titles the modal "Feature Details", not "Missing PRD", when status is No PR', () => {
    const rfe = makeRFE({ status: 'No PR', creatorDisplayName: 'Dev One', sourceRfe: null, aiInvolvement: 'none' });
    const wrapper = mountModal(rfe);

    expect(document.body.querySelector('h2').textContent).toBe('Feature Details');
    wrapper.unmount();
  });

  it('shows a Review Status of Approved when the PRD PR is Merged', () => {
    const wrapper = mountModal(makeRFE({ status: 'Merged' }));

    expect(document.body.textContent).toContain('Review Status');
    expect(document.body.textContent).toContain('Approved');
    wrapper.unmount();
  });

  it('shows a Review Status of Awaiting Sign-off when the PRD PR is Open or Closed without merge', () => {
    const openWrapper = mountModal(makeRFE({ status: 'Open' }));
    expect(document.body.textContent).toContain('Awaiting Sign-off');
    openWrapper.unmount();

    const closedWrapper = mountModal(makeRFE({ status: 'Closed' }));
    expect(document.body.textContent).toContain('Awaiting Sign-off');
    closedWrapper.unmount();
  });

  it('does not show a Review Status field when status is No PR', () => {
    const rfe = makeRFE({ status: 'No PR', creatorDisplayName: 'Dev One', sourceRfe: null, aiInvolvement: 'none' });
    const wrapper = mountModal(rfe);

    expect(document.body.textContent).not.toContain('Review Status');
    expect(document.body.textContent).not.toContain('Awaiting Sign-off');
    wrapper.unmount();
  });

  it('shows Component and Fix Version together when both are present', () => {
    const wrapper = mountModal(makeRFE({ components: ['Core'], linkedFeature: { fixVersions: ['0.3'] } }));

    expect(document.body.textContent).toContain('Component');
    expect(document.body.textContent).toContain('Core');
    expect(document.body.textContent).toContain('Fix Version');
    expect(document.body.textContent).toContain('0.3');
    wrapper.unmount();
  });

  it('hides Fix Version when the linked feature has no fix versions', () => {
    const wrapper = mountModal(makeRFE({ components: ['Core'], linkedFeature: null }));

    expect(document.body.textContent).toContain('Component');
    expect(document.body.textContent).not.toContain('Fix Version');
    wrapper.unmount();
  });

  it('hides both Component and Fix Version when neither is present', () => {
    const wrapper = mountModal(makeRFE({ components: [], linkedFeature: null }));

    expect(document.body.textContent).not.toContain('Component');
    expect(document.body.textContent).not.toContain('Fix Version');
    wrapper.unmount();
  });

  it('uses the same 3-column grid geometry as the metadata grid above it, with Component fixed in column 1', () => {
    const wrapper = mountModal(makeRFE({ components: ['Core'], linkedFeature: { fixVersions: ['0.3'] } }));
    const metadataGrid = document.body.querySelector('.grid.grid-cols-3');
    const chipRow = [...document.body.querySelectorAll('.grid.grid-cols-3')][1];

    expect(chipRow.className).toBe(metadataGrid.className);
    expect(chipRow.children[0].textContent).toContain('Component');
    expect(chipRow.children[1].textContent).toContain('Fix Version');
    wrapper.unmount();
  });

  it('keeps Component in column 1 even when Fix Version is the only group present', () => {
    const wrapper = mountModal(makeRFE({ components: [], linkedFeature: { fixVersions: ['0.3'] } }));
    const chipRow = [...document.body.querySelectorAll('.grid.grid-cols-3')][1];

    expect(chipRow.children[0].textContent).not.toContain('Fix Version');
    expect(chipRow.children[1].textContent).toContain('Fix Version');
    wrapper.unmount();
  });
});

describe('RFEDetailModal PRD PR action', () => {
  it('renders the PRD PR action with the canonical URL when linkedFeature.prdPrUrl is present', () => {
    const wrapper = mountModal(makeRFE({
      linkedFeature: { key: 'RHAISTRAT-1', prdPrUrl: 'https://github.com/osac-project/enhancement-proposals/pull/1168' }
    }));

    const link = document.body.querySelector('a[title="View PRD pull request on GitHub"]');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('https://github.com/osac-project/enhancement-proposals/pull/1168');
    wrapper.unmount();
  });

  it('does not render the PRD PR action when linkedFeature.prdPrUrl is absent', () => {
    const wrapper = mountModal(makeRFE({ linkedFeature: { key: 'RHAISTRAT-1', prdPrUrl: null } }));

    expect(document.body.querySelector('a[title="View PRD pull request on GitHub"]')).toBeNull();
    wrapper.unmount();
  });

  it('does not render the PRD PR action when there is no linkedFeature at all', () => {
    const wrapper = mountModal(makeRFE({ linkedFeature: null }));

    expect(document.body.querySelector('a[title="View PRD pull request on GitHub"]')).toBeNull();
    wrapper.unmount();
  });

  it('does not render the PRD PR action for an EP-prefixed key alone, without a canonical URL', () => {
    const wrapper = mountModal(makeRFE({ key: 'EP-42', linkedFeature: null }));

    expect(document.body.querySelector('a[title="View PRD pull request on GitHub"]')).toBeNull();
    wrapper.unmount();
  });

  it('renders the top action with the same visual/action pattern as Design PR, including the GitHub icon', () => {
    const wrapper = mountModal(makeRFE({
      linkedFeature: { key: 'RHAISTRAT-1', prdPrUrl: 'https://github.com/osac-project/enhancement-proposals/pull/1168' }
    }));

    const link = document.body.querySelector('a[title="View PRD pull request on GitHub"]');
    expect(link.className).toContain('bg-purple-50');
    expect(link.className).toContain('border-purple-200');
    expect(link.textContent.trim()).toBe('PRD PR');
    expect(link.querySelector('svg')).not.toBeNull();
    wrapper.unmount();
  });

  it('shows the top action when Pipeline Progress resolves a PR from an EP-sourced RFE, even with no linkedFeature.prdPrUrl', () => {
    const wrapper = mountModal(makeRFE({
      status: 'Open',
      aiInvolvement: 'revised',
      sourceRfe: 'EP-177',
      linkedFeature: null
    }));

    const link = document.body.querySelector('a[title="View PRD pull request on GitHub"]');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('https://github.com/osac-project/enhancement-proposals/pull/177');
    wrapper.unmount();
  });

  it('resolves the top action and Pipeline Progress to the same PR URL, so they cannot disagree', () => {
    const wrapper = mountModal(makeRFE({
      status: 'Open',
      aiInvolvement: 'revised',
      sourceRfe: 'EP-177',
      linkedFeature: null
    }));

    const links = [...document.body.querySelectorAll('a[title="View PRD pull request on GitHub"]')];
    // One in the top actions area, one inline in Pipeline Progress's PRD Review row.
    expect(links.length).toBe(2);
    const hrefs = new Set(links.map(l => l.getAttribute('href')));
    expect(hrefs.size).toBe(1);
    expect([...hrefs][0]).toBe('https://github.com/osac-project/enhancement-proposals/pull/177');
    wrapper.unmount();
  });

  it('hides the top action when sourceRfe is a Jira key (not EP-sourced) and no linkedFeature.prdPrUrl exists', () => {
    const wrapper = mountModal(makeRFE({
      status: 'Open',
      sourceRfe: 'RHAIRFE-500',
      linkedFeature: null
    }));

    expect(document.body.querySelector('a[title="View PRD pull request on GitHub"]')).toBeNull();
    wrapper.unmount();
  });
});

describe('RFEDetailModal late linked-feature enrichment', () => {
  it('loads the test plan once linkedFeature enrichment resolves after the modal is already open', async () => {
    apiRequest.mockClear();
    apiRequest.mockResolvedValueOnce({
      latest: { verdict: 'PASS', score: 8, humanReviewStatus: 'approved', labels: [] }
    });

    const rfe = makeRFE({ linkedFeature: null });
    const wrapper = mountModal(rfe);
    await flushAsyncWatchers();

    expect(apiRequest).not.toHaveBeenCalledWith(expect.stringContaining('/test-plans/'));

    await wrapper.setProps({ rfe: { ...rfe, linkedFeature: { key: 'RHAISTRAT-1' } } });
    await flushAsyncWatchers();

    expect(apiRequest).toHaveBeenCalledWith('/modules/ai-impact/test-plans/RHAISTRAT-1');
    expect(wrapper.findComponent(PipelineTimeline).props('testPlan')).toEqual(
      { verdict: 'PASS', score: 8, humanReviewStatus: 'approved', labels: [] }
    );
    wrapper.unmount();
  });

  it('does not reload assessment details when only the linked-feature key changes', async () => {
    const loadAssessmentDetail = vi.fn().mockResolvedValue({ latest: { verdict: 'PASS' } });
    const rfe = makeRFE({ linkedFeature: null });
    const assessment = { passFail: 'PASS', total: 9, scores: { what: 2, why: 2, how: 2, task: 2, size: 1 } };
    const wrapper = mount(RFEDetailModal, {
      props: { show: true, rfe, phases: PHASES, assessment, loadAssessmentDetail },
      attachTo: document.body
    });
    await flushAsyncWatchers();

    expect(loadAssessmentDetail).toHaveBeenCalledTimes(1);

    await wrapper.setProps({ rfe: { ...rfe, linkedFeature: { key: 'RHAISTRAT-1' } } });
    await flushAsyncWatchers();

    expect(loadAssessmentDetail).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});

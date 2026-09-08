import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all dependencies before imports
const mockApiRequest = vi.fn();
vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: (...args) => mockApiRequest(...args)
}));

vi.mock('vue-chartjs', () => ({
  Bar: { template: '<div />' },
  Line: { template: '<div />' }
}));
vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  CategoryScale: {},
  LinearScale: {},
  BarElement: {},
  PointElement: {},
  LineElement: {},
  Title: {},
  Tooltip: {},
  Legend: {}
}));

// Track cross-module navigation calls
const mockCrossNavigate = vi.fn();
vi.mock('@shared/client/composables/useModuleLink.js', () => ({
  useModuleLink: () => ({
    navigateTo: mockCrossNavigate,
    linkTo: vi.fn()
  })
}));

// Mock LoadingOverlay
vi.mock('@shared/client/components/LoadingOverlay.vue', () => ({
  default: { template: '<div><slot /></div>', props: ['message'] }
}));

import { mount } from '@vue/test-utils';
import { ref, nextTick, defineComponent } from 'vue';
import RFEReviewView from '../../client/views/RFEReviewView.vue';

// Mock composables
vi.mock('../../client/composables/useAIImpact.js', () => ({
  useAIImpact: () => ({
    rfeData: ref({ issues: [
      { key: 'RHAIRFE-1', summary: 'RFE with feature', created: '2026-01-01', aiInvolvement: 'created', creatorDisplayName: 'Alice', priority: 'Major', status: 'New' },
      { key: 'RHAIRFE-2', summary: 'RFE without feature', created: '2026-01-01', aiInvolvement: 'none', creatorDisplayName: 'Bob', priority: 'Minor', status: 'New' },
      { key: 'OSAC-63', summary: 'Feature without a verified PRD', created: '2026-06-01T00:00:00.000Z', aiInvolvement: 'none', creatorDisplayName: 'Dev One', priority: 'Major', status: 'No PR' }
    ], jiraHost: 'https://jira.example.com', fetchedAt: '2026-01-01' }),
    loading: ref(false),
    error: ref(null),
    load: vi.fn(),
    timeWindow: ref('month')
  })
}));

vi.mock('../../client/composables/useAssessments.js', () => ({
  useAssessments: () => ({
    assessments: ref({
      'RHAIRFE-1': { total: 8 },
      'RHAIRFE-2': { total: 4 },
      'OSAC-63': { total: 2 }
    }),
    loadAssessments: vi.fn(),
    loadAssessmentDetail: vi.fn()
  })
}));

vi.mock('../../client/composables/useFeatures.js', () => ({
  useFeatures: () => ({
    features: ref({
      'RHAISTRAT-10': {
        key: 'RHAISTRAT-10', title: 'Linked Feature', sourceRfe: 'RHAIRFE-1', status: 'In Progress',
        prdPrUrl: 'https://github.com/osac-project/enhancement-proposals/pull/10'
      }
    }),
    loadFeatures: vi.fn()
  })
}));

const PhaseContentStub = defineComponent({
  name: 'PhaseContent',
  template: '<div class="phase-content"><slot /></div>',
  props: ['phase', 'loading', 'error', 'rfeData', 'metrics', 'trendData', 'breakdown', 'filteredRFEs', 'windowedRFEs', 'timeWindow', 'filter', 'searchQuery', 'chartExpanded', 'assessments', 'filteredAssessments', 'sortBy', 'passFailFilter', 'priorityFilter', 'statusFilter', 'reviewStatusFilter', 'componentFilter', 'selectedRFE', 'rfeToFeature'],
  emits: ['selectRFE', 'retry', 'update:timeWindow', 'update:filter', 'update:searchQuery', 'update:chartExpanded', 'update:sortBy', 'update:passFailFilter', 'update:priorityFilter', 'update:statusFilter', 'update:reviewStatusFilter', 'update:componentFilter']
});

describe('RFEReviewView navigation', () => {
  const moduleNav = {
    navigateTo: vi.fn(),
    params: ref({})
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function mountView() {
    return mount(RFEReviewView, {
      global: {
        provide: { moduleNav },
        stubs: {
          PhaseContent: PhaseContentStub,
          RFEDetailModal: { template: '<div class="rfe-modal" :data-prd-pr-url="rfe?.linkedFeature?.prdPrUrl" />', props: ['show', 'rfe', 'phases', 'jiraHost', 'assessment', 'loadAssessmentDetail'] },
          AIImpactGuide: { template: '<div />' }
        }
      }
    });
  }

  it('opens modal when RFE has linked feature', async () => {
    const wrapper = mountView();
    const phaseContent = wrapper.findComponent(PhaseContentStub);

    phaseContent.vm.$emit('selectRFE', { key: 'RHAIRFE-1', summary: 'RFE with feature' });
    await nextTick();

    expect(mockCrossNavigate).not.toHaveBeenCalled();
    expect(moduleNav.navigateTo).toHaveBeenCalledWith('prd-review', { select: 'RHAIRFE-1' });
  });

  it('opens modal when RFE has no linked feature', async () => {
    const wrapper = mountView();
    const phaseContent = wrapper.findComponent(PhaseContentStub);

    phaseContent.vm.$emit('selectRFE', { key: 'RHAIRFE-2', summary: 'RFE without feature' });
    await nextTick();

    expect(mockCrossNavigate).not.toHaveBeenCalled();
    expect(moduleNav.navigateTo).toHaveBeenCalledWith('prd-review', { select: 'RHAIRFE-2' });
  });

  it('passes rfeToFeature prop to PhaseContent', () => {
    const wrapper = mountView();
    const phaseContent = wrapper.findComponent(PhaseContentStub);

    expect(phaseContent.props('rfeToFeature')).toEqual({
      'RHAIRFE-1': { key: 'RHAISTRAT-10', summary: 'Linked Feature', status: 'In Progress', fixVersions: [], prdPrUrl: 'https://github.com/osac-project/enhancement-proposals/pull/10' }
    });
  });

  it('enriches an existing Jira linkedFeature with the canonical PRD PR URL', async () => {
    const wrapper = mountView();
    const phaseContent = wrapper.findComponent(PhaseContentStub);

    phaseContent.vm.$emit('selectRFE', {
      key: 'RHAIRFE-1',
      summary: 'RFE with feature',
      linkedFeature: { key: 'RHAISTRAT-10', status: 'In Progress', fixVersions: [] }
    });
    await nextTick();

    expect(wrapper.find('.rfe-modal').attributes('data-prd-pr-url'))
      .toBe('https://github.com/osac-project/enhancement-proposals/pull/10');
  });

  it('includes No PR rows only under the "All AI" filter, not under "No AI"', async () => {
    const wrapper = mountView();
    const phaseContent = wrapper.findComponent(PhaseContentStub);

    expect(phaseContent.props('filteredRFEs').map(r => r.key)).toEqual(
      expect.arrayContaining(['RHAIRFE-1', 'RHAIRFE-2', 'OSAC-63'])
    );

    phaseContent.vm.$emit('update:filter', 'none');
    await nextTick();

    const filteredKeys = wrapper.findComponent(PhaseContentStub).props('filteredRFEs').map(r => r.key);
    expect(filteredKeys).toContain('RHAIRFE-2');
    expect(filteredKeys).not.toContain('OSAC-63');
  });

  it('updates componentFilter prop on PhaseContent when it emits update:componentFilter', async () => {
    const wrapper = mountView();
    const phaseContent = wrapper.findComponent(PhaseContentStub);

    expect(phaseContent.props('componentFilter')).toBe('all');

    phaseContent.vm.$emit('update:componentFilter', 'Storage');
    await nextTick();

    expect(wrapper.findComponent(PhaseContentStub).props('componentFilter')).toBe('Storage');
  });

  it('updates reviewStatusFilter prop on PhaseContent when it emits update:reviewStatusFilter', async () => {
    const wrapper = mountView();
    const phaseContent = wrapper.findComponent(PhaseContentStub);

    expect(phaseContent.props('reviewStatusFilter')).toBe('all');

    phaseContent.vm.$emit('update:reviewStatusFilter', 'approved');
    await nextTick();

    expect(wrapper.findComponent(PhaseContentStub).props('reviewStatusFilter')).toBe('approved');
  });

  it('scopes windowedRFEs to the selected time window, unlike the all-time filteredRFEs', async () => {
    // Pin the clock: fixture dates are fixed, so the window boundaries must be too,
    // or this assertion silently rots as real time drifts past the fixture dates.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T00:00:00.000Z'));

    const wrapper = mountView();
    let phaseContent = wrapper.findComponent(PhaseContentStub);

    // All fixture RFEs are from early 2026, well outside the default "month" window
    expect(phaseContent.props('windowedRFEs')).toEqual([]);
    expect(phaseContent.props('filteredRFEs').length).toBeGreaterThan(0);

    phaseContent.vm.$emit('update:timeWindow', '3months');
    await nextTick();

    phaseContent = wrapper.findComponent(PhaseContentStub);
    const windowedKeys = phaseContent.props('windowedRFEs').map(r => r.key);
    expect(windowedKeys).toContain('OSAC-63');
    expect(windowedKeys).not.toContain('RHAIRFE-1');
    expect(windowedKeys).not.toContain('RHAIRFE-2');
  });

  it('keeps windowedRFEs independent of the AI-involvement filter, unlike filteredRFEs', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T00:00:00.000Z'));

    const wrapper = mountView();
    let phaseContent = wrapper.findComponent(PhaseContentStub);

    phaseContent.vm.$emit('update:timeWindow', '3months');
    await nextTick();
    phaseContent = wrapper.findComponent(PhaseContentStub);
    const windowedKeysBefore = phaseContent.props('windowedRFEs').map(r => r.key);

    // "No AI" excludes OSAC-63 (aiInvolvement: 'none' but status 'No PR') from filteredRFEs...
    phaseContent.vm.$emit('update:filter', 'none');
    await nextTick();
    phaseContent = wrapper.findComponent(PhaseContentStub);

    // ...but windowedRFEs must stay unaffected, since it only tracks the time window
    expect(phaseContent.props('windowedRFEs').map(r => r.key)).toEqual(windowedKeysBefore);
  });

  it('scopes filteredAssessments (Score Distribution / Criteria Performance) to the period, unaffected by search or the AI-involvement filter', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T00:00:00.000Z'));

    const wrapper = mountView();
    let phaseContent = wrapper.findComponent(PhaseContentStub);

    phaseContent.vm.$emit('update:timeWindow', '3months');
    await nextTick();
    phaseContent = wrapper.findComponent(PhaseContentStub);

    // Only OSAC-63 (created 2026-06-01) falls inside the 90-day window from 2026-08-25.
    expect(Object.keys(phaseContent.props('filteredAssessments'))).toEqual(['OSAC-63']);

    // Neither the AI-involvement quick filter nor the search box should narrow it further.
    phaseContent.vm.$emit('update:filter', 'none');
    phaseContent.vm.$emit('update:searchQuery', 'RFE with feature');
    await nextTick();
    phaseContent = wrapper.findComponent(PhaseContentStub);

    expect(Object.keys(phaseContent.props('filteredAssessments'))).toEqual(['OSAC-63']);
  });

  it('leaves the all-time PRD list (filteredRFEs) unaffected when the Period selector changes', async () => {
    const wrapper = mountView();
    let phaseContent = wrapper.findComponent(PhaseContentStub);
    const beforeKeys = phaseContent.props('filteredRFEs').map(r => r.key).sort();

    phaseContent.vm.$emit('update:timeWindow', 'week');
    await nextTick();
    phaseContent = wrapper.findComponent(PhaseContentStub);

    expect(phaseContent.props('filteredRFEs').map(r => r.key).sort()).toEqual(beforeKeys);
  });
});

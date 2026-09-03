import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chart.js to avoid canvas errors in tests
vi.mock('vue-chartjs', () => ({
  Bar: { template: '<div class="mock-bar-chart" />' },
  Line: { template: '<div class="mock-line-chart" />' }
}));
vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  CategoryScale: {},
  LinearScale: {},
  PointElement: {},
  LineElement: {},
  BarElement: {},
  Filler: {},
  Title: {},
  Tooltip: {},
  Legend: {}
}));

// Mock LoadingOverlay
vi.mock('@shared/client/components/LoadingOverlay.vue', () => ({
  default: { template: '<div><slot /></div>', props: ['message'] }
}));

vi.mock('@shared/client/composables/useModuleLink.js', () => ({
  useModuleLink: () => ({
    navigateTo: vi.fn(),
    linkTo: vi.fn()
  })
}));

import { mount } from '@vue/test-utils';
import { ref, nextTick } from 'vue';
import FeatureReviewView from '../../client/views/FeatureReviewView.vue';

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
    created: new Date().toISOString(),
    ...overrides
  };
}

const features = ref({
  'RHAISTRAT-1': makeFeature({ key: 'RHAISTRAT-1', title: 'Core feature', components: ['Core'] }),
  'RHAISTRAT-2': makeFeature({ key: 'RHAISTRAT-2', title: 'UI feature', components: ['UI'] })
});
const featureTimeWindow = ref('month');

vi.mock('../../client/composables/useFeatures.js', () => ({
  useFeatures: () => ({
    features,
    featureMeta: ref({}),
    featureLoading: ref(false),
    featureError: ref(null),
    loadFeatures: vi.fn(),
    loadFeatureDetail: vi.fn(),
    featureTrendData: ref([]),
    featureBreakdown: ref([]),
    featureTimeWindow,
    loadFeatureTrend: vi.fn()
  })
}));

vi.mock('../../client/composables/useAIImpact.js', () => ({
  useAIImpact: () => ({
    rfeData: ref({ jiraHost: 'https://jira.example.com' }),
    loading: ref(false),
    error: ref(null),
    load: vi.fn()
  })
}));

describe('FeatureReviewView', () => {
  const moduleNav = {
    navigateTo: vi.fn(),
    params: ref({})
  };

  beforeEach(() => {
    vi.clearAllMocks();
    moduleNav.params.value = {};
    featureTimeWindow.value = 'month';
    features.value = {
      'RHAISTRAT-1': makeFeature({ key: 'RHAISTRAT-1', title: 'Core feature', components: ['Core'] }),
      'RHAISTRAT-2': makeFeature({ key: 'RHAISTRAT-2', title: 'UI feature', components: ['UI'] })
    };
  });

  function mountView() {
    return mount(FeatureReviewView, {
      global: {
        provide: { moduleNav },
        stubs: {
          FeatureDetailPanel: { template: '<div class="feature-detail-panel" />', props: ['show', 'feature', 'phases', 'jiraHost', 'loadFeatureDetail'] },
          AIImpactGuide: { template: '<div />' }
        }
      }
    });
  }

  it('resets componentFilter to all when a feature arrives via cross-module navigation', async () => {
    const wrapper = mountView();

    const selects = wrapper.findAll('select');
    const componentSelect = selects.find(s => { const opt = s.find('option[value="all"]'); return opt.exists() && opt.text() === 'All Components' });
    await componentSelect.setValue('Core');
    expect(componentSelect.element.value).toBe('Core');

    moduleNav.params.value = { select: 'RHAISTRAT-2' };
    await nextTick();

    const resetSelects = wrapper.findAll('select');
    const resetComponentSelect = resetSelects.find(s => { const opt = s.find('option[value="all"]'); return opt.exists() && opt.text() === 'All Components' });
    expect(resetComponentSelect.element.value).toBe('all');
  });

  it('filters the rendered feature list when a component is selected', async () => {
    const wrapper = mountView();

    expect(wrapper.text()).toContain('Core feature');
    expect(wrapper.text()).toContain('UI feature');

    const selects = wrapper.findAll('select');
    const componentSelect = selects.find(s => { const opt = s.find('option[value="all"]'); return opt.exists() && opt.text() === 'All Components' });
    await componentSelect.setValue('Core');

    expect(wrapper.text()).toContain('Core feature');
    expect(wrapper.text()).not.toContain('UI feature');
  });

  it('scopes the summary KPI row to featureTimeWindow without filtering the feature list', async () => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    features.value = {
      'RHAISTRAT-1': makeFeature({ key: 'RHAISTRAT-1', title: 'Recent feature', created: new Date(now - 2 * dayMs).toISOString() }),
      'RHAISTRAT-2': makeFeature({ key: 'RHAISTRAT-2', title: 'Old feature', created: new Date(now - 200 * dayMs).toISOString() })
    };
    featureTimeWindow.value = 'week';

    const wrapper = mountView();
    await nextTick();

    const totalTile = wrapper.findAll('.space-y-1').find(d => d.find('p').text() === 'Total Features');
    expect(totalTile.find('span').text()).toBe('1');
    expect(wrapper.text()).toContain('2 all time');

    // The feature list/table itself remains unfiltered by the time window.
    expect(wrapper.text()).toContain('Recent feature');
    expect(wrapper.text()).toContain('Old feature');
  });

  it('re-scopes the summary KPI row when featureTimeWindow changes via the selector', async () => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    features.value = {
      'RHAISTRAT-1': makeFeature({ key: 'RHAISTRAT-1', title: 'Recent feature', created: new Date(now - 2 * dayMs).toISOString() }),
      // 60 days ago: outside week/month windows, inside the 3-month (90-day) window.
      'RHAISTRAT-2': makeFeature({ key: 'RHAISTRAT-2', title: 'Old feature', created: new Date(now - 60 * dayMs).toISOString() })
    };
    featureTimeWindow.value = 'week';

    const wrapper = mountView();
    await nextTick();

    const timeWindowSelect = wrapper.find('#design-time-window');
    await timeWindowSelect.setValue('3months');
    // The view's @update:timeWindow handler writes back into the shared featureTimeWindow ref.
    await nextTick();

    const totalTile = wrapper.findAll('.space-y-1').find(d => d.find('p').text() === 'Total Features');
    expect(totalTile.find('span').text()).toBe('2');
  });
});

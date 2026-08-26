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
    ...overrides
  };
}

const features = ref({
  'RHAISTRAT-1': makeFeature({ key: 'RHAISTRAT-1', title: 'Core feature', components: ['Core'] }),
  'RHAISTRAT-2': makeFeature({ key: 'RHAISTRAT-2', title: 'UI feature', components: ['UI'] })
});

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
    featureTimeWindow: ref('month'),
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
});

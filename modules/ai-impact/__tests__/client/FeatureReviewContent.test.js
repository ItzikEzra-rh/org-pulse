import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import FeatureReviewContent from '../../client/components/FeatureReviewContent.vue';

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
  default: { template: '<div class="loading-overlay"><slot /></div>', props: ['message'] }
}));

describe('FeatureReviewContent', () => {
  it('shows loading state', () => {
    const wrapper = mount(FeatureReviewContent, {
      props: { loading: true }
    });
    expect(wrapper.find('.loading-overlay').exists()).toBe(true);
  });

  it('shows error state with retry button', async () => {
    const wrapper = mount(FeatureReviewContent, {
      props: { error: 'Connection failed' }
    });
    expect(wrapper.text()).toContain('Failed to load design review data');
    expect(wrapper.text()).toContain('Connection failed');

    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('retry')).toBeTruthy();
  });

  it('shows empty state when no features', () => {
    const wrapper = mount(FeatureReviewContent, {
      props: { features: {} }
    });
    expect(wrapper.text()).toContain('No Design Reviews Yet');
  });

  it('renders metrics and list when features exist', () => {
    const features = {
      'RHAISTRAT-1': {
        key: 'RHAISTRAT-1',
        title: 'Test Feature',
        sourceRfe: 'RHAIRFE-1',
        priority: 'Major',
        status: 'New',
        size: 'M',
        recommendation: 'approve',
        needsAttention: false,
        humanReviewStatus: 'approved',
        scores: { feasibility: 2, testability: 2, scope: 2, architecture: 2, total: 8 },
        reviewers: { feasibility: 'approve', testability: 'approve', scope: 'approve', architecture: 'approve' },
        reviewedAt: '2026-04-19T12:00:00Z'
      }
    };
    const wrapper = mount(FeatureReviewContent, {
      props: { features, windowedFeatures: features }
    });
    // Should render metrics row with total count
    expect(wrapper.text()).toContain('1');
    expect(wrapper.text()).toContain('100%'); // approval rate
  });

  it('scopes the summary KPI row to windowedFeatures, not the full features store', () => {
    const inWindow = {
      key: 'RHAISTRAT-1',
      title: 'In window',
      recommendation: 'approve',
      humanReviewStatus: 'approved',
      scores: { total: 8 },
      designStatus: 'reviewed'
    };
    const outOfWindow = {
      key: 'RHAISTRAT-2',
      title: 'Out of window',
      recommendation: 'revise',
      humanReviewStatus: 'needs-review',
      scores: { total: 2 },
      designStatus: 'reviewed'
    };
    const features = { 'RHAISTRAT-1': inWindow, 'RHAISTRAT-2': outOfWindow };
    const windowedFeatures = { 'RHAISTRAT-1': inWindow };

    const wrapper = mount(FeatureReviewContent, {
      props: { features, windowedFeatures }
    });

    // Summary tiles reflect only the windowed subset (1 feature, 100% approval)...
    expect(wrapper.text()).toContain('100%');
    // ...while the all-time subtext and the feature list below still reflect the full store.
    expect(wrapper.text()).toContain('2 all time');
    expect(wrapper.text()).toContain('In window');
    expect(wrapper.text()).toContain('Out of window');
  });
});

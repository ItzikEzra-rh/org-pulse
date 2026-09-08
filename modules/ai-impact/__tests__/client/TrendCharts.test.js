import { describe, it, expect } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import { Bar } from 'vue-chartjs';
import TrendCharts from '../../client/components/TrendCharts.vue';

function mountTrend(props) {
  return shallowMount(TrendCharts, { props: { expanded: true, ...props } });
}

// Three Bar charts render in this component; identify the Created-with-AI one by its dataset label.
function createdPctBar(wrapper) {
  return wrapper.findAllComponents(Bar).find(c => c.props('data').datasets[0]?.label === 'Created with AI');
}

function tooltipLabel(wrapper, dataIndex = 0, datasetIndex = 0) {
  const options = createdPctBar(wrapper).props('options');
  return options.plugins.tooltip.callbacks.label({ dataIndex, datasetIndex });
}

describe('TrendCharts Created-with-AI tooltip', () => {
  it('formats the emerald (Created) segment tooltip with the real numerator, denominator, and percentage', () => {
    const trendData = [{ date: '2026-08-01', createdPct: 70, createdWithAI: 7, total: 10, revisedCount: 0 }];
    const wrapper = mountTrend({ trendData, timeWindow: 'week' });

    expect(tooltipLabel(wrapper, 0, 0)).toBe('Created with AI: 7 of 10 PRDs · 70%');
  });

  it('formats the gray (Not created) segment tooltip as the complementary count and percentage', () => {
    const trendData = [{ date: '2026-08-01', createdPct: 70, createdWithAI: 7, total: 10, revisedCount: 0 }];
    const wrapper = mountTrend({ trendData, timeWindow: 'week' });

    expect(tooltipLabel(wrapper, 0, 1)).toBe('Not created with AI: 3 of 10 PRDs · 30%');
  });

  it('formats both segment tooltips for Designs via countLabel', () => {
    const trendData = [{ date: '2026-08-01', createdPct: 50, createdWithAI: 1, total: 2, revisedCount: 0 }];
    const wrapper = mountTrend({ trendData, timeWindow: 'week', countLabel: 'Designs' });

    expect(tooltipLabel(wrapper, 0, 0)).toBe('Created with AI: 1 of 2 Designs · 50%');
    expect(tooltipLabel(wrapper, 0, 1)).toBe('Not created with AI: 1 of 2 Designs · 50%');
  });

  it('does not suppress or round away a low-N point', () => {
    const trendData = [{ date: '2026-08-01', createdPct: 100, createdWithAI: 1, total: 1, revisedCount: 0 }];
    const wrapper = mountTrend({ trendData, timeWindow: 'week' });

    expect(tooltipLabel(wrapper, 0, 0)).toBe('Created with AI: 1 of 1 PRDs · 100%');
  });

  it('names the item type for a bucket with zero eligible population instead of a misleading 0%', () => {
    const trendData = [{ date: '2026-08-01', createdPct: null, createdWithAI: null, total: 0, revisedCount: 0 }];
    const wrapper = mountTrend({ trendData, timeWindow: 'week' });

    expect(tooltipLabel(wrapper)).toBe('No PRDs in this period');
  });

  it('names Designs via countLabel for a bucket with zero eligible population', () => {
    const trendData = [{ date: '2026-08-01', createdPct: null, createdWithAI: null, total: 0, revisedCount: 0 }];
    const wrapper = mountTrend({ trendData, timeWindow: 'week', countLabel: 'Designs' });

    expect(tooltipLabel(wrapper)).toBe('No Designs in this period');
  });
});

describe('TrendCharts Created-with-AI chart type', () => {
  it('renders Created with AI as a Bar chart', () => {
    const wrapper = mountTrend({ trendData: [] });

    expect(createdPctBar(wrapper)).toBeTruthy();
  });

  it('uses the emerald green Created-with-AI color', () => {
    const wrapper = mountTrend({ trendData: [] });
    const dataset = createdPctBar(wrapper).props('data').datasets[0];

    expect(dataset.backgroundColor).toBe('rgba(16, 185, 129, 0.6)');
    expect(dataset.borderColor).toBe('rgba(16, 185, 129, 0.8)');
  });

  it('carries no line-chart gap-handling artifacts on the dataset', () => {
    const trendData = [
      { date: '2026-08-01', createdPct: 50, createdWithAI: 1, total: 2, revisedCount: 0 },
      { date: '2026-08-08', createdPct: null, createdWithAI: null, total: 0, revisedCount: 0 }
    ];
    const wrapper = mountTrend({ trendData, timeWindow: 'month' });
    const dataset = createdPctBar(wrapper).props('data').datasets[0];

    expect(dataset.spanGaps).toBeUndefined();
    expect(dataset.segment).toBeUndefined();
    expect(dataset.fill).toBeUndefined();
    expect(dataset.tension).toBeUndefined();
    expect(dataset.minBarLength).toBeUndefined();
  });

  it('passes no chart-scoped plugins (no N/A marker machinery)', () => {
    const wrapper = mountTrend({ trendData: [] });

    expect(createdPctBar(wrapper).props('plugins')).toEqual([]);
  });

  it('stacks both axes so counts sum instead of grouping side by side', () => {
    const wrapper = mountTrend({ trendData: [] });
    const options = createdPctBar(wrapper).props('options');

    expect(options.scales.x.stacked).toBe(true);
    expect(options.scales.y.stacked).toBe(true);
  });
});

describe('TrendCharts Created-with-AI legend', () => {
  it('shows a compact legend labeling both stacked segments', () => {
    const wrapper = mountTrend({ trendData: [] });

    expect(wrapper.text()).toContain('Created with AI');
    expect(wrapper.text()).toContain('Not created with AI');
  });

  it('colors the legend markers to match the emerald and gray dataset colors', () => {
    const wrapper = mountTrend({ trendData: [] });
    const swatches = wrapper.findAll('.rounded-sm');

    expect(swatches[0].attributes('style')).toContain('background-color:#10b981');
    expect(swatches[1].attributes('style')).toContain('background-color:#9ca3af');
  });
});

describe('TrendCharts Created-with-AI stacked raw-count composition', () => {
  function segments(wrapper) {
    const [created, notCreated] = createdPctBar(wrapper).props('data').datasets;
    return { created: created.data, notCreated: notCreated.data };
  }

  it('1 of 1 renders full height as Created, nothing in Not-created', () => {
    const trendData = [{ date: '2026-08-01', createdPct: 100, createdWithAI: 1, total: 1, revisedCount: 0 }];
    const wrapper = mountTrend({ trendData, timeWindow: 'week' });

    expect(segments(wrapper)).toEqual({ created: [1], notCreated: [0] });
  });

  it('2 of 3 splits the total into matching Created and Not-created counts', () => {
    const trendData = [{ date: '2026-08-01', createdPct: 67, createdWithAI: 2, total: 3, revisedCount: 0 }];
    const wrapper = mountTrend({ trendData, timeWindow: 'week', countLabel: 'Designs' });

    expect(segments(wrapper)).toEqual({ created: [2], notCreated: [1] });
    expect(tooltipLabel(wrapper, 0, 0)).toBe('Created with AI: 2 of 3 Designs · 67%');
    expect(tooltipLabel(wrapper, 0, 1)).toBe('Not created with AI: 1 of 3 Designs · 33%');
  });

  it('0 of 1 renders the full height as Not-created, with the gray segment tooltip describing it', () => {
    const trendData = [{ date: '2026-08-01', createdPct: 0, createdWithAI: 0, total: 1, revisedCount: 0 }];
    const wrapper = mountTrend({ trendData, timeWindow: 'week', countLabel: 'Designs' });

    expect(segments(wrapper)).toEqual({ created: [0], notCreated: [1] });
    expect(tooltipLabel(wrapper, 0, 1)).toBe('Not created with AI: 1 of 1 Designs · 100%');
  });

  it('zero eligible artifacts renders no bar in either segment', () => {
    const trendData = [{ date: '2026-08-01', createdPct: null, createdWithAI: null, total: 0, revisedCount: 0 }];
    const wrapper = mountTrend({ trendData, timeWindow: 'week' });

    expect(segments(wrapper)).toEqual({ created: [null], notCreated: [null] });
    expect(tooltipLabel(wrapper, 0)).toBe('No PRDs in this period');
  });
});

describe('TrendCharts x-axis label density', () => {
  it('caps rendered ticks without dropping any underlying daily bucket', () => {
    const trendData = Array.from({ length: 30 }, (_, i) => ({ date: `day-${i}`, createdPct: 0, createdWithAI: 0, total: 1, revisedCount: 0 }));
    const wrapper = mountTrend({ trendData, timeWindow: 'month' });
    const options = createdPctBar(wrapper).props('options');

    expect(options.scales.x.ticks.maxTicksLimit).toBeLessThan(30);
    expect(createdPctBar(wrapper).props('data').labels).toHaveLength(30);
  });
});

describe('TrendCharts period-aligned subtitle', () => {
  it('describes the week window with daily buckets, not "per week"', () => {
    const wrapper = mountTrend({ timeWindow: 'week' });

    expect(wrapper.text()).toContain('Daily trend · last 7 days');
    expect(wrapper.text()).not.toContain('per week');
  });

  it('describes the month window as daily buckets over 30 days', () => {
    const wrapper = mountTrend({ timeWindow: 'month' });

    expect(wrapper.text()).toContain('Daily trend · last 30 days');
  });

  it('describes the 3-month window as weekly buckets over 90 days', () => {
    const wrapper = mountTrend({ timeWindow: '3months' });

    expect(wrapper.text()).toContain('Weekly trend · last 90 days');
  });
});

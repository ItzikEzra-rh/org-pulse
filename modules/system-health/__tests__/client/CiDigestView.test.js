import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: vi.fn()
}))

vi.mock('vue-chartjs', () => ({
  Doughnut: { name: 'Doughnut', props: ['data', 'options'], template: '<canvas data-testid="doughnut"></canvas>' },
  Bar: { name: 'Bar', props: ['data', 'options'], template: '<canvas data-testid="bar"></canvas>' }
}))

vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  ArcElement: 'ArcElement',
  CategoryScale: 'CategoryScale',
  LinearScale: 'LinearScale',
  BarElement: 'BarElement',
  Tooltip: 'Tooltip',
  Legend: 'Legend'
}))

import { apiRequest } from '@shared/client/services/api.js'
import CiDigestView from '../../client/views/CiDigestView.vue'
import RepoWindowBarChart from '../../client/components/ci-digest/RepoWindowBarChart.vue'

function makeDigest(overrides = {}) {
  return {
    now: '2026-09-10 15:23 UTC',
    periodic_24h: { success: 42, failure: 2, success_rate: 0.9545 },
    periodic_72h: { success: 103, failure: 22, success_rate: 0.824 },
    infra_24h: { infra_total: 0, test_total: 7, total_failures: 7, infra_by_step: [] },
    infra_72h: { infra_total: 44, test_total: 49, total_failures: 93, infra_by_step: [{ step: 'Teardown', count: 10 }] },
    periodic_infra_24h: { infra_total: 0, test_total: 0, total_failures: 0, infra_by_step: [] },
    periodic_infra_72h: { infra_total: 0, test_total: 22, total_failures: 22, infra_by_step: [] },
    merge_time: {
      median_approval_to_merge_display: '4h 34m 42s', avg_approval_to_merge_display: '29h 56m 14s',
      approved_count: 40, count: 121,
      median_queue_wait_display: '1h 11m 49s', avg_queue_wait_display: '1h 7m 24s',
      via_merge_queue_count: 59, avg_retest_count: 10.5,
      by_repo: [
        { repo: 'osac', median_approval_to_merge_seconds: 18310, median_approval_to_merge_display: '5h 5m 10s', approved_count: 36, count: 71, median_queue_wait_seconds: 4309, median_queue_wait_display: '1h 11m 49s', via_merge_queue_count: 54 }
      ]
    },
    merge_time_24h: {
      median_approval_to_merge_display: '13h 38m 12s', avg_approval_to_merge_display: '47h 21m 55s',
      approved_count: 10, count: 22,
      median_queue_wait_display: '1h 18m 39s', avg_queue_wait_display: '1h 9m 25s',
      via_merge_queue_count: 16, avg_retest_count: 13.1,
      by_repo: []
    },
    flake_rate: 0.0783,
    mttr: { mttr_display: '1h 28m 12s', num_recoveries: 159 },
    top_failing: { workflow: 'E2E CaaS Full Install', failure: 12 },
    jobs_per_pr: {
      distinct_prs: 234, total_jobs: 2718, avg_jobs_per_pr: 11.62, median_jobs_per_pr: 6.0,
      histogram: [{ bucket: '1', prs: 4, success: 4, cancelled: 0, failure: 0 }],
      top_prs: [{ repo: 'osac', pr: '#734', jobs: 321 }],
      outcomes: [{ outcome: 'Success', count: 2114 }, { outcome: 'Cancelled', count: 373 }, { outcome: 'Failure', count: 219 }]
    },
    ...overrides
  }
}

function makeEnvelope(digestOverrides = {}, sourceOverrides = {}) {
  return {
    source: {
      repo: 'osac-project/osac-test-infra',
      workflow: 'ci-daily-digest.yml',
      runId: 34495310704,
      runUrl: 'https://github.com/osac-project/osac-test-infra/actions/runs/34495310704',
      runConclusion: 'success',
      artifactId: 10159505017,
      artifactCreatedAt: '2026-09-10T15:23:35Z',
      ...sourceOverrides
    },
    fetchedAt: '2026-09-10T15:24:02Z',
    digest: makeDigest(digestOverrides)
  }
}

describe('CiDigestView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a loading state initially', () => {
    apiRequest.mockReturnValue(new Promise(() => {}))
    const wrapper = mount(CiDigestView)
    expect(wrapper.text()).toContain('Loading CI digest')
  })

  it('renders a distinct empty state on 404 (no report delivered yet)', async () => {
    const err = new Error('No CI digest report available yet')
    err.status = 404
    apiRequest.mockRejectedValue(err)
    const wrapper = mount(CiDigestView)
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('No CI digest report available')
    expect(wrapper.text()).not.toContain('Failed to load CI digest')
  })

  it('renders an error state (not the empty state) on a non-404 failure', async () => {
    const err = new Error('network down')
    apiRequest.mockRejectedValue(err)
    const wrapper = mount(CiDigestView)
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('Failed to load CI digest')
    expect(wrapper.text()).toContain('network down')
    expect(wrapper.text()).not.toContain('No CI digest report available')
  })

  it('renders headline tiles and section content from a full envelope', async () => {
    apiRequest.mockResolvedValue(makeEnvelope())
    const wrapper = mount(CiDigestView)
    await flushPromises()
    await flushPromises()

    expect(apiRequest).toHaveBeenCalledWith('/modules/system-health/ci-digest')
    expect(wrapper.text()).toContain('95.5%')
    expect(wrapper.text()).toContain('82.4%')
    expect(wrapper.text()).toContain('7.8%')
    expect(wrapper.text()).toContain('1h 28m 12s')
    expect(wrapper.text()).toContain('159 recoveries')
    expect(wrapper.text()).toContain('E2E CaaS Full Install (12 failures)')
    expect(wrapper.text()).toContain('Time to Merge')
    expect(wrapper.text()).toContain('Time in Merge Queue')
    expect(wrapper.text()).toContain('E2E Jobs per PR')
    expect(wrapper.text()).toContain('osac-test-infra')
    const link = wrapper.find('a[href="https://github.com/osac-project/osac-test-infra/actions/runs/34495310704"]')
    expect(link.exists()).toBe(true)
  })

  it('shows "no successes yet" (not 0%) when flake_rate is null -- distinct from a real 0% rate', async () => {
    apiRequest.mockResolvedValue(makeEnvelope({ flake_rate: null }))
    const wrapper = mount(CiDigestView)
    await flushPromises()
    await flushPromises()

    expect(wrapper.text()).toContain('no successes yet')
    expect(wrapper.text()).not.toContain('0.0%')
  })

  it('renders a real 0% flake rate distinctly from the null "no data" case', async () => {
    apiRequest.mockResolvedValue(makeEnvelope({ flake_rate: 0 }))
    const wrapper = mount(CiDigestView)
    await flushPromises()
    await flushPromises()

    expect(wrapper.text()).toContain('0.0%')
    expect(wrapper.text()).not.toContain('no successes yet')
  })

  it('shows "None" (a healthy signal) when top_failing is null -- distinct from the "n/a" used for missing data', async () => {
    apiRequest.mockResolvedValue(makeEnvelope({ top_failing: null }))
    const wrapper = mount(CiDigestView)
    await flushPromises()
    await flushPromises()

    const section = wrapper.findAll('section').find((s) => s.text().includes('Other stability signals'))
    expect(section.text()).toContain('Top failing workflow (24h)')
    expect(section.text()).toContain('None')
  })

  it('shows "no recoveries yet" (not a dash or crash) when mttr is null', async () => {
    apiRequest.mockResolvedValue(makeEnvelope({ mttr: null }))
    const wrapper = mount(CiDigestView)
    await flushPromises()
    await flushPromises()

    expect(wrapper.text()).toContain('no recoveries yet')
  })

  it('treats a periodic window with zero runs as "n/a", not a misleading 0%', async () => {
    apiRequest.mockResolvedValue(makeEnvelope({ periodic_24h: { success: 0, failure: 0, success_rate: 0 } }))
    const wrapper = mount(CiDigestView)
    await flushPromises()
    await flushPromises()

    expect(wrapper.text()).toContain('n/a')
    expect(wrapper.text()).toContain('0/0 runs')
  })

  it('flags a report older than the staleness threshold', async () => {
    const oldNow = '2020-01-01 00:00 UTC'
    apiRequest.mockResolvedValue(makeEnvelope({ now: oldNow }))
    const wrapper = mount(CiDigestView)
    await flushPromises()
    await flushPromises()

    expect(wrapper.text()).toMatch(/more than 36h old/)
  })

  it('does not flag a fresh report as stale', async () => {
    apiRequest.mockResolvedValue(makeEnvelope({ now: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC' }))
    const wrapper = mount(CiDigestView)
    await flushPromises()
    await flushPromises()

    expect(wrapper.text()).not.toMatch(/more than 36h old/)
  })

  it('surfaces a failing source runConclusion without treating it as report-invalidating', async () => {
    apiRequest.mockResolvedValue(makeEnvelope({}, { runConclusion: 'failure' }))
    const wrapper = mount(CiDigestView)
    await flushPromises()
    await flushPromises()

    // The report still renders fully -- runConclusion is provenance, not a health signal.
    expect(wrapper.text()).not.toContain('Failed to load CI digest')
    expect(wrapper.text()).toContain('95.5%')
  })

  it('retries the fetch when "Try again" is clicked after an error', async () => {
    apiRequest.mockRejectedValueOnce(new Error('boom'))
    const wrapper = mount(CiDigestView)
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('Failed to load CI digest')

    apiRequest.mockResolvedValue(makeEnvelope())
    await wrapper.find('button').trigger('click')
    await flushPromises()
    await flushPromises()

    expect(wrapper.text()).toContain('95.5%')
  })

  it('unions 24h-only, 7d-only, and shared repos across merge-time and queue-time windows without dropping or substituting values', async () => {
    const mergeTime = {
      ...makeDigest().merge_time,
      by_repo: [
        {
          repo: 'alpha', median_approval_to_merge_seconds: 3600, median_approval_to_merge_display: '1h 0m 0s', approved_count: 5, count: 10,
          median_queue_wait_seconds: 1800, median_queue_wait_display: '30m 0s', via_merge_queue_count: 3
        },
        {
          repo: 'bravo', median_approval_to_merge_seconds: 7200, median_approval_to_merge_display: '2h 0m 0s', approved_count: 8, count: 12,
          median_queue_wait_seconds: null, median_queue_wait_display: null, via_merge_queue_count: 0
        }
      ]
    }
    const mergeTime24h = {
      ...makeDigest().merge_time_24h,
      by_repo: [
        {
          repo: 'alpha', median_approval_to_merge_seconds: 5400, median_approval_to_merge_display: '1h 30m 0s', approved_count: 2, count: 3,
          median_queue_wait_seconds: 900, median_queue_wait_display: '15m 0s', via_merge_queue_count: 1
        },
        {
          repo: 'charlie', median_approval_to_merge_seconds: 1200, median_approval_to_merge_display: '20m 0s', approved_count: 1, count: 1,
          median_queue_wait_seconds: 600, median_queue_wait_display: '10m 0s', via_merge_queue_count: 1
        }
      ]
    }

    apiRequest.mockResolvedValue(makeEnvelope({ merge_time: mergeTime, merge_time_24h: mergeTime24h }))
    const wrapper = mount(CiDigestView)
    await flushPromises()
    await flushPromises()

    const [mergeChart, queueChart] = wrapper.findAllComponents(RepoWindowBarChart)

    // shared (alpha), 7d-only (bravo), 24h-only (charlie); sorted by the
    // fastest available metric, preferring 7d and falling back to 24h
    expect(mergeChart.props('rows')).toEqual([
      { repo: 'charlie', hours7d: null, label7d: null, count7d: null, hours24: 1200 / 3600, label24: '20m 0s', count24: 1 },
      { repo: 'alpha', hours7d: 1, label7d: '1h 0m 0s', count7d: 5, hours24: 1.5, label24: '1h 30m 0s', count24: 2 },
      { repo: 'bravo', hours7d: 2, label7d: '2h 0m 0s', count7d: 8, hours24: null, label24: null, count24: null }
    ])

    // bravo never used the merge queue in either window, so it's absent
    // here even though it appears in the merge-time chart above
    expect(queueChart.props('rows')).toEqual([
      { repo: 'charlie', hours7d: null, label7d: null, count7d: null, hours24: 600 / 3600, label24: '10m 0s', count24: 1 },
      { repo: 'alpha', hours7d: 0.5, label7d: '30m 0s', count7d: 3, hours24: 0.25, label24: '15m 0s', count24: 1 }
    ])
  })
})

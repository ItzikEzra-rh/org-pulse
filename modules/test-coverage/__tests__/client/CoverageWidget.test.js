import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CoverageWidget from '../../client/widgets/CoverageWidget.vue'
import report from '../fixtures/report.json'

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }))
vi.mock('@shared/client/services/api.js', () => ({ apiRequest }))
vi.mock('@shared/client/composables/useModuleLink.js', () => ({
  useModuleLink: () => ({ navigateTo: vi.fn(), linkTo: vi.fn(() => '#/test-coverage/coverage') })
}))

beforeEach(() => {
  apiRequest.mockReset()
})

describe('CoverageWidget', () => {
  it('counts areas by verdict and links to the page', async () => {
    // Vary the fixture verdicts so all three cards are exercised.
    apiRequest.mockResolvedValue({
      available: true,
      lastRunAt: '2026-10-25',
      groups: [{ key: 'core', name: 'core' }, { key: 'platform', name: 'platform' }],
      overview: report.overview.map((row, index) => ({ ...row, name: row.area, verdict: index === 0 ? 'ready' : 'not ready' }))
    })

    const wrapper = mount(CoverageWidget, { props: { size: 'half' } })
    await flushPromises()

    expect(wrapper.text()).toContain('View coverage')
    expect(wrapper.find('[data-testid="count-ready"]').text()).toBe('1')
    expect(wrapper.find('[data-testid="count-not-ready"]').text()).toBe('1')
    expect(wrapper.find('[data-testid="count-insufficient"]').text()).toBe('0')
    expect(wrapper.find('[data-testid="updated"]').text()).toContain('2 areas')
    expect(wrapper.find('[data-testid="updated"]').text()).toContain('2 working groups')
  })
})

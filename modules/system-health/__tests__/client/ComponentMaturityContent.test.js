import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import report from '../../../../fixtures/system-health/component-maturity/maturity-report.json'
import ComponentMaturityContent from '../../client/views/ComponentMaturityContent.vue'

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }))

vi.mock('@shared/client/services/api', () => ({ apiRequest }))

async function mountContent(response = report) {
  apiRequest.mockResolvedValueOnce(response)
  const wrapper = mount(ComponentMaturityContent)
  await flushPromises()
  return wrapper
}

function copyReport() {
  return JSON.parse(JSON.stringify(report))
}

function buttonWithText(wrapper, text) {
  return wrapper.findAll('button').find(button => button.text() === text)
}

describe('ComponentMaturityContent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the original report summary and dense component table', async () => {
    const wrapper = await mountContent()

    expect(apiRequest).toHaveBeenCalledWith('/modules/system-health/component-maturity/report')
    expect(wrapper.text()).toContain('OSAC Component Maturity Report')
    expect(wrapper.text()).toContain('Avg score')
    expect(wrapper.text()).toContain('Evidence coverage')
    expect(wrapper.text()).toContain('Blocker gaps')
    expect(wrapper.text()).toContain('Deliverables ready')
    expect(wrapper.text()).toContain('Core')
    expect(wrapper.text()).toContain('Billing and Quota')
    expect(wrapper.find('iframe').exists()).toBe(false)
  })

  it('switches between the original requirement and mapping views', async () => {
    const wrapper = await mountContent()

    await buttonWithText(wrapper, 'By Requirement').trigger('click')
    expect(wrapper.text()).toContain('Process Checkpoints')
    expect(wrapper.text()).toContain('Feature signoff completed for DP stage')
    expect(wrapper.text()).toContain('Build & Repository')

    await buttonWithText(wrapper, 'Mapping Problems').trigger('click')
    expect(wrapper.text()).toContain('component-owner-unmapped')
    expect(wrapper.text()).toContain('No owning team is mapped for Billing and Quota')
    expect(wrapper.text()).toContain('rule evaluator(s) are not implemented')
    expect(wrapper.findAll('th').map(cell => cell.text())).toEqual(expect.arrayContaining([
      'Severity', 'Signal', 'Entity', 'Type', 'Message'
    ]))
  })

  it('expands a component into readiness, requirements, and deliverables', async () => {
    const wrapper = await mountContent()

    await wrapper.get('button[aria-label="Toggle Core details"]').trigger('click')
    expect(wrapper.text()).toContain('OSAC/Core')
    expect(wrapper.text()).toContain('Stage readiness')
    expect(wrapper.text()).toContain('Component requirements')
    expect(wrapper.text()).toContain('Target')
    expect(wrapper.text()).toContain('Deliverable pipeline status')
    expect(wrapper.text()).toContain('Fulfillment service')
  })

  it('applies stage and status filters and sorts component rows', async () => {
    const wrapper = await mountContent()

    await buttonWithText(wrapper, 'By Requirement').trigger('click')
    await buttonWithText(wrapper, 'DP').trigger('click')
    expect(wrapper.text()).toContain('Feature signoff completed for DP stage')
    expect(wrapper.text()).not.toContain('Feature signoff completed for TP stage')

    const unknownCheckbox = wrapper.findAll('input[type="checkbox"]')[3]
    expect(unknownCheckbox.element.checked).toBe(true)
    await unknownCheckbox.setValue(false)
    expect(wrapper.text()).not.toContain('Feature signoff completed for DP stage')

    await buttonWithText(wrapper, 'Components').trigger('click')
    await buttonWithText(wrapper, 'Score ↕').trigger('click')
    expect(wrapper.find('tbody tr').text()).toMatch(/\d+%/)
  })

  it('expands a process checkpoint with Jira evidence guidance', async () => {
    const wrapper = await mountContent()

    await buttonWithText(wrapper, 'By Requirement').trigger('click')
    await wrapper.get('button[aria-label="Toggle Feature signoff completed for TP stage requirement details"]').trigger('click')
    expect(wrapper.text()).toContain('Define and approve how an OSAC component and TP signoff are represented in Jira')
    expect(wrapper.text()).toContain('No approved machine-readable OSAC Jira evidence convention exists')
    expect(wrapper.text()).toContain('Core')
  })

  it('distinguishes stale, empty, and malformed reports', async () => {
    const staleReport = copyReport()
    staleReport.generatedAt = '2020-01-01T00:00:00Z'
    let wrapper = await mountContent(staleReport)
    expect(wrapper.text()).toContain('more than 36 hours old')

    const emptyReport = copyReport()
    emptyReport.components = []
    emptyReport.evaluations = []
    wrapper.unmount()
    wrapper = await mountContent(emptyReport)
    expect(wrapper.text()).toContain('contains no components')

    wrapper.unmount()
    wrapper = await mountContent({ ...copyReport(), evaluations: null })
    expect(wrapper.text()).toContain('unsupported format')
  })

  it('renders the unavailable state and retries', async () => {
    const unavailable = Object.assign(new Error('unavailable'), {
      data: { code: 'COMPONENT_MATURITY_DATA_UNAVAILABLE' }
    })
    apiRequest.mockRejectedValueOnce(unavailable).mockResolvedValueOnce(report)
    const wrapper = mount(ComponentMaturityContent)
    await flushPromises()

    expect(wrapper.text()).toContain('has not been published yet')
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Core')
  })
})

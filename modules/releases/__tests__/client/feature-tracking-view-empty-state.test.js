import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import FeatureTrackingView from '../../client/execute/views/FeatureTrackingView.vue'

const mockApiRequest = vi.fn()

vi.mock('@shared/client/services/api', () => ({
  apiRequest: (...args) => mockApiRequest(...args),
  SESSION_CACHE_PREFIX: 'tt_cache:session:'
}))

const RELEASES = { releases: [{ releaseId: 'osac-0.2-M1', displayName: 'OSAC 0.2-M1' }] }

const GENUINE_ZERO = {
  schemaVersion: 1,
  releaseId: 'osac-0.2-M1',
  displayName: 'OSAC 0.2-M1',
  fixVersions: ['0.2-M1'],
  baselineDate: '2026-07-08',
  baselineSource: 'releaseStart+7d',
  fetchedAt: '2026-08-17T03:09:41Z',
  featureCount: 0,
  counts: { committed: 0, added: 0, dropped: 0, moved: 0, unknown: 0, blockerPriority: 0 },
  wasQueryFailed: false,
  features: []
}

function withData(overrides) {
  return Object.assign({}, GENUINE_ZERO, overrides)
}

async function mountWith(trackingData) {
  mockApiRequest.mockImplementation(function (url) {
    if (url.indexOf('/tracking/releases') !== -1) return Promise.resolve(RELEASES)
    return Promise.resolve(trackingData)
  })
  const wrapper = mount(FeatureTrackingView)
  await flushPromises()
  return wrapper
}

describe('FeatureTrackingView empty-state messaging', function() {
  beforeEach(function() {
    mockApiRequest.mockReset()
  })

  it('shows the semantic zero-scope message for a successful, reached-baseline, genuinely-empty release', async function() {
    const wrapper = await mountWith(GENUINE_ZERO)
    expect(wrapper.text()).toContain('No Feature-level scope was found for this release or milestone.')
    expect(wrapper.text()).toContain('Epics may still be assigned to this milestone and are shown in Epics by Release.')
  })

  it('does not use the semantic zero-scope message when wasQueryFailed is true', async function() {
    const wrapper = await mountWith(withData({ wasQueryFailed: true }))
    expect(wrapper.text()).not.toContain('No Feature-level scope was found for this release or milestone.')
    expect(wrapper.text()).toContain('No features match this filter.')
  })

  it('does not use the semantic zero-scope message when the baseline is unknown', async function() {
    const wrapper = await mountWith(withData({ baselineDate: null, baselineSource: 'unknown' }))
    expect(wrapper.text()).not.toContain('No Feature-level scope was found for this release or milestone.')
    expect(wrapper.text()).toContain('No features match this filter.')
  })

  it('treats a missing/falsy baselineSource the same as "unknown" instead of a resolvable baseline', async function() {
    const wrapper = await mountWith(withData({ baselineSource: '' }))
    expect(wrapper.text()).not.toContain('No Feature-level scope was found for this release or milestone.')
    expect(wrapper.text()).toContain('No features match this filter.')
    expect(wrapper.text()).toContain('No baseline could be established for this release')
  })

  it('does not use the semantic zero-scope message when the baseline has not been reached yet', async function() {
    const wrapper = await mountWith(withData({ baselineDate: '2099-01-01' }))
    expect(wrapper.text()).not.toContain('No Feature-level scope was found for this release or milestone.')
    expect(wrapper.text()).toContain('No features match this filter.')
  })

  it('keeps the filtered-empty message when an active filter hides all rows of a non-empty dataset', async function() {
    const wrapper = await mountWith(withData({
      featureCount: 1,
      counts: { committed: 0, added: 1, dropped: 1, moved: 0, unknown: 0, blockerPriority: 0 },
      features: [
        { key: 'OSAC-1', summary: 'Feature one', status: 'In Progress', scopeChange: 'added', components: [] }
      ]
    }))
    const droppedCard = wrapper.findAll('.cursor-pointer').find(function (c) { return c.text().includes('Dropped') })
    await droppedCard.trigger('click')

    expect(wrapper.text()).toContain('No features match this filter.')
    expect(wrapper.text()).not.toContain('No Feature-level scope was found for this release or milestone.')
  })

  it('does not use the semantic zero-scope message before any release data has loaded', async function() {
    mockApiRequest.mockImplementation(function (url) {
      if (url.indexOf('/tracking/releases') !== -1) return Promise.resolve({ releases: [] })
      return Promise.resolve(null)
    })
    const wrapper = mount(FeatureTrackingView)
    await flushPromises()
    expect(wrapper.text()).not.toContain('No Feature-level scope was found for this release or milestone.')
  })

  it('keeps unconfigured baseline counts and absent team attribution explicitly Unknown', async function() {
    const wrapper = await mountWith(withData({
      projectId: 'flightctl',
      partial: true,
      scopePolicyState: 'unconfigured',
      baselineDate: null,
      baselineSource: 'unknown',
      featureCount: 1,
      counts: { committed: null, added: null, dropped: null, moved: null, unknown: 1, blockerPriority: 0 },
      features: [{
        key: 'EDM-100', summary: 'Jira-only Feature', status: 'Closed', team: null,
        coverage: { team: 'unknown' }, components: ['FlightCtl-Core'], scopeChange: 'unknown'
      }]
    }))

    expect(wrapper.text()).toContain('A scope-baseline policy is not configured')
    expect(wrapper.text()).toContain('Team attribution is unknown for some features')
    expect(wrapper.text()).toContain('Added')
    expect(wrapper.text()).toContain('Dropped')
    expect(wrapper.text()).toContain('Moved')
    expect(wrapper.text()).toContain('Unknown')
    expect(wrapper.text()).toContain('EDM-100')
    expect(wrapper.text()).toContain('This release tracking artifact is partial')

    const teamFilter = wrapper.findAll('button[aria-haspopup="listbox"]').find(button => button.text().includes('All teams'))
    await teamFilter.trigger('click')
    const unknownOption = wrapper.findAll('label').find(label => label.text() === 'Unknown')
    await unknownOption.find('input[type="checkbox"]').setValue(true)
    expect(wrapper.text()).toContain('EDM-100')
    expect(wrapper.text()).not.toContain('No features match this filter.')
  })
})

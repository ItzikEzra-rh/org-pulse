import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import LandingPage from '../components/LandingPage.vue'
import { _resetForTesting } from '../composables/useSotuLayout.js'

const mockIsManager = { value: false }
const mockIsTeamAdmin = { value: false }

vi.mock('@shared/client/composables/useAuth.js', () => ({
  useAuth: () => ({
    isManager: mockIsManager,
    isTeamAdmin: mockIsTeamAdmin
  })
}))

vi.mock('../module-loader', () => ({
  loadModuleWidget: () => ({ template: '<div>widget stub</div>' })
}))

vi.mock('sortablejs', () => ({
  default: { create: () => ({ destroy: () => {} }) }
}))

const AI_IMPACT_MANIFEST = {
  slug: 'ai-impact',
  name: 'AI Impact',
  client: {
    sotuWidgets: [
      {
        id: 'feature-board',
        name: 'Feature Planning Board',
        component: 'FeatureBoard.vue',
        defaultSize: 'full',
        default: true
      }
    ]
  }
}

// useSotuLayout's layout ref is a module-level singleton; reset it from localStorage before each mount.
function mountLandingPage(props) {
  _resetForTesting()
  return mount(LandingPage, { props })
}

describe('LandingPage', () => {
  beforeEach(() => {
    localStorage.clear()
    mockIsManager.value = false
    mockIsTeamAdmin.value = false
  })

  it('seeds Feature Planning Board as the default first-visit widget when AI Impact is enabled', async () => {
    const wrapper = await mountLandingPage({ builtInManifests: [AI_IMPACT_MANIFEST], isAdmin: false })
    await flushPromises()
    expect(wrapper.findAll('.sotu-widget')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('Build Your Dashboard')
  })

  it('does not reseed an existing saved layout', async () => {
    localStorage.setItem('orgpulse_sotu_layout', JSON.stringify([]))
    const wrapper = await mountLandingPage({ builtInManifests: [AI_IMPACT_MANIFEST], isAdmin: false })
    await flushPromises()
    expect(wrapper.findAll('.sotu-widget')).toHaveLength(0)
    expect(wrapper.text()).toContain('Build Your Dashboard')
  })

  it('hides Your Overview and Add Widgets when there are zero available widget definitions', async () => {
    const wrapper = await mountLandingPage({ builtInManifests: [], isAdmin: false })
    await flushPromises()
    expect(wrapper.text()).not.toContain('YOUR OVERVIEW')
    expect(wrapper.text()).not.toContain('Add Widgets')
  })

  it('shows the Build Your Dashboard empty-layout state and a working Add Widgets action when widgets exist but the layout is empty', async () => {
    localStorage.setItem('orgpulse_sotu_layout', JSON.stringify([]))
    const wrapper = await mountLandingPage({ builtInManifests: [AI_IMPACT_MANIFEST], isAdmin: false })
    await flushPromises()
    expect(wrapper.text()).toContain('YOUR OVERVIEW')
    expect(wrapper.text()).toContain('Build Your Dashboard')

    const addWidgetsButton = wrapper.findAll('button').find(b => b.text() === 'Add Widgets')
    expect(addWidgetsButton).toBeTruthy()
    await addWidgetsButton.trigger('click')
    expect(wrapper.find('h2').text()).toBe('Add Widgets')
  })

  it('marks unavailable explore cards as disabled with an explanation', async () => {
    const wrapper = await mountLandingPage({ builtInManifests: [], isAdmin: false })
    await flushPromises()
    const cards = wrapper.findAll('section button')
    expect(cards).toHaveLength(4)
    for (const card of cards) {
      expect(card.attributes('disabled')).toBeDefined()
      expect(card.attributes('title')).toBe('Not available in this deployment')
    }
    expect(wrapper.text()).toContain('Not Enabled')
  })

  it('does not render text matching the smoke test error-state pattern in a core (single-module) deployment', async () => {
    // tests/smoke/app-loads.spec.js flags any visible "error|failed|unavailable" text as an API error.
    const wrapper = await mountLandingPage({ builtInManifests: [{ slug: 'team-tracker', name: 'People & Teams' }], isAdmin: false })
    await flushPromises()
    expect(wrapper.text()).not.toMatch(/error|failed|unavailable/i)
  })

  it('keeps enabled explore cards clickable and navigable', async () => {
    const wrapper = await mountLandingPage({ builtInManifests: [{ slug: 'team-tracker', name: 'People & Teams' }], isAdmin: false })
    await flushPromises()
    const peopleCard = wrapper.findAll('section button').find(b => b.text().includes('People & Teams'))
    expect(peopleCard.attributes('disabled')).toBeUndefined()
    await peopleCard.trigger('click')
    expect(wrapper.emitted('navigate')).toEqual([['team-tracker']])
  })

  it('shows an admin-only recovery notice when no built-in manifests are enabled', async () => {
    const adminWrapper = await mountLandingPage({ builtInManifests: [], isAdmin: true })
    await flushPromises()
    expect(adminWrapper.text()).toContain('No built-in modules are currently enabled.')

    const nonAdminWrapper = await mountLandingPage({ builtInManifests: [], isAdmin: false })
    await flushPromises()
    expect(nonAdminWrapper.text()).not.toContain('No built-in modules are currently enabled.')
  })

  it('navigates to settings when Configure modules is clicked', async () => {
    const wrapper = await mountLandingPage({ builtInManifests: [], isAdmin: true })
    await flushPromises()
    await wrapper.find('button.underline').trigger('click')
    expect(wrapper.emitted('navigate')).toEqual([['settings']])
  })
})

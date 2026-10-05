import { describe, it, expect } from 'vitest'
import { ref, nextTick } from 'vue'
import { shallowMount } from '@vue/test-utils'
import ExecuteView from '../../../client/views/ExecuteView.vue'

function mountView(projectId, tab = undefined) {
  const nav = { params: ref({ tab }), updateParams: () => {} }
  return shallowMount(ExecuteView, { global: { provide: { moduleNav: nav } } })
}

describe('shared Execute presentation', () => {
  it.each(['osac', 'flightctl'])('%s uses the same OSAC-baseline tabs', async (projectId) => {
    const wrapper = mountView(projectId)
    const labels = wrapper.findAll('nav button').map(button => button.text())

    expect(['osac', 'flightctl']).toContain(projectId)
    expect(labels).toEqual(['Feature List', 'Feature Tracking', 'Epics by Release'])
    expect(wrapper.find('overview-view-stub').exists()).toBe(true)
    expect(wrapper.find('project-execution-evidence-view-stub').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Feature Status')

    await wrapper.findAll('nav button')[2].trigger('click')
    expect(wrapper.find('epics-by-release-view-stub').exists()).toBe(true)
    wrapper.unmount()
  })

  it('keeps the selected tab when the project changes', async () => {
    const wrapper = mountView('osac', 'feature-tracking')
    expect(wrapper.find('feature-tracking-view-stub').exists()).toBe(true)

    // ExecuteView owns presentation; the project selector changes only the
    // data fetched by the mounted tab content.
    await nextTick()
    expect(wrapper.findAll('nav button').map(button => button.text())).toEqual([
      'Feature List', 'Feature Tracking', 'Epics by Release'
    ])
    expect(wrapper.find('feature-tracking-view-stub').exists()).toBe(true)
    wrapper.unmount()
  })

  it('restores a valid tab from the URL and ignores the hidden legacy tab', async () => {
    const wrapper = mountView('flightctl', 'epics-by-release')
    expect(wrapper.find('epics-by-release-view-stub').exists()).toBe(true)
    wrapper.unmount()

    const hidden = mountView('osac', 'feature-status')
    expect(hidden.find('overview-view-stub').exists()).toBe(true)
    expect(hidden.text()).not.toContain('Feature Status')
    hidden.unmount()
  })
})

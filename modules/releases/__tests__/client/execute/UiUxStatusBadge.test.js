import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import UiUxStatusBadge from '../../../client/execute/components/UiUxStatusBadge.vue'
import AIInfoBubble from '../../../client/execute/components/AIInfoBubble.vue'

describe('UiUxStatusBadge', () => {
  it('renders the label and mapped status text', () => {
    const wrapper = mount(UiUxStatusBadge, { props: { label: 'UI', status: 'in-progress', source: 'aggregate' } })
    expect(wrapper.text()).toContain('UI')
    expect(wrapper.text()).toContain('In Progress')
  })

  it('omits the label element entirely when label is empty', () => {
    const wrapper = mount(UiUxStatusBadge, { props: { label: '', status: 'completed', source: 'aggregate' } })
    expect(wrapper.text()).toContain('Completed')
    expect(wrapper.find('.uppercase').exists()).toBe(false)
  })

  it('shows a conflict marker and mentions it in the tooltip text when conflict is true', () => {
    const wrapper = mount(UiUxStatusBadge, { props: { label: 'UI', status: 'completed', conflict: true, source: 'aggregate' } })
    expect(wrapper.text()).toContain('!')
    expect(wrapper.findComponent(AIInfoBubble).props('text')).toContain('Conflicting evidence detected')
  })

  it('relabels an unknown status as "No evidence" when the source is none', () => {
    const wrapper = mount(UiUxStatusBadge, { props: { label: 'UX', status: 'unknown', source: 'none' } })
    expect(wrapper.text()).toContain('No evidence')
    expect(wrapper.findComponent(AIInfoBubble).props('text')).toContain('No evidence recorded')
  })

  it('explains a mixed status in the tooltip text', () => {
    const wrapper = mount(UiUxStatusBadge, { props: { label: 'UI', status: 'mixed', source: 'mixed' } })
    expect(wrapper.text()).toContain('Mixed')
    expect(wrapper.findComponent(AIInfoBubble).props('text')).toContain('disagree')
  })

  it('falls back to the Unknown status style for an unrecognized status value', () => {
    const wrapper = mount(UiUxStatusBadge, { props: { label: 'UI', status: 'something-new', source: 'aggregate' } })
    expect(wrapper.text()).toContain('Unknown')
  })
})

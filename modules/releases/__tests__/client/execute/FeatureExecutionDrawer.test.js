import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FeatureExecutionDrawer from '../../../client/execute/components/FeatureExecutionDrawer.vue'

function makeCard(overrides = {}) {
  return {
    feature: {
      key: 'OSAC-100', summary: 'Streaming inference endpoint', status: 'In Progress',
      assignee: 'Jane Doe', components: ['Comp A'], fixVersions: ['1.0'], labels: ['label-a'],
      epicCount: 1, issueCount: 3, blockerCount: 0,
      ...overrides.feature
    },
    progress: { kind: 'available', pct: 40, done: 2, total: 5 },
    readiness: { label: 'Ready', class: 'bg-emerald-100' },
    ...overrides
  }
}

function mountDrawer(props) {
  return mount(FeatureExecutionDrawer, {
    props: { featureKey: null, card: null, detail: null, loading: false, error: null, ...props },
    global: { stubs: { Teleport: true, Transition: true } }
  })
}

describe('FeatureExecutionDrawer', () => {
  it('renders nothing when closed', () => {
    const wrapper = mountDrawer({})
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('renders header identity, status, and readiness when open', () => {
    const wrapper = mountDrawer({ featureKey: 'OSAC-100', card: makeCard(), detail: { key: 'OSAC-100', epics: [] } })
    const dialog = wrapper.find('[role="dialog"]')
    expect(dialog.exists()).toBe(true)
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(dialog.text()).toContain('OSAC-100')
    expect(dialog.text()).toContain('Streaming inference endpoint')
    expect(dialog.text()).toContain('Ready')
  })

  it('shows the loading state and hides epic content while loading', () => {
    const wrapper = mountDrawer({ featureKey: 'OSAC-100', card: makeCard(), loading: true })
    expect(wrapper.text()).toContain('Loading epics')
    expect(wrapper.text()).not.toContain('No epics for this feature')
  })

  it('shows the error message with a Retry button that emits retry', async () => {
    const wrapper = mountDrawer({ featureKey: 'OSAC-100', card: makeCard(), error: 'Failed to load' })
    expect(wrapper.text()).toContain('Failed to load')
    const retryButton = wrapper.findAll('button').find(b => b.text() === 'Retry')
    await retryButton.trigger('click')
    expect(wrapper.emitted('retry')).toBeTruthy()
  })

  it('distinguishes missing/malformed detail from a genuinely empty Epic list', () => {
    const missingDetail = mountDrawer({ featureKey: 'OSAC-100', card: makeCard(), detail: null })
    expect(missingDetail.text()).toContain('Feature detail unavailable.')
    expect(missingDetail.text()).not.toContain('No epics for this feature.')

    const malformedDetail = mountDrawer({ featureKey: 'OSAC-100', card: makeCard(), detail: { key: 'OSAC-100' } })
    expect(malformedDetail.text()).toContain('Epic data unavailable.')
    expect(malformedDetail.text()).not.toContain('No epics for this feature.')

    const genuinelyEmpty = mountDrawer({ featureKey: 'OSAC-100', card: makeCard(), detail: { key: 'OSAC-100', epics: [] } })
    expect(genuinelyEmpty.text()).toContain('No epics for this feature.')
  })

  it('renders per-Epic progress validity: available, verified-empty, and unavailable, never a fabricated 0%', () => {
    const detail = {
      key: 'OSAC-100',
      epics: [
        { key: 'EP-1', summary: 'Real progress', status: 'In Progress', executionIssueCount: 4, doneExecutionIssueCount: 1, issues: [] },
        { key: 'EP-2', summary: 'All preparation', status: 'New', executionIssueCount: 0, doneExecutionIssueCount: 0, issues: [] },
        { key: 'EP-3', summary: 'No issues collected', status: 'New', executionIssueCount: null, doneExecutionIssueCount: null, issues: [] }
      ]
    }
    const wrapper = mountDrawer({ featureKey: 'OSAC-100', card: makeCard(), detail })
    const text = wrapper.text()

    expect(text).toContain('1/4')
    expect(text).toContain('25%')
    expect(text).toContain('No tracked execution work')
    expect(text).toContain('No issue-level progress available')
    expect(text).not.toMatch(/0\/0/)
  })

  it('separates execution and preparation issues, flagging missing/unrecognized classification as Unclassified', async () => {
    const detail = {
      key: 'OSAC-100',
      epics: [{
        key: 'EP-1', summary: 'Mixed epic', status: 'In Progress',
        executionIssueCount: 2, doneExecutionIssueCount: 1,
        issues: [
          { key: 'I-1', summary: 'Implement handler', status: 'Done', isPreparation: false },
          { key: 'I-2', summary: 'Legacy issue with no flag', status: 'To Do' },
          { key: 'I-3', summary: 'PRD: Streaming inference', status: 'Done', isPreparation: true }
        ]
      }]
    }
    const wrapper = mountDrawer({ featureKey: 'OSAC-100', card: makeCard(), detail })

    const expandButton = wrapper.findAll('button').find(b => b.text().includes('Mixed epic'))
    await expandButton.trigger('click')

    expect(wrapper.text()).toContain('Implement handler')
    expect(wrapper.text()).toContain('Legacy issue with no flag')
    expect(wrapper.text()).not.toContain('PRD: Streaming inference')

    const unclassifiedPills = wrapper.findAll('span').filter(s => s.text() === 'Unclassified')
    expect(unclassifiedPills).toHaveLength(1)

    const showPrepButton = wrapper.findAll('button').find(b => b.text().includes('Show preparation'))
    expect(showPrepButton.text()).toContain('(1)')
    await showPrepButton.trigger('click')
    expect(wrapper.text()).toContain('PRD: Streaming inference')
  })

  it('treats a non-array epic.issues as no issue-level data, not confirmed zero execution', async () => {
    const detail = {
      key: 'OSAC-100',
      epics: [{
        key: 'EP-1', summary: 'Malformed epic', status: 'In Progress',
        executionIssueCount: 2, doneExecutionIssueCount: 1,
        issues: 'not-an-array'
      }]
    }
    const wrapper = mountDrawer({ featureKey: 'OSAC-100', card: makeCard(), detail })

    // Epic-level progress still reads from executionIssueCount/doneExecutionIssueCount
    // directly, unaffected by the malformed issues array.
    expect(wrapper.text()).toContain('1/2')

    const expandButton = wrapper.findAll('button').find(b => b.text().includes('Malformed epic'))
    await expandButton.trigger('click')
    expect(wrapper.text()).toContain('No execution issues')
    expect(wrapper.findAll('button').find(b => b.text().includes('Show preparation'))).toBeUndefined()
  })

  it('links the Epic key to Jira without toggling expansion, keeping chevron/title as separate controls', async () => {
    const detail = {
      key: 'OSAC-100',
      epics: [{ key: 'OSAC-1862', summary: 'Streaming epic', status: 'In Progress', executionIssueCount: 2, doneExecutionIssueCount: 1, issues: [] }]
    }
    const wrapper = mountDrawer({ featureKey: 'OSAC-100', card: makeCard(), detail })

    const epicLink = wrapper.findAll('a').find(a => a.text().includes('OSAC-1862'))
    expect(epicLink.exists()).toBe(true)
    expect(epicLink.attributes('href')).toBe('https://issues.redhat.com/browse/OSAC-1862')
    expect(epicLink.attributes('target')).toBe('_blank')
    expect(epicLink.attributes('rel')).toContain('noopener')
    expect(epicLink.element.tagName).toBe('A')
    expect(epicLink.element.closest('button')).toBeNull()

    await epicLink.trigger('click')
    expect(wrapper.text()).not.toContain('No execution issues')

    const titleToggle = wrapper.findAll('button').find(b => b.text().includes('Streaming epic'))
    await titleToggle.trigger('click')
    expect(wrapper.text()).toContain('No execution issues')
  })

  it('closes on Escape via the shared focus-trap composable', async () => {
    const wrapper = mountDrawer({ featureKey: 'OSAC-100', card: makeCard(), detail: { key: 'OSAC-100', epics: [] } })
    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('dismisses an info bubble on Escape without closing the drawer', async () => {
    const wrapper = mountDrawer({ featureKey: 'OSAC-100', card: makeCard(), detail: { key: 'OSAC-100', epics: [] } })
    const infoButton = wrapper.find('[aria-label="More info"]')
    await infoButton.trigger('click')
    await infoButton.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toBeFalsy()
  })

  it('closes on backdrop click', async () => {
    const wrapper = mountDrawer({ featureKey: 'OSAC-100', card: makeCard(), detail: { key: 'OSAC-100', epics: [] } })
    await wrapper.find('[aria-hidden="true"]').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  describe('Epic status completion', () => {
    it('shows "Completed via Epic status" with the actual N/M below it, labelled as actual', () => {
      const detail = {
        key: 'OSAC-100',
        epics: [{
          key: 'EP-1', summary: 'Completed via status', status: 'Done',
          completedViaStatus: true,
          executionIssueCount: 3, doneExecutionIssueCount: 1, issues: []
        }]
      }
      const wrapper = mountDrawer({ featureKey: 'OSAC-100', card: makeCard(), detail })
      const text = wrapper.text()
      expect(text).toContain('Completed via Epic status')
      expect(text).toContain('1/3')
      expect(text).toContain('(actual)')
    })

    it('shows "No execution issues recorded" for a confirmed zero-execution-issue completed-via-status Epic', () => {
      const detail = {
        key: 'OSAC-100',
        epics: [{
          key: 'EP-1', summary: 'Zero-child epic closed as Done', status: 'Done',
          completedViaStatus: true,
          executionIssueCount: 0, doneExecutionIssueCount: 0, issues: []
        }]
      }
      const wrapper = mountDrawer({ featureKey: 'OSAC-100', card: makeCard(), detail })
      const text = wrapper.text()
      expect(text).toContain('Completed via Epic status')
      expect(text).toContain('No execution issues recorded')
      expect(text).not.toContain('No tracked execution work')
    })

    it('shows "No execution issues recorded" (not "no children") when a completed-via-status Epic has only preparation children', () => {
      const detail = {
        key: 'OSAC-100',
        epics: [{
          key: 'EP-1', summary: 'Completed Epic with only prep issues', status: 'Done',
          completedViaStatus: true,
          executionIssueCount: 0, doneExecutionIssueCount: 0,
          issues: [{ key: 'I-1', summary: 'PRD doc', isPreparation: true }]
        }]
      }
      const wrapper = mountDrawer({ featureKey: 'OSAC-100', card: makeCard(), detail })
      expect(wrapper.text()).toContain('No execution issues recorded')
    })

    it('keeps "No issue-level progress available" for a completed-via-status Epic with no collected count, not a confirmed zero', () => {
      const detail = {
        key: 'OSAC-100',
        epics: [{
          key: 'EP-1', summary: 'Completed epic, no issue detail collected', status: 'Done',
          completedViaStatus: true,
          executionIssueCount: null, doneExecutionIssueCount: null, issues: []
        }]
      }
      const wrapper = mountDrawer({ featureKey: 'OSAC-100', card: makeCard(), detail })
      const text = wrapper.text()
      expect(text).toContain('Completed via Epic status')
      expect(text).toContain('No issue-level progress available')
      expect(text).not.toContain('No execution issues recorded')
    })

    it('adds a feature-level explanatory line summarizing completed-via-status Epics', () => {
      const detail = {
        key: 'OSAC-100',
        epics: [
          { key: 'EP-1', summary: 'A', status: 'Done', completedViaStatus: true, executionIssueCount: 2, doneExecutionIssueCount: 1, issues: [] },
          { key: 'EP-2', summary: 'B', status: 'In Progress', completedViaStatus: false, executionIssueCount: 2, doneExecutionIssueCount: 1, issues: [] }
        ]
      }
      const wrapper = mountDrawer({ featureKey: 'OSAC-100', card: makeCard(), detail })
      expect(wrapper.text()).toContain('1 epic completed via Epic status.')
    })

    it('does not show a stale completion label for a reopened Epic whose flag was invalidated to false', () => {
      const detail = {
        key: 'OSAC-100',
        epics: [{
          key: 'EP-1', summary: 'Reopened Epic', status: 'New', statusCategory: 'To Do',
          completedViaStatus: false,
          executionIssueCount: 3, doneExecutionIssueCount: 1, issues: []
        }]
      }
      const wrapper = mountDrawer({ featureKey: 'OSAC-100', card: makeCard(), detail })
      const text = wrapper.text()
      expect(text).not.toContain('Completed via Epic status')
      expect(text).toContain('1/3')
    })

    it('omits the completed-via-status explanatory line when no Epic carries the flag', () => {
      const detail = {
        key: 'OSAC-100',
        epics: [{ key: 'EP-1', summary: 'Normal', status: 'In Progress', executionIssueCount: 2, doneExecutionIssueCount: 1, issues: [] }]
      }
      const wrapper = mountDrawer({ featureKey: 'OSAC-100', card: makeCard(), detail })
      expect(wrapper.text()).not.toContain('completed via Epic status')
    })
  })
})

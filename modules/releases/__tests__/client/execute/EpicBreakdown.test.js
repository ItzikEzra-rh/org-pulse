import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EpicBreakdown from '../../../client/execute/components/EpicBreakdown.vue'

function makeEpic(overrides = {}) {
  return {
    key: 'OSAC-101',
    summary: 'Epic summary',
    status: 'In Progress',
    statusCategory: 'In Progress',
    priority: 'Normal',
    assignee: 'Jane Doe',
    components: [],
    labels: [],
    created: '2026-01-01T00:00:00Z',
    updated: '2026-08-01T00:00:00Z',
    issues: [
      { key: 'OSAC-1', status: 'Done', statusCategory: 'Done', summary: 'i1' },
      { key: 'OSAC-2', status: 'In Progress', statusCategory: 'In Progress', summary: 'i2' },
      { key: 'OSAC-3', status: 'In Progress', statusCategory: 'In Progress', summary: 'i3', isBlocked: true }
    ],
    ...overrides
  }
}

describe('EpicBreakdown', () => {
  it('renders multiple epics under one Feature', () => {
    const wrapper = mount(EpicBreakdown, {
      props: { epics: [makeEpic({ key: 'OSAC-101' }), makeEpic({ key: 'OSAC-102' })] }
    })

    expect(wrapper.text()).toContain('OSAC-101')
    expect(wrapper.text()).toContain('OSAC-102')
  })

  it('renders progress, blocker count, and issue count from the epic\'s own issues', () => {
    const wrapper = mount(EpicBreakdown, { props: { epics: [makeEpic()] } })

    // 1 of 3 issues done -> 33%
    expect(wrapper.text()).toContain('33%')
    expect(wrapper.text()).toContain('1') // done count
    expect(wrapper.text()).toContain('1 Blocked')
  })

  it('labels Jira child status separately from execution and readiness', () => {
    const wrapper = mount(EpicBreakdown, {
      props: {
        showProvenance: true,
        epics: [makeEpic({
          jiraStatusProgress: true,
          issueStatusCoverage: 'complete',
          blockedCoverage: 'unavailable',
          issues: [
            { key: 'EDM-201', status: 'Closed', statusCategory: 'Done' },
            { key: 'EDM-202', status: 'To Do', statusCategory: 'To Do' }
          ]
        })]
      }
    })

    expect(wrapper.text()).toContain('1/2 Jira Done')
    expect(wrapper.text()).toContain('Jira child status only; this does not measure pipeline execution or release readiness.')
    expect(wrapper.text()).toContain('Blocked: Unknown')
    expect(wrapper.text()).not.toContain('50%')
  })

  it('does not calculate Jira status percentages when child status coverage is partial', () => {
    const wrapper = mount(EpicBreakdown, {
      props: {
        epics: [makeEpic({
          jiraStatusProgress: true,
          issueStatusCoverage: 'partial',
          blockedCoverage: 'unavailable',
          issues: [
            { key: 'EDM-201', status: 'Review', statusCategory: null }
          ]
        })]
      }
    })

    expect(wrapper.text()).toContain('Jira child statuses are partial')
    expect(wrapper.text()).toContain('1 observed status Unknown.')
    expect(wrapper.text()).toContain('Blocked: Unknown')
    expect(wrapper.text()).not.toMatch(/\b\d+%/)
  })

  it('shows no Jira child issues instead of a zero-percent progress bar', () => {
    const wrapper = mount(EpicBreakdown, {
      props: {
        epics: [makeEpic({ jiraStatusProgress: true, issueStatusCoverage: 'complete', issues: [] })]
      }
    })

    expect(wrapper.text()).toContain('No Jira child issues.')
    expect(wrapper.text()).not.toMatch(/\b\d+%/)
  })

  it('does not show provenance info by default (existing Feature Detail behavior unchanged)', () => {
    const wrapper = mount(EpicBreakdown, {
      props: {
        epics: [makeEpic({ fixVersions: ['0.4'], fixVersionSource: 'direct', parentFeatureKey: 'OSAC-100' })]
      }
    })

    expect(wrapper.text()).not.toContain('Fix Version')
    expect(wrapper.text()).not.toContain('Parent Feature')
  })

  it('shows a direct Fix Version with no inherited badge when showProvenance is on', () => {
    const wrapper = mount(EpicBreakdown, {
      props: {
        showProvenance: true,
        epics: [makeEpic({ fixVersions: ['0.4'], fixVersionSource: 'direct' })]
      }
    })

    expect(wrapper.text()).toContain('0.4')
    expect(wrapper.text()).not.toContain('inherited from Feature')
  })

  it('visibly tags a via-parent-feature Fix Version as inherited, never as epic-owned', () => {
    const wrapper = mount(EpicBreakdown, {
      props: {
        showProvenance: true,
        epics: [makeEpic({ fixVersions: ['0.9'], fixVersionSource: 'via-parent-feature' })]
      }
    })

    expect(wrapper.text()).toContain('0.9')
    expect(wrapper.text()).toContain('inherited from Feature')
  })

  it('shows Fix Version as honestly Unknown, not blank or fabricated', () => {
    const wrapper = mount(EpicBreakdown, {
      props: {
        showProvenance: true,
        epics: [makeEpic({ fixVersions: [], fixVersionSource: 'unknown' })]
      }
    })

    expect(wrapper.text()).toContain('Unknown')
  })

  it('tags inherited Components distinctly from direct Components', () => {
    const wrapper = mount(EpicBreakdown, {
      props: {
        showProvenance: true,
        epics: [makeEpic({ components: ['Comp A'], componentSource: 'via-parent-feature' })]
      }
    })

    expect(wrapper.text()).toContain('Comp A')
    expect(wrapper.text()).toContain('components inherited')
  })

  it('shows the parent Feature key when showProvenance is on', () => {
    const wrapper = mount(EpicBreakdown, {
      props: {
        showProvenance: true,
        epics: [makeEpic({ parentFeatureKey: 'OSAC-100' })]
      }
    })

    expect(wrapper.text()).toContain('Parent Feature')
    expect(wrapper.text()).toContain('OSAC-100')
  })
})

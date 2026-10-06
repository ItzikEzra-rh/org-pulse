import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ProjectHygieneBoard from '../../../client/execute/components/hygiene/ProjectHygieneBoard.vue'

function makeHygiene() {
  return {
    state: 'supported',
    freshness: 'unknown',
    partial: true,
    sourceRefs: {
      jiraIssues: { freshness: 'fresh', partial: false, generatedAt: '2026-10-06T07:00:00Z' },
      releaseRegistry: { freshness: 'unknown', partial: false, generatedAt: '2026-10-06T08:00:00Z' }
    },
    summary: {
      totalUniqueIssueCount: 2,
      attributedUniqueIssueCount: 1,
      unattributedUniqueIssueCount: 1,
      unmatchedFixVersionIssueCount: 0
    },
    unattributedIssues: [{ key: 'EDM-9', summary: 'No release', reason: 'no-fix-version' }],
    releases: [
      {
        displayName: 'Flight Control 0.10.0',
        state: 'supported',
        features: [{
          key: 'EDM-1',
          jiraUrl: 'https://redhat.atlassian.net/browse/EDM-1',
          summary: 'Observed Feature',
          status: 'Queued for Triage',
          violations: [{ id: 'component', name: 'Component missing · EDM-2', sourceIssueKey: 'EDM-2' }],
          releaseEvidence: [{ issueKey: 'EDM-2', fixVersion: '0.10.0', source: 'issue-fix-version' }]
        }],
        unassignedFindings: [{ key: 'EDM-3', summary: 'No Feature parent', violations: [{ id: 'priority', name: 'Priority missing' }] }]
      },
      {
        displayName: 'Flight Control 0.10.0-rc1',
        state: 'supported',
        features: [{
          key: 'EDM-1',
          summary: 'Observed Feature',
          status: 'Queued for Triage',
          violations: [{ id: 'component', name: 'Component missing · EDM-2', sourceIssueKey: 'EDM-2' }],
          releaseEvidence: [{ issueKey: 'EDM-2', fixVersion: '0.10.0-rc1', source: 'issue-fix-version' }]
        }],
        unassignedFindings: []
      }
    ]
  }
}

describe('ProjectHygieneBoard', () => {
  it('renders unknown freshness and partial coverage without inventing status lanes', () => {
    const wrapper = mount(ProjectHygieneBoard, {
      props: { hygiene: makeHygiene(), projectName: 'Flight Control', partial: false }
    })

    expect(wrapper.text()).toContain('Evidence is partial')
    expect(wrapper.text()).toContain('freshness unknown')
    expect(wrapper.text()).toContain('Queued for Triage')
    expect(wrapper.text()).not.toContain('Backlog')
    expect(wrapper.text()).toContain('Release findings without a Feature ancestor')
    expect(wrapper.text()).toContain('Findings without a release assignment (1)')
    expect(wrapper.findAll('article').length).toBeGreaterThan(1)
  })

  it('deduplicates the same Feature across releases and includes traceable Fix Version evidence', () => {
    const wrapper = mount(ProjectHygieneBoard, {
      props: { hygiene: makeHygiene(), projectName: 'Flight Control' }
    })

    expect(wrapper.text()).toContain('Features: 1')
    expect(wrapper.text()).toContain('0.10.0, 0.10.0-rc1')
    expect(wrapper.find('a[href="https://redhat.atlassian.net/browse/EDM-1"]').exists()).toBe(true)
  })
})

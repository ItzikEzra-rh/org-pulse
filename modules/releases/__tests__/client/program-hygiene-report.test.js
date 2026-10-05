import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: vi.fn()
}))

import { apiRequest } from '@shared/client/services/api.js'
import ProgramHygieneReport from '../../client/reports/ProgramHygieneReport.vue'
import HygieneSelect from '../../client/execute/components/hygiene/HygieneSelect.vue'

function makeIssue(overrides = {}) {
  return {
    key: 'OSAC-1',
    summary: 'Some summary',
    issueType: 'Feature',
    status: 'In Progress',
    assignee: 'Alice',
    parentKey: null,
    fixVersions: [],
    components: ['Core'],
    team: 'Platform',
    jiraUrl: 'https://redhat.atlassian.net/browse/OSAC-1',
    ...overrides
  }
}

function sampleResults(projectOverrides = {}) {
  const rules = [
    {
      id: 'no-team',
      name: 'Open issue without Team',
      description: 'All issues that are not Done should have a Team assigned.',
      category: 'ownership',
      count: 2,
      issues: [
        makeIssue({ key: 'OSAC-1', team: null, components: ['Core'], jiraUrl: 'https://redhat.atlassian.net/browse/OSAC-1' }),
        makeIssue({ key: 'OSAC-2', team: 'Platform', components: ['Core', 'API'], jiraUrl: 'https://redhat.atlassian.net/browse/OSAC-2' })
      ]
    },
    {
      id: 'no-component',
      name: 'Open issue without Component',
      description: 'All issues that are not Done should have at least one Component.',
      category: 'classification',
      count: 2,
      issues: [
        makeIssue({ key: 'OSAC-2', team: 'Platform', components: ['Core', 'API'], jiraUrl: 'https://redhat.atlassian.net/browse/OSAC-2' }),
        makeIssue({ key: 'OSAC-3', team: 'Data', issueType: 'Bug', components: [], jiraUrl: 'https://redhat.atlassian.net/browse/OSAC-3' })
      ]
    },
    { id: 'zero-rule', name: 'Zero Match Rule', description: 'Never matches in this fixture.', category: 'lifecycle', count: 0, issues: [] },
    { id: 'failed-rule', name: 'Failed Rule', description: 'Query failed during collection.', category: 'lifecycle', count: -1, issues: [] }
  ]
  const project = {
    projectKey: 'OSAC',
    displayName: 'OSAC',
    jiraBaseUrl: 'https://redhat.atlassian.net',
    partial: true,
    errors: [{ ruleId: 'failed-rule', message: 'Jira query timed out' }],
    summary: {
      uniqueIssueCount: 3,
      totalRuleMatches: 4,
      affectedRuleCount: 2,
      failedRuleCount: 1,
      generatedAt: '2026-08-09T00:00:00Z'
    },
    rules
  }
  const selectedProject = { ...project, ...projectOverrides }
  const selectedRules = selectedProject.rules || []
  const configRules = selectedRules.map(rule => ({ ...rule, enabled: true, disabledReason: null, jql: `project = OSAC AND ${rule.id}` }))
  return {
    schemaVersion: 1,
    projectId: 'osac',
    profileRevision: 'profile-osac-test',
    artifactKey: 'sources/jira-hygiene/registry.json',
    generatedAt: '2026-08-09T00:00:00Z',
    fetchedAt: '2026-08-09T00:00:00Z',
    source: { id: 'jira-hygiene', kind: 'jira', revision: 'abc123' },
    freshness: 'fresh',
    state: 'supported',
    partial: selectedProject.partial,
    configuredRuleIds: selectedRules.map(rule => rule.id),
    evaluatedRuleIds: selectedRules.map(rule => rule.id),
    collectionFailure: null,
    configuration: {
      projectId: 'osac',
      profileRevision: 'profile-osac-test',
      projectKey: 'OSAC',
      displayName: 'OSAC',
      jiraBaseUrl: 'https://redhat.atlassian.net',
      configRevision: 'abc123',
      enabledRuleIds: selectedRules.map(rule => rule.id),
      fieldMappings: { team: 'customfield_10001' },
      rules: configRules
    },
    results: { OSAC: selectedProject }
  }
}

function sampleEdmResults(overrides = {}) {
  const disabledRules = [
    ['in-progress-no-fix-version', 'In Progress Feature/Epic without Fix Version', 'Pending Flight Control owner confirmation that active Features and Epics require a release assignment.'],
    ['epic-no-parent-feature', 'Open Epic without parent Feature', 'Pending Flight Control hierarchy policy confirmation for Epic parent requirements.'],
    ['no-component', 'Open issue without Component', 'Pending Flight Control classification policy confirmation for Jira Components.'],
    ['no-team', 'Open issue without Team', 'Pending Flight Control Team-field mapping and ownership policy confirmation; the collector does not request a Team field.']
  ].map(([id, name, disabledReason]) => ({ id, name, description: name, category: 'policy', enabled: false, disabledReason, jql: null, fields: null }))
  const enabledRule = {
    id: 'in-progress-no-assignee',
    name: 'In Progress issue without Assignee',
    description: 'All In Progress issues must have an assignee.',
    category: 'ownership',
    enabled: true,
    disabledReason: null,
    jql: 'project = EDM AND statusCategory = "In Progress" AND assignee is EMPTY'
  }
  const data = {
    projectKey: 'EDM',
    displayName: 'Flight Control',
    jiraBaseUrl: 'https://redhat.atlassian.net',
    partial: false,
    errors: [],
    summary: { uniqueIssueCount: 1, totalRuleMatches: 1, affectedRuleCount: 1, failedRuleCount: 0, generatedAt: '2026-10-05T10:00:00Z' },
    rules: [{
      id: enabledRule.id,
      name: enabledRule.name,
      description: enabledRule.description,
      category: enabledRule.category,
      count: 1,
      issues: [{ key: 'EDM-1', summary: 'Unassigned Flight Control issue', issueType: 'Feature', status: 'Active', assignee: null, components: [], jiraUrl: 'https://redhat.atlassian.net/browse/EDM-1' }]
    }]
  }
  return {
    schemaVersion: 1,
    projectId: 'flightctl',
    profileRevision: 'profile-flightctl-test',
    artifactKey: 'sources/jira-hygiene/registry.json',
    generatedAt: '2026-10-05T10:00:00Z',
    fetchedAt: '2026-10-05T10:00:00Z',
    source: { id: 'jira-hygiene', kind: 'jira', revision: 'edm-config-test' },
    freshness: 'fresh',
    state: 'supported',
    partial: false,
    collectionFailure: null,
    configuration: {
      projectId: 'flightctl',
      profileRevision: 'profile-flightctl-test',
      projectKey: 'EDM',
      displayName: 'Flight Control',
      jiraBaseUrl: 'https://redhat.atlassian.net',
      configRevision: 'edm-config-test',
      enabledRuleIds: [enabledRule.id],
      fieldMappings: {},
      rules: [enabledRule, ...disabledRules]
    },
    results: { EDM: { ...data, ...overrides } }
  }
}

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  err.data = { error: message }
  return err
}

function findCardByName(wrapper, name) {
  return wrapper.findAll('button[title]').find(b => b.text().includes(name))
}

function setProjectId(projectId) {
  window.location.hash = `#/releases/jira-hygiene?projectId=${projectId}`
  window.dispatchEvent(new Event('urlchange'))
}

describe('ProgramHygieneReport (Jira Hygiene)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setProjectId('osac')
  })

  it('fetches the project-hygiene results endpoint', async () => {
    apiRequest.mockResolvedValue(sampleResults())
    mount(ProgramHygieneReport)
    await flushPromises()
    expect(apiRequest).toHaveBeenCalledWith('/modules/releases/hygiene/project-hygiene?projectId=osac')
    expect(apiRequest).not.toHaveBeenCalledWith(expect.stringContaining('/program-report'))
  })

  it('shows a loading state before the request resolves', () => {
    apiRequest.mockReturnValue(new Promise(() => {}))
    const wrapper = mount(ProgramHygieneReport)
    expect(wrapper.text()).toContain('Loading hygiene report')
  })

  it('shows a not-published explanation on 404', async () => {
    apiRequest.mockRejectedValue(httpError(404, 'Project hygiene data has not been published yet'))
    const wrapper = mount(ProgramHygieneReport)
    await flushPromises()
    expect(wrapper.text()).toContain('Project hygiene data has not been published yet')
  })

  it('shows a non-destructive unavailable state with retry on other failures', async () => {
    apiRequest.mockRejectedValue(httpError(503, 'Project hygiene data is temporarily unavailable'))
    const wrapper = mount(ProgramHygieneReport)
    await flushPromises()
    expect(wrapper.text()).toContain('Project hygiene data is temporarily unavailable')
    expect(wrapper.find('button').exists()).toBe(true)
  })

  it('switches the report between OSAC and EDM without retaining the previous project rows', async () => {
    setProjectId('flightctl')
    apiRequest.mockImplementation((url) => url.includes('projectId=flightctl')
      ? Promise.resolve(sampleEdmResults())
      : Promise.resolve(sampleResults()))

    const wrapper = mount(ProgramHygieneReport)
    await flushPromises()

    expect(apiRequest).toHaveBeenCalledWith('/modules/releases/hygiene/project-hygiene?projectId=flightctl')
    expect(wrapper.text()).toContain('Flight Control')
    expect(wrapper.text()).toContain('EDM-1')
    expect(wrapper.text()).not.toContain('OSAC-1')
    expect(wrapper.text()).toContain('Rules disabled pending policy confirmation')

    setProjectId('osac')
    await flushPromises()

    expect(apiRequest).toHaveBeenCalledWith('/modules/releases/hygiene/project-hygiene?projectId=osac')
    expect(wrapper.text()).toContain('OSAC-1')
  })

  it('ignores a slow OSAC response after switching to Flight Control', async () => {
    let resolveOsac
    apiRequest.mockImplementation(url => url.includes('projectId=osac')
      ? new Promise(resolve => { resolveOsac = resolve })
      : Promise.resolve(sampleEdmResults()))
    const wrapper = mount(ProgramHygieneReport)
    setProjectId('flightctl')
    await flushPromises()

    expect(wrapper.text()).toContain('EDM-1')
    resolveOsac(sampleResults())
    await flushPromises()
    expect(wrapper.text()).toContain('EDM-1')
    expect(wrapper.text()).not.toContain('OSAC-1')
  })

  it('does not show Team controls or fabricate an Unassigned team for EDM', async () => {
    apiRequest.mockResolvedValue(sampleEdmResults())
    setProjectId('flightctl')
    const wrapper = mount(ProgramHygieneReport)
    await flushPromises()

    expect(wrapper.text()).toContain('EDM-1')
    expect(wrapper.text()).not.toContain('Team Accountability')
    expect(wrapper.text()).not.toContain('Violations by Team')
    expect(wrapper.findAllComponents(HygieneSelect).some(select => select.props('placeholder') === 'Team')).toBe(false)
    expect(wrapper.findAll('th').map(th => th.text())).not.toContain('Team')
    expect(sampleEdmResults().results.EDM.rules[0].issues[0]).not.toHaveProperty('team')
    expect(wrapper.text()).toContain('Pending Flight Control Team-field mapping and ownership policy confirmation')
  })

  it('shows the source freshness state supplied by the publication envelope', async () => {
    const contract = sampleEdmResults()
    contract.freshness = 'stale'
    apiRequest.mockResolvedValue(contract)
    setProjectId('flightctl')
    const wrapper = mount(ProgramHygieneReport)
    await flushPromises()
    expect(wrapper.text()).toContain('Stale')
  })

  it('distinguishes successful empty results from unavailable collection', async () => {
    const empty = sampleEdmResults()
    empty.state = 'empty'
    empty.results.EDM.rules[0].count = 0
    empty.results.EDM.rules[0].issues = []
    empty.results.EDM.summary = { uniqueIssueCount: 0, totalRuleMatches: 0, affectedRuleCount: 0, failedRuleCount: 0, generatedAt: empty.generatedAt }
    apiRequest.mockResolvedValue(empty)
    setProjectId('flightctl')
    const wrapper = mount(ProgramHygieneReport)
    await flushPromises()
    expect(wrapper.find('[data-testid="hygiene-empty-results"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('No issues matched the enabled rules.')
  })

  it('shows an empty-rules state when the project has no rules configured', async () => {
    apiRequest.mockResolvedValue(sampleResults({ rules: [], partial: false, errors: [], summary: { uniqueIssueCount: 0, totalRuleMatches: 0, affectedRuleCount: 0, failedRuleCount: 0, generatedAt: '2026-08-09T00:00:00Z' } }))
    const wrapper = mount(ProgramHygieneReport)
    await flushPromises()
    expect(wrapper.text()).toContain('No hygiene rules are configured for this project.')
  })

  it('renders one card per rule dynamically, not a fixed five-card layout', async () => {
    apiRequest.mockResolvedValue(sampleResults())
    const wrapper = mount(ProgramHygieneReport)
    await flushPromises()
    const cards = wrapper.findAll('button[title]')
    expect(cards.length).toBe(4)
  })

  it('distinguishes zero, nonzero, and failed rule states without arbitrary thresholds', async () => {
    apiRequest.mockResolvedValue(sampleResults())
    const wrapper = mount(ProgramHygieneReport)
    await flushPromises()

    const zeroCard = findCardByName(wrapper, 'Zero Match Rule')
    expect(zeroCard.text()).toContain('0')

    const nonzeroCard = findCardByName(wrapper, 'Open issue without Team')
    expect(nonzeroCard.text()).toContain('2')

    const failedCard = findCardByName(wrapper, 'Failed Rule')
    expect(failedCard.text()).toContain('—')
    expect(failedCard.text()).toContain('Collection failed')
  })

  it('shows uniqueIssueCount and totalRuleMatches as distinct labeled metrics', async () => {
    apiRequest.mockResolvedValue(sampleResults())
    const wrapper = mount(ProgramHygieneReport)
    await flushPromises()
    expect(wrapper.text()).toContain('Unique Affected Issues')
    expect(wrapper.text()).toContain('Total Rule Matches')
    expect(wrapper.text()).toContain('Rules with Matches')
    expect(wrapper.text()).toContain('Rules Failed')
  })

  it('renders a partial-failure banner listing the failed rule and its error message', async () => {
    apiRequest.mockResolvedValue(sampleResults())
    const wrapper = mount(ProgramHygieneReport)
    await flushPromises()
    expect(wrapper.text()).toContain('Some hygiene rules could not be collected')
    expect(wrapper.text()).toContain('Failed Rule')
    expect(wrapper.text()).toContain('Jira query timed out')
  })

  it('deduplicates an issue matched by multiple rules into a single row with aggregated rule badges', async () => {
    apiRequest.mockResolvedValue(sampleResults())
    const wrapper = mount(ProgramHygieneReport)
    await flushPromises()

    const rows = wrapper.findAll('tbody tr')
    expect(rows.length).toBe(3) // OSAC-1, OSAC-2, OSAC-3 — never 4

    const osac2Row = rows.find(r => r.text().includes('OSAC-2'))
    expect(osac2Row.text()).toContain('Open issue without Team')
    expect(osac2Row.text()).toContain('Open issue without Component')
  })

  it('uses the contract-provided jiraUrl for issue links, not a reconstructed URL', async () => {
    apiRequest.mockResolvedValue(sampleResults())
    const wrapper = mount(ProgramHygieneReport)
    await flushPromises()
    const link = wrapper.findAll('a').find(a => a.text() === 'OSAC-2')
    expect(link.attributes('href')).toBe('https://redhat.atlassian.net/browse/OSAC-2')
  })

  it('clicking a rule card filters the Issues table to unique issues matching that rule', async () => {
    apiRequest.mockResolvedValue(sampleResults())
    const wrapper = mount(ProgramHygieneReport)
    await flushPromises()

    const card = findCardByName(wrapper, 'Open issue without Team')
    await card.trigger('click')

    const rows = wrapper.findAll('tbody tr')
    expect(rows.length).toBe(2) // OSAC-1, OSAC-2
    expect(wrapper.text()).not.toContain('OSAC-3')

    // Toggle off on second click
    await card.trigger('click')
    expect(wrapper.findAll('tbody tr').length).toBe(3)
  })

  it('filters the deduplicated issue set by team, component, and issue type', async () => {
    apiRequest.mockResolvedValue(sampleResults())
    const wrapper = mount(ProgramHygieneReport)
    await flushPromises()

    const selects = wrapper.findAllComponents(HygieneSelect)
    const teamSelect = selects[0]
    await teamSelect.vm.$emit('update:modelValue', ['Data'])
    await flushPromises()

    let rows = wrapper.findAll('tbody tr')
    expect(rows.length).toBe(1)
    expect(rows[0].text()).toContain('OSAC-3')

    await teamSelect.vm.$emit('update:modelValue', [])

    const issueTypeSelect = selects[2]
    await issueTypeSelect.vm.$emit('update:modelValue', ['Bug'])
    await flushPromises()
    rows = wrapper.findAll('tbody tr')
    expect(rows.length).toBe(1)
    expect(rows[0].text()).toContain('OSAC-3')
  })

  it('exposes an Unassigned option in the Team filter for issues with no team', async () => {
    apiRequest.mockResolvedValue(sampleResults())
    const wrapper = mount(ProgramHygieneReport)
    await flushPromises()

    const teamSelect = wrapper.findAllComponents(HygieneSelect)[0]
    expect(teamSelect.props('options')).toEqual(expect.arrayContaining(['Platform', 'Data', 'Unassigned']))
  })

  it('selecting the Unassigned team filter shows only issues with no team', async () => {
    apiRequest.mockResolvedValue(sampleResults())
    const wrapper = mount(ProgramHygieneReport)
    await flushPromises()

    const teamSelect = wrapper.findAllComponents(HygieneSelect)[0]
    await teamSelect.vm.$emit('update:modelValue', ['Unassigned'])
    await flushPromises()

    const rows = wrapper.findAll('tbody tr')
    expect(rows.length).toBe(1)
    expect(rows[0].text()).toContain('OSAC-1')
  })

  it('surfaces a brand-new team value from the data automatically, with no hardcoded team list', async () => {
    apiRequest.mockResolvedValue(sampleResults({
      rules: [{
        id: 'no-team',
        name: 'Open issue without Team',
        description: 'All issues that are not Done should have a Team assigned.',
        category: 'ownership',
        count: 1,
        issues: [makeIssue({ key: 'OSAC-9', team: 'Quasar Squad', jiraUrl: 'https://redhat.atlassian.net/browse/OSAC-9' })]
      }],
      partial: false,
      errors: [],
      summary: { uniqueIssueCount: 1, totalRuleMatches: 1, affectedRuleCount: 1, failedRuleCount: 0, generatedAt: '2026-08-09T00:00:00Z' }
    }))
    const wrapper = mount(ProgramHygieneReport)
    await flushPromises()

    const teamSelect = wrapper.findAllComponents(HygieneSelect)[0]
    expect(teamSelect.props('options')).toEqual(['Quasar Squad'])
  })

  it('paginates the issue table client-side over the full deduplicated set', async () => {
    const issues = []
    for (let i = 0; i < 80; i++) {
      issues.push(makeIssue({ key: `OSAC-${100 + i}`, jiraUrl: `https://redhat.atlassian.net/browse/OSAC-${100 + i}` }))
    }
    apiRequest.mockResolvedValue(sampleResults({
      rules: [{ id: 'big-rule', name: 'Big Rule', description: 'd', category: 'ownership', count: 80, issues }],
      partial: false,
      errors: [],
      summary: { uniqueIssueCount: 80, totalRuleMatches: 80, affectedRuleCount: 1, failedRuleCount: 0, generatedAt: '2026-08-09T00:00:00Z' }
    }))
    const wrapper = mount(ProgramHygieneReport)
    await flushPromises()

    expect(wrapper.findAll('tbody tr').length).toBe(75)
    expect(wrapper.text()).toContain('Page 1 of 2')

    const nextButton = wrapper.findAll('button').find(b => b.text() === 'Next')
    await nextButton.trigger('click')
    await flushPromises()

    expect(wrapper.findAll('tbody tr').length).toBe(5)
  })

  it('clamps the current page when the filtered set shrinks below it, instead of rendering a blank page', async () => {
    const issues = []
    for (let i = 0; i < 78; i++) {
      issues.push(makeIssue({ key: `OSAC-${200 + i}`, team: 'Platform', jiraUrl: `https://redhat.atlassian.net/browse/OSAC-${200 + i}` }))
    }
    issues.push(makeIssue({ key: 'OSAC-300', team: 'Data', jiraUrl: 'https://redhat.atlassian.net/browse/OSAC-300' }))
    issues.push(makeIssue({ key: 'OSAC-301', team: 'Data', jiraUrl: 'https://redhat.atlassian.net/browse/OSAC-301' }))

    apiRequest.mockResolvedValue(sampleResults({
      rules: [{ id: 'big-rule', name: 'Big Rule', description: 'd', category: 'ownership', count: 80, issues }],
      partial: false,
      errors: [],
      summary: { uniqueIssueCount: 80, totalRuleMatches: 80, affectedRuleCount: 1, failedRuleCount: 0, generatedAt: '2026-08-09T00:00:00Z' }
    }))
    const wrapper = mount(ProgramHygieneReport)
    await flushPromises()

    // Move to page 2 of the unfiltered 80-issue set
    const nextButton = wrapper.findAll('button').find(b => b.text() === 'Next')
    await nextButton.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Page 2 of 2')

    // Filtering down to the 2 "Data" team issues shrinks totalPages to 1 while
    // currentPage is still 2. This regression-tests the end-user-visible
    // invariant (never show a page past the available range, or render a
    // spuriously blank table) that both the pre-existing filter-reset watcher
    // and the totalPages clamp watcher are jointly responsible for keeping true.
    const teamSelect = wrapper.findAllComponents(HygieneSelect)[0]
    await teamSelect.vm.$emit('update:modelValue', ['Data'])
    await flushPromises()

    const rows = wrapper.findAll('tbody tr')
    expect(rows.length).toBe(2)
    expect(rows.map(r => r.text()).join(' ')).toContain('OSAC-300')
    expect(wrapper.text()).not.toContain('Page 2 of')
  })

  it('counts unique affected issues per team in the Violations by Team chart, not raw rule matches', async () => {
    apiRequest.mockResolvedValue(sampleResults())
    const wrapper = mount(ProgramHygieneReport)
    await flushPromises()

    // Platform team is matched by both no-team and no-component via OSAC-2, but should count once
    const chartSection = wrapper.findAll('h3').find(h => h.text() === 'Violations by Team').element.parentElement
    expect(chartSection.textContent).toContain('Platform')
    // Platform's unique count (1) should appear as the count next to the bar
    const platformRow = [...chartSection.querySelectorAll('div')].find(el => el.textContent.trim() === 'Platform')
    const countSpan = platformRow.parentElement.querySelector('span.text-sm')
    expect(countSpan.textContent.trim()).toBe('1')
  })

  it('computes Team Accountability totals unique by issue key while per-rule columns count matches independently', async () => {
    apiRequest.mockResolvedValue(sampleResults())
    const wrapper = mount(ProgramHygieneReport)
    await flushPromises()

    await wrapper.findAll('button').find(b => b.text() === 'Team Accountability').trigger('click')

    const rows = wrapper.findAll('tbody tr')
    const platformRow = rows.find(r => r.text().includes('Platform'))
    const cells = platformRow.findAll('td')
    // Team | Affected Issues | no-team | no-component | zero-rule | failed-rule
    expect(cells[1].text()).toBe('1') // unique: OSAC-2 counted once despite matching 2 rules
    expect(cells[2].text()).toBe('1') // no-team column: OSAC-2 matched
    expect(cells[3].text()).toBe('1') // no-component column: OSAC-2 matched
    expect(cells[5].text()).toBe('—') // failed-rule column: unknown, not zero
  })

  it('does not silently render the first project when multiple projects are present', async () => {
    apiRequest.mockResolvedValue({
      schemaVersion: 1,
      projectId: 'osac',
      generatedAt: '2026-08-09T00:00:00Z',
      source: 'jira-dashboard-26582',
      configVersion: 'abc123',
      results: {
        OSAC: sampleResults().results.OSAC,
        RHOAIENG: { ...sampleResults().results.OSAC, projectKey: 'RHOAIENG', displayName: 'RHOAI Engineering' }
      }
    })
    const wrapper = mount(ProgramHygieneReport)
    await flushPromises()

    expect(wrapper.text()).toContain('project selection is not supported')
    expect(wrapper.find('table').exists()).toBe(false)
  })

  it('renders arbitrary project/rule data generically, with no hardcoded OSAC or rule IDs', async () => {
    apiRequest.mockResolvedValue({
      schemaVersion: 1,
      projectId: 'rhoai-eng',
      generatedAt: '2026-08-09T00:00:00Z',
      source: 'jira-dashboard-99999',
      configVersion: 'xyz',
      results: {
        RHOAIENG: {
          projectKey: 'RHOAIENG',
          displayName: 'RHOAI Engineering',
          jiraBaseUrl: 'https://redhat.atlassian.net',
          partial: false,
          errors: [],
          summary: { uniqueIssueCount: 1, totalRuleMatches: 1, affectedRuleCount: 1, failedRuleCount: 0, generatedAt: '2026-08-09T00:00:00Z' },
          rules: [{
            id: 'custom-rule-x',
            name: 'Custom Ruleset Check',
            description: 'A totally different rule.',
            category: 'custom-cat',
            count: 1,
            issues: [makeIssue({ key: 'RHOAIENG-1', jiraUrl: 'https://redhat.atlassian.net/browse/RHOAIENG-1' })]
          }]
        }
      }
    })
    setProjectId('rhoai-eng')
    const wrapper = mount(ProgramHygieneReport)
    await flushPromises()
    expect(wrapper.text()).toContain('RHOAI Engineering')
    expect(wrapper.text()).toContain('Custom Ruleset Check')
    expect(wrapper.text()).toContain('Custom-cat')
    expect(wrapper.text()).not.toContain('OSAC')
  })
})

import { describe, it, expect } from 'vitest'
import {
  UNASSIGNED_COMPONENT,
  UNKNOWN_STATUS,
  UNASSIGNED_TEAM,
  UNASSIGNED_ASSIGNEE,
  collectComponentOptions,
  collectStatusOptions,
  collectTeamOptions,
  collectAssigneeOptions,
  matchesComponents,
  matchesStatus,
  matchesTeam,
  matchesAssignee,
  useComponentStatusFilter
} from '../../../client/execute/composables/useComponentStatusFilter'

describe('collectComponentOptions', () => {
  it('sorts real component names and appends the Unassigned sentinel last', () => {
    const items = [{ components: ['Zeta'] }, { components: [] }, { components: ['Alpha', 'Zeta'] }]
    expect(collectComponentOptions(items, i => i.components)).toEqual(['Alpha', 'Zeta', UNASSIGNED_COMPONENT])
  })

  it('omits the sentinel when every item has a component', () => {
    const items = [{ components: ['Alpha'] }]
    expect(collectComponentOptions(items, i => i.components)).toEqual(['Alpha'])
  })
})

describe('collectStatusOptions', () => {
  it('sorts statuses and appends the Unknown sentinel last for missing values', () => {
    const items = [{ status: 'To Do' }, { status: null }, { status: 'Done' }]
    expect(collectStatusOptions(items, i => i.status)).toEqual(['Done', 'To Do', UNKNOWN_STATUS])
  })
})

describe('matchesComponents', () => {
  it('matches when no filter is selected', () => {
    expect(matchesComponents(['Alpha'], [])).toBe(true)
    expect(matchesComponents([], [])).toBe(true)
  })

  it('matches a multi-component item when ANY selected component overlaps (OR semantics)', () => {
    expect(matchesComponents(['Alpha', 'Beta'], ['Beta', 'Gamma'])).toBe(true)
  })

  it('rejects when none of the components overlap', () => {
    expect(matchesComponents(['Alpha'], ['Gamma'])).toBe(false)
  })

  it('matches missing/empty components only via the Unassigned sentinel', () => {
    expect(matchesComponents([], [UNASSIGNED_COMPONENT])).toBe(true)
    expect(matchesComponents(null, [UNASSIGNED_COMPONENT])).toBe(true)
    expect(matchesComponents([], ['Alpha'])).toBe(false)
  })
})

describe('matchesStatus', () => {
  it('matches when no filter is selected', () => {
    expect(matchesStatus('Done', [])).toBe(true)
  })

  it('matches a missing status only via the Unknown sentinel', () => {
    expect(matchesStatus(null, [UNKNOWN_STATUS])).toBe(true)
    expect(matchesStatus('', [UNKNOWN_STATUS])).toBe(true)
    expect(matchesStatus(null, ['Done'])).toBe(false)
  })

  it('matches an exact status value', () => {
    expect(matchesStatus('Done', ['Done', 'To Do'])).toBe(true)
    expect(matchesStatus('Review', ['Done'])).toBe(false)
  })
})

describe('collectTeamOptions', () => {
  it('sorts real team names and appends the Unassigned sentinel last', () => {
    const items = [{ team: 'OSAC-VMaaS' }, { team: null }, { team: 'OSAC-Core' }]
    expect(collectTeamOptions(items, i => i.team)).toEqual(['OSAC-Core', 'OSAC-VMaaS', UNASSIGNED_TEAM])
  })

  it('omits the sentinel when every item has a team', () => {
    const items = [{ team: 'OSAC-Core' }]
    expect(collectTeamOptions(items, i => i.team)).toEqual(['OSAC-Core'])
  })
})

describe('matchesTeam', () => {
  it('matches when no filter is selected', () => {
    expect(matchesTeam('OSAC-Core', [])).toBe(true)
  })

  it('matches a missing team only via the Unassigned sentinel', () => {
    expect(matchesTeam(null, [UNASSIGNED_TEAM])).toBe(true)
    expect(matchesTeam(null, ['OSAC-Core'])).toBe(false)
  })

  it('matches an exact team value', () => {
    expect(matchesTeam('OSAC-Core', ['OSAC-Core', 'OSAC-VMaaS'])).toBe(true)
    expect(matchesTeam('OSAC-Storage', ['OSAC-Core'])).toBe(false)
  })
})

describe('collectAssigneeOptions', () => {
  it('sorts real assignee names and appends the Unassigned sentinel last', () => {
    const items = [{ assignee: 'Dan Manor' }, { assignee: null }, { assignee: 'Alice' }]
    expect(collectAssigneeOptions(items, i => i.assignee)).toEqual(['Alice', 'Dan Manor', UNASSIGNED_ASSIGNEE])
  })

  it('omits the sentinel when every item has an assignee', () => {
    const items = [{ assignee: 'Alice' }]
    expect(collectAssigneeOptions(items, i => i.assignee)).toEqual(['Alice'])
  })
})

describe('matchesAssignee', () => {
  it('matches when no filter is selected', () => {
    expect(matchesAssignee('Alice', [])).toBe(true)
  })

  it('matches a missing assignee only via the Unassigned sentinel', () => {
    expect(matchesAssignee(null, [UNASSIGNED_ASSIGNEE])).toBe(true)
    expect(matchesAssignee(null, ['Alice'])).toBe(false)
  })

  it('matches named assignees (OR semantics) and rejects non-matches', () => {
    expect(matchesAssignee('Alice', ['Alice', 'Bob'])).toBe(true)
    expect(matchesAssignee('Carol', ['Alice', 'Bob'])).toBe(false)
  })

  it('matches a named assignee selected together with Unassigned', () => {
    expect(matchesAssignee('Alice', ['Alice', UNASSIGNED_ASSIGNEE])).toBe(true)
    expect(matchesAssignee(null, ['Alice', UNASSIGNED_ASSIGNEE])).toBe(true)
  })
})

describe('useComponentStatusFilter', () => {
  it('toggles selections independently and reports isFiltered', () => {
    const f = useComponentStatusFilter()
    expect(f.isFiltered.value).toBe(false)

    f.toggleComponent('Alpha')
    expect(f.selectedComponents.value).toEqual(['Alpha'])
    expect(f.isFiltered.value).toBe(true)

    f.toggleStatus('Done')
    expect(f.selectedStatuses.value).toEqual(['Done'])

    f.toggleComponent('Alpha')
    expect(f.selectedComponents.value).toEqual([])
    expect(f.isFiltered.value).toBe(true)

    f.clearFilters()
    expect(f.selectedComponents.value).toEqual([])
    expect(f.selectedStatuses.value).toEqual([])
    expect(f.isFiltered.value).toBe(false)
  })

  it('toggles Team selections and includes them in isFiltered/clearFilters', () => {
    const f = useComponentStatusFilter()

    f.toggleTeam('OSAC-Core')
    expect(f.selectedTeams.value).toEqual(['OSAC-Core'])
    expect(f.isFiltered.value).toBe(true)

    f.clearFilters()
    expect(f.selectedTeams.value).toEqual([])
    expect(f.isFiltered.value).toBe(false)
  })

  it('toggles Assignee selections and includes them in isFiltered/clearFilters', () => {
    const f = useComponentStatusFilter()

    f.toggleAssignee('Alice')
    expect(f.selectedAssignees.value).toEqual(['Alice'])
    expect(f.isFiltered.value).toBe(true)

    f.toggleAssignee(UNASSIGNED_ASSIGNEE)
    expect(f.selectedAssignees.value).toEqual(['Alice', UNASSIGNED_ASSIGNEE])

    f.clearFilters()
    expect(f.selectedAssignees.value).toEqual([])
    expect(f.isFiltered.value).toBe(false)
  })

  it('setAssignees overwrites the Assignee selection outright ("Assigned to me" shortcut)', () => {
    const f = useComponentStatusFilter()

    f.toggleAssignee('Alice')
    f.toggleAssignee('Bob')
    expect(f.selectedAssignees.value).toEqual(['Alice', 'Bob'])

    f.setAssignees(['Carol'])
    expect(f.selectedAssignees.value).toEqual(['Carol'])
    expect(f.selectedComponents.value).toEqual([])
  })
})

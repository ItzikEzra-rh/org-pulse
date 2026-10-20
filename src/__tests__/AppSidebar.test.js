import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AppSidebar from '../components/AppSidebar.vue'

function teamTrackerManifest() {
  return {
    slug: 'team-tracker',
    name: 'Team Tracker',
    icon: 'users',
    disabled: false,
    client: {
      navItems: [
        { id: 'home', label: 'Team Directory', icon: 'Users', default: true },
        { id: 'manager-dashboard', label: 'My Teams', icon: 'LayoutDashboard', requireRole: 'manager', requireCondition: 'in-app-mode' }
      ]
    }
  }
}

function mountSidebar(props) {
  return mount(AppSidebar, {
    props: {
      collapsed: true, // renders nav items without needing to expand the section first
      mobileOpen: false,
      activeModule: 'team-tracker',
      activeViewId: 'home',
      routeParams: {},
      projectId: '',
      user: null,
      isAdmin: false,
      isTeamAdmin: false,
      isManager: false,
      roles: [],
      modules: [],
      builtInManifests: [teamTrackerManifest()],
      titlePrefix: '',
      teamDataSource: '',
      ...props
    }
  })
}

function hasMyTeamsItem(wrapper) {
  return wrapper.find('button[aria-label="My Teams"]').exists()
}

describe('AppSidebar manager-dashboard nav visibility', () => {
  it('shows My Teams for an OSAC manager with in-app team data', () => {
    const wrapper = mountSidebar({ isManager: true, teamDataSource: 'in-app' })
    expect(hasMyTeamsItem(wrapper)).toBe(true)
  })

  it('hides My Teams for an OSAC manager when team data is not in-app', () => {
    const wrapper = mountSidebar({ isManager: true, teamDataSource: 'sheets' })
    expect(hasMyTeamsItem(wrapper)).toBe(false)
  })

  it('hides My Teams for an OSAC non-manager', () => {
    const wrapper = mountSidebar({ isManager: false, teamDataSource: 'in-app' })
    expect(hasMyTeamsItem(wrapper)).toBe(false)
  })

  it('shows My Teams for a verified Flight Control manager regardless of teamDataSource', () => {
    const wrapper = mountSidebar({ projectId: 'flightctl', isManager: true, teamDataSource: '' })
    expect(hasMyTeamsItem(wrapper)).toBe(true)
  })

  it('hides My Teams for a non-manager in Flight Control', () => {
    const wrapper = mountSidebar({ projectId: 'flightctl', isManager: false, teamDataSource: '' })
    expect(hasMyTeamsItem(wrapper)).toBe(false)
  })

  it('shows My Teams for a team-admin in Flight Control even without manager status', () => {
    const wrapper = mountSidebar({ projectId: 'flightctl', isManager: false, isTeamAdmin: true, teamDataSource: '' })
    expect(hasMyTeamsItem(wrapper)).toBe(true)
  })

  it('shows My Teams (read-only Hierarchy Unavailable) for a non-manager in Flight Control when hierarchy is unknown', () => {
    const wrapper = mountSidebar({ projectId: 'flightctl', isManager: false, hierarchyAvailable: false, teamDataSource: '' })
    expect(hasMyTeamsItem(wrapper)).toBe(true)
  })

  it('still hides My Teams for a verified non-manager in Flight Control when hierarchy is available', () => {
    const wrapper = mountSidebar({ projectId: 'flightctl', isManager: false, hierarchyAvailable: true, teamDataSource: '' })
    expect(hasMyTeamsItem(wrapper)).toBe(false)
  })

  it('does not use the hierarchy-unavailable bypass for legacy OSAC (no project selected)', () => {
    const wrapper = mountSidebar({ projectId: '', isManager: false, hierarchyAvailable: false, teamDataSource: 'in-app' })
    expect(hasMyTeamsItem(wrapper)).toBe(false)
  })
})

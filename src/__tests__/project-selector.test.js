/**
 * Shell project selector: the only visible UI addition for multi-project
 * support. Selecting a project sets the projectId hash param; single-project
 * deployments render nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('@shared/client/services/api.js', () => ({
  apiRequest: vi.fn()
}))

import { apiRequest } from '@shared/client/services/api.js'
import ProjectSelector from '../components/ProjectSelector.vue'

function mountSelector(params = {}) {
  const updateParams = vi.fn()
  const wrapper = mount(ProjectSelector, {
    global: {
      provide: {
        moduleNav: {
          updateParams,
          navigateTo: vi.fn(),
          goBack: vi.fn(),
          params: ref(params)
        }
      }
    }
  })
  return { wrapper, updateParams }
}

const twoProjects = { projects: [{ projectId: 'osac', displayName: 'OSAC' }, { projectId: 'flightctl', displayName: 'Flight Control' }] }

describe('ProjectSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a selector only for multi-project deployments', async () => {
    apiRequest.mockResolvedValueOnce(twoProjects)
    const { wrapper } = mountSelector()
    await flushPromises()
    expect(wrapper.find('select#project-selector').exists()).toBe(true)

    apiRequest.mockResolvedValueOnce({ projects: [twoProjects.projects[0]] })
    const single = mountSelector()
    await flushPromises()
    expect(single.wrapper.find('select#project-selector').exists()).toBe(false)
  })

  it('defaults to the first published project when no projectId param exists', async () => {
    apiRequest.mockResolvedValueOnce(twoProjects)
    const { wrapper } = mountSelector()
    await flushPromises()
    expect(wrapper.find('select#project-selector').element.value).toBe('osac')
  })

  it('keeps the explicit current projectId param as the selection', async () => {
    apiRequest.mockResolvedValueOnce(twoProjects)
    const { wrapper } = mountSelector({ projectId: 'flightctl' })
    await flushPromises()
    expect(wrapper.find('select#project-selector').element.value).toBe('flightctl')
  })

  it('sets the projectId param through moduleNav.updateParams on change', async () => {
    apiRequest.mockResolvedValueOnce(twoProjects)
    const { wrapper, updateParams } = mountSelector()
    await flushPromises()
    await wrapper.find('select#project-selector').setValue('flightctl')
    expect(updateParams).toHaveBeenCalledWith({ projectId: 'flightctl' })
    expect(wrapper.find('select#project-selector').element.value).toBe('flightctl')
  })

  it('keeps an unknown projectId visible for 404 handling', async () => {
    apiRequest.mockResolvedValueOnce(twoProjects)
    const { wrapper } = mountSelector({ projectId: 'nonexistent' })
    await flushPromises()
    expect(wrapper.find('select#project-selector').element.value).toBe('nonexistent')
  })
})

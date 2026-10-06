import { EventEmitter } from 'node:events'
import { describe, it, expect, vi } from 'vitest'
import {
  resolveAiCommitsSource,
  fetchAiCommitsPage,
  transformAiCommitsHtml,
  renderAiCommitsStatePage
} from '../../server/ai-commits-source.js'

const OSAC_URL = 'https://ai-commits-scanner-fd01cc.pages.redhat.com/osac/index.html'
const FLIGHTCTL_URL = 'https://ai-commits-scanner-fd01cc.pages.redhat.com/flightctl/index.html'

function makeProjects(overrides = {}) {
  const profiles = {
    osac: {
      projectId: 'osac',
      displayName: 'OSAC',
      sources: [{ id: 'osac-ai', kind: 'ai-provenance', locator: OSAC_URL }]
    },
    flightctl: {
      projectId: 'flightctl',
      displayName: 'Flight Control',
      sources: [{ id: 'flightctl-ai', kind: 'ai-provenance', locator: FLIGHTCTL_URL }]
    },
    ...overrides
  }
  return {
    get: projectId => profiles[projectId] || null,
    list: () => Object.values(profiles)
  }
}

describe('AI Commits scanner project selection', () => {
  it('resolves the scanner URL from the selected Flightctl profile', () => {
    expect(resolveAiCommitsSource(makeProjects(), { projectId: 'flightctl' })).toMatchObject({
      status: 200,
      projectId: 'flightctl',
      displayName: 'Flight Control',
      url: FLIGHTCTL_URL
    })
  })

  it('does not use the OSAC URL for an unknown project', () => {
    expect(resolveAiCommitsSource(makeProjects(), { projectId: 'unknown' })).toMatchObject({
      status: 404,
      error: 'Unknown project'
    })
  })

  it('requires project context when multiple projects are configured', () => {
    expect(resolveAiCommitsSource(makeProjects(), {})).toMatchObject({
      status: 400,
      error: 'projectId is required'
    })
  })

  it('keeps the legacy OSAC scanner in a deployment with no published profiles', () => {
    const projects = { get: () => null, list: () => [] }
    expect(resolveAiCommitsSource(projects, {})).toMatchObject({
      status: 200,
      projectId: 'osac',
      url: OSAC_URL
    })
    expect(resolveAiCommitsSource(projects, { projectId: 'flightctl' })).toMatchObject({
      status: 404,
      error: 'Unknown project'
    })
  })

  it('uses the only published profile when a single-project deployment omits projectId', () => {
    const projects = makeProjects()
    projects.list = () => [projects.get('flightctl')]
    expect(resolveAiCommitsSource(projects, {})).toMatchObject({
      status: 200,
      projectId: 'flightctl',
      url: FLIGHTCTL_URL
    })
  })

  it('keeps the legacy OSAC scanner available for older OSAC profiles only', () => {
    const projects = makeProjects({ osac: { projectId: 'osac', displayName: 'OSAC', sources: [] } })
    expect(resolveAiCommitsSource(projects, { projectId: 'osac' })).toMatchObject({
      status: 200,
      projectId: 'osac',
      url: OSAC_URL
    })
    const flightctl = makeProjects({ flightctl: { projectId: 'flightctl', displayName: 'Flight Control', sources: [] } })
    expect(resolveAiCommitsSource(flightctl, { projectId: 'flightctl' })).toMatchObject({
      status: 200,
      state: 'unavailable',
      projectId: 'flightctl',
      reason: 'ai-commits-scanner-not-configured'
    })
  })

  it('rejects scanner URLs outside the published scanner host', () => {
    const projects = makeProjects({
      flightctl: {
        projectId: 'flightctl',
        displayName: 'Flight Control',
        sources: [{ id: 'flightctl-ai', kind: 'ai-provenance', locator: 'https://example.com/osac/index.html' }]
      }
    })
    expect(resolveAiCommitsSource(projects, { projectId: 'flightctl' })).toMatchObject({
      status: 502,
      error: 'AI Commits scanner URL is not allowed'
    })
  })
})

describe('AI Commits scanner HTML', () => {
  it('sets relative assets to the selected scanner path and keeps Flightctl rows', () => {
    const html = '<html><head></head><body><a href="https://github.com/flightctl/flightctl">repo</a><section><h2>Monthly Trend — Red Hat</h2>Flightctl data</section></body></html>'
    const result = transformAiCommitsHtml(html, FLIGHTCTL_URL, 'flightctl')
    expect(result).toContain('<base href="https://ai-commits-scanner-fd01cc.pages.redhat.com/flightctl/">')
    expect(result).toContain('https://github.com/flightctl/flightctl')
    expect(result).toContain('Flightctl data')
  })

  it('applies the existing OSAC-only scanner cleanup only to OSAC', () => {
    const html = '<html><head></head><body><details><summary><a>rh-ecosystem-edge</a></summary>remove</details><section><h2>Monthly Trend — Red Hat</h2>remove</section></body></html>'
    const result = transformAiCommitsHtml(html, OSAC_URL, 'osac')
    expect(result).not.toContain('rh-ecosystem-edge')
    expect(result).not.toContain('Monthly Trend — Red Hat')
  })

  it('escapes unavailable-state text before rendering it', () => {
    const html = renderAiCommitsStatePage({ title: 'AI Commits <Flight Control>', message: 'source <missing>' })
    expect(html).toContain('AI Commits &lt;Flight Control&gt;')
    expect(html).toContain('source &lt;missing&gt;')
  })
})

describe('AI Commits scanner HTTPS client', () => {
  it('uses Node HTTPS certificate verification defaults', async () => {
    const response = new EventEmitter()
    response.statusCode = 200
    response.headers = {}
    response.resume = vi.fn()

    const request = {
      on: vi.fn().mockReturnThis(),
      setTimeout: vi.fn(),
      destroy: vi.fn()
    }
    const httpsGet = vi.fn((url, callback) => {
      queueMicrotask(() => {
        callback(response)
        response.emit('data', Buffer.from('<html>scanner</html>'))
        response.emit('end')
      })
      return request
    })

    await expect(fetchAiCommitsPage(FLIGHTCTL_URL, { httpsGet })).resolves.toBe('<html>scanner</html>')
    expect(httpsGet).toHaveBeenCalledTimes(1)
    expect(httpsGet.mock.calls[0]).toHaveLength(2)
    expect(httpsGet.mock.calls[0][0]).toBe(FLIGHTCTL_URL)
    expect(httpsGet.mock.calls[0][1]).toEqual(expect.any(Function))
  })
})

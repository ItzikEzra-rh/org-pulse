const https = require('https')
const { resolveProjectSelection } = require('../../../shared/server/project-profile')

const AI_COMMITS_SCANNER_ORIGIN = 'https://ai-commits-scanner-fd01cc.pages.redhat.com'
const LEGACY_OSAC_SCANNER_URL = `${AI_COMMITS_SCANNER_ORIGIN}/osac/index.html`
const MAX_REDIRECTS = 5
const FETCH_TIMEOUT_MS = 15000

function fetchAiCommitsPage(url, { redirectCount = 0, httpsGet = https.get } = {}) {
  return new Promise((resolve, reject) => {
    // Calling https.get without custom TLS options preserves Node's default
    // certificate verification. NODE_EXTRA_CA_CERTS, when configured for the
    // process, adds the deployment's trusted CA chain without disabling checks.
    const req = httpsGet(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirectCount >= MAX_REDIRECTS) return reject(new Error('Too many redirects'))
        const nextUrl = new URL(res.headers.location, url).toString()
        res.resume()
        return resolve(fetchAiCommitsPage(nextUrl, { redirectCount: redirectCount + 1, httpsGet }))
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume()
        return reject(new Error(`Upstream returned ${res.statusCode}`))
      }
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(FETCH_TIMEOUT_MS, () => {
      req.destroy(new Error('Upstream request timed out'))
    })
  })
}

function resolveAiCommitsSource(projects, query) {
  const selection = resolveProjectSelection(projects, query)
  if (selection.status) return { status: selection.status, error: selection.error }

  let profile = selection.profile
  if (!selection.provided) {
    let availableProjects
    try {
      availableProjects = typeof projects?.list === 'function' ? projects.list() : []
    } catch {
      return { status: 503, error: 'Project profiles are unavailable' }
    }
    if (availableProjects.length === 0 && typeof projects?.list === 'function') {
      // Preserve the legacy single-project OSAC deployment while no project
      // profiles have been published. An explicit unknown project still fails
      // closed in resolveProjectSelection above.
      return {
        status: 200,
        projectId: 'osac',
        displayName: 'OSAC',
        url: LEGACY_OSAC_SCANNER_URL
      }
    }
    if (availableProjects.length !== 1) {
      return { status: 400, error: 'projectId is required' }
    }
    profile = availableProjects[0]
  }

  if (!profile) return { status: 503, error: 'Project profile is unavailable' }

  const source = (profile.sources || []).find(entry => entry.kind === 'ai-provenance')
  if (!source?.locator) {
    // Keep the single-project OSAC deployment working while older published
    // profiles are being refreshed. Other projects never inherit this URL.
    if (profile.projectId === 'osac') {
      return { status: 200, projectId: 'osac', displayName: profile.displayName || 'OSAC', url: LEGACY_OSAC_SCANNER_URL }
    }
    return {
      status: 200,
      state: 'unavailable',
      projectId: profile.projectId,
      displayName: profile.displayName || profile.projectId,
      reason: 'ai-commits-scanner-not-configured'
    }
  }

  let scannerUrl
  try {
    scannerUrl = new URL(source.locator)
  } catch {
    return { status: 502, error: 'AI Commits scanner URL is invalid' }
  }

  if (scannerUrl.protocol !== 'https:'
      || scannerUrl.origin !== AI_COMMITS_SCANNER_ORIGIN
      || scannerUrl.username
      || scannerUrl.password) {
    return { status: 502, error: 'AI Commits scanner URL is not allowed' }
  }

  return {
    status: 200,
    projectId: profile.projectId,
    displayName: profile.displayName || profile.projectId,
    url: scannerUrl.toString()
  }
}

function transformAiCommitsHtml(html, scannerUrl, projectId) {
  const baseHref = new URL('.', scannerUrl).href
  let transformed = html.replace(/<head([^>]*)>/, `<head$1><base href="${baseHref}">`)

  transformed = transformed.replace(
    /(<a\s+href="https:\/\/github\.com\/[^"]+")/g,
    '$1 target="_blank" rel="noopener noreferrer"'
  )

  if (projectId === 'osac') {
    transformed = transformed.replace(
      /<details>\s*<summary><a[^>]*>rh-ecosystem-edge<\/a>[\s\S]*?<\/details>/g,
      ''
    )
    transformed = transformed.replace(
      /<section><h2>Monthly Trend — Red Hat<\/h2>[\s\S]*?<\/section>/,
      ''
    )
    transformed = transformed.replace(
      /<tr><td>(?:[^<](?!<\/td>))*rh-ecosystem-edge(?:[^<](?!<\/td>))*<\/td>(?:<td[^>]*>[^<]*<\/td>)*<\/tr>/g,
      ''
    )
  }

  return transformed
}

function renderAiCommitsStatePage({ title, message }) {
  const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character])
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="font-family:system-ui,sans-serif;padding:2rem;color:#374151"><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main></body></html>`
}

module.exports = {
  resolveAiCommitsSource,
  fetchAiCommitsPage,
  transformAiCommitsHtml,
  renderAiCommitsStatePage
}

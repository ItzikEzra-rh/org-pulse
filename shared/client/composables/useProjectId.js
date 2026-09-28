import { ref, watch } from 'vue'

/**
 * Reactive project context from the shell project selector's hash query
 * param (projectId). The selector is the source of truth; an empty value
 * means the deployment has a single project or no explicit context yet.
 */
function readProjectIdFromHash() {
  const raw = window.location.hash || '#/'
  const qIdx = raw.indexOf('?')
  if (qIdx < 0) return ''
  for (const pair of raw.substring(qIdx + 1).split('&')) {
    const eqIdx = pair.indexOf('=')
    const key = eqIdx >= 0 ? pair.substring(0, eqIdx) : pair
    if (decodeURIComponent(key) === 'projectId') {
      const value = eqIdx >= 0 ? pair.substring(eqIdx + 1) : ''
      return decodeURIComponent(value)
    }
  }
  return ''
}

let _projectId = null

export function useProjectId() {
  if (_projectId === null) {
    _projectId = ref(readProjectIdFromHash())
    window.addEventListener('hashchange', () => {
      _projectId.value = readProjectIdFromHash()
    })
  }
  return _projectId
}

export function projectQuery(projectId) {
  return projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
}

export function projectParam(projectId) {
  return projectId ? { projectId } : {}
}

export { watch }

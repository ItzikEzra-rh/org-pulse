import { projectKeyOf } from './readiness'

// Project-scoped Labels-dropdown grouping, keyed by Jira project key (the same
// convention as readiness.js). Labels match by exact name, never by prefix.
const LABEL_CATEGORY_CONFIG_BY_PROJECT_KEY = {
  OSAC: { readinessLabels: ['osac-ui', 'osac-ux'] }
}

// Merges the config of every project key present in `features`, so a mixed or
// unconfigured list falls back to the generic defaults.
export function labelCategoryConfigFor(features) {
  const projectKeys = new Set((features || []).map(f => projectKeyOf(f?.key)).filter(Boolean))
  const readinessLabels = []
  for (const key of projectKeys) {
    readinessLabels.push(...(LABEL_CATEGORY_CONFIG_BY_PROJECT_KEY[key]?.readinessLabels || []))
  }
  return readinessLabels.length > 0 ? { readinessLabels } : {}
}

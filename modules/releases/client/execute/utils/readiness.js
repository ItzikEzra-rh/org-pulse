const GENERIC_PREPARATION_HELP = {
  ready: 'Required preparation is confirmed complete.',
  pending: 'Required preparation is still pending.',
  unknown: 'There isn’t enough information to determine preparation readiness.'
}

// OSAC-specific policy wording; other projects get the generic text instead.
const OSAC_PROJECT_KEY = 'OSAC'
const OSAC_PREPARATION_HELP = {
  ready: 'Required PRD and Design pull requests have been merged.',
  pending: 'Required PRD or Design work is still pending completion and PR merge.',
  unknown: 'Not enough information to confirm whether the required PRD and Design pull requests have been merged.'
}

function projectKeyOf(featureKey) {
  const idx = typeof featureKey === 'string' ? featureKey.indexOf('-') : -1
  return idx > 0 ? featureKey.slice(0, idx) : null
}

// not-applicable has no defined help text.
export function preparationHelpText(readiness, featureKey) {
  const table = projectKeyOf(featureKey) === OSAC_PROJECT_KEY ? OSAC_PREPARATION_HELP : GENERIC_PREPARATION_HELP
  const base = table[readiness]
  return base ? base + ' Preparation is separate from execution progress.' : null
}

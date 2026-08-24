// PRD review rubric versions. The bot's rubric changed from v1 (legacy) to v2
// (current); each assessment is tagged with `rubricVersion` by the data
// pipeline. Render each assessment under its own rubric.
//
// - v1 (legacy):  What / Why / How / Task / Size
// - v2 (current): What / Why / User-Facing Focus / Right-Sized / Testability

export const RUBRICS = {
  v1: {
    version: 'v1',
    keys: ['what', 'why', 'how', 'task', 'size'],
    labels: { what: 'What', why: 'Why', how: 'How', task: 'Task', size: 'Size' },
  },
  v2: {
    version: 'v2',
    keys: ['what', 'why', 'userFacing', 'rightSized', 'testability'],
    labels: {
      what: 'What',
      why: 'Why',
      userFacing: 'User-Facing Focus',
      rightSized: 'Right-Sized',
      testability: 'Testability',
    },
  },
}

// Keys unique to v2 — used to infer the version from an untagged assessment.
const V2_ONLY_KEYS = ['userFacing', 'rightSized', 'testability']

/**
 * Resolve the rubric for an assessment. Prefers the explicit `rubricVersion`
 * tag; falls back to inferring v2 from score keys; defaults to v1.
 * @param {object|null} assessment
 * @returns {{version: string, keys: string[], labels: Record<string,string>}}
 */
export function rubricForAssessment(assessment) {
  const version = assessment?.rubricVersion
  if (version && RUBRICS[version]) return RUBRICS[version]
  const scores = assessment?.scores || {}
  if (V2_ONLY_KEYS.some(k => k in scores)) return RUBRICS.v2
  return RUBRICS.v1
}

/**
 * Resolve the rubric for a version string (v1 fallback).
 * @param {string} version
 */
export function rubricFor(version) {
  return RUBRICS[version] || RUBRICS.v1
}

export function isValidProgressCount(n) {
  return Number.isInteger(n) && n >= 0
}

// Keyed by executionCoverageReason; caption is short card/table wording, detail is the fuller explanation.
const EXECUTION_UNAVAILABLE_REASONS = {
  'preparation-only': {
    caption: 'Only preparation issues found',
    detail: 'The collected issues cover preparation, such as PRD or Design. No execution issues were found to calculate progress.'
  },
  'no-epics': {
    caption: 'No linked epics found',
    detail: 'No linked epics were found in the collected data, so execution progress cannot be calculated.'
  },
  'epics-without-issue-detail': {
    caption: 'Issue details missing',
    detail: 'Some linked epics have no collected issue details, so execution progress cannot be determined.'
  }
}

// `hasOwnProperty` (not `??`) so an explicit `effective* === null` (insufficient-data)
// is distinguished from a legacy payload that predates the effective fields.
function effectiveOrRaw(feature, effectiveKey, rawKey) {
  return Object.prototype.hasOwnProperty.call(feature, effectiveKey) ? feature[effectiveKey] : feature[rawKey]
}

export function effectiveExecutionState(feature) {
  return effectiveOrRaw(feature, 'effectiveExecutionState', 'executionState')
}

export function effectiveExecutionCoverage(feature) {
  return effectiveOrRaw(feature, 'effectiveExecutionCoverage', 'executionCoverage')
}

export function effectiveExecutionCoverageReason(feature) {
  return effectiveOrRaw(feature, 'effectiveExecutionCoverageReason', 'executionCoverageReason')
}

export function effectiveExecutionIssueCount(feature) {
  return effectiveOrRaw(feature, 'effectiveExecutionIssueCount', 'executionIssueCount')
}

export function effectiveDoneExecutionIssueCount(feature) {
  return effectiveOrRaw(feature, 'effectiveDoneExecutionIssueCount', 'doneExecutionIssueCount')
}

const EXECUTION_DATA_UNAVAILABLE = {
  caption: 'Execution data unavailable',
  detail: 'There isn’t enough execution data to calculate progress.'
}

// Reason is producer-owned — never inferred from epicCount/issueCount.
export function executionUnavailableInfo(reason) {
  return EXECUTION_UNAVAILABLE_REASONS[reason] || EXECUTION_DATA_UNAVAILABLE
}

export const PROGRESS_SUPPORTING_TEXT =
  'Excludes identified preparation issues, such as PRD and Design tasks. This does not indicate release readiness.'

export const PROGRESS_HELP_TEXT =
  'Only issues identified as preparation are excluded from this calculation. Other collected issues remain included, even if their type wasn’t confirmed.'

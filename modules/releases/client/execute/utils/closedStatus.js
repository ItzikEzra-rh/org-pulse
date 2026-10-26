// Browser mirror of server/planning/constants.js CLOSED_STATUSES (kept in sync by a parity test);
// the server module is CommonJS and cannot be imported into browser code.
export const CLOSED_STATUSES = ['Closed', 'Done', 'Resolved', 'Cancelled']
const FOLDED_CLOSED_STATUSES = new Set(CLOSED_STATUSES.map(s => s.toLowerCase()))

export function isClosedStatus(status) {
  return typeof status === 'string' && FOLDED_CLOSED_STATUSES.has(status.trim().toLowerCase())
}

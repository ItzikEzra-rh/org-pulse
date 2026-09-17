export const EP_GITHUB_REPO = 'https://github.com/osac-project/enhancement-proposals/pull'

// Single source of truth for the PRD pull-request URL used by Releases and
// AI Impact. Prefer an explicitly stored canonical URL; EP sources provide a
// deterministic fallback when that field is missing.
export function getPrdReviewPrUrl(rfe) {
  if (!rfe || rfe.status === 'No PR') return null
  if (rfe.linkedFeature?.prdPrUrl) return rfe.linkedFeature.prdPrUrl
  if (/^EP-\d+$/i.test(rfe.sourceRfe || '')) {
    return `${EP_GITHUB_REPO}/${rfe.sourceRfe.slice(3)}`
  }
  return null
}

// PRD Review is keyed by an RFE item, not by the feature/Jira key. An EP
// source is an external PRD identifier, unless the feature also carries an
// explicit linked RFE key that can be selected in-app.
export function getPrdReviewNavigationKey(record) {
  if (!record) return null
  if (record.linkedRfeKey) return record.linkedRfeKey
  return /^RHAIRFE-\d+$/i.test(record.sourceRfe || '') ? record.sourceRfe : null
}

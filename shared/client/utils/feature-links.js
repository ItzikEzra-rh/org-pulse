export const EP_GITHUB_REPO = 'https://github.com/osac-project/enhancement-proposals/pull'

/**
 * Resolve the PRD pull-request URL used by Releases and AI Impact.
 * @param {object|null} rfe - RFE or feature link data
 * @returns {string|null} Canonical PRD pull-request URL, if available
 */
export function getPrdReviewPrUrl(rfe) {
  if (!rfe || rfe.status === 'No PR') return null
  if (rfe.linkedFeature?.prdPrUrl) return rfe.linkedFeature.prdPrUrl
  if (/^EP-\d+$/i.test(rfe.sourceRfe || '')) {
    return `${EP_GITHUB_REPO}/${rfe.sourceRfe.slice(3)}`
  }
  return null
}

/**
 * Resolve the RFE key that can be selected by the in-app PRD Review view.
 * @param {object|null} record - Feature or review record
 * @returns {string|null} Valid RFE key, if the record has one
 */
export function getPrdReviewNavigationKey(record) {
  if (!record) return null
  if (/^RHAIRFE-\d+$/i.test(record.linkedRfeKey || '')) return record.linkedRfeKey
  return /^RHAIRFE-\d+$/i.test(record.sourceRfe || '') ? record.sourceRfe : null
}

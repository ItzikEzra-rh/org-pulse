const PULL_REQUEST_PATH_RE = /^\/[^/\s]+\/[^/\s]+\/pull\/\d+\/?$/;

/**
 * Check whether a value is a canonical GitHub pull-request URL.
 * @param {unknown} value - Candidate URL
 * @returns {boolean} Whether the value is an HTTPS GitHub pull-request URL
 */
function isCanonicalPullRequestUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      !url.search &&
      !url.hash &&
      PULL_REQUEST_PATH_RE.test(url.pathname);
  } catch {
    return false;
  }
}

/**
 * Return pull-request URL fields that are present but unsafe or malformed.
 * @param {object} record - Object containing optional PR URL fields
 * @returns {string[]} Invalid field names
 */
function getInvalidPullRequestUrlFields(record) {
  if (!record || typeof record !== 'object') return [];
  return ['prdPrUrl', 'designPrUrl'].filter((field) => {
    const value = record[field];
    return value !== undefined && value !== null && !isCanonicalPullRequestUrl(value);
  });
}

module.exports = { isCanonicalPullRequestUrl, getInvalidPullRequestUrlFields };

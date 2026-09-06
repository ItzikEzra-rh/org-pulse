// "created" = the doc carries the AI-workflow provenance stamp; "revised" = an AI review
// score exists (surfaced in the UI as "Review"); "both" = stamp + score. Shared by PRD
// and Design cards so the provenance badge reads identically on both tabs.
export function getInvolvementLabel(involvement) {
  switch (involvement) {
    case 'both': return 'AI Created & Review'
    case 'created': return 'AI Created'
    case 'revised': return 'AI Review'
    default: return 'No AI'
  }
}

// Categorical provenance colors (solid), not success/failure semantics.
export function getInvolvementClass(involvement) {
  switch (involvement) {
    case 'both': return 'bg-blue-500 text-white'
    case 'created': return 'bg-green-500 text-white'
    case 'revised': return 'bg-amber-500 text-white'
    default: return 'bg-gray-200 text-gray-600'
  }
}

export function getRecommendationClass(rec) {
  switch (rec) {
    case 'approve': return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
    case 'revise': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
    case 'reject': return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
    default: return 'bg-gray-100 text-gray-600'
  }
}

export function getRecommendationLabel(rec) {
  switch (rec) {
    case 'approve': return 'Approve'
    case 'revise': return 'Needs Revision'
    case 'reject': return 'Reject'
    default: return rec || 'N/A'
  }
}

export function getReviewStatusClass(status) {
  switch (status) {
    case 'approved': return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
    case 'needs-review': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
    case 'awaiting-review': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200'
    default: return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
  }
}

export function getReviewStatusLabel(status) {
  switch (status) {
    case 'approved': return 'Approved'
    case 'needs-review': return 'Flagged'
    case 'awaiting-review': return 'Awaiting Sign-off'
    default: return 'Awaiting Sign-off'
  }
}

export function getReviewStatusTooltip(status) {
  switch (status) {
    case 'approved': return 'A human engineer has reviewed and signed off on this feature. No further action needed.'
    case 'needs-review': return 'The AI pipeline flagged concerns. Open in Jira, add feedback in the Staff Engineer Input section of the description, then remove the strat-creator-needs-attention label to unblock re-refinement.'
    case 'awaiting-review': return 'This feature passed AI review but still needs a human to review and sign off. Open in Jira and add the strat-creator-human-sign-off label when ready.'
    default: return 'This feature has not yet been reviewed by a human. Open in Jira to review and sign off.'
  }
}

// Design-tab review state, gated on artifact existence. 'awaiting-review' is
// also humanReviewStatus's unset default, so it only counts once an AI score
// exists to actually be awaited on; explicit 'approved'/'needs-review' labels
// are meaningful regardless of scoring. Returns null when neither applies.
export function getMeaningfulDesignReviewStatus(feature) {
  if (feature.designPrStatus == null) return null
  const status = feature.humanReviewStatus
  if (status === 'approved' || status === 'needs-review') return status
  if (status === 'awaiting-review' && feature.scores?.total != null) return status
  return null
}

// PRD-side review-status tooltip. PRD sign-off is derived from PR state
// (getPrdSignOffStatus), so it only ever yields 'approved' or 'awaiting-review'.
export function getPrdReviewStatusTooltip(status) {
  switch (status) {
    case 'approved': return 'The PRD pull request has been merged — reviewed and signed off. No further action needed.'
    default: return 'This PRD still needs review and sign-off. Merge the PRD pull request once approved.'
  }
}

export function getRecommendationTooltip(rec) {
  switch (rec) {
    case 'approve': return 'All AI reviewers recommend approval. The feature still needs human sign-off.'
    case 'revise': return 'One or more AI reviewers flagged issues to address before this feature is ready.'
    case 'reject': return 'AI reviewers found significant concerns. This feature needs rework before proceeding.'
    default: return ''
  }
}

export function getScoreClass(score) {
  if (score === 2) return 'text-green-600 dark:text-green-400'
  if (score === 1) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

// Design's overall score is a sum of four 0-2 dimensions (0-8 total), not a
// discrete 0-2 value, so it can't go through getScoreClass. Bands mirror the
// same pass/partial/fail semantics: only a perfect 8/8 is green.
export function getTotalScoreClass(total) {
  if (total >= 8) return 'text-green-600 dark:text-green-400'
  if (total >= 4) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

// The "no design doc" state — the Design-tab mirror of PRD's "Missing PRD".
// Driven by designPrStatus (artifact existence), not designStatus, which is
// AI Design Review processing state and says nothing about whether a Design
// artifact exists (see useForYou.js classifyFeature).
export function getDesignStatusClass(designPrStatus) {
  if (designPrStatus == null) return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200'
  return ''
}

export function getDesignStatusLabel(designPrStatus) {
  if (designPrStatus == null) return 'Missing Design'
  return null
}

// Same merge-based sign-off rule as Design Review, applied to the PRD PR status.
export function getPrdSignOffStatus(prdPrStatus) {
  if (prdPrStatus === 'No PR') return null
  if (prdPrStatus === 'Merged') return 'approved'
  return 'awaiting-review'
}

export const EP_GITHUB_REPO = 'https://github.com/osac-project/enhancement-proposals/pull'

// Single source of truth for the RFE's PRD pull-request link, shared by
// Pipeline Progress (PipelineTimeline) and the top-level PRD PR action
// (RFEDetailModal) so the two can't resolve to different URLs. Mirrors the
// EP-sourced PR that Pipeline Progress renders for the "PRD Review" phase,
// falling back to the linked feature's own prdPrUrl when no EP source exists.
export function getPrdReviewPrUrl(rfe) {
  if (!rfe || rfe.status === 'No PR') return null
  if (rfe.sourceRfe && rfe.sourceRfe.startsWith('EP-')) {
    return `${EP_GITHUB_REPO}/${rfe.sourceRfe.slice(3)}`
  }
  return rfe.linkedFeature?.prdPrUrl || null
}

// --- Shared filter-bar option sets (PRD Review + Design Review) ---
// Centralized here so the two list filter bars can't drift apart again.

export const AI_INVOLVEMENT_FILTER_OPTIONS = [
  { value: 'all', label: 'All AI' },
  { value: 'both', label: 'Created & Review' },
  { value: 'created', label: 'AI Created' },
  { value: 'revised', label: 'AI Review' },
  { value: 'none', label: 'No AI' }
]

export const REVIEW_STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All Review Status' },
  { value: 'approved', label: 'Approved' },
  { value: 'awaiting-review', label: 'Awaiting Sign-off' },
  { value: 'needs-review', label: 'Flagged' }
]

export const SORT_FILTER_OPTIONS = [
  { value: 'default', label: 'Sort: Default' },
  { value: 'score-desc', label: 'Score: High to Low' },
  { value: 'score-asc', label: 'Score: Low to High' },
  { value: 'newest', label: 'Sort: Newest' },
  { value: 'oldest', label: 'Sort: Oldest' }
]

// Artifact = whether the underlying doc (PRD / design doc) exists at all.
// `noun` is the tab-specific word ("PRD" / "Design") so the labels read naturally.
export function getArtifactFilterOptions(noun) {
  return [
    { value: 'all', label: `All ${noun}` },
    { value: 'has', label: `Has ${noun}` },
    { value: 'missing', label: `Missing ${noun}` }
  ]
}

const SIGN_OFF_LABEL = 'strat-creator-human-sign-off';
const NEEDS_ATTENTION_LABEL = 'strat-creator-needs-attention';
const { isCanonicalPullRequestUrl } = require('../../../../shared/server/feature-links');

/**
 * Derive humanReviewStatus from strat-creator pipeline labels.
 * @param {string[]} labels
 * @returns {'approved' | 'needs-review' | 'awaiting-review'}
 */
function deriveHumanReviewStatus(labels) {
  if (!labels || !Array.isArray(labels)) return 'awaiting-review';
  if (labels.includes(SIGN_OFF_LABEL)) return 'approved';
  if (labels.includes(NEEDS_ATTENTION_LABEL)) return 'needs-review';
  return 'awaiting-review';
}

const DIMENSIONS = ['feasibility', 'testability', 'scope', 'architecture'];
const PRIORITIES = ['Blocker', 'Critical', 'Major', 'Minor', 'Normal', 'Undefined'];
const RECOMMENDATIONS = ['approve', 'revise', 'reject'];

/**
 * Validate and normalize a feature request body.
 * Accepts both snake_case (from summary.json) and camelCase fields.
 * @param {object} body - The request body to validate
 * @returns {{ valid: true, data: object } | { valid: false, errors: string[] }}
 */
function validateFeature(body) {
  const errors = [];

  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Request body must be an object'] };
  }

  // ─── Normalize snake_case → camelCase ───
  if (body.strat_id && !body.key) body.key = body.strat_id;
  if (body.source_rfe && !body.sourceRfe) body.sourceRfe = body.source_rfe;
  if (body.needs_attention !== undefined && body.needsAttention === undefined) body.needsAttention = body.needs_attention;
  if (body.run_id && body.runId === undefined) body.runId = body.run_id;
  if (body.run_timestamp && body.runTimestamp === undefined) body.runTimestamp = body.run_timestamp;
  if (body.criterion_notes && !body.criterionNotes) body.criterionNotes = body.criterion_notes;
  // Synthesize reviewedAt from runTimestamp if absent
  if (body.reviewedAt === undefined && typeof body.runTimestamp === 'string' && !isNaN(Date.parse(body.runTimestamp))) {
    body.reviewedAt = body.runTimestamp;
  }

  // ─── Field validation ───

  // key: required non-empty string
  if (typeof body.key !== 'string' || body.key.length === 0) {
    errors.push('key must be a non-empty string');
  }

  // title: required non-empty string
  if (typeof body.title !== 'string' || body.title.length === 0) {
    errors.push('title must be a non-empty string');
  }

  // sourceRfe: required, must start with RHAIRFE-
  if (typeof body.sourceRfe !== 'string' || !body.sourceRfe.startsWith('RHAIRFE-')) {
    errors.push('sourceRfe must be a string starting with "RHAIRFE-"');
  }

  // priority: required enum
  if (!PRIORITIES.includes(body.priority)) {
    errors.push('priority must be one of: ' + PRIORITIES.join(', '));
  }

  // status: required non-empty string
  if (typeof body.status !== 'string' || body.status.length === 0) {
    errors.push('status must be a non-empty string');
  }

  // size: optional enum or null
  if (body.size !== undefined && body.size !== null) {
    if (!['S', 'M', 'L', 'XL'].includes(body.size)) {
      errors.push('size must be one of: S, M, L, XL, or null');
    }
  }

  // recommendation: required enum
  if (!RECOMMENDATIONS.includes(body.recommendation)) {
    errors.push('recommendation must be one of: ' + RECOMMENDATIONS.join(', '));
  }

  // needsAttention: required boolean
  if (typeof body.needsAttention !== 'boolean') {
    errors.push('needsAttention must be a boolean');
  }

  // scores: required object with dimension scores + total
  if (!body.scores || typeof body.scores !== 'object') {
    errors.push('scores must be an object with keys: ' + DIMENSIONS.join(', ') + ', total');
  } else {
    for (const dim of DIMENSIONS) {
      const val = body.scores[dim];
      if (!Number.isInteger(val) || val < 0 || val > 2) {
        errors.push(`scores.${dim} must be an integer between 0 and 2`);
      }
    }
    if (!Number.isInteger(body.scores.total) || body.scores.total < 0 || body.scores.total > 8) {
      errors.push('scores.total must be an integer between 0 and 8');
    } else {
      const sum = DIMENSIONS.reduce((acc, d) => {
        const v = body.scores[d];
        return acc + (Number.isInteger(v) ? v : 0);
      }, 0);
      if (body.scores.total !== sum) {
        errors.push(`scores.total (${body.scores.total}) must equal sum of dimension scores (${sum})`);
      }
    }
  }

  // reviewers: required object with dimension verdicts
  if (!body.reviewers || typeof body.reviewers !== 'object') {
    errors.push('reviewers must be an object with keys: ' + DIMENSIONS.join(', '));
  } else {
    for (const dim of DIMENSIONS) {
      if (!RECOMMENDATIONS.includes(body.reviewers[dim])) {
        errors.push(`reviewers.${dim} must be one of: ${RECOMMENDATIONS.join(', ')}`);
      }
    }
  }

  // labels: required array of strings, max 50
  if (!Array.isArray(body.labels) || !body.labels.every(s => typeof s === 'string')) {
    errors.push('labels must be an array of strings');
  } else if (body.labels.length > 50) {
    errors.push('labels must have at most 50 items');
  }

  // components: optional array of strings
  if (body.components !== undefined && body.components !== null) {
    if (!Array.isArray(body.components) || !body.components.every(s => typeof s === 'string')) {
      errors.push('components must be an array of strings');
    }
  }

  // runId: optional string
  if (body.runId !== undefined && typeof body.runId !== 'string') {
    errors.push('runId must be a string');
  }

  // runTimestamp: optional valid ISO 8601
  if (body.runTimestamp !== undefined) {
    if (typeof body.runTimestamp !== 'string' || isNaN(Date.parse(body.runTimestamp))) {
      errors.push('runTimestamp must be a valid ISO 8601 date string');
    }
  }

  // reviewedAt: required valid ISO 8601
  if (typeof body.reviewedAt !== 'string' || isNaN(Date.parse(body.reviewedAt))) {
    errors.push('reviewedAt must be a valid ISO 8601 date string');
  }

  // verdict: optional string
  if (body.verdict !== undefined && body.verdict !== null) {
    if (typeof body.verdict !== 'string') {
      errors.push('verdict must be a string');
    }
  }

  // feedback: optional string
  if (body.feedback !== undefined && body.feedback !== null) {
    if (typeof body.feedback !== 'string') {
      errors.push('feedback must be a string');
    }
  }

  // criterionNotes: optional object with dimension keys
  if (body.criterionNotes !== undefined && body.criterionNotes !== null) {
    if (typeof body.criterionNotes !== 'object' || Array.isArray(body.criterionNotes)) {
      errors.push('criterionNotes must be an object');
    } else {
      for (const k of Object.keys(body.criterionNotes)) {
        if (!DIMENSIONS.includes(k)) {
          errors.push('criterionNotes key "' + k + '" is not a valid dimension (' + DIMENSIONS.join(', ') + ')');
        } else if (typeof body.criterionNotes[k] !== 'string') {
          errors.push('criterionNotes.' + k + ' must be a string');
        }
      }
    }
  }

  // PRD/Design links: optional canonical HTTPS GitHub pull-request URLs
  for (const field of ['prdPrUrl', 'designPrUrl']) {
    if (body[field] !== undefined && body[field] !== null) {
      if (typeof body[field] !== 'string') {
        errors.push(`${field} must be a string`);
      } else if (!isCanonicalPullRequestUrl(body[field].trim())) {
        errors.push(`${field} must be a canonical HTTPS GitHub pull-request URL`);
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Derive humanReviewStatus from labels
  const humanReviewStatus = deriveHumanReviewStatus(body.labels);

  return {
    valid: true,
    data: {
      key: body.key,
      title: body.title,
      sourceRfe: body.sourceRfe,
      priority: body.priority,
      status: body.status,
      size: body.size !== undefined ? body.size : null,
      recommendation: body.recommendation,
      needsAttention: body.needsAttention,
      humanReviewStatus,
      scores: {
        feasibility: body.scores.feasibility,
        testability: body.scores.testability,
        scope: body.scores.scope,
        architecture: body.scores.architecture,
        total: body.scores.total
      },
      reviewers: {
        feasibility: body.reviewers.feasibility,
        testability: body.reviewers.testability,
        scope: body.reviewers.scope,
        architecture: body.reviewers.architecture
      },
      components: Array.isArray(body.components) ? body.components : [],
      labels: body.labels,
      runId: body.runId || undefined,
      runTimestamp: body.runTimestamp || undefined,
      reviewedAt: body.reviewedAt,
      verdict: typeof body.verdict === 'string' ? body.verdict.trim() : undefined,
      feedback: typeof body.feedback === 'string' ? body.feedback.trim() : undefined,
      criterionNotes: body.criterionNotes || undefined,
      prdPrUrl: typeof body.prdPrUrl === 'string' ? body.prdPrUrl.trim() : undefined,
      designPrUrl: typeof body.designPrUrl === 'string' ? body.designPrUrl.trim() : undefined
    }
  };
}

module.exports = { validateFeature, deriveHumanReviewStatus, DIMENSIONS, PRIORITIES, RECOMMENDATIONS };

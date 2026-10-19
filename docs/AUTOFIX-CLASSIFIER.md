# Autofix Classifier and UI Mapping

How the Org Pulse dashboard classifies Jira issues into pipeline states and
displays them in the UI.

> **Source of truth:**
> `modules/ai-impact/server/jira/autofix-fetcher.js` — `classifyIssue()` (lines 40–66).
> Tests: `modules/ai-impact/__tests__/server/autofix-fetcher.test.js`.
> UI rendering: `modules/ai-impact/client/components/AutofixContent.vue`.
> Pipeline guide: `modules/ai-impact/client/views/AIFactoryGuideView.vue`.

---

## 1. Global Jira Query Eligibility

Before any issue enters classification, the `fetchAutofixData()` function
builds a JQL query. Project and pipeline-label filters are always included;
the component-exclusion clause is added only when `autofixExcludedComponents`
is nonempty, and the created-after clause only when `autofixCreatedAfter`
has a value:

| Filter | Source | Default |
|--------|--------|---------|
| **Project scope** | `config.autofixProjects` | `['AIPCC', 'RHOAIENG']` |
| **Pipeline labels** | `ALL_PIPELINE_LABELS` (union of `TRIAGE_LABELS` + `AUTOFIX_LABELS`) | See §2 |
| **Component exclusion** | `config.autofixExcludedComponents` | `['Enclave', 'agentic-sdlc']` |
| **Created-after date** | `config.autofixCreatedAfter` | `null` (no date floor) |

All config values are validated against JQL injection (`validateJqlSafeString`
in `modules/ai-impact/server/config.js`).

**Resulting JQL template:**

```
project IN ("AIPCC", "RHOAIENG")
  AND labels IN ("jira-triage-pending", "jira-triage-missing-info", …all 15 labels…)
  [AND (component IS EMPTY OR component NOT IN ("Enclave", "agentic-sdlc")) — when autofixExcludedComponents is nonempty]
  [AND created >= "<date>" — when autofixCreatedAfter is set]
ORDER BY created DESC
```

Only issues matching this query are fetched; everything else is invisible to
the classifier.

### Label Sets

**Triage labels** (6):

| Jira Label |
|------------|
| `jira-triage-pending` |
| `jira-triage-missing-info` |
| `jira-triage-not-fixable` |
| `jira-triage-stale` |
| `jira-triage-external` |
| `jira-triage-security-review` |

**Autofix labels** (9):

| Jira Label |
|------------|
| `jira-autofix` |
| `jira-autofix-pending` |
| `jira-autofix-review` |
| `jira-autofix-ci-failing` |
| `jira-autofix-merged` |
| `jira-autofix-rejected` |
| `jira-autofix-max-retries` |
| `jira-autofix-blocked` |
| `jira-autofix-fork-user-missing` |

**Note:** `no-autofix` is a Jira label recognized by the external bot to
permanently exclude a ticket from triage and autofix. It is **not** in
`ALL_PIPELINE_LABELS`, so issues carrying only `no-autofix` are never fetched
by the dashboard.

---

## 2. Classification Rules — `classifyIssue(labels, status, assignee)`

The classifier applies a strict **first-match** precedence cascade. The first
matching rule wins; later rules are never evaluated for that issue.

| Priority | pipelineState | Jira Condition | Status Check | Assignee Check |
|----------|---------------|----------------|--------------|----------------|
| 1 | `autofix-merged` | `jira-autofix-merged` in labels | — | — |
| 2 | `autofix-rejected` | `jira-autofix-rejected` in labels | — | — |
| 3 | `autofix-max-retries` | `jira-autofix-max-retries` in labels | — | — |
| 4 | `autofix-blocked` | `jira-autofix-blocked` in labels | — | — |
| 5 | `autofix-fork-user-missing` | `jira-autofix-fork-user-missing` in labels | — | — |
| 6 | `autofix-ci-failing` | `jira-autofix-ci-failing` in labels | — | — |
| 7 | `autofix-review` | `jira-autofix-review` in labels | — | — |
| 8 | `autofix-pending` | `jira-autofix-pending` in labels | — | — |
| 9 | `autofix-ready` | `jira-autofix` in labels | `status === 'New'` | — |
| 10 | `triage-security-review` | `jira-triage-security-review` in labels | — | — |
| 11 | `triage-human-assigned` | `jira-autofix` in labels | — | assignee present AND not a bot |
| 12 | `triage-external` | `jira-triage-external` in labels | — | — |
| 13 | `triage-not-fixable` | `jira-triage-not-fixable` in labels | — | — |
| 14 | `triage-stale` | `jira-triage-stale` in labels | — | — |
| 15 | `triage-missing-info` | `jira-triage-missing-info` in labels | — | — |
| 16 | `triage-pending` | `jira-triage-pending` in labels | — | — |
| — | `unknown` | No rule matched | — | — |

### Design Properties

- **Earlier rules shadow later ones.** An issue with both
  `jira-autofix-blocked` and `jira-triage-stale` classifies as
  `autofix-blocked` (priority 4), never `triage-stale` (priority 14).

- **Terminal states first.** Rules 1–3 are terminal autofix outcomes checked
  before any active or triage state, ensuring finality.

- **Blocked before pending.** Rule 4 (`autofix-blocked`) is checked before
  rule 8 (`autofix-pending`). The bot may add `jira-autofix-blocked` after
  starting work without removing `jira-autofix-pending`.

- **`autofix-ready` is conditional.** Rule 9 requires both the `jira-autofix`
  label AND Jira status `"New"`. An issue with `jira-autofix` but status
  `"In Progress"` falls through to later rules (potentially
  `triage-human-assigned` or `unknown`).

- **`triage-security-review` beats `triage-human-assigned`.** Rule 10 is
  evaluated before rule 11, so a security-flagged issue with a human assignee
  shows as security review, not deferred to human.

- **`triage-human-assigned` is synthetic.** No Jira label maps to it directly.
  It is derived from: `jira-autofix` label present + non-empty assignee + the
  assignee is not in the bot accounts list. This only triggers if no
  higher-priority autofix sub-state label is present and status is not `"New"`.

---

## 3. Bot Account Exclusion

The `BOT_ACCOUNTS` set controls which assignees are treated as bot-assigned
(and therefore do not trigger `triage-human-assigned`):

```js
const BOT_ACCOUNTS = new Set(['osac-dev-bot']);
```

The check uses `displayName`, not Jira `accountId`. If an issue has
`jira-autofix`, is assigned to `osac-dev-bot`, and its status is not `New`,
it falls through to `unknown` — not `triage-human-assigned`.

---

## 4. Pipeline State → UI Label Mapping

`AutofixContent.vue` defines the `STATE_OPTIONS` array that maps each
`pipelineState` to a human-readable UI label. The table also shows the CSS
color class used for badges.

| pipelineState | UI Label | Badge Color |
|---------------|----------|-------------|
| `triage-pending` | AI Assessing | gray |
| `triage-missing-info` | Missing Info | yellow |
| `triage-not-fixable` | Not AI-Fixable | red |
| `triage-stale` | Stale | gray |
| `triage-external` | External Reporter | purple |
| `triage-security-review` | Security Review | rose |
| `triage-human-assigned` | Deferred to Human | cyan |
| `autofix-ready` | Queued for AI | indigo |
| `autofix-pending` | AI Working | indigo |
| `autofix-review` | AI Fix Under Review | blue |
| `autofix-ci-failing` | AI Fix CI Failing | orange |
| `autofix-merged` | AI Fix Merged | green |
| `autofix-rejected` | AI Fix Rejected | red |
| `autofix-max-retries` | AI Max Retries | orange |
| `autofix-blocked` | AI Blocked | yellow |
| `autofix-fork-user-missing` | Fork Not Installed | amber |
| `unknown` | *(raw state string)* | gray |

---

## 5. "Ready for AI" Aggregate

The "Triage Outcomes" panel in the UI shows a **Ready for AI** segment. This
is the count of all issues whose `pipelineState` starts with `autofix-`
(all 9 autofix states combined). It equals `triageVerdicts.ready` in the
metrics object, which is set to `autofixTotal` — the sum of all
`autofixStates.*` counts:

```
Ready for AI = autofix-ready + autofix-pending + autofix-review
             + autofix-ci-failing + autofix-merged + autofix-rejected
             + autofix-max-retries + autofix-blocked + autofix-fork-user-missing
```

This aggregate tells you how many triaged issues were deemed suitable for the
autofix pipeline, regardless of their current position within it.

---

## 6. Eligibility Rate

The eligibility rate is a separate metric showing what fraction of all issues
in the time window were ever considered for autofix. It uses a **union**
definition:

```
eligible = issues with autofix-* pipelineState
         OR issues carrying the jira-autofix label (regardless of state)
eligibilityRate = round(eligible / windowTotal * 100)
```

This means `eligibleCount` can exceed `autofixTotal`. An issue with
`jira-autofix` label but `pipelineState = 'triage-pending'` counts as
eligible (the label indicates autofix intent) but not as part of
`autofixTotal` (its state is triage, not autofix).

---

## 7. Multiple-Label Precedence Examples

These examples are validated by the test suite:

| Labels on Issue | Status | Assignee | Classified As | Why |
|-----------------|--------|----------|---------------|-----|
| `jira-autofix-merged`, `jira-autofix-review`, `jira-autofix` | any | any | `autofix-merged` | Rule 1 fires first |
| `jira-autofix-pending`, `jira-autofix-blocked` | any | any | `autofix-blocked` | Rule 4 beats rule 8 |
| `jira-triage-not-fixable`, `jira-triage-security-review` | any | any | `triage-security-review` | Rule 10 beats rule 13 |
| `jira-autofix`, `jira-triage-security-review` | Open | Jane Doe | `triage-security-review` | Rule 10 beats rule 11 |
| `jira-autofix-review` | In Progress | Jane Doe | `autofix-review` | Autofix sub-state labels (rule 7) beat human-assigned (rule 11) |
| `jira-autofix` | New | any | `autofix-ready` | Rule 9: label + status match |
| `jira-autofix` | In Progress | Jane Doe | `triage-human-assigned` | Rule 11: not New, has human assignee |
| `jira-autofix` | In Progress | osac-dev-bot | `unknown` | Bot assignee excluded from rule 11, no other rule matches |
| `jira-autofix` | In Progress | *(none)* | `unknown` | No assignee, status not New — falls through all rules |
| `jira-triage-stale` | Open | Jane Doe | `triage-stale` | Rule 14: assignee is irrelevant for triage-stale (no `jira-autofix` label) |

---

## 8. Time-Window Filtering and `terminalAt`

### Standard Windows (week, month, 3months)

Issues are bucketed by their `created` date. An issue created 3 weeks ago
that later moved to `autofix-merged` appears as "merged" in the week it was
created, not when it was merged. This is a known limitation — Jira labels
do not carry timestamps for state transitions.

### Last Week Window

The `lastWeek` time window uses Monday-to-Monday UTC boundaries
(`getLastWeekBounds()`). For **terminal states** (`autofix-merged`,
`autofix-rejected`, `autofix-max-retries`), it uses the `terminalAt`
timestamp instead of `created`:

```
if (isLastWeek && TERMINAL_STATES.has(pipelineState) && terminalAt) {
  // bucket by terminalAt
} else {
  // bucket by created
}
```

`terminalAt` is extracted from the Jira changelog by `extractTerminalAt()`.
It finds the latest `labels` field change event where the terminal label
(e.g., `jira-autofix-merged`) appears in the `toString` value. This allows
the Last Week view to show issues that were *resolved* last week, even if
they were *created* months earlier.

For non-terminal issues in the `lastWeek` window, `created` is still used.

### Changelog Fetching

Terminal-state issues have their changelogs fetched in batches of 10
(`Promise.allSettled`). A failed changelog fetch logs a warning but does not
prevent the issue from appearing — it simply has `terminalAt: null` and falls
back to `created`-based bucketing.

---

## 9. Current Key-Based Jira Drill-Down Links

When a user clicks on a segment in the Triage Outcomes or Autofix Breakdown
bars, the UI opens a Jira issue navigator link. These links use
**`key IN (...)`** JQL — listing the exact issue keys that match the segment.

```js
function buildKeysJql(matchFn) {
  const keys = timeFilteredIssues.value.filter(matchFn).map(i => i.key)
  const jql = `key IN (${keys.map(k => `"${k}"`).join(', ')}) ORDER BY updated DESC`
  return `${host}/issues/?jql=${encodeURIComponent(jql)}`
}
```

### Why Key-Based

The key-based approach was adopted to fix count mismatches between the
dashboard and Jira drill-down results. Because `classifyIssue()` uses
first-match precedence across labels, status, and assignee, a single Jira
label query (e.g., `labels = "jira-autofix-pending"`) can return issues that
the classifier places in a *different* state due to a higher-priority label
also being present. Key-based JQL guarantees the drill-down shows exactly the
issues the dashboard counted.

### Trade-offs

- **Pros:** Exact match with dashboard counts; no precedence bugs; works for
  synthetic states like `triage-human-assigned`.
- **Cons:** URLs can be long for large segments; the link is a snapshot of the
  current data, not a live Jira query.

---

## 10. Dynamic JQL Feasibility

A feasibility analysis determined that **all 16 pipelineState values are
logically expressible** as precedence-aware JQL using standard Jira Cloud
operators. Each state's JQL would include a base label condition plus
`labels NOT IN (...)` clauses to exclude all higher-priority labels. The
`triage-human-assigned` state requires the most complex query (combining label
presence, status inequality, non-empty assignee, and bot-account exclusion via
`accountId`).

### What Works

For any state at priority *N*, the JQL structure is:

```
<base condition for state N>
AND labels NOT IN (<labels for all states with priority < N>)
AND <De Morgan exclusions for cross-field conditions at priorities < N>
```

The Jira Cloud operators needed (`labels NOT IN`, `status != "X"`,
`assignee IS NOT EMPTY`, `assignee != "accountId"`, `OR` in parentheses) are
all supported.

### Known Exception

The `lastWeek` time window's `terminalAt`-based bucketing for terminal states
cannot be expressed in JQL. Jira has no operator for "the date a specific
label was added." For this time window, key-based JQL remains the only
correct approach for terminal-state segments.

### Bot Account Identifier

The `triage-human-assigned` JQL requires `assignee != "<accountId>"`. The
classifier uses `displayName`, but Jira JQL requires `accountId` for assignee
comparisons. The bot's Jira `accountId` would need to be looked up and
configured — it is not hardcoded in the current implementation and this
document does not specify it.

### Current Status

Dynamic JQL is **not currently implemented**. The dashboard uses key-based
JQL for all drill-down links. The feasibility analysis confirms it is
*possible* as a future enhancement for standard time windows, with key-based
fallback retained for the `lastWeek` terminal-state case.

---

## 11. Metrics Computation

`computeAutofixMetrics(issues, timeWindow)` produces the metrics object
consumed by the UI:

| Metric | Formula |
|--------|---------|
| `windowTotal` | Issues in the time window |
| `triageTotal` | All issues with `triage-*` or `autofix-*` pipelineState |
| `triageVerdicts.ready` | = `autofixTotal` (all `autofix-*` states combined) |
| `triageVerdicts.missingInfo` | Issues with `triage-missing-info` |
| `triageVerdicts.notFixable` | Issues with `triage-not-fixable` |
| `triageVerdicts.stale` | Issues with `triage-stale` |
| `triageVerdicts.pending` | Issues with `triage-pending` |
| `triageVerdicts.external` | Issues with `triage-external` |
| `triageVerdicts.securityReview` | Issues with `triage-security-review` |
| `triageVerdicts.humanAssigned` | Issues with `triage-human-assigned` |
| `autofixStates.ready` | Issues with `autofix-ready` |
| `autofixStates.pending` | Issues with `autofix-pending` |
| `autofixStates.review` | Issues with `autofix-review` |
| `autofixStates.ciFailing` | Issues with `autofix-ci-failing` |
| `autofixStates.merged` | Issues with `autofix-merged` |
| `autofixStates.rejected` | Issues with `autofix-rejected` |
| `autofixStates.maxRetries` | Issues with `autofix-max-retries` |
| `autofixStates.blocked` | Issues with `autofix-blocked` |
| `autofixStates.forkUserMissing` | Issues with `autofix-fork-user-missing` |
| `successRate` | `round(merged / (merged + rejected + maxRetries) * 100)` |
| `eligibleCount` | Union: `autofix-*` state OR `jira-autofix` label |
| `eligibilityRate` | `round(eligibleCount / windowTotal * 100)` |

---

## References

- **Classifier source:** `modules/ai-impact/server/jira/autofix-fetcher.js`
- **Classifier tests:** `modules/ai-impact/__tests__/server/autofix-fetcher.test.js`
- **UI component:** `modules/ai-impact/client/components/AutofixContent.vue`
- **Pipeline guide (Jira labels):** `modules/ai-impact/client/views/AIFactoryGuideView.vue`
- **Config defaults:** `modules/ai-impact/server/config.js`
- **Data format notes:** `docs/DATA-FORMATS.md` (AutoFix snapshot freshness section)
- **Autofix tab plan:** `AUTOFIX-TAB-PLAN.md` (team-tracker integration design)

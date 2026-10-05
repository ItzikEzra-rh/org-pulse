# Shared Releases → Execute verification

Date: 2026-10-05. Status: local candidate verification complete; remote CI and
production verification are pending. No merge or deployment has been performed.

App base: `rh-ecosystem-edge/org-pulse:main` at
`a9acb03378f1e307fdc4071aed8b04c6e76e4a17`. Data base:
`edge-infrastructure/org-pulse-data:main` at
`45e1af96fc293f4130a9af084c05fb4da064dfbc`. Both worktrees use the isolated
branch `codex/shared-release-execute-20261005`. The bases include MR !146's
build-collector recovery/ordering fix, MR !148's checkpoint transaction repair,
and the Jira Hygiene changes already merged to main.

## Product result

OSAC remains the visual and interaction baseline. `ExecuteView.vue` renders the
same **Feature List**, **Feature Tracking**, and **Epics by Release** tabs for
OSAC and Flight Control; Feature Status remains hidden. Project switching changes
the selected project's rows, release versions, provenance and coverage states.
The project catalog keeps OSAC first so it remains the default selection when
there is no saved project context.
The replacement Execute presentation was removed after its other consumers were
checked. System Health → Release Execution continues to use its separate bounded
evidence route and view.

## Consumer audit and contract

The audit was performed against fetched main before implementation. It covered
the three tabs, their detail panels, route handlers, exports, project refresh and
config writes, AI-review writes, cooldown/refresh locks, and project-filtered
audit events.

| Surface | Requests and consumed data | Preserved controls and behavior |
| --- | --- | --- |
| Feature List | `GET /execution/features`; `GET /execution/versions`; `GET /execution/features/{key}` for the drawer. Summaries use `key`, `summary`, Jira `status`/`statusCategory`, `assignee`, `team`, `components`, `fixVersions`, `labels`, `priority`, `epicCount`, `issueCount`, `blockerCount`, `executionState`, `executionCoverage`, `executionCoverageReason`, execution issue counts (including the existing effective override fields), `preparationReadiness`, and coverage metadata. The drawer consumes detail `epics`, child issues, metrics, topology/PR links and Jira fields. | Board/list switch, search, versions, components, execution state, Jira status, assignee/Me, Blockers-only, clear filters, pagination/collapse, expanded labels and the feature detail drawer. Filters persist under project-qualified browser keys; OSAC retains its existing key. |
| Feature Tracking | `GET /execution/tracking/releases`; `GET /execution/tracking/data?releaseId=…`. Release data includes baseline date/source/policy, history coverage, freshness/partial/state, feature count, scope counts and `wasQueryFailed`. Rows use Feature key/title, `scopeChange`, moved-to/version-change dates, Jira status, priority/Blocker-priority, components and assignee. | Release chips, component/status/team filters, clickable Added/Dropped/Moved/Blocker Priority summaries, reset and Jira links. An unknown baseline keeps classifications and counts Unknown; failed history queries remain partial. |
| Epics by Release | `GET /execution/versions?scope=epics`; `GET /execution/epics?version=…`. Feature rows use key/summary/status, actual Feature Fix Versions, components and Team coverage. Epic cards use key/summary/status/priority/assignee, direct versus inherited Fix Version and Component provenance, parent Feature, observed Jira child status and its coverage. | Release selector, component/status/team/assignee filters and Jira links. Directly-versioned Epic context preserves the Feature's actual version. Project-wide Epics without a Feature parent are called out in this same tab and are not silently assigned to a Feature. |

The shared consumer contract publishes `index.json`,
`features/{KEY}.json`, and `tracking-data-{URI-encoded-releaseId}.json` under
`projects/{projectId}/releases/execution/`. Each envelope and nested payload
identifies its project, profile revision, Execute revision, generation and
artifact key. The profile index, sanitized profile, release registry, Execute
index/details and tracking artifacts must agree before a generation is visible.
Unknown numbers stay `null`; successful empty collections use `state: empty`;
missing or failed sources are unavailable/partial and retain honest timestamps.

OSAC's canonical data builder copies its established summaries and details
without recalculating pipeline, Jira or review metrics with new meanings. Jira
Feature status, Jira child status, pipeline execution, readiness and release
success remain separate. Workflow success never certifies Feature completion or
release readiness.

## Inventory and policy evidence

The data-side OSAC parity test verifies the project snapshot's Feature summaries
and every Feature detail equal the preserved legacy feature store. It records
274 Features, 372 observed Epics, zero unparented Epics and nine tracking
releases in that canonical data fixture.

The last-collected EDM Jira payload contains **271 Features, 440 observed
Epics, 51 Epics without a linked Feature, and 20 release entries with Feature
scope**. It includes Features with no AI marker or PR. Unit tests derive the
shared output from that real payload, including parented hierarchy and direct
versions, and verify that the unparented count remains visible. Team attribution
is unknown, no compatible pipeline producer is configured, and readiness and
scope-baseline policies are unconfigured. Those values stay Unknown/null. The
tree's Jira child status label explicitly says it does not measure pipeline
execution or release readiness.

The current base's source and registry envelopes still carry profile revisions
`df41f77ef2a16e8d` (OSAC) and `c4526ee0fc8e869f` (Flight Control), while the
refreshed profile projections are `653d4e3d171383df` and `84d6e4c515154de5`.
The data change therefore omits project-qualified Execute snapshots rather than
publishing mismatched generations. Derivation tests change revisions only in a
disposable temporary copy of those payloads; the checked-in sources are not
relabeled. The sidecar test confirms that the current mixed generation is
rejected until the ordered collector refresh publishes matching registries,
sources, release plans, tracking and Execute outputs. These local payload counts
are not evidence of a current coherent publication or production readback.

The third-project fixtures use the differently named Jira key `BLUEBIRD` and
profile-defined Feature/Epic types, parent mapping, release versions, producer
and policy settings. Data builder and app route tests exercise that project
through the same configured path without project-specific implementation code.

## Project isolation audit

- Feature list/detail, status, versions, Epic tree and tracking readers resolve
  the requested project before reading. Unknown project IDs return 404; a known
  project with missing data returns an unavailable/empty response and never
  reads another project's root data.
- Project exports pin one immutable project root and validate project ID,
  profile/Execute revisions, artifact key and generation for index, detail and
  tracking files. Legacy OSAC export remains intact during migration.
- Manual refresh, config GET/POST, per-Feature refresh and AI-review bulk/delete
  resolve the project first. Generated-project writes return a scoped 409 before
  accessing OSAC storage. Query/body project mismatches return 400. The
  per-Feature cooldown key includes project ID; the shared manual-refresh lock
  remains behind the OSAC-only legacy-writer guard.
- Execution audit entries include project ID and audit reads filter on it.
  AI Impact review writes forward project ID in both query and body. Release
  Planning keeps its separate config lock and path.
- Feature, tracking and Epic composables clear prior-project data, include
  `projectId`, and discard stale responses. The browser switch test delays an
  OSAC response until after Flight Control has loaded.

## Local verification

| Check | Result |
| --- | --- |
| Data repository CI unittest list from `.gitlab-ci.yml` | 349 passed. Includes OSAC parity, all EDM Features, Epic hierarchy/version mapping, unknown/partial sources and configuration-only third project. |
| Data `test_release_plan_ci_contract` | 9 passed; checks producer/derivation/publication order and compatible revisions, including the merged !146 recovery path and !148 checkpoint transaction. |
| Data `test_sidecar_sync` | 24 passed; covers coherent synthetic activation, failure/LKG behavior, recovery, Execute validation and rejection of the current stale checked-in revisions. |
| App `npm test` | 6,189 passed, 9 skipped (371 test files; 367 passed, 4 skipped). The full run used local test-server access. |
| App route/UI and isolation tests | Included in the full app suite; additional Playwright checks exercise both projects and switching behavior in the browser. |
| App `npm run lint` | Passed. |
| App `npm run build` | Passed. Vite reports existing large chunks over 500 kB. |
| App module/platform validation | Both passed. |
| App OpenAPI validation | Spec valid, 351 operations, coverage passed. The validator prints 71 route-scanner warnings, including existing execution routes; the command exits successfully. |
| Playwright `release-execution-evidence.spec.js` | 3 passed: same three tabs for both projects, delayed OSAC response discarded on switch, and unknown project returns not found without OSAC data. Captured all six local fixture screenshots; this is not production readback. |
| `git diff --check` | Passed in both repositories at the last check. |

The browser run captured all six views: [OSAC Feature List](shared-execute-verification-assets/osac-feature-list.png), [OSAC Feature Tracking](shared-execute-verification-assets/osac-feature-tracking.png), [OSAC Epics by Release](shared-execute-verification-assets/osac-epics-by-release.png), [Flight Control Feature List](shared-execute-verification-assets/flightctl-feature-list.png), [Flight Control Feature Tracking](shared-execute-verification-assets/flightctl-feature-tracking.png), and [Flight Control Epics by Release](shared-execute-verification-assets/flightctl-epics-by-release.png). Screenshots are local fixture renderings; they are not production readbacks.

## CI and production status

The checks above are local candidate results. Remote MR/PR pipelines have not
run yet. Production has not been changed or verified. The production gap
tracker keeps FC-03 open until both projects are read back after rollout.

Required merge/rollout order:

1. Merge the data MR first. Run collection and verify the OSAC/EDM profiles,
   registries and Execute artifacts share compatible revisions/generations;
   then verify production data sync and source timestamps.
2. Only after that readback, merge the app PR. Verify image builds and rollout,
   then use an authenticated production browser to check all three tabs for both
   projects, project switching, Feature detail links, unavailable/partial states,
   action isolation and System Health's separate evidence screen.

The user owns both merges. No merge, rollout or deployment was performed by
this candidate.

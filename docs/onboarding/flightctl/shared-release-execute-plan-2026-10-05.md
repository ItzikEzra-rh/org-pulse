# One shared Releases → Execute experience

Date: 2026-10-05. Status: implementation and local verification are complete; both review requests are being opened. Neither change is merged or deployed.

The data candidate is based on `edge-infrastructure/org-pulse-data:main` at
`45e1af96fc293f4130a9af084c05fb4da064dfbc`, on branch
`codex/shared-release-execute-20261005`. The app candidate is based on
`rh-ecosystem-edge/org-pulse:main` at `a9acb03378f1e307fdc4071aed8b04c6e76e4a17`,
on a separate branch with the same name. This includes the merged !146 ordering
and build-collector recovery fixes, the !148 checkpoint transaction repair, and
the Jira Hygiene changes already on main. MR/PR links, branch head commits and
remote CI status will be recorded after the branches are pushed and opened. The
field, endpoint, metric and action inventory
is recorded in the app candidate's `docs/onboarding/flightctl/shared-execute-verification-2026-10-05.md`.

## Product requirement

OSAC's Execute experience is the baseline for every project. Changing the project
changes the data, labels, evidence availability and configured policy. It must not
replace the page with a different dashboard. Future onboarding must require
configuration rather than a new project-specific view or collector branch.

Deliver one coordinated data MR and one app PR. Preserve the existing visual
layout, visible tabs, filters, drilldowns and navigation. Do not redesign OSAC.

## Current implementation and the actual gap

- `ExecuteView.vue` switches between `feature-execution` and `release-evidence`
  according to profile capability. Flight Control consequently loses the OSAC
  tabs and receives `ProjectExecutionEvidenceView` instead.
- The OSAC view has Feature List, Feature Tracking, and Epics by Release tabs.
  Feature Status is currently hidden: preserve that setting during migration.
- OSAC's canonical feature store combines Jira enrichment, delivery pipeline
  metrics and AI review fields. Its storage prefix is root `releases/execution`.
- Flight Control's project-qualified execution collector supplies bounded
  release/workflow/job/artifact evidence. That evidence is valuable but is not
  itself the feature inventory expected by the existing Execute UI.
- Shared Jira/GitHub collectors already exist. The Execute consumer contract and
  some OSAC legacy derivations are not yet shared.
- `fetch-releases-feature-tracking.py` hardcodes OSAC and root registry/config
  paths. Its freeze-baseline rules cannot simply be applied to another project.
- Flight Control has Jira features, hierarchy and version data. Missing team,
  policy or delivery joins must be represented explicitly, not used as a reason
  to replace the entire page.

## 1. Inventory the OSAC UI contract before coding

Read current remote main, not an old local checkout. Record every request, field,
filter, sort, export and mutation used by the three visible Execute tabs and their
detail panels. Inspect route handlers, scheduler, feature store, Jira enrichment,
pipeline importer and data collectors together.

For each field record: producer, definition, raw inputs, policy dependency,
availability for OSAC/EDM, and null/empty behavior. Capture OSAC parity fixtures
and screenshots. Audit refresh/config/export actions as well as read endpoints:
making the tables project-aware is insufficient if a button still writes OSAC.

## 2. Common data contract

Publish a versioned, project-qualified Execute snapshot beneath
`projects/<projectId>/releases/execution/`. Final artifact names must follow the
existing project reader conventions and be documented before implementation.

The shared contract covers:

- Feature index and per-feature detail, with Jira keys, URLs and identity.
- Epic relationships and direct versus inherited version attribution.
- Release/version options derived from the selected project's registry.
- Metrics with definitions, denominators, evidence references and coverage.
- Scope tracking with explicit baseline availability and complete-history status.
- Source freshness, partial status, failures and last successful observation.
- Optional delivery pipeline and AI review enrichment, with provenance.

Every snapshot carries project ID, profile revision, schema version, generation
time and source references. Unknown numeric values are null, not zero. Empty
arrays mean successfully collected absence; unavailable collection has a separate
state. Missing policy never means successful completion or healthy delivery.

### Initial mapping

| UI concept | Shared evidence and behavior |
| --- | --- |
| Feature rows, Jira status, assignee, components, versions | Selected project's Jira inventory; include features without PRs or AI markers |
| Feature → Epic tree | Explicit Jira parent/relationship evidence; preserve direct Epic version semantics |
| Issue completion | Define from collected Jira status categories; expose denominator and incomplete descendant coverage |
| Pipeline execution metrics | Explicit linked producer evidence; unavailable when no compatible producer/join exists |
| Health/status color | Preserve OSAC's established source/policy semantics; unknown if another project's required evidence is absent |
| Team | Configured Jira mapping or approved attribution; unknown when absent |
| Scope added/dropped/moved | Complete version history plus configured baseline; unknown scope classification without baseline |
| AI review | Actual marker-derived review evidence only; missing markers do not hide features |
| Workflow/release artifacts | Preserve bounded evidence and links; associate with a feature only through explicit traceability |

Jira issue completion and CI execution success remain distinct metrics. Audit
existing metric names before mapping either into a progress column; matching a
field name does not establish matching meaning.

## 3. Data MR: reusable collection and derivation

1. Add an execution collection configuration and capability using existing profile
   conventions: feature/epic types, hierarchy interpretation, optional fields,
   producer sources, completion rules and scope-baseline policy.
2. Build one shared derivation over project-qualified Jira/GitHub/traceability,
   release registry and optional execution/review evidence. Reuse existing
   normalizers and calculations where their meanings match.
3. Preserve OSAC pipeline-owned metrics through an explicitly configured producer
   adapter. Keep provenance and existing authority/merge rules; do not overwrite
   pipeline metrics with approximate Jira-derived substitutes.
4. Generalize scope tracking to project-qualified paths and profile-selected Jira
   key, issue types, team field and baseline policy. Fetch paginated changelogs
   only when required; prefer existing complete snapshots where sufficient.
5. Configure OSAC with its existing approved behavior. Configure EDM with real
   inventory/hierarchy/version facts; leave unapproved freeze/readiness policies
   unconfigured. Optional enrichment must not suppress otherwise valid rows.
6. Derive calculated metrics on the data side. Keep publication and server-side
   interactive update ownership explicit so migrated OSAC edits are not lost.
7. Collect independent inputs once, then derive Execute after dependencies finish.
   Publish a coherent generation under the shared writer lock. Failed optional
   evidence produces partial coverage; invalid mandatory identity blocks publication.
8. Preserve legacy OSAC root outputs during rollout, generated from the same
   resolved inputs where practical. Remove them only after all consumers migrate.

No `if projectId == flightctl` or repo-specific rendering switch. A third-project
fixture must work through configuration with a differently named Jira project.

## 4. App PR: same UI, selected-project data

1. Keep the OSAC Execute layout and visible tabs for all supported projects.
   Remove the presentation branch that substitutes the Flight Control dashboard.
2. Generalize the feature list/detail, versions, Epic tree, tracking and status
   endpoints to read the shared selected-project contract through project storage.
3. Preserve existing filters, sorting, detail navigation, URL tab/version context
   and exports. Include project context in every request and output identity.
4. Handle null metrics in the existing cells/cards with clear unknown or
   unavailable states. Never render null as 0%, healthy or completed. Keep useful
   inventory visible even when one enrichment source is absent.
5. Surface freshness, partial coverage and missing policy within the existing
   page's information areas. Evidence links can appear in existing detail panels;
   do not create a replacement Flight Control page.
6. Audit and project-qualify refresh/config/edit operations, authorization, locks,
   cooldown state and audit events. Disable an unsupported action with a reason
   rather than letting it operate on another project's global data.
7. Ignore stale responses during rapid switches, clear old-project rows, and
   preserve selected project across sidebar and detail navigation.
8. Unknown project returns 404. Missing data is unavailable without root fallback.
   Any temporary OSAC legacy adapter must be explicitly configured and bounded.
9. Retain the existing separate System Health evidence functionality. Delete or
   relocate the Execute replacement component only after checking other consumers.
10. Update OpenAPI, fixtures and consumer documentation in the same PR.

## 5. Verification

- OSAC parity: same feature rows, counts, metric meanings, filters, hierarchy,
  version attribution, baseline classifications, details and supported actions.
- EDM: actual feature inventory and Epic/version relations appear in the same UI;
  missing teams, producers, reviews or baselines show explicit unknown states.
- Third project: configuration alone enables the same collectors, API and UI.
- Isolation: OSAC ↔ EDM switches, slow responses, direct URLs, exports, refresh
  actions and invalid identities never read or modify another project's data.
- Evidence: all-item collection includes non-AI/no-PR features; deduplication,
  paginated history, reopened issues, direct Epic versions and incomplete joins
  have regression coverage. Workflow success cannot certify feature completion.
- Failure: empty success, partial sources, stale snapshot, total failure and
  profile changes have distinct behavior. Previous evidence remains honestly dated.
- Run repository-required tests, lint, build and API contract validation, plus
  browser checks of the same three tabs for both projects.

## 6. Merge and deployment sequence

1. Open data MR and app PR with matching contract fixtures and an OSAC parity report.
2. Merge data first and run collection. Verify both coherent project generations
   reach production storage; keep the existing app compatible during this step.
3. Merge/build/deploy the app PR. Verify actual backend/frontend image revisions
   and ready replicas rather than assuming merge implies deployment.
4. Read back Feature List, Feature Tracking and Epics by Release in production for
   both projects, including switching, detail links and applicable actions.
5. Update the production gap tracker with exact revisions and results. Remove the
   presentation split and migration fallback only when no consumers depend on them.

If collection fails, keep the last valid project generation with honest freshness.
If the app rollout fails, retained legacy OSAC output supports rollback. Do not
relax identity validation or relabel snapshots to make acceptance pass.

## Acceptance and boundaries

Done means one Execute UI, one consumer contract, shared profile-driven machinery,
OSAC parity and a populated EDM feature inventory in production. There is no
project-selected replacement dashboard. No bespoke code is required for the
third-project fixture.

Freeze/readiness policy, missing team attribution and optional pipeline producers
remain owner/source decisions. They do not block sharing the UI, but their metrics
must remain unknown until supported. Jira Hygiene is a separate coordinated effort;
this work must not absorb or conflict with its MR/PR.

The initial audit has been completed against the fetched main revisions before
implementation. The verification report records the consumer fields, source
ownership, endpoint/action isolation, local results and remaining production
checks. EDM policy-dependent values remain unknown; OSAC parity is measured
against its established inventory, detail and metric outputs.

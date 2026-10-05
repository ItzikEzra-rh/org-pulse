# Flight Control production gaps and repair plan

Recorded: 2026-10-05. Related epic: OSAC-5466.

Detailed FC-02 implementation plan: [Project-driven Jira Hygiene](jira-hygiene-implementation-plan-2026-10-05.md).
FC-02 implementation is merged in the requested order: data MR [!147](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/merge_requests/147) at 12:37:53Z, followed by app PR [#163](https://github.com/rh-ecosystem-edge/org-pulse/pull/163) at 12:39:19Z. The MR pipeline and app review CI passed. Post-merge app images built and pushed in run [37311043174](https://github.com/rh-ecosystem-edge/org-pulse/actions/runs/37311043174), but its production image-tag update was skipped because `APP_ID` or `APP_PRIVATE_KEY` is missing. Data main pipelines [18198893](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/pipelines/18198893) and [18199106](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/pipelines/18199106) were running/waiting for resources at last check. No production rollout, collection or authenticated readback is confirmed.

Production: https://org-pulse-ecosystem-poc.apps.rosa.appsres09ue1.24ep.p3.openshiftapps.com/

This is the working repair tracker for the deployment, published artifacts and
source code. It distinguishes source evidence and code behavior from a fresh
browser readback. Each repair is closed only after its candidate, checks and
production result are recorded.

## Current baseline

- The deployed frontend/backend pods are ready. Their build includes the
  project-selector implementation; a fresh browser readback was not available
  during this phase.
- Deployed frontend/backend image revision: `b618c7f1400250f73995598d1c4b63a1daa77283`.
- Data-puller image revision: `d392f077c9c36b64b69f7cf39926e79c5ba15be5`.
- Production data-sync read main revision `5634f7e8` at 06:31Z and published
  both Flight Control and OSAC project generations at 06:32Z. The latest log
  read at 06:47Z reported no further changes at `5634f7e8`.
- After FC-11 merged, EP Review collection succeeded in job 62683163 and
  published data main commit `fc17bb76`; production data-sync fetched and
  published that commit for both projects at 08:33Z. The overall scheduled
  pipeline 18192474 later failed in the separate release refresh because its
  design-doc registry profile revision did not match the current profile.
- PR #161 merged at 08:19Z and Build & Push Images run 37282885904 built and
  pushed app images tagged `236524cf`. Its automatic production tag update
  skipped because `APP_ID` and `APP_PRIVATE_KEY` are missing. The cluster still
  runs app image `b618c7f1`; deployment MR [!142](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/merge_requests/142)
  pins the built backend/frontend images and its pipeline passed.
- Flight Control artifacts exist: six teams, 23 people, 6,151 EDM issues,
  158 EDMRFE issues, 7,123 remote links and nine Jira AutoFix issues.
- Release execution evidence exists: 98 releases, 200 workflow runs,
  322 jobs and 96 artifacts. Its envelope is `fresh`, `partial=true` and was
  generated at 2026-10-04T16:41:06Z.
- The deployed documentation snapshot contained 17 features, 40 artifacts and
  56 PR links. Manual pipeline 18190729 published a newer source snapshot with
  17 features, 40 present artifacts and 58 PR links at 06:45:21Z; production
  sync to that revision is not yet confirmed.
- Build registry evidence exists: 1,359 packages from 38 sources; the envelope
  is `fresh`, `partial=true`, with four documented excluded scopes.
- Flight Control release registry and release-plan index contain 98 releases
  and 98 plan versions. The plan index is `freshness=unknown`, `partial=true`,
  generated at 16:48:57Z; `0.10.0` and `0.10.0-rc1` through `rc7` are present.
- Manual pipeline [18190729](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/pipelines/18190729)
  completed successfully at 07:05Z; all seven jobs passed, including OSAC builds,
  release refresh and the template updater. The release job read private
  `flightctl/design-docs` and published 17 features / 40 artifacts at 06:46Z.
  The newest scheduled pipeline
  [18190801](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/pipelines/18190801)
  was canceled before release refresh; the latest completed scheduled pipeline
  [18190219](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/pipelines/18190219)
  failed its OSAC build job. A scheduled run after the credential change is still
  needed. The successful manual run's AI-provenance source remains
  `unavailable`, `partial=true`, without a diagnostic reason; separately, its
  design-doc registry contains 10 document-level provenance stamps.
- OpenShift pod/image and data-sync reads succeeded in namespace
  `org-pulse-ecosystem-poc`. An unauthenticated request to the public route
  returned HTTP 403, so the production pages were not visually re-read.
- Phase 1 app PR [#160](https://github.com/rh-ecosystem-edge/org-pulse/pull/160)
  at `bb1eeb1464822b925e33db014a2033540b18f068` merged at 07:56Z. Its companion
  data MR [!140](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/merge_requests/140)
  at `8a9946a4846330535534ce6159213d9d0d14ddf2` merged at 07:58Z; pipeline
  18191486 passed. Production deployment is not confirmed.
- Local Phase 1 validation: 29 focused Vitest tests, two Operational Metrics
  Playwright checks, lint, production build, OpenAPI validation and seven data
  profile tests passed. The app PR has not been merged or deployed; production
  still serves the previously recorded app and data-puller image revisions.
- A healthy deployment does not establish successful scheduled collection
  or correct rendering on every page. Production serves committed snapshots;
  failed collection leaves those snapshots without a successful new refresh.

### Phase 1 route and sidebar inventory

Most artifact counts below describe the production data-sync revision
`5634f7e870ca36f06fb155e6cfa0c0db73a74b45`. The PRD/Design row also records
the newer source artifacts published by manual pipeline 18190729; production
sync to that generated snapshot is not yet confirmed.
The result column describes current route/view behavior found in source; the
public production route required an authenticated browser session for a fresh
screen-by-screen check.

| Sidebar destination | Flight Control source and freshness | OSAC source and freshness | Current screen/result evidence |
| --- | --- | --- | --- |
| **People & Teams** — Team Directory, People, Reports, Org Dashboard, My Teams | `sources/roster/registry.json`: supported, fresh, partial=false; 6 teams / 23 people; generated 16:29:49Z. | Same contract: supported, fresh, partial=false; 13 teams / 67 people; generated 16:33:18Z. | `/api/roster?projectId=…` reads only the selected project's roster and derives memberships from `person.teamIds`. |
| **AI Impact — PRD Review, Design Review** | Design docs: supported, fresh, partial=false; 17 features / 40 present artifacts / 58 PR links, generated 2026-10-05T06:45:21Z; 10 valid artifact-level provenance stamps are present. EP Review queried 68 Jira Feature issues but published 0 feature rows and 0 PRD rows, generated 2026-10-05T07:01:05Z. Live PR scan checked 90 issue comments and found 0 configured-bot score markers. | OSAC remains on its existing sources. | The collector only added rows when a score marker existed, while the non-OSAC `/features` endpoint returns top-level keyed rows but the client consumes `data.features`; the separate docs registry and provenance were not joined. Keep scores empty, but publish/display the feature inventory and verified AI-created stamps. See FC-11. |
| **AI Impact — Test Plan Review** | No separate Flight Control test-plan collector/publication is present. | OSAC's existing Test Plan Review remains separate. | Keep Flight Control empty/unavailable. Do not infer a collected test plan from design-doc presence or zero review rows. |
| **AI Impact — Documentation** (hidden from sidebar) | Same design-doc registry as above: supported, fresh, partial=false. | Existing OSAC documentation source remains separate. | Artifacts exist, but `Documentation` is disabled in the AI Impact manifest; navigation repair is FC-06. |
| **AI Impact — Jira AutoFix** | `sources/autofix/issues.json`: supported, fresh, partial=false; 9 issues, generated 16:30:09Z. | Same contract: supported, fresh, partial=false; 475 issues, generated 16:34:27Z. | Project-qualified issue artifacts are available to AutoFix. The manual collection job also succeeded in pipeline 18190729. |
| **AI Impact — AI Commits** | `sources/ai-provenance/registry.json`: supported, fresh, partial=false; registry generated 16:34:04Z. The embedded scanner says 20 repos and was generated 04:29:34Z. | OSAC keeps its existing scanner configuration. | Scanner proxy selects by project profile. The embedded page timestamp is older than its registry publication time and must remain visible as the source freshness. |
| **Product Builds — OSAC / Build Registry** | `sources/build-artifacts/registry.json`: supported, fresh, partial=true; 1,359 packages / 38 sources / 4 excluded scopes; generated 16:30:07Z. | OSAC keeps its existing build report. | Sidebar code labels the non-OSAC item `Build Registry` and the OSAC item `OSAC`. Coverage remains bounded. |
| **Releases — Schedule** | `releases/registry.json`: supported, freshness=unknown, partial=false; 98 releases, generated 16:28:26Z. | Same envelope: supported, freshness=unknown, partial=false; 10 releases, generated 16:33:10Z. | Registry reads are project-qualified. Release lifecycle stays unconfigured where product policy is absent. |
| **Releases — Execute** | Flight Control feature/version execution data is not published through the Releases execution source. | OSAC retains its existing feature execution data. | Flight Control route returns an explicit unavailable result. This differs from System Health → Release Execution, which has real Flight Control evidence. |
| **Releases — Jira Hygiene** | Raw Jira source is supported, fresh, partial=false (6,151 EDM issues); no Flight Control hygiene results/config are published in production. | Existing OSAC-only results/config remain. | Data MR !147 and app PR #163 are review candidates; production still has no EDM results, and Flight Control must remain isolated from OSAC data. |
| **Releases — Release Plan** | `releases/release-plans/index.json`: supported, freshness=unknown, partial=true; 98 versions including `0.10.0` and `0.10.0-rc1`–`rc7`; generated 16:48:57Z. | OSAC keeps its own plan source. | Project-qualified fetch exists, but the current view hard-codes OSAC in copy and heading. Phase 1 candidate resolves the selected profile name and uses a generic heading if discovery fails. |
| **System Health — Operational Metrics** | Operational-integrations registry marks UOI inapplicable / owner-approved OSAC-only; envelope supported, fresh, partial=false, generated 16:30:08Z. | UOI is the existing OSAC dashboard. | Current view embeds the OSAC URL for every project. Phase 1 data/app candidates make the disposition explicit and gate the iframe by project; production result awaits merge/build. |
| **System Health — CI Daily Digest** | No Flight Control digest publisher/artifact exists. | `sources/ci-digest/digest.json`: supported, fresh, partial=false, generated 16:58:26Z. | Route returns unavailable for Flight Control (`osac-only-data-source`); a Flight Control publisher remains optional. |
| **System Health — CI Duty** | Operational-integrations registry marks the source inapplicable / owner-approved OSAC-only. | Existing OSAC roster remains. | Route returns the Flight Control inapplicable disposition without OSAC rows. |
| **System Health — Component Maturity** | Operational-integrations registry marks the source inapplicable / OSAC-only. | OSAC source remains separate. | Navigation is disabled; no Flight Control result should render. |
| **System Health — Release Execution** | `sources/release-execution/registry.json`: supported, fresh, partial=true; 98 releases, 3 repos, 197 tags, 186 GitHub releases, 200 workflow runs, 322 jobs, 96 artifacts and 16 reports; generated 16:41:06Z. | OSAC remains on its own source. | This screen can render bounded Flight Control Actions evidence. Keep partial coverage and 13 unmatched versions visible; CI success is not feature completion/readiness. |

The shell uses `/api/projects` for the selector. Unknown project IDs go to the
shell's 404 state. The disabled AI Impact views (Implementation, Security
Review and Build & Release) and Releases → Deliver remain disabled; AI Factory
Guide is shared guidance rather than project evidence. Customer Insights,
Upstream Pulse and AI Catalyst Showcase are not Flight Control profile-backed
sources and are outside this project-scoped inventory.

## Current delivery summary after MR !143 merge

This summary supersedes older pending-deployment statements below. MR !143 merge is reported by the user; collection rerun and production screen verification are still pending.

| Gaps | Delivered | Remaining |
| --- | --- | --- |
| FC-01 / FC-07 | App PR #160 and data MR !140 merged; Operational Metrics capability gating and selected-project release labels are included in the deployed app image. | Production screen verification for Flight Control and OSAC. |
| FC-11 | Data MR !141 and app PR #161 merged; image deployment MR !142 merged and rollout verified. Collector publishes the full Feature inventory with evidence-based document/AI joins. | New collection and publication, then PRD/Design production screen verification. |
| FC-04 / FC-05 | MR !143 merged per user: collect design docs before traceability; publish project artifacts before later release collectors. 35 focused tests plus publication integration check pass. | Successful full scheduled refresh, updated artifacts, production sync and private-doc access verification. |
| FC-02 | Data MR [!147](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/merge_requests/147) and app PR [#163](https://github.com/rh-ecosystem-edge/org-pulse/pull/163) are merged in data-first order. | MR pipeline [18197577](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/pipelines/18197577) passed all jobs; app review checks passed. Post-merge images were pushed by [Build & Push Images 37311043174](https://github.com/rh-ecosystem-edge/org-pulse/actions/runs/37311043174), but production image-tag updates were skipped because `APP_ID` or `APP_PRIVATE_KEY` is missing. Data main pipeline [18198893](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/pipelines/18198893) was running and [18199106](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/pipelines/18199106) was waiting for resources. Live EDM collection, successful production publication/data sync, deployed-image confirmation and authenticated readback remain. |
| FC-03 | Shared Execute is implemented with the OSAC Feature List, Feature Tracking and Epics by Release tabs for both projects; OSAC remains the default. Data MR [!149](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/merge_requests/149) and app PR [#164](https://github.com/rh-ecosystem-edge/org-pulse/pull/164) are open. Data pipeline 18199308 and app Test & Build plus five integration suites pass on the current code commits. | Core Smoke, AI Eng Smoke and aggregate status checks pass. Merge !149 first, run a full refresh, verify matching profiles/registries/plans/tracking/Execute generations and production data-sync readback, then merge/build/deploy #164. Production screen readback remains open. |
| FC-06 / FC-08 | Source documentation and bounded release evidence exist. | Documentation navigation; freshness/partial coverage and unmatched-release diagnostics. |
| FC-09 / FC-10 | Findings recorded. | Investigate missing Jira team attribution and scanner/provenance count/status differences. |

Immediate next step: run the main-branch data pipeline, verify refreshed project-qualified PRD/Design envelopes and production sync, then read both screens. No additional app deployment is required for FC-11. Optional publishers, review agents and product/repository-scope decisions remain as described below.

### FC-02 project-driven Jira Hygiene implementation and verification

Data MR [!147](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/merge_requests/147), source commit 58884f538eb233efe77afc26ac47540610ab4d84, merged at 12:37:53Z as `d7a65250a34224cf1b959d7b61b55cae69031589`. App PR [#163](https://github.com/rh-ecosystem-edge/org-pulse/pull/163), source commit 3e467e937c5a76247e716ab42f5c62cb7d09ab20, merged at 12:39:19Z as `a9acb03378f1e307fdc4071aed8b04c6e76e4a17`. Both changes are merged; production deployment and readback are not confirmed.

The data candidate adds a reusable five-rule catalog and profile-discovered collector. OSAC retains its five existing rule IDs and query semantics, including the Epic rule's empty-parent behavior, and keeps writing the legacy root config/results from the same resolved rules. EDM enables only missing-assignee checks for configured status category In Progress; fix-version, hierarchy, component and Team checks remain disabled with explicit policy-pending reasons. The EDM profile has no Team mapping, so the collector neither fetches nor invents Team assignments. Results and resolved configuration share a project-qualified source envelope, and the CI checkpoint includes profile-bound collectors. The app candidate resolves the selected project by capability, returns 404 for an unknown project, never falls back across projects, and reuses the existing report for freshness, partial failures, successful-empty results and disabled-rule scope. Release-specific Hygiene workflows remain outside this change.

Local verification:

- After rebasing onto data main 1ca9c9097ebe3ddcfdbd62298471b4b4f62ef0bc, the full Data unittest discovery passes. Hygiene catalog/collector tests: 22 passed; CI-contract tests: 4 passed; sidecar-sync tests: 22 passed, including checked-in OSAC and Flight Control publication acceptance.
- The first MR pipeline [18196672](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/pipelines/18196672) failed sidecar acceptance because its then-current release registry revisions lagged the profiles. Main subsequently published coherent registry/profile revisions. The rebased MR pipeline [18197577](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/pipelines/18197577) passed all three jobs before the MR merged; no stale revision was fabricated and sidecar validation remains strict.
- Hygiene Playwright tests: 7 passed; project selection and EDM-switch browser checks: 2 passed. Earlier lint, build, module/platform validation and OpenAPI validation passed.
- Full app CI on fcaf4e43 reported 6,170 passed, 9 skipped and one failed project-discovery order assertion; smoke jobs were skipped after Test & Build failed. Commit 66e78e35 corrected that assertion, passed Test & Build and Jira Hygiene integration, but Core and AI Eng smoke tests then failed on a missing project-qualified OSAC roster publication.
- The selector intentionally defaults to the first catalog entry, so OSAC remains first. Commit 3b34b35e's client fallback still allowed Chromium to record the expected project-qualified 404 as a console error. Commit 3e467e93 moves migration handling to the server: only a registered OSAC profile with no project roster artifact can use the preserved legacy OSAC roster. Flight Control and unknown projects never fall back. Focused Hygiene route, project-profile and roster migration tests: 42 passed; changed-file lint and diff checks passed. Local selector tests: 18 passed; onboarding browser checks: 2 passed. A local container smoke run could not start because Podman's `/run/user/.../libpod` directory is read-only. The full local suite reported 6,123 passed, 9 skipped and 55 failures caused by sandbox `listen EPERM` in existing HTTP-server tests; remote CI passed the full suite in its supported runner. [CI run 37310017226](https://github.com/rh-ecosystem-edge/org-pulse/actions/runs/37310017226) passed Test & Build, Core Smoke, AI Eng Smoke and Smoke Test Status. [Integration run 37310017297](https://github.com/rh-ecosystem-edge/org-pulse/actions/runs/37310017297) passed People & Teams, Jira Hygiene and Integration Test Status. CodeRabbit and AI Config Guard passed. The local demo store lacks project-qualified roster artifacts, so its earlier 404 is not production verification.
- Post-merge app workflow [37311043174](https://github.com/rh-ecosystem-edge/org-pulse/actions/runs/37311043174) passed tests, image builds/pushes and Core Smoke. Its `Update Prod Image Tags` job skipped the tag changes and deploy commit because required GitHub Actions secrets `APP_ID` or `APP_PRIVATE_KEY` are missing. Thus built images are available, but no production deployment is confirmed. Data main pipelines [18198893](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/pipelines/18198893) (running at SHA `e41205ad`) and [18199106](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/pipelines/18199106) (waiting for resources at SHA `c2bd8add`) have not yet verified a successful post-merge collection/data sync.
- CodeRabbit's two failed/empty-result findings were verified and fixed on 66e78e35. No live EDM query was run because Jira credentials are unavailable in this environment. The configured active-status-category query and successful collection remain production checks.

Both changes merged in the requested order, and all PR/MR review checks passed. Remaining FC-02 production gates, in order:

1. Confirm a successful main-branch data pipeline and collection after MR !147, then verify matching profile/config/result revisions for OSAC and EDM, EDM active-category query and issue links, OSAC rule parity and legacy root artifacts, and successful production data-sync readback with the source timestamp.
2. Resolve the skipped production image-tag update through the authorized credential owner or approved deployment process; confirm prod frontend/backend image revisions before counting the app as deployed.
3. In an authenticated production session, verify OSAC and EDM, project switching, unknown-project 404, no cross-project rows, freshness, partial failures, successful-empty output and disabled-rule explanations. Keep FC-02 open until these checks are recorded.

Both review changes were merged by the user in data-first order. No production deployment or authenticated readback is confirmed.

## Issue register

All entries below remain open unless marked as an investigation or expected gap.

| ID | Priority | Finding | Evidence and cause | Required outcome |
| --- | --- | --- | --- | --- |
| FC-01 | P0 | Operational Metrics can show OSAC content while Flight Control is selected. | `OperationalMetricsView.vue` unconditionally embeds `product=osac&team=osac`. The Flight Control operational-integrations registry marks UOI inapplicable, but its profile has no dedicated Operational Metrics capability yet. | Phase 1 candidate adds a project capability, exposes only its bounded public fields, and gates the iframe on the selected project. Flight Control must not mount/request the OSAC iframe; OSAC retains its configured view. |
| FC-02 | P1 | Flight Control Jira Hygiene results are missing in production. | Raw EDM Jira records exist. Data MR [!147](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/merge_requests/147) and app PR [#163](https://github.com/rh-ecosystem-edge/org-pulse/pull/163) are merged in data-first order, and their review pipelines passed. The post-merge data pipelines [18198893](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/pipelines/18198893) and [18199106](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/pipelines/18199106) were running/waiting for resources at last check. App images built and pushed, but the production image-tag update skipped because GitHub Actions is missing `APP_ID` or `APP_PRIVATE_KEY`; production deployment is unconfirmed. | Keep FC-02 open until a successful post-merge OSAC/EDM collection and project-qualified publication are verified, production data sync is read back, an authorized image-tag update is completed, and authenticated project isolation/report states are checked. EDM fix-version, hierarchy, component and Team rules remain disabled pending policy confirmation. |
| FC-03 | P1 | Production Flight Control Releases → Execute still lacks the shared OSAC baseline UI. | Data MR [!149](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/merge_requests/149) and app PR [#164](https://github.com/rh-ecosystem-edge/org-pulse/pull/164) are open. The app reuses the same project-qualified Execute contract and OSAC tabs; six fixture screenshots and three Playwright cases cover both projects, switching and unknown-project 404. Data pipeline 18199308, app Test & Build and all five integration suites pass; Core Smoke, AI Eng Smoke and aggregate status checks also pass. | Merge data first; verify coherent OSAC/EDM profile, registry, plan, tracking and Execute generations plus data-sync readback. Then merge/build/deploy the app and verify authenticated OSAC/Flight Control screens. Keep CI success, Feature completion and readiness distinct. |
| FC-04 | P1 | Scheduled refresh is not yet verified end-to-end after the credential change. | Latest completed scheduled pipeline 18190219 failed `refresh-osac-builds-data` (job 62671032) with HTTP 403 and a missing `actions` scope. Manual pipeline 18190729 completed all seven jobs successfully; scheduled 18190801 was canceled before release refresh. | Complete a successful scheduled chain through collection, publication and template update using the new credential. Verify the resulting source timestamps and production sync for both projects. |
| FC-05 | P1 | Flight Control private design-doc access needs final scheduled-run confirmation. | Earlier job 62648395 in pipeline 18180605 failed on `repos/flightctl/design-docs/git/trees/main?recursive=1` with HTTP 404. Manual pipeline 18190729 completed successfully, read `flightctl/design-docs`, and published 17 features / 40 present artifacts. | Confirm a scheduled run completes publication and production data-sync consumes it. Preserve an honest inaccessible/failure status if a later run reports one. |
| FC-06 | P2 | Documentation is hidden from navigation despite available data. | `modules/ai-impact/module.json` disables the Documentation navigation item. A project-aware documentation route/view and Flight Control artifacts exist. | Expose the supported Documentation screen through the sidebar, preserving project selection and OSAC behavior. |
| FC-07 | P2 | Flight Control release plans display OSAC labels. | `modules/releases/client/views/ReleasePlanView.vue` contains OSAC-specific copy and an `OSAC` plan heading although the served plan is project-qualified. | Use the selected project's display name in headings and copy. Switching projects must never leave a stale label or plan. |
| FC-08 | P2 | Release evidence status is not fully exposed. | Flight Control release-plan envelopes have `freshness=unknown` and `partial=true`; the plan screen mainly exposes a generated timestamp. System Health Release Execution says bounded evidence but does not explicitly surface the partial flag. There are 13 unmatched release versions. | Display freshness and partial coverage explicitly, including unmatched-version diagnostics where useful. Freeze/readiness/shipped remain unknown until product policy is approved. |
| FC-09 | Investigation | Issue-to-team attribution may be incomplete. | All 6,151 collected EDM issue records have `team: null`; sampled team custom fields are null. The six-team roster and person memberships are separate and present. | Determine which screens require issue-to-team attribution and whether the Jira field or a documented join can supply it. Report unknown when absent; do not fabricate team assignments. |
| FC-10 | Investigation | AI scanner and collected marker counts need reconciliation. | The published scanner's reported 15 Jira marker signals differ from the collected snapshot's 18 markers. Scanner content timestamp is 2026-10-04 04:29 UTC; an envelope was refreshed later that day. Manual pipeline 18190729 completed, but its AI-provenance source remained `unavailable`, `partial=true`, without a diagnostic in the job log. | Compare definitions, issue IDs and timestamps before classifying the count difference. Diagnose why the source envelope is unavailable; expose source freshness and do not republish an old scanner page as newly generated. |
| FC-11 | P1 | Flight Control PRD Review and Design Review hide the collected feature inventory. | Latest design-doc registry has 17 feature folders, 40 present artifacts, 58 PR links and 10 valid artifact-level provenance stamps. The EP Review collector queried 68 EDM Feature issues but emitted 0 rows because its row construction requires a bot review marker; live scan found 0 valid markers in 90 issue comments. The non-OSAC `/features` endpoint also returns keyed rows at the top level while the Vue composable reads `data.features`, and no docs/provenance join exists. | Publish and display all 68 Jira Features, enrich the 17 documented ones with exact PR/doc links, and show an AI-created badge only for a verified stamp. Keep review scores/status empty until a real bot marker exists; keep missing and unavailable docs distinct. |

### Pipeline evidence

- Latest completed failed scheduled pipeline: [18190219](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/pipelines/18190219); its OSAC build error says the token lacks the `actions` scope ([job 62671032](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/jobs/62671032)).
- The earlier matching artifact download/scope failure is [62669349](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/jobs/62669349).
- Earlier release collector/private repo read failure: [62648395](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/jobs/62648395). Manual pipeline [18190729](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/pipelines/18190729) later completed successfully, including the Flight Control design-doc read and publication.
- Newest scheduled pipeline [18190801](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/pipelines/18190801) was canceled before release refresh. Latest completed scheduled pipeline [18190219](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/pipelines/18190219) failed its OSAC build job; a successful scheduled run after the credential change remains outstanding.

### Read-only credential probe (2026-10-05)

The local diagnostic token authenticated as `ItzikEzra-rh`, with classic
scopes `repo, write:packages`. It read all eight configured repositories,
including private `flightctl/design-docs`. For `osac-project/osac`, workflow
runs and artifact listings succeeded; an unexpired artifact was found and the
download endpoint returned its authorized redirect. OSAC package listing and
metadata reads for `charts/osac`, `charts/osac-operator` and `charts/osac-ui`
also succeeded.

This verifies the local account's access, not GitLab CI's `assisted-bot`
credential. Manual pipeline 18190729 using the updated CI credential completed
all seven jobs, including OSAC builds, release refresh, private Flight Control
design-doc collection and template update. FC-04 remains open until a scheduled
run and production sync are confirmed. FC-05 remains open until the scheduled
run and sync confirm the private-repository read. The diagnostic token has
package write permission; CI only needs package read access for this collector.

FC-04 and FC-05 were separate failures. The current run has made progress on
both, but only a completed publication and successful data sync can close them.

## Coverage limits and expected empty screens

| Surface | Current disposition | Completion condition |
| --- | --- | --- |
| PRD Review and Design Review | Review scores are honestly empty: the live scan found no valid score marker. The collected 68-issue Feature inventory and 17 documented features are hidden by collector marker gating and a response-shape mismatch; 10 valid artifact-level provenance stamps are not joined into app rows. | FC-11 restores the full inventory independently of review scores, links exact PR/docs evidence and tags AI-created only where a verified provenance stamp is linked. Review scores remain empty until real marker reviews are collected. |
| Test Plan Review | No Flight Control test-plan collector/source yet. | Add a collector and publish a supported project-qualified contract when this capability is commissioned. |
| CI Daily Digest | No Flight Control digest publisher. | Deploy a publisher, configure its source and verify the collected digest. |
| CI Duty, Component Maturity, Product Pages and UOI/Conforma | Inapplicable under the current approved Flight Control profile. | Show the approved disposition. FC-01 is the confirmed exception: the Operational Metrics implementation still embeds OSAC content. |
| Product Builds | Supported but partial: 38 sources and four documented excluded scopes; the UI already warns about partial capture. | Keep coverage explicit. Expand collection only if required; do not describe the current registry as exhaustive. |
| Release execution registry | Bounded Actions evidence with 13 unmatched versions. | Retain bounded coverage and unknown readiness; investigate joins without silently discarding unmatched evidence. |
| Release freeze/readiness/shipped | Unknown pending product policy. | Product owner approves predicates before these statuses can be computed. |
| 41 outside PR-field links | Repo-scope decision remains with Amir. | Obtain the scope decision and apply it consistently to collection and traceability. |

## Delivery plan

### Phase 1 — establish the baseline and contain incorrect project content

1. **Complete:** Read production image revisions, data-sync revision and current
   manual/scheduled pipeline state. Manual pipeline 18190729 completed all seven
   jobs with the updated credential; a post-change scheduled run and production
   sync are still outstanding under FC-04/FC-05.
2. **Complete for source/API evidence:** Inventory project-scoped destinations
   and their source state, freshness, timestamps and partial coverage in the table
   above. The live production screen read remains pending because the route returns
   HTTP 403 without an authenticated browser session.
3. **Merged:** Gate Operational Metrics on the selected project's capability.
   Data MR [!140](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/merge_requests/140)
   declares OSAC supported and Flight Control inapplicable. App PR
   [#160](https://github.com/rh-ecosystem-edge/org-pulse/pull/160) fails closed,
   binds the dashboard product ID to the selected profile, and preserves the
   OSAC iframe. The data pipeline passed; production deployment is not confirmed.
4. **Merged in PR #160:** Replace hard-coded OSAC Release Plan labels with
   the selected published project display name; use a generic heading when
   project discovery is unavailable.
5. **Local candidate checks complete:** 29 focused tests, two browser checks,
   lint, build, OpenAPI validation and seven profile tests passed; app PR #160 CI
   was green. After the data and app changes are deployed, repeat authenticated
   production screen checks.

Acceptance: Flight Control never loads an OSAC operational iframe; OSAC retains
its operational view. Unknown projects return 404. Rapid switching and sidebar
navigation preserve the selected project and cannot render stale data. Phase 1
remains open until the candidates are merged/deployed and the affected screens
are read in an authenticated browser session.

### Phase 2 — restore scheduled collection

1. Identify the credentials used by the failing builds and release jobs without
   printing tokens. Verify artifact-download permission and private-repo read access.
2. Correct credential grants/configuration through the existing secret-management
   mechanism. Repository changes cannot themselves grant a token access.
3. Review pipeline dependencies and failure reporting. An OSAC failure must not
   silently imply a successful Flight Control refresh; retain failure visibility
   and last-known-good artifacts. Consider independent project jobs if appropriate.
4. Run the full pipeline after the authorized credential/configuration changes.
5. Check actual source timestamps, not merely job success or publication time.

Acceptance: OSAC builds collection and Flight Control design-doc reads succeed;
release refresh and publication complete; the intended updater runs. Production
data sync reads the published revision and serves the new project-qualified artifacts.

### Phase 3 — fill the missing supported screens

1. **FC-03 implementation candidate:** derive the same Releases → Execute tabs
   from the selected project's shared Jira Feature/Epic inventory, version registry
   and configured producer evidence. Flight Control's bounded Actions evidence
   remains in System Health; workflow success is not feature completion/readiness.
   Merge data first, verify generation publication, then merge/deploy the app.
2. **Implemented in data MR !147:** a shared catalog and profile configuration preserve OSAC semantics and enable only EDM missing-assignee checks for the configured active status category. Keep EDM fix-version, hierarchy, component and Team rules disabled with explicit policy reasons until owners confirm those policies.
3. **Implemented across data MR !147 and app PR #163:** collect and publish project-qualified result/config envelopes, preserve legacy OSAC artifacts, resolve the selected project by capability, and return 404 for unknown projects without cross-project fallback. Complete the merge, collection, data-sync and authenticated screen checks recorded above.
4. Enable the supported Documentation navigation item (FC-06).
5. Render freshness, partial coverage and diagnostics consistently (FC-08).

Acceptance: Releases → Execute shows real Flight Control evidence; Documentation is reachable from the sidebar. For FC-02, results are accepted only after the data-first merge and production verification above. Empty, unavailable and inapplicable remain distinct states.

### Phase 4 — resolve data investigations and optional sources

1. Fix FC-11 so the base Flight Control Feature inventory, linked design docs and
   PRs appear independently of review scores. Join verified provenance stamps to
   the right feature and show the AI-created tag only where that stamp exists.
2. Resolve FC-09 with the Jira field/schema owner and consumers; fix real joins
   where supported and retain unknown attribution otherwise.
3. Reconcile FC-10 by comparing source issue IDs, marker definitions and timestamps.
   Validate that `stair` never counts as AI evidence and that issues without AI
   signals remain collected with empty signals.
4. Coordinate marker-review agents, digest publisher and test-plan collector with
   Flight Control owners. Track these independently from the app/refresh repairs.
5. Record product release-policy and Amir's outside-repo scope decisions.

Acceptance: every investigation has either a documented explanation or a verified
fix. Optional sources remain explicitly empty/unavailable until real evidence exists.

## Proposed reviewable changes

| Deliverable | Scope | Dependencies |
| --- | --- | --- |
| Phase 1 app PR | [#160](https://github.com/rh-ecosystem-edge/org-pulse/pull/160), commit `bb1eeb1464822b925e33db014a2033540b18f068`: FC-01 capability-gated Operational Metrics and FC-07 project-aware Release Plan labels. | Merged at 07:56Z after all checks passed. Production deployment is not confirmed. |
| Phase 1 data MR | [!140](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/merge_requests/140), commit `8a9946a4846330535534ce6159213d9d0d14ddf2`: OSAC supported and Flight Control inapplicable Operational Metrics capability entries. | Merged at 07:58Z; pipeline 18191486 passed. Production publication/deployment is not confirmed. |
| Project-driven Jira Hygiene data MR | [!147](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/merge_requests/147), source commit 58884f538eb233efe77afc26ac47540610ab4d84, merged at 12:37:53Z as `d7a65250a34224cf1b959d7b61b55cae69031589`; based on data main 1ca9c909; 10 changed files. | MR pipeline [18197577](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/pipelines/18197577) passed all three jobs. The earlier 18196672 sidecar failure was resolved by rebasing onto coherent profile/registry snapshots; validation was not weakened. Post-merge main pipeline [18198893](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/pipelines/18198893) is running and scheduled pipeline [18199106](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/pipelines/18199106) is waiting for resources. Production collection/data sync remains unverified. |
| Project-driven Jira Hygiene app PR | [#163](https://github.com/rh-ecosystem-edge/org-pulse/pull/163), source commit 3e467e937c5a76247e716ab42f5c62cb7d09ab20, merged at 12:39:19Z as `a9acb03378f1e307fdc4071aed8b04c6e76e4a17`; based on rh-ecosystem-edge/org-pulse:main 8aff6b6d; 19 changed files. | Focused Hygiene route/profile/roster tests: 42 passed; selector tests: 18; lint and diff checks pass. CI [37310017226](https://github.com/rh-ecosystem-edge/org-pulse/actions/runs/37310017226) passed Test & Build, Core Smoke, AI Eng Smoke and Smoke Test Status; Integration [37310017297](https://github.com/rh-ecosystem-edge/org-pulse/actions/runs/37310017297) passed People & Teams, Jira Hygiene and Integration Test Status; CodeRabbit passed. Post-merge workflow [37311043174](https://github.com/rh-ecosystem-edge/org-pulse/actions/runs/37311043174) built and pushed frontend/backend images and passed Core Smoke, but skipped production image-tag update because `APP_ID` or `APP_PRIVATE_KEY` is missing. Deployment and readback remain unverified. |
| Shared Releases → Execute | FC-03: data MR [!149](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/merge_requests/149) and app PR [#164](https://github.com/rh-ecosystem-edge/org-pulse/pull/164) are open on isolated branches. | Data pipeline 18199308, app Test & Build, five integration suites, Core Smoke, AI Eng Smoke and aggregate status checks pass. Merge data first, verify coherent production data sync, then merge/deploy the app and complete authenticated production readback. |
| Data pipeline follow-up | Confirm a successful scheduled run and production sync for FC-04/FC-05; diagnose FC-10's unavailable provenance source. | Updated CI credential; inspect source timestamps and the consumed data revision. |
| PRD/Design inventory fix | FC-11 data MR [!141](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/merge_requests/141), commit `12f66b2bb590407477e3a33a30723703352f69e8`, and app PR [#161](https://github.com/rh-ecosystem-edge/org-pulse/pull/161), latest commit `a41e159da39d6755bf4510161e327b7b82a8e6d9` (includes the normalized-design-status review fix). The collector publishes the full Feature inventory with project-qualified docs/PR/provenance joins; the app renders those rows and only verified AI-created tags. | Both merged. MR !141 pipeline [18192191](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/pipelines/18192191) passed; EP Review job [62683163](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/jobs/62683163) succeeded, and production data-sync published commit `fc17bb76` at 08:33Z. The full scheduled pipeline failed later in Release refresh; see FC-08/FC-10 follow-up. |
| FC-11 app deployment | [MR !142](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/merge_requests/142), commit `7945d227fc72ea59ca6633071a0980b049020b07`: update only BACKEND_IMAGE and FRONTEND_IMAGE in the production template to successful #161 build tag `236524cf87a328003db9535bc55962db73fa3053`. | CI pipeline [18193093](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/pipelines/18193093) passed; MR is mergeable. Automatic GitHub image-tag update skipped due missing `APP_ID`/`APP_PRIVATE_KEY`. Production still runs `b618c7f1`; user merge and rollout/readback remain pending. |
| Operational credential change | Actions artifact permission and private design-doc repository access. | Authorized credential owner; no secret values committed. |
| Deployment change, if required | Update image revisions using the established app-interface/template mechanism. | Reviewed changes, successful image builds and publication. |

Use feature branches and reviewable PRs/MRs; do not edit remote main directly.
The user performs merges. Do not bypass a failing data pipeline by calling the
deployment alone proof of a successful refresh. Pin deployment revisions only
after confirming the intended images and published artifacts.

## Verification and merge gates

- [x] Record exact app/data candidate commits and source artifact timestamps.
- [x] Run focused checks for project isolation, capability handling and changed routes.
- [ ] Validate Flight Control/EDM hygiene rules against real issues, including absent fields.
- [x] Run the relevant existing project-switching and Operational Metrics integration checks.
- [ ] Complete required PR/MR CI and image builds; distinguish infrastructure failure
      from passing application validation without calling failed CI green.
- [ ] Read every affected screen in the candidate UI for Flight Control and OSAC.
- [x] Test stale-request handling during a project switch in Operational Metrics.
- [ ] Test app-wide navigation persistence and unknown-project 404 behavior.
- [ ] Confirm Jira collection uses `state=all`, including issues without AI signals.
- [ ] Confirm nine real Flight Control AutoFix issues and unchanged OSAC behavior.
- [ ] Verify scanner provenance, private documentation access and remote-link joins.
- [ ] Verify supported/empty/unavailable/inapplicable states, freshness and partial coverage.
- [ ] Complete one successful full scheduled-data path through release collection/publication.
- [ ] After the user merges, confirm production image and data revisions match the candidates.
- [ ] Repeat affected production screen checks and record any remaining owner-dependent gaps.

## Closure record

For each issue, append: status, PR/MR URL, commit, checks run, artifact generation
time, deployed revision and production result. Link screenshots or captured
responses when available. Do not close an issue solely because a PR merged.

Phase 1 PR [#160](https://github.com/rh-ecosystem-edge/org-pulse/pull/160) and MR
[!140](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/merge_requests/140)
are merged. FC-11 MR [!141](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/merge_requests/141)
and app PR [#161](https://github.com/rh-ecosystem-edge/org-pulse/pull/161) are
merged. The EP Review snapshot is synced to production at `fc17bb76`. Deployment
MR [!142](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/merge_requests/142)
is green and mergeable; production still runs the old app image until it is
merged and rolled out. The scheduled data pipeline also has a separate Release
refresh failure that needs follow-up.

Overall completion requires the supported screens to work for Flight Control,
OSAC parity to hold, no cross-project data rendering, and refresh automation to
complete. Owner-dependent optional capabilities remain visible as documented gaps.


### Follow-up verification after MR !142 merge

- Production backend and frontend successfully rolled out image `236524cf87a328003db9535bc55962db73fa3053`; both pods are ready. Data-sync reports main snapshot `6abeffc2484d543707b5ef12b8c16c9fbabf7624`.
- PRD/Design remains unresolved: the published Flight Control EP-review artifacts are from run `18191341`, generated `2026-10-05T07:36:22Z`, before MR !141 merged. The committed feature envelope reports **68 searched features and zero rendered feature rows**. The earlier claim that the Jira search returned zero was incorrect.
- Current Jira source inventory contains 271 Feature issues; the docs registry contains 17 documented features and 58 PR links. Offline projection with the merged collector and the matching collection profile produces 271 PRD rows and 271 Design rows. Live review API calls were disabled for this check; this is not production screen verification.
- The successful legacy EP Review job only publishes root OSAC artifacts; project-qualified review sources are collected and published by `refresh-releases-data`. Its publication occurs after later collectors, so an intervening failure leaves the old Flight Control envelopes in production.
- Follow-up change: publish complete project snapshots immediately after the project review collectors, before unrelated release collectors. Preserve later failure reporting. Scope: `.gitlab-ci.yml` plus regression contract coverage; the draft Jira fallback was discarded.
- Validation: 21 focused tests pass. A temporary Git remote integration check confirms fresh project files are pushed even when a later command fails.
- Acceptance still required after merge: rerun collection; confirm new Flight Control review envelope timestamps, populated project-qualified rows, production data-sync commit, and authenticated PRD/Design screen readback. The application image is already deployed.

- Follow-up MR: [!143](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/merge_requests/143), commit `c570170b80cd8ae4ba232bcea302c715075f4898`, targets `main`; scope verified as two files. MR pipeline [18193784](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/pipelines/18193784) was running at verification.

- Confirmed blocker from [job 62683164](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/jobs/62683164) in scheduled pipeline `18192474`: `build-project-traceability.py` raises `ValueError: design-docs artifact profile revision does not match profile`. The job runs traceability before refreshing the docs registry, so it stops **before** project review collection. Legacy EP Review job `62683163` succeeds but does not refresh these project-qualified files.
- MR !143 now also moves traceability after design-doc collection, preserving strict revision checks. Final scope remains two files; latest commit `99720a4`. Validation now includes **35 passing** collector/traceability/CI contract tests plus the publication integration check. Earlier statements attributing this specific failure to a later collector were incomplete; later failure isolation remains part of the MR.


### Collection rerun after MR !143

[Job 62690199](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/jobs/62690199)
in pipeline `18193821` ran with merged MR !143. The ordering failure is fixed,
but GitHub returned HTTP 404 for `repos/flightctl/design-docs/git/trees/main?recursive=1`.
The job stopped before project EP-review collection/publication. The user
confirmed this is a token issue and is repairing CI repository access.
`GH_TOKEN` takes precedence over `GITHUB_TOKEN`; the active token must be able
to read the private repository and have any required organization/SSO approval.
After the credential is repaired, rerun collection and repeat FC-11 acceptance.

### FC-03 — Releases Execute work in progress

An isolated app branch based on organization main `236524cf87` is implementing
a Releases-owned API and view for the existing project-qualified release
execution registry. It displays collected releases, workflow runs, jobs and
artifacts, exact source links, release-ID joins, freshness and partial coverage.
Workflow conclusion takes precedence over lifecycle status. No inferred
feature completion or product readiness. OSAC retains its existing feature
tabs. Wrong-project responses and late responses after switching are rejected.
PR and final validation results are pending.


### FC-03 reviewable delivery

- App [PR #162](https://github.com/rh-ecosystem-edge/org-pulse/pull/162), commit `3f541b82`: generic profile-configured Execute presentation and artifact reader. No Flight Control project-name branch in the new view. Read configured release evidence with explicit producer joins, source links, partial coverage and freshness. Workflow conclusions take precedence over lifecycle status; readiness/completion stay unknown.
- Data [MR !144](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/merge_requests/144), commit `7f763ff`: OSAC declares `feature-execution`; Flight Control declares `release-evidence` with its existing artifact key. New projects using this collector configure the same source/capability. Other pipeline contracts still require a compatible collector.
- Browser acceptance found and fixed a shared Home-to-sidebar context bug: sidebar navigation now preserves the current shell project rather than relying on view-local route parameters.
- Validation: **6,152 app tests passed, 9 skipped**; 2 fixture-backed Playwright browser checks passed (Flight Control → OSAC → Flight Control and unknown-project 404); lint, production build and OpenAPI validation passed. Seven data profile tests passed. A third-project unit test exercises the same evidence reader/presentation without project-specific code.
- Deployment order: merge !144 and repair the CI credential, rerun profile/data publication and verify the new OSAC capability is published; then merge/build/deploy #162 and check Execute in production for both projects. Application and data CI status should be checked before merging. FC-03 remains open until production readback.

- Final FC-03 follow-up: app PR #162 head `f6c4217f` includes the explicit OSAC demo capability and matching fixture revision. Existing OSAC Execute UI integration check also passes (three browser checks total); 66 profile/selector checks pass after the fixture update. Data MR !144 CI is **green and mergeable**. App CI remains pending. Production has not been changed by these branches.

- MR !144 merge confirmed at `2026-10-05T09:48:32Z`, main merge commit `4b0ac0ba4790741363cecbcc31a987e5c2ccd8d9`. PR #162 remains open; Test & Build and Test releases were still running at this check. Profile publication/collection and production readback remain pending; the config merge alone does not publish the new profile envelopes.


### Follow-up: job 62691951

Pipeline `18194286` / [job 62691951](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/jobs/62691951)
successfully collected 17 design-doc features / 40 artifacts, proving private
repository access worked for that run. It then failed with `remote-links
artifact profile revision does not match profile`: traceability still ran
before remote-link collection. The earlier docs-order fix missed this input.

[MR !145](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/merge_requests/145),
commit `6199a15`, moves remote links before traceability and checks the order of
all four producers (Jira, GitHub, docs, remote links). Strict revision/identity
checks stay intact. Forty-six focused tests pass. Merge after CI, then rerun
collection and confirm fresh project review publication and production sync.
The failed run stopped before EP-review collection/publication.


### PR #162 merge and rollout status

PR #162 merge confirmed at `2026-10-05T10:08:26Z`; merge image commit
`8aff6b6d7ee46edf473ca9dec0181b7e005a64e6`. Build & Push Images run
[37294637329](https://github.com/rh-ecosystem-edge/org-pulse/actions/runs/37294637329)
is running (npm test phase at this check). Production backend/frontend are
ready but still pinned to `236524cf87`; the new Execute view is not deployed.

Data pipeline `18194848` is the active manual rerun: preceding refresh jobs
passed, but Release refresh job `62694136` is `waiting_for_resource`. Project
profile/review publication from this rerun is not confirmed. Scheduled pipeline
`18195006` was canceled; `18195028` only queues People & Teams.

## Build collector profile-revision recovery — MR !146

Job 62694136 failed because the build registry retained profile revision `9e7d48c94586ac48` while the published profile had `c4526ee0fc8e869f`. [MR !146](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/merge_requests/146) allows fresh collection while excluding old-revision fallback and rejecting foreign project identity. Local collector CI suite: 232 tests passed. Live isolated collection: 1,359 package records / 38 sources / zero failed sources, supported/fresh/partial under the current revision. No production writes. Pending: MR CI, user merge, successful refresh/publication, template update, and production image/data verification.

### MR !146 follow-up: snapshot acceptance repaired

The initial MR pipeline also detected profiles published ahead of their release registry/plan revisions. The checkpoint now waits for coherent registries, execution evidence and generated plans. Approved CI-only repair job 62699116 collected real sources successfully; generated snapshots were added in commit `4bbb09515f73a8ef4c071a079ed31940d6bc00d3`, and the temporary repair job was removed. Local checks: 237 collector/ordering tests and all 22 sidecar tests passed. Latest MR pipeline [18196589](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/pipelines/18196589) passed all three jobs. Pending user merge, full refresh and production image/data verification; production unchanged.

## Shared Execute UI correction — MR !149 / PR #164

Product clarification: OSAC is the reusable UI baseline; project selection changes
the data and evidence states, not the dashboard. The candidate keeps the same
Feature List, Feature Tracking and Epics by Release tabs for OSAC and Flight
Control. OSAC stays first in the project catalog and remains the default when
there is no saved project context. System Health → Release Execution remains a
separate evidence view.

The data MR [!149](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/merge_requests/149), head
`71b36f58d4d1fbe2a796e6c09d3cb32dea69abe1`, targets data `main` from base
`45e1af96fc293f4130a9af084c05fb4da064dfbc`. The app PR
[#164](https://github.com/rh-ecosystem-edge/org-pulse/pull/164), current code head
`8b121dd159f0fa8413b4aa565fca3bc1f5f2a981`, targets app `main` from base
`a9acb03378f1e307fdc4071aed8b04c6e76e4a17`. Both use the isolated branch
`codex/shared-release-execute-20261005`; the bases include the !146 build-collector
recovery/ordering changes, !148 checkpoint transaction repair and merged Jira
Hygiene PR #163. Legacy OSAC files remain intact.

The project-qualified contract publishes an index, per-Feature details and
tracking artifacts with compatible profile/Execute revisions and generation
identity. OSAC's established feature and pipeline-owned metrics keep their
existing meanings. The real Flight Control Jira payload contains 271 Features,
440 Epics and 51 Epics without a linked Feature; 20 release entries carry Feature
scope. Missing Team attribution, compatible pipeline metrics, readiness and
scope-baseline policy remain unknown. The data MR does not fabricate new
project-qualified outputs from mismatched source generations; a full ordered
refresh must publish compatible profiles, registries, plans and Execute data.

Fixtures cover OSAC parity, Features without AI markers or PRs, hierarchy and
version attribution, empty/partial/unavailable/failure states, switching and
actions, and a differently named third project configured without project
specific code. Local checks: data CI unittest list 340 passed; release-plan
contract 9 passed; sidecar 24 passed; app `npm test` 6,189 passed and 9 skipped;
lint, build, module/platform and OpenAPI checks passed. Three Playwright cases
cover the same three tabs for both projects, stale responses during switching,
and unknown-project 404; six local fixture screenshots are linked in the
verification report. These are not production readbacks.

Remote CI: data pipeline
[18199308](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/pipelines/18199308)
passed all three jobs. App Test & Build
[37317770270](https://github.com/rh-ecosystem-edge/org-pulse/actions/runs/37317770270)
and all five integration suites
[37317770283](https://github.com/rh-ecosystem-edge/org-pulse/actions/runs/37317770283)
passed on code head `8b121dd1`. Core Smoke, AI Eng Smoke and Smoke Test
Status also passed in run [37317770270](https://github.com/rh-ecosystem-edge/org-pulse/actions/runs/37317770270).
No merge, rollout or deployment has been performed.

Merge order: merge !149 first, run a full collection and verify coherent OSAC/EDM
generations and production data-sync readback; only then merge/build/deploy #164
and read all three tabs for both projects in an authenticated production browser.
Keep the same OSAC UI and preserve the System Health execution-evidence screen.

## CI checkpoint transaction repair — MR !148

Job 62702667 failed before pull/rebase because earlier collectors modified legacy `releases/` files outside the checkpoint staging list. [MR !148](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/merge_requests/148) stages both owned data roots using `ci/publish-data-checkpoint.sh`; it rejects unrelated tracked changes and preserves conflict failures. Real-Git tests cover detached checkout, project plus legacy output, deletes, upstream merges, no-op and conflicts. Full local suite: 1,185 tests, one skipped. Git was added to the slim CI test image for these integration tests. Latest MR pipeline [18198704](https://gitlab.cee.redhat.com/edge-infrastructure/org-pulse-data/-/pipelines/18198704) passed all three jobs at commit `b5f25c99ba62633b10e32d6f2882f8d8aab66fd1`. Pending user merge and one successful real refresh/publication; no production or main edits made.

# OSAC-5468 deployed runtime baseline (2026-09-27)

Read-only observation on `ocp-edge117.lab.eng.tlv2.redhat.com` at
2026-09-27T12:02:59Z. This records the deployment **before** the 5468
foundation is promoted; it is not evidence that the candidate is deployed.

## Existing OSAC service

- Frontend: `org-pulse-frontend`,
  `quay.io/org-pulse/org-pulse-core-frontend-runtime:latest`, image ID
  `bf0511f92422f2b719d33db9f7e205a1397589cebc701c32502f83d7f173c4ae`,
  exposed on `0.0.0.0:8081`.
- Backend: `org-pulse-backend`, `localhost/org-pulse-test-backend:latest`,
  image ID `68ff417c64606abca8ba2d958225be7fb9cc279937071a8421473130964586a4`,
  with `/tmp/pipeline-data` mounted at `/app/data`.
- Data sidecar: `org-pulse-data-sync`,
  `quay.io/rh-ee-iezra/org-pulse-data-puller:latest`, image ID
  `068e6ee1f7e6aad5544b9a259c11d090e03cfb70d56bf56c2f171149c2f66805`,
  with `/tmp/pipeline-data` mounted at `/pipeline-data`.
- Data revision marker: `/tmp/pipeline-data/.last-commit-hash` contains
  `fed25d0b202c09f4231c68283e1123b4a012c234`. The module configuration
  file exists; its git-static module list contains `team-tracker`. The public
  built-in manifest endpoint returned HTTP 200 and listed `ai-catalyst`,
  `ai-impact`, `catalyst-showcase`, `customer-insights`, `okr-hub`,
  `pm-pipeline`, `product-builds`, `releases`, `system-health`,
  `team-tracker`, and `upstream-pulse`.

## Existing Flightctl staging service

- Backend: `org-pulse-flightctl-staging-backend-20260924T061946Z-src-103071056a2c-proj-d98490ade418`,
  image ID `91ace90e4e566c5c322d511b3037847cd94127b3b65fcebe3d7fc09446b2f2a9`,
  exposed only on `127.0.0.1:13001`; runtime data is mounted from
  `/opt/org-pulse-flightctl-staging/runtime-data/20260924T061946Z-src-103071056a2c-proj-d98490ade418`.
- Frontend: `org-pulse-flightctl-staging-frontend-20260924T061946Z-src-103071056a2c-proj-d98490ade418`,
  image ID `4612168eed7a514cd83dcadd23bcf2dc94133dba7536d79500dd7c7cbafa4be8`,
  exposed on `0.0.0.0:18081`.
- Its public built-in manifest endpoint returned HTTP 200 and listed
  `ai-impact`, `catalyst-showcase`, `customer-insights`, `product-builds`,
  `releases`, `system-health`, `team-tracker`, and `upstream-pulse`.

The OSAC image tags use `latest`, so their source commit cannot be inferred
from the tag. The staging tag records a candidate source/profile prefix, but
the exact source/data revisions were not independently verified by this
readback. The image IDs and OSAC data marker above are the reproducible
baseline for comparing a later deployment.

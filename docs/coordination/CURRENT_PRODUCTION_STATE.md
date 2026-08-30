# Current production state

This document records a read-only production identity reconciliation. It does
not authorize a deployment, migration, data write, account or invitation,
product activation, payment, provider change, or external message.

## Current deployment identity

| Fact | Read-only observation |
| --- | --- |
| Verified window | Rollback live and read-only verified around `2026-08-29T02:48:00Z` |
| Render workspace | `tea-d8nhh6a8qa3s73f4ocj0` |
| Render service | `srv-d8s9vej7uimc7384dfcg` (`xenios-website`) |
| Current Render deployment | `dep-da94g05g1s2s7396lkv0` |
| Historical successful attestation | `dep-da6vorqfngtc73brb0gg` (same SHA; not current) |
| Deployment status | `live` |
| Exact deployed commit | `3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212` |
| Configured branch | `release/early-access-code-session-checkout` |
| Auto-deploy | `false` |
| Public origin | `https://xeniostechnology.com` |

The commit-pinned rollback deployment and repository identity agree on the
exact commit above. The source controls therefore use `3daa…` as the one
trusted production baseline. `dep-da6vor…` remains a historical attestation of
the same SHA and must not be represented as the current live deployment. The
controls do not assume that production tracks `main`; the validator accepts a
syntactically safe branch name and can require an exact externally supplied
branch with `XENIOS_EXPECTED_PRODUCTION_BRANCH`.

## Failed deployment and active recut

The exact records successor
`eb659d8100a3b9831d52688120931c48d10330d9` was deployed as
`dep-da94b91srm7s73b55dsg` at 2026-08-29T02:37:19Z. Its runtime beneath the
records commit was `679564fc8cb29289e2277836eb32e2deac3d8bec`. The known-live
assisted-order config route changed from HTTP 200 to the generic API 404, so
the deployment was rolled back at 02:47:15Z to `3daa…` through the current
deployment `dep-da94g…`. The failed SHA and its consumed authorization are
permanently disqualified.

The first incident diagnosis incorrectly named `submissionStanding` as a
missing production dependency. It derives from the available agreement gate.
The actual missing dependency was the runtime's mandatory unresolved durable
audit authority, combined with conditional route registration.

The current Codex-only runtime freeze is
`2d662a0d31bb1de9332fb5c591f01cab76b991b1`, tree
`c1b1c5d64c317b4a26bdbe89735be97fb1b22ca5`. Its R11 technical bundle is
sealed at
`C:\Users\sboad\AppData\Local\Temp\xenios-gates-2d662a0-r11-volume2-linux`:
21 of 21 gates passed. The full sequential suite recorded 803 passed files,
4 skipped files, 0 failed files, 12,049 passed tests, 43 skipped tests and
0 failed tests in 469.08 seconds. Canonical E2E recorded 4 passed files and
53 passed tests in 2.73 seconds. The targeted-domain run recorded 196 passed
files and 3,116 passed tests in 152.53 seconds; evidence self-tests recorded
13 passed files and 208 total tests (196 passed, 12 intentional
network-disabled boundary skips, 0 failed); core protection recorded 35/35
tests.

The current origin-verified evidence freeze is
`c01569169cad5e6619187221d84019ae8bfc7c69`, tree
`c4a48d5d8d5fa159d0234cb0f94c61ca8e87e019`. Exactly seven evidence/test
files separate it from the runtime freeze. Commit `db9aeaaf…` changes
`scripts/evidence/routes.public.json` and
`scripts/evidence/routes-public.test.mjs` to re-pin two normalized document
body fingerprints and their exact test. Commit `193b3075…` changes only
`scripts/release/critical-endpoint-expectations.json` to re-pin ten anchored
endpoint fingerprints. Commit `e64122d6…` changes only
`scripts/evidence/lib/cdp.mjs` and
`scripts/evidence/network-boundary.test.mjs` to fix and pin the synthetic
service-worker CDP restart lifecycle race. Commit `c0156916…` changes only
`scripts/evidence/capture-synthetic-journeys.mjs` and
`scripts/evidence/capture-synthetic-journeys.test.mjs` to make the same
lifecycle contract explicit in the synthetic runner and its regression tests.
No customer-facing or server-runtime file changed.

The clean db9 smoke is recorded at
`C:\tmp\xenios-smoke-db9aeaa-r11-repin-summary.json`. It passed 9/9 HTTP
records; its 54 browser runs comprise 30 `AUTOMATED_PASS`, 24
`AUTOMATED_PASS_WITH_NOTES` and 0 `AUTOMATED_FAIL`; assisted-order config was
HTTP 200 with `enabled:true`; and PII was `CLEAN` with `COMPLETE` coverage.
The build envelope contains 321 files with inventory SHA256
`933d3165fc168de1b9fc967cf3a3b40bdb919fda49bb3cc623c90880558dbf37`;
the route inventory SHA256 is
`c8e26e430e426d91e781bc19fd6f3ff8fc359d382fa9c0fa1d41f4c023f8d67a`.
That smoke remains a truthful historical bounded predecessor. It is not
current c015 final validation because the evidence harness later changed.

Retry1 at
`C:\Users\sboad\AppData\Local\Temp\xenios-full-evidence-193b307-r11-final-lf-retry1-20260830`
is `EXCLUDED_EXTERNAL_INTERRUPTION`. It reached 224/1,100 primary observations:
180 `AUTOMATED_PASS`, 44 `AUTOMATED_PASS_WITH_NOTES`, and 0
`AUTOMATED_FAIL`; its targeted partners were 11/11 PASS. Windows Modern
Standby Event 506 at `2026-08-30T18:08:41.172Z` and Event 507 resume at
`2026-08-30T18:14:32.725Z` establish the host-sleep interruption that caused
CDP loss. No product or harness defect was found, and none of those partial
observations is final evidence.

Retry2 at
`C:\Users\sboad\AppData\Local\Temp\xenios-full-evidence-193b307-r11-final-lf-retry2-20260830`
is `EXCLUDED_EVIDENCE_LIFECYCLE_FLAKE`. Its primary matrix completed
1,100/1,100 with 1,023 automated PASS, 77 PASS_WITH_NOTES, and 0 FAIL; focused
gates passed. Synthetic stopped at 10/20 on a service-worker CDP restart.
Three valid diagnostic runs produced one PASS and two exact race reproductions,
with no product or network failure.

The e641 three-run canonical smoke is excluded at two PASS and one FAIL. It is
superseded by c015. The c015 focused suite passed 53/53 under the pinned
toolchain. Three c015 canonical prerequisite synthetic runs each completed 20
captures as 18 automated PASS plus 2 declared notes plus 0 FAIL, with boundary
0 and PII CLEAN.

Retry3 used planned runner
`C:\tmp\xenios-run-full-evidence-c015691-r11-final-lf-retry3-20260830.ps1`
(SHA-256
`10631b1c606ec6ab5d6e553c64678bd334ac58d197f3f18c8c004d1b3eb8c6d3`).
Both exact clones matched byte-for-byte at 3,575 files and 88,285,956 bytes,
inventory SHA-256
`7e6a96080f3dc65c7f91f9e87ddb80eaffad5e4a0478a2bdfac7bdf980f097b`,
0 mismatches, with `core.autocrlf=false` before first checkout. Clone and build
checks passed, and the focused JSON actually reported 3 suites and 23 tests
PASS. The temporary runner incorrectly asserted `numTotalTestSuites=1`, so
retry3 is `STOPPED_PRE_EVIDENCE_WRAPPER_SCHEMA`. It stopped before any HTTP,
browser, or evidence-root creation. No candidate defect was found, the
execution-state guard was reset, and retry3 will not be resumed or reused.

Retry3b passed the network-boundary gate at 23 tests and the route gate at 17
tests. Vitest suite totals reflected `describe` blocks—3 and then 2—while the
temporary wrapper incorrectly assumed a fixed total of 3 for the route gate.
Retry3b is therefore `STOPPED_PRE_PREVIEW_WRAPPER_SCHEMA`. It stopped before
preview, HTTP, browser, or evidence-root creation. No candidate defect was
found, the execution-state guard was reset, and retry3b will not be resumed or
reused.

Retry3c full evidence is sealed. HTTP passed 100/100. The first browser attempt
completed 1,100 observations as 1,023 automated PASS + 77 expected notes + 0
fail. Focused early-access, assisted-order, negative and unknown groups each
passed 11/11; account passed 99/99; all were zero-fail and clean. Synthetic
completed 20 as 18 PASS + 2 expected-denial notes + 0 fail. Evidence tests
passed 13 files/213 tests/46 `describe` suites. The non-skipped release scan
was 0/0. Final PII was CLEAN with 0 findings across 2,332 text files, a 1,120
PNG manual-review inventory and 0 unscannable files. The evidence manifest
SHA-256 is
`1f90d4fe76f616ed59734256c9188a368227281ae3049c21ce182735b6e2f257`.

A wrapper-only stop that compared 46 Vitest `describe` suites with 13 evidence
test files remains disclosed. An excluded fixture-scan attempt is archived at
`C:\Users\sboad\AppData\Local\Temp\xenios-retry3c-excluded-tail-pii-order-fixture-20260830`.
The successful reserved-fixture endpoint recapture recorded 16 `SAME` + 11
`INTENTIONAL_CHANGE` + 0 `REGRESSION` + 0 human review, with assisted-order
config HTTP 200.

The bounded packet at
`docs/review/xenios-research-full-site-20260829` is generated and validated:
192 files = 191 payload + packet-inventory self; 72 PNG + 72 text form 36
desktop-1440 and 36 mobile-390 capture pairs. Packet inventory SHA-256 is
`6dab7745cab5246993befd3e7d1ddc12ea6fc7caf08e17a00d2de0d13b3668e7` and
payload inventory SHA-256 is
`f6ef58eae2959f820f27ed0495113dcc2654c25155076bbd6f86a36a06dd4a14`.
Representative manual visual/privacy QA covered 18 PNG, 9 route areas and 2
viewports with 0 blocking visual and 0 privacy findings; five cosmetic backlog
items are recorded in `review-summary.json`.

Canonical release-manifest verification passed under Node 20.19.0/npm 10.8.2;
SHA-256
`16f08fd27b145068388a4c5e59f8163d86f8d70b0d3d48483960bd19e78b109c`
binds the packet and assisted-order environment inventory. Ownership review
SHA-256
`84ae795dbe4c945d6d9c3d1a082e8519400451045e1296d7557949952262769c`
records 613 unowned, 20 wrong-lane and 0 conflict paths as attested,
dispositioned and nonblocking. Release-control passed 51 with 1 intentional
skip and 0 failures; production-state passed; migration passed 35; route
uniqueness passed at 409 registrations across 400 call sites against exact
c015. The copied automated packet `evidence-manifest.json` intentionally
remains PENDING and is distinct from the canonical verifier PASS.

Current phase remains `PACKET_FINALIZING`. The records/evidence successor SHA,
exact-final-SHA checks, successor origin verification, final RC assignment and
detached review remain unassigned; no deployment is claimed.
Runtime predecessor `efb30f57…`, r10g
and r10h remain historical: r10g is invalid/excluded with 1,077 PNG, 1,077
text and 1,076 run JSON diagnostic files but no browser-matrix, and r10h is
superseded. The first db9 smoke failed from the wrong working directory and is
excluded; the stopped db9 full run never sealed and is superseded. None of
those historical attempts supplies a current final PASS.

The final RC SHA remains unassigned, detached Codex review has not started,
and the candidate has not been deployed. No migration is required, authorized
or applied.

## Runtime evidence

The 2026-08-28 unauthenticated `GET` requests to the public health endpoint and
the Render service origin returned HTTP 200. Runtime configuration reported
`commerceEnabled: false`. Those HTTP observations remain dated evidence for
the same 3daa runtime; the HTTP payloads did not themselves cryptographically
attest a Git SHA. The later rollback observation separately verifies that the
current live deployment is `dep-da94g…` and that the assisted-order config
route returned HTTP 200 with `enabled:true` after rollback.

## Database posture is unavailable

No database aggregate or managed-migration evidence was refreshed during this
reconciliation. Consequently every database-derived `dataPosture` value in the
JSON snapshot is `null` with `availability: "unavailable"`.

`null` means not observed. It must never be rendered or validated as zero,
disabled, empty, complete, or safe. Older production counts and Care assertions
were retired from current fields rather than silently carried forward. Their
exact dated source is preserved at
`docs/coordination/history/CURRENT_PRODUCTION_STATE_2026-07-30.json` (original
Git blob `322df6d9feb008acc834df2ec0e87e008993e3dc`) and is classified historical,
not current. Per-migration historical evidence remains in `MIGRATION_DAG.json`,
clearly scoped to its own dated observations; it was not re-attested here.

This unavailable database refresh is nonblocking for the 2d662a0d recut: no
migration is required, authorized or applied, and database-backed capabilities
outside the proven release scope remain safely disabled or fail-closed.

## Preserved historical controls

The exact 2026-07-30 release graph is preserved at
`docs/coordination/history/ACTIVE_RELEASE_GRAPH_2026-07-30.json` (original Git
blob `3915f85c82ed05fcdfc7d43232364c4c0ca7d990`). That archive preserves the
founder authority, safety gates, prior acceptance vocabulary, and supporting
evidence without converting those observations into 2026-08-28 facts.

The current graph carries the founder decision lock, workaround addendum, and
final full-website directive forward as locked authority. Immutable paid-order
evidence and commission/payout activation remain blocked. PR117 (`821bf169…`)
and PR106 (`40d697c7…`) are unresolved historical lineage: their earlier
accepted/pending dispositions are not current acceptance against `3daa…`.
PR144 (`410e6878…`) remains frozen pending founder-locked pricing reconciliation
and independent exact-SHA review.

These PR117, PR106 and PR144 facts remain preserved, but none is accepted or
used by the 2d662a0d recut. Their unresolved historical lineage is therefore
nonblocking for this release.

`FILE_OWNERSHIP.json` and `MIGRATION_DAG.json` retain their original
whole-document `generatedAt` timestamps. Their separate
`productionBaselineReconciledAt` fields scope the 2026-08-28 change only to the
production-baseline reconciliation; no lane assignment, migration application,
or database evidence was re-attested.

## Current release gates

- `a1bbc2a186ebbf96cead429a78dc30ffdc811005` is a failed composite RC. It is
  historical development source only, prohibited from deployment, and closed
  as a nonblocking excluded lineage fact for this recut.

- `679564fc8cb29289e2277836eb32e2deac3d8bec` and its deployed records
  successor `eb659d8100a3b9831d52688120931c48d10330d9` are failed/disqualified
  lineage and may never be deployed again.

- `efb30f5751969f0c05032aa4d6084fcc5c587a95`, r10g and r10h are historical
  predecessor records. r10g is invalid/excluded and r10h is superseded; neither
  contributes a current final result.

- `2d662a0d31bb1de9332fb5c591f01cab76b991b1` is the only frozen recut runtime.
  Its technical bundle is sealed 21/21. Evidence freeze
  `c01569169cad5e6619187221d84019ae8bfc7c69` is origin-verified and differs by
  exactly seven evidence/test files; no runtime changed.

- The first db9 smoke is an excluded wrong-working-directory failure. The
  stopped db9 full run is incomplete and superseded. The later clean db9 smoke
  is a truthful historical bounded predecessor, not current c015 validation.

- R11 retry1 is `EXCLUDED_EXTERNAL_INTERRUPTION`. Retry2 is
  `EXCLUDED_EVIDENCE_LIFECYCLE_FLAKE` after a clean 1,100-observation primary
  matrix but a reproduced synthetic CDP restart race, with no product or
  network failure. The e641 smoke is excluded at 2 PASS + 1 FAIL. The c015
  focused suite passed 53/53 and its three canonical prerequisites passed as
  18 PASS + 2 declared notes + 0 FAIL each. Retry3 then stopped before evidence
  on a wrapper-only suite-count assertion after exact clone, build and actual
  3-suite/23-test focused PASS. Retry3b also stopped wrapper-only before preview
  after network-boundary 23 PASS and routes 17 PASS because its wrapper assumed
  a fixed suite count rather than Vitest's describe-block totals. Both guards
  reset and neither attempt may resume or be reused. Retry3c full evidence is
  sealed at HTTP 100/100; browser 1,100 = 1,023 PASS + 77 expected notes + 0
  fail; focused 11/11, 11/11, 11/11, 11/11 and 99/99 all zero fail and clean;
  synthetic 20 = 18 PASS + 2 expected-denial notes + 0 fail; evidence tests 13
  files/213 tests/46 describe suites; release scan 0/0 non-skipped; and PII
  CLEAN across 2,332 text / 1,120 PNG manual-review inventory / 0 unscannable.
  The wrapper-only 46-vs-13 stop and excluded fixture-scan attempt remain
  disclosed; replacement endpoint recapture passed 16/11/0/0 with config 200.
  The bounded packet is generated and validated with the inventories and
  manual review above. Current phase remains `PACKET_FINALIZING`; no
  records/evidence successor SHA, exact-final-SHA result, final RC assignment,
  detached-review PASS or deployment authorization is asserted.

- The separate warm-silver homepage source is integrated in the frozen runtime;
  its final visual, responsive, accessibility and catalog-guard evidence is
  sealed in exact-c015 retry3c and represented in the validated bounded review
  packet. It is not an independent product-build blocker.

- Candidate integration remains exact-SHA, pushed and Codex-controlled.
  Nothing in this reconciliation changes production.

- After the validated exact-c015 packet and release records are committed and
  pushed as an origin-verified exact successor, exact-final-SHA checks pass and
  detached Codex review closes all technical gates, Samuel's
  exact-final-RC-SHA GO is the sole remaining human-only authorization. That
  boundary has not yet been reached.

## Evidence boundaries

This snapshot proves only the recorded Git, Render and HTTP production facts.
It does not convert candidate evidence into production truth and does not prove
current database row counts, migration application state, member/account
continuity, Care readiness, payment readiness, product or variant activation,
fulfillment state, final R11 matrix counts, a final RC SHA or detached-review
verdict.

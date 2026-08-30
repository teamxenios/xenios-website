# Xenios Research Omega recut handoff

Reconciled: 2026-08-30

Session: `codex-recut-final-20260829`

Task: `OMEGA-FULL-FINISH-LEAD-20260828`

State: **CODEX_DETACHED_REVIEW**

This handoff is bound to pushed, origin-verified records/evidence packet
successor `8bd8df8f556d8e84bc9c8daef1871d6a59b58590` (tree
`517db145ed6494c845c9453a8cec59c6be4b9892`). It does not assign or predict the
self-containing continuity successor's final RC SHA.

## Exact identities

| Item | Value |
| --- | --- |
| Candidate branch | `claude/xenios-research-full-finish-takeover-20260828` |
| Runtime freeze SHA | `2d662a0d31bb1de9332fb5c591f01cab76b991b1` |
| Runtime tree | `c1b1c5d64c317b4a26bdbe89735be97fb1b22ca5` |
| Evidence freeze SHA | `c01569169cad5e6619187221d84019ae8bfc7c69` |
| Evidence tree | `c4a48d5d8d5fa159d0234cb0f94c61ca8e87e019` |
| Records/evidence packet successor | `8bd8df8f556d8e84bc9c8daef1871d6a59b58590` / tree `517db145ed6494c845c9453a8cec59c6be4b9892`; pushed and origin-verified |
| Exact successor release scan | 1,338,773 added lines / 732 files / 0 secret / 0 PII / non-skipped |
| Final RC SHA | **UNASSIGNED** |
| Production / rollback SHA | `3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212` |
| Current live production deploy | `dep-da94g05g1s2s7396lkv0` |
| Failed/disqualified SHA | `eb659d8100a3b9831d52688120931c48d10330d9` |
| Failed deploy | `dep-da94b91srm7s73b55dsg` |
| Recut deployed | **NO** |
| Migration required / authorized / applied | **NO / NO / NO** |
| Detached review | **NOT STARTED** |
| Readiness | **PACKET SUCCESSOR PUSHED AND EXACT-SHA SCANNED; CONTINUITY SUCCESSOR, FINAL RC ASSIGNMENT, AND DETACHED REVIEW PENDING — NOT READY FOR GO** |

The failed SHA was deployed at 2026-08-29T02:37:19Z and rolled back at
02:47:15Z after a known-live assisted-order config route changed from 200 to
the generic API 404. Its authorization was consumed and cannot be reused.

Earlier never-deployed candidates `aaeba162…`, `b03ae1bf…`, `8c08cbc…`,
`d541eb5…`, `4c5ba617…`, `7167a78…`, `0e1b60a6…`, and `efb30f57…` are
historical superseded or disqualified predecessors only. The invalid r10g
attempt and superseded r10h predecessor, the first failed db9 smoke, and the
stopped db9 full run are also historical only and provide no current
final-matrix PASS claim.

## Runtime and evidence relationship

The runtime is frozen at `2d662a0d…`; the pushed evidence checkpoint changes
exactly seven evidence/test files and no customer or server runtime file:

- `db9aeaafbc0638095caca5596e1bdcec1e076902` changes
  `scripts/evidence/routes.public.json` and
  `scripts/evidence/routes-public.test.mjs` for two normalized document-body
  pins and their test coverage.
- `193b30752597b4684f4897e68d020c92449f97bd` changes only
  `scripts/release/critical-endpoint-expectations.json` for ten anchored
  endpoint pins.
- `e64122d67671113b02e1af2e1ba6b967a48767da` changes only
  `scripts/evidence/lib/cdp.mjs` and
  `scripts/evidence/network-boundary.test.mjs` to fix the synthetic
  service-worker CDP restart lifecycle race and pin its regression coverage.
- `c01569169cad5e6619187221d84019ae8bfc7c69` changes only
  `scripts/evidence/capture-synthetic-journeys.mjs` and
  `scripts/evidence/capture-synthetic-journeys.test.mjs` to apply and pin that
  lifecycle contract in the canonical synthetic runner.

## Sealed R11 technical gates

The R11 technical artifact root is
`C:\Users\sboad\AppData\Local\Temp\xenios-gates-2d662a0-r11-volume2-linux`.
Its orchestrator sealed **21/21 PASS, 0 failures**. Machine-derived highlights:

- complete sequential suite: 803 passed files, 4 skipped files, 0 failed;
  12,049 passed tests, 43 skipped tests, 0 failed; 469.08 seconds;
- canonical E2E: 4 files, 53 tests, 0 failures; 2.73 seconds;
- targeted release bundle: 196 files, 3,116 tests, 0 failures; 152.53 seconds;
- evidence tooling self-tests: 13 files and 208 tests;
- core-site protection: 35/35 tests.

## Historical clean db9 smoke

The clean post-fix smoke at
`C:\tmp\xenios-smoke-db9aeaa-r11-repin-summary.json` records 9/9 HTTP
checks, 54 browser variants (30 automated PASS, 24 documented NOTES, 0 FAIL),
assisted-order config HTTP 200 with the feature enabled, and a CLEAN/COMPLETE
PII scan. It remains a truthful bounded predecessor result, but it is not
current c015 final validation because the evidence harness later changed.

## Corrected-LF final-matrix attempts

Retry1 at
`C:\Users\sboad\AppData\Local\Temp\xenios-full-evidence-193b307-r11-final-lf-retry1-20260830`
is **EXCLUDED_EXTERNAL_INTERRUPTION**. Its fresh build, endpoint comparison,
and 100/100 HTTP stages completed before 224/1,100 primary observations were
captured: 180 automated PASS, 44 PASS_WITH_NOTES, and 0 FAIL. Targeted partners
were 11/11 PASS. Windows Modern Standby Event 506 at
`2026-08-30T18:08:41.172Z` and Event 507 resume at
`2026-08-30T18:14:32.725Z` establish that host sleep caused CDP loss. No
product or harness defect was found, and retry1 supplies no final evidence.

Retry2 at:

`C:\Users\sboad\AppData\Local\Temp\xenios-full-evidence-193b307-r11-final-lf-retry2-20260830`

is **EXCLUDED_EVIDENCE_LIFECYCLE_FLAKE**. Its primary matrix completed
1,100/1,100 with 1,023 automated PASS, 77 PASS_WITH_NOTES and 0 FAIL, and its
focused gates passed. Synthetic stopped at 10/20 on a service-worker CDP
restart. Three valid diagnostics produced one PASS and two exact race
reproductions. No product or network failure was found; retry2 supplies no
final evidence.

## Current c015 prerequisite and wrapper-only attempts

The e641 three-run canonical smoke is excluded at two PASS and one FAIL. It is
superseded by exact `c01569169cad5e6619187221d84019ae8bfc7c69`, tree
`c4a48d5d8d5fa159d0234cb0f94c61ca8e87e019`. The c015 focused suite passed
53/53 under the pinned toolchain. Three c015 canonical prerequisite runs each
completed 20 captures as 18 automated PASS plus 2 declared notes plus 0 FAIL,
with boundary 0 and PII CLEAN.

Retry3 used planned runner
`C:\tmp\xenios-run-full-evidence-c015691-r11-final-lf-retry3-20260830.ps1`,
SHA-256
`10631b1c606ec6ab5d6e553c64678bd334ac58d197f3f18c8c004d1b3eb8c6d3`.
Both exact clones matched byte-for-byte: 3,575 files, 88,285,956 bytes,
inventory SHA-256
`7e6a96080f3dc65c7f91f9e87ddb80eaffad5e4a0478a2bdfac7bdf980f097b`,
0 mismatches, with `core.autocrlf=false` before first checkout. Clone and build
checks passed, and the focused JSON actually reported 3 suites/23 tests PASS.
The temporary wrapper incorrectly asserted `numTotalTestSuites=1`, so retry3
is **STOPPED_PRE_EVIDENCE_WRAPPER_SCHEMA**. It stopped before HTTP, browser,
or evidence-root creation; its guard reset and it will not resume or be reused.

Retry3b passed network-boundary 23 and routes 17, but Vitest suite totals
reflected `describe` blocks (3 then 2) while the temporary wrapper assumed a
fixed total of 3. It is **STOPPED_PRE_PREVIEW_WRAPPER_SCHEMA**: no preview,
HTTP, browser, or evidence root started or existed. Its guard reset, no
candidate defect was found, and it will not resume or be reused.

Retry3c full evidence is sealed at exact c015. HTTP passed 100/100. The first
browser attempt completed 1,100 as 1,023 PASS + 77 expected notes + 0 fail.
Focused early-access, assisted-order, negative and unknown groups each passed
11/11; account passed 99/99; all were zero-fail and clean. Synthetic completed
20 as 18 PASS + 2 expected-denial notes + 0 fail. Evidence tests passed 13
files/213 tests/46 `describe` suites. The non-skipped release scan was 0/0.
Final PII was CLEAN with 0 findings across 2,332 text files, a 1,120 PNG
manual-review inventory and 0 unscannable files. Evidence manifest SHA-256:
`1f90d4fe76f616ed59734256c9188a368227281ae3049c21ce182735b6e2f257`.

The wrapper-only 46-vs-13 stop remains disclosed. The excluded fixture-scan
attempt is archived at
`C:\Users\sboad\AppData\Local\Temp\xenios-retry3c-excluded-tail-pii-order-fixture-20260830`.
The successful reserved-fixture endpoint recapture passed 16 `SAME` + 11
`INTENTIONAL_CHANGE` + 0 `REGRESSION` + 0 human review with assisted-order
config HTTP 200.

The bounded packet at `docs/review/xenios-research-full-site-20260829` is
generated and validated: 192 files = 191 payload + packet-inventory self; 72
PNG + 72 text capture artifacts form 36 desktop-1440 and 36 mobile-390 pairs.
Packet inventory SHA-256 is
`6dab7745cab5246993befd3e7d1ddc12ea6fc7caf08e17a00d2de0d13b3668e7`;
payload inventory SHA-256 is
`f6ef58eae2959f820f27ed0495113dcc2654c25155076bbd6f86a36a06dd4a14`.
Representative manual visual/privacy QA reviewed 18 PNG across 9 route areas
and 2 viewports with 0 blocking visual and 0 privacy findings; five cosmetic
backlog items are recorded in `review-summary.json`.

The canonical release manifest passed under Node 20.19.0/npm 10.8.2. Its
current SHA-256 is
`16f08fd27b145068388a4c5e59f8163d86f8d70b0d3d48483960bd19e78b109c`
and it binds both the bounded packet and assisted-order environment inventory.
Ownership review SHA-256
`84ae795dbe4c945d6d9c3d1a082e8519400451045e1296d7557949952262769c`
records 613 unowned, 20 wrong-lane and 0 conflict paths as attested,
dispositioned and nonblocking. Release-control passed 51 with 1 intentional
skip and 0 failures; production-state passed; migration passed 35; route
uniqueness passed at 409 registrations across 400 call sites against exact
c015. The packet's copied automated `evidence-manifest.json` intentionally
retains its pre-successor PENDING state and is not the canonical verifier.

Current phase is **CODEX_DETACHED_REVIEW**. The records/evidence successor is
`8bd8df8f556d8e84bc9c8daef1871d6a59b58590`, pushed and origin-verified. Its
non-skipped exact production-to-successor scan covered 1,338,773 added lines
across 732 files with 0 secret and 0 PII findings. The self-containing
continuity successor SHA, final RC assignment, detached review, deployment
authorization and deployment remain unassigned.

## Records successor and authorization policy

The pushed `8bd8df8f…` records/evidence packet successor is the exact SHA
supporting this handoff, not the final RC. After this continuity handoff is
committed and pushed, its exact-final-SHA checks and origin/clean-worktree
verification pass, and the detached Codex review passes, that exact continuity
successor may be deployable. It is deployable only if Samuel's new
authorization names that exact final successor SHA. Nothing here assigns that
future SHA or grants deployment authority.

## Human and operational boundary

No action in this completion program deployed the recut, applied a migration,
changed production configuration, created or invited an account, imported
customer data, activated a product, changed pricing, captured/refunded a
payment, activated Tebra, performed a clinical/pharmacy action, or sent an
external communication.

Tebra remains **production-disabled and unconfigured**; the product must not
represent scheduling, provider, pharmacy, or clinical state as live. This
release requires no migration, and no migration is authorized or applied.

## Required next action

Commit and push this exact continuity handoff successor, run its non-skipped
exact-final-SHA scan, verify a clean origin-bound worktree, and then perform the
detached read-only Codex review. Until those steps pass, this recut is **NOT
READY FOR GO** and the final RC SHA remains unassigned.

After technical closure, stop at the authorization boundary. Only Samuel may
issue a new explicit exact-SHA GO naming the final records/evidence successor.
If authorized, follow the approved release runbook and rollback plan, take the
pre/post critical-endpoint comparison, smoke test, monitor, and roll back on
any release-blocking result.

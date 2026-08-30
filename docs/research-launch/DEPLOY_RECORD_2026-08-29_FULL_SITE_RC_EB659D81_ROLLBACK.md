# Production incident record: `eb659d81` deploy and rollback

Date: 2026-08-29

Status: **CLOSED BY ROLLBACK; FAILED LINEAGE DISQUALIFIED**

This is an immutable history record. It is not a deployment authorization.

## Exact identities

| Item | Value |
| --- | --- |
| Deployed SHA | `eb659d8100a3b9831d52688120931c48d10330d9` |
| Runtime beneath that records successor | `679564fc8cb29289e2277836eb32e2deac3d8bec` |
| Failed deployment | `dep-da94b91srm7s73b55dsg` |
| Render service | `srv-d8s9vej7uimc7384dfcg` |
| Live at | 2026-08-29T02:37:19Z |
| Release-blocking detection | 2026-08-29T02:46:23Z |
| Rollback live at | 2026-08-29T02:47:15Z |
| Rollback SHA | `3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212` |
| Current live rollback deployment | `dep-da94g05g1s2s7396lkv0` |
| Historical successful attestation | `dep-da6vorqfngtc73brb0gg` (same rollback SHA; not current) |
| Migration | None |
| Environment change | None |

The deployment consumed the exact-SHA authorization that triggered it. That
authorization died with the rollback and cannot be reused.

## What failed

After the new deployment went live,
`GET /api/research/early-access/assisted-orders/config` returned the generic
API 404. The trusted production baseline returned HTTP 200 on the same route.
The Early Access session endpoint still answered its expected public session
state, so the regression was specifically the assisted-order composition and
route registration, not the entire Early Access surface.

The original smoke covered marketing, Research documents, Hino, Care,
robots/sitemap, health, assets, private-page policy, unknown routes and browser
presentation. Those checks passed, but the smoke did not include the
assisted-order config route. A clean general smoke and clean application logs
therefore coexisted with a release-blocking route disappearance.

## Detection and rollback

The pre-existing production route changing from 200 to generic 404 was treated
as an automatic rollback condition. The release owner initiated a
commit-pinned deployment of
`3daa3f4aef9d0fcac7fd4ffd941e0b8bdf3dc212`. Render assigned
`dep-da94g05g1s2s7396lkv0`, which became live at 02:47:15Z.

Post-rollback verification restored the assisted-order config route to HTTP
200 with `enabled:true`, and the production SHA matched the trusted
pre-deploy baseline.

## Exposure

The exposure window was 02:37:19Z–02:47:15Z. No customer order POST, quote or
checkout traffic was observed in the window logs. The generic 404 fallback did
not log those requests, so the number of visitors who received the config 404
is **unknown**, not zero.

No migration, production environment change, product activation, pricing,
payment, refund, account, invitation, Tebra or clinical action accompanied the
deployment. The rollback therefore required no database reversal.

## Deterministic root cause

The failed runtime made a durable assisted-order audit authority mandatory.
Production intentionally had neither an applied audit-store migration nor
resolved `RESEARCH_ASSISTED_ORDER_AUDIT_*` authority. Composition refused
with the missing-audit dependency, the bridge did not mount, and the
composition root registered the assisted-order routes only when the bridge was
enabled. Requests therefore fell through to the generic API 404 instead of an
explicit unavailable contract.

### Correction to the first diagnosis

The first incident note also named `submissionStanding` as missing. That part
was corrected at 2026-08-29T03:22Z. `submissionStanding` derives from the
agreement gate, which production has. An invalid placeholder agreement list in
the first reproduction made it appear missing. With a valid production-shaped
agreement list, the sole missing dependency was the audit authority.

## Why the prior controls missed it

1. Module-level production-wiring tests did not boot the real
   `server/index.ts` composition root under the production environment-name
   shape.
2. The preview harness did not reproduce the enabled assisted-order bridge.
3. The post-deploy smoke did not include a known-live assisted-order endpoint.
4. The generic 404 fallback produced no application error log.

## Preventive closure in the Omega recut

The current recut closes the failure class structurally:

- assisted-order audit behavior has explicit
  `durable_store`, `log_line_nondurable` and `unavailable` modes;
- the existing production-shaped configuration uses the honestly named
  non-durable operational sink unless durable audit is explicitly demanded;
- a failed durable-audit demand refuses explicitly rather than silently
  degrading;
- assisted-order routes are registered even when composition is disabled or
  refused, so the config route returns an explicit 200 state and the other
  unavailable routes return named 503 responses instead of the generic 404;
- a production-root boot test exercises the real composition under the
  production environment-name shape;
- the preview harness carries assisted-order bridge parity;
- the critical-endpoint diff captures safe status/header/shape evidence and
  treats unexplained disappearance of a live route as a release-blocking
  regression.

The frozen successor runtime is
`2d662a0d31bb1de9332fb5c591f01cab76b991b1` with tree
`c1b1c5d64c317b4a26bdbe89735be97fb1b22ca5`. It has **not** been deployed.
Its exact-SHA R11 technical bundle passed 21/21. The pushed evidence freeze is
`c01569169cad5e6619187221d84019ae8bfc7c69` with tree
`c4a48d5d8d5fa159d0234cb0f94c61ca8e87e019`; its only changes from the runtime
freeze are these seven exact evidence controls, so customer and server runtime
bytes remain frozen:

- `scripts/evidence/capture-synthetic-journeys.mjs`
- `scripts/evidence/capture-synthetic-journeys.test.mjs`
- `scripts/evidence/lib/cdp.mjs`
- `scripts/evidence/network-boundary.test.mjs`
- `scripts/evidence/routes-public.test.mjs`
- `scripts/evidence/routes.public.json`
- `scripts/release/critical-endpoint-expectations.json`

The earlier bounded 9/9 HTTP and 54/54 browser smoke is historical only. The
sealed retry3c final evidence passed HTTP `100/100`, browser
`1,100 = 1,023 PASS + 77 expected notes + 0 failures`, synthetic journeys
`20 = 18 PASS + 2 expected-denial notes + 0 undeclared failures`, and the final
evidence Vitest gate `13 files / 213 tests / 46 describe suites`. Packet
consistency, final-RC assignment, and detached review remain before an exact-SHA
GO is requestable. After closure, only Samuel may authorize that exact final RC
SHA; Codex performs the approved runbook.

Earlier candidates `aaeba16201f0d451a6d5a9d320d7d022503067f8`
and `b03ae1bf7329fba189919666408ddc4f46d542b0` were never deployed and are
superseded/do-not-deploy. The former was superseded by final evidence-parity,
release-control portability, and exact-diff ownership-attestation corrections.
The latter was disqualified when the Docker assisted-production gate found a
stale literal-source assertion after `preview_write_refused` moved to the
shared helper.

The later pre-final candidate
`8c08cbc37c42f25259af1e33edb42ca83e581d0e` was also never deployed and is
superseded/do-not-deploy. It was disqualified when the network-disabled Linux
Docker evidence-tool gate exposed operator-path leakage for foreign Windows
paths. Its immediate replacement `d541eb5…` fixed separator portability and
stabilized the release-control route-census timeout, but it too was never
deployed and is now disqualified/do-not-deploy: focused exact-browser evidence
found an undersized consent target, a dangling assisted-order ARIA descriptor,
and an undeclared fail-closed assisted-catalog 403/console/network condition.

The later `4c5ba61764d6eb5ca0e92ba02431177537d56d0c` candidate
(tree `377b63eacfc9f27fdecc5f76fd013dae6f32d009`) repaired those defects but was
also never deployed and is disqualified/do-not-deploy. Its assisted-catalog
declaration omitted the deterministic `?page=1&pageSize=24` query, causing
exact URL/count/console/network contract mismatch in focused browser evidence.

The later `7167a78df33d657d744a3a7775ad39c2ccef05fc` candidate
(tree `6f1b374f5c65b77542d662e76ee92778873a2fbc`) corrected that exact query but
was also never deployed and is disqualified/do-not-deploy. Its full browser
matrix found the same exact fail-closed assisted-catalog 403 undeclared on the
order-request route, causing all 11 variants to fail the console/network
contract.

## Required future smoke

Every future deploy must capture and compare the approved critical endpoint
set before and after deployment. In particular:

- the assisted-order config route must remain HTTP 200 with an explicit state;
- any pre-deploy 2xx route becoming unexplained 404/5xx is an automatic
  rollback;
- zero `REGRESSION` and zero unresolved `HUMAN_REVIEW_REQUIRED` results are
  required;
- rollback target remains the exact trusted predecessor, not a branch name.

The failed SHA, failed deploy ID, current rollback deployment and historical
attestation remain distinct in every release record.

# Continued audit — local repair qualified, release not accepted

This record supersedes the older checkpoint's unfinished cross-owner scenario and deferred contact/UX findings. Historical evidence remains preserved. It does not claim exhaustive product qualification.

## Source identities

- Original tested application repair: `02d525baa7d784ed16e297c1d17b1e4050ecf4cc`.
- New application repair: `c4ea8a9111fcdf7b66cff7db42347e7d38a3fefa`, tree `e79b5eef9da677a783e2b928597ead86593c74ce`.
- Test-only successor: `ee1c972ce57e34ed185949a72b0ce55256a35951`. Changes only the stale secure-documents route assertion; runtime is unchanged from c4ea8a9.
- Production remains `79414143d4355d5d3d14cd5fe6e5a536dc68d99d`, Render deployment `dep-daqft3vf3r2c73b7e88g`. No production mutation or deployment authorization.
- Subsequent audit, record and handoff commits are documentation/evidence successors, not additional application repairs.

## Executed scenarios and provenance

The original matrix contains 3,910 discovered controls, not 3,910 executed journeys. `evidence/resume-navigation-results.json` separately records actual clicks, observed destinations and limitations for a deduplicated 129-destination plan. A rendered gate is navigation evidence, not an authenticated workflow pass. `CONTINUATION_SCENARIOS.csv` separates status from provenance for additional scenario executions.

Recovered the previously lost cross-owner order scenario with the existing isolated native harness: another signed-in owner is denied the seeded order; the correct owner sees its exact items and total. The actual admin guard and order services exercised paid → processing → tracking recorded → shipped. The fixture uses synthetic Auth responses and memory records with real validation/authorization; it does not attest production RLS, physical shipment, provider payment or external notification.

Real signed-token status routes display under-review, correctly signed expired, approved-customer and active-account states. Active is a seeded already-active state, not proof of a browser consuming a claim. Real membership/approved-access tests exercise validation, recovery-purpose exclusion and authorization. Existing SQL rehearsals execute actual functions, role grants, replay, expiry, stale revisions and rollback. Synthetic in-memory SQL is not production schema parity, cross-process concurrency or restart durability.

The corporate and partnership contact forms use the sole shared `/api/contact` client. Browser scenarios cover stalled courtesy after team acceptance, team timeout, provider response loss after acceptance, browser response loss after acceptance, unchanged retry, rate-limit retention, slow network pending state and duplicate submission capture. Accepted team delivery never becomes a false failure due to courtesy delay. Uncertain acceptance retains the draft and states uncertainty; unchanged replay returns the same captured acceptance. The client also bounds stalled fetch/body parsing at 20 seconds. Team/courtesy waits are bounded at 10/2 seconds.

Responsive inquiry checks at 390, 768 and 1440 CSS pixels show no horizontal overflow. Mobile empty-submit validation focuses its alert and keyboard Tab reaches the error link. The recorded 200% visual zoom is pinch-style scaling, not a desktop CSS reflow qualification. Slow-network capture uses 800 ms latency, 64 KB/s down and 32 KB/s up. Browser interruptions were recovered; no lost tab is classified as an access blocker.

## Reversible UX decisions resolved

“Prepare inquiry” actions now say “Send inquiry” or the relevant inquiry type. Public secure documents lead to `/research/account/documents` and preserve this target through sign-in/recovery. The corporate form and courtesy email no longer promise two business days: repository Research Support explicitly says no response time is promised, and no supported guaranteed corporate SLA was found. Confirmation says accepted for delivery, distinguishes a missing courtesy confirmation, and avoids telling accepted users to resubmit.

## Validation

| Check | Status | Evidence |
| --- | --- | --- |
| Focused repair/UX regression | PASS | 74 tests in 12 files |
| Typecheck / production build | PASS | Pinned Node 20.19.0; resumed-build-provenance.json |
| Full suite at application candidate | FAIL | 18,053 passed, 85 skipped, two failed: protection fingerprint and old documents assertion |
| Corrected documents assertion | PASS | Separate test-only commit; all five quality-surface tests pass |
| Lifecycle regression | PASS | 185 tests in seven files |
| Approved-customer SQL rehearsal | PASS | 35 checks; actual SQL, isolated PGlite |
| Partner lifecycle SQL rehearsal | PASS | 57 checks; actual SQL, isolated PGlite |
| Migration DAG | PASS | 37 nodes; canonical checksums |
| Route uniqueness | PASS | 448 registrations / 439 call sites |
| Protected integration | FAIL | Two fingerprints and six scoped paths require integrator review |
| Qualified release manifest | NOT RUN | Required integration attestation and coherent production/schema controls absent |
| Actual external email delivery | NOT RUN | No authorized external delivery test; no real test messages sent |

The full suite was not rerun after the test-only assertion correction. Report the full run and focused rerun separately; do not call the original full run green.

## Notification evidence levels

1. Event/intent and operator ownership: existing real outbox, enqueue-once and operational-question tests; isolated admin browser reply creates the expected intent. Operator recipient routing is source/test evidence, not confirmation that a human saw it.
2. Provider acceptance/rejection/timeout/replay: actual contact implementation against an isolated capture seam, with all outbound network blocked. `notification-capture-receipt.txt` records accepted and replayed calls without private payloads.
3. Durable SQL behavior: local actual SQL rehearsals establish transaction/replay/rollback properties within the rehearsal engine only.
4. External delivery, inbox placement, human handling and production persistence: unverified. No provider sink or operator inbox was used.

## Remaining limits and external prerequisites

- Integrator-owned protected manifest and trusted ownership attestation must be reviewed against the exact integration SHA. See PROTECTED_CHANGE_REVIEW.md and protected-routes-review.diff.
- Fresh production identity is known; the coupled central production controls still carry the old identity and require integrator reconciliation plus current schema evidence. An undeployed candidate must never replace production identity.
- Full browser claim consumption/recovery completion, cross-owner document/history data, and partner/payment/supplier end-to-end provisioning are not production-equivalent qualifications. The established native fixture supplies orders/questions; the added token fixture deliberately supplies read-only status rows. Actual SQL/unit coverage is recorded separately. Extending those browser fixtures remains engineering work, not a missing-user-permission claim.
- Desktop CSS zoom/reflow and exhaustive keyboard coverage across every route remain NOT RUN; the sampled checks do not qualify all controls.
- Real external delivery and live operational readiness need a specifically authorized delivery test and its operator receipt. No real messages were sent.

Commerce and formal applications remain held. Clinical, membership, payment and notification authorities were preserved. No deployment, migration, production configuration, external payment or real delivery operation occurred.

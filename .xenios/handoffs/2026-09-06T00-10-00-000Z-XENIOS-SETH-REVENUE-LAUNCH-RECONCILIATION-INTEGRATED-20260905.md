# Xenios Health universal launch — reconciliation integration handoff

**Task:** `XENIOS-SETH-REVENUE-LAUNCH-TO-PRODUCTION-20260905`  
**Session:** `codex-seth-revenue-launch-20260905` (Astra-A)  
**Handoff state:** local runtime candidate integrated and validated; production authority not granted

## Exact source

- Branch: `codex/xenios-seth-revenue-launch-20260905`
- Runtime candidate: `9d066b18aabf8b6abc18f1b8ea73e11b22e0a1fb`
- Runtime candidate tree: `ff698f0be242d2fa4d5b1315807858d397f852f5`
- Server route/projection commit: `1a3d7787ecd2205aed0e62cc33a37145e61c1980`
- Product Control client mount commit: `4c85065cc7be8dab369222a163b80ba8ab7318c1` (integrated as `9d066b1`)
- Product Control mount QA record: `02ca47694829a544b6713e0c89d653e18fdbd657` (integrated as `feffd8f`)
- Validation head used for the complete suite: `feffd8fad6033b8743c81302de351e1915912e40`
- Validation tree: `f4a39bdca6c6d72fd8e78a47e2330ce1fd691f09`

## Completed slice

The server now exposes the existing admin-guarded read route
`GET /api/admin/research/products/revenue-launch/reconciliation`. It reads
committed source and canonical evidence, validates package hashes and row
coverage, returns scoped exception or full Phase A projections, and fails
closed for missing or malformed dependencies. The projection does not expose
prices or private data and does not grant approval, purchase, fulfillment, or
evidence-writing authority.

Product Control now offers an explicit **Review source reconciliation** action.
It invokes the route only when opened and renders available, partial,
unavailable, denied, and malformed states through the existing read-only review
content. No mutation or activation control was added.

## Validation

- Server projection/route plus Product Control mount focused tests: **54/54 PASS**.
- Follow-up AVAILABLE-state Product Control assertion is integrated in test
  commit `682b0d825a9e03689903d21427f5fc178197c799`; the refreshed focused
  route/mount suite is **55/55 PASS**, including **45/45** Products
  Admin/adapter/panel checks.
- Route census: **427 registrations across 418 call sites**, PASS.
- `npm run check`: PASS.
- `npm run build`: PASS (known dynamic-import and large-chunk warnings only).
- `node scripts/agentic/xenios-os.mjs validate`: PASS.
- `npm run site:record:check`: PASS after the records update.
- Complete `npm test -- --reporter=dot --testTimeout=60000`: **876 passed
  files, 5 skipped; 13,502 passed tests, 59 skipped; zero failures** in
  **488.03 seconds**, observed 2026-09-06T00:07:32.030Z.

The clean detached browser harness remains blocked by Windows `EPERM/EBUSY`
while installing native `esbuild`/`bufferutil`; browser journey evidence is
not claimed. Astra-B recorded a fresh post-integration attempt against exact
head `cd5500fe903e601fc967e536b08d2458e4304df9` in QA commit
`1a24c2a515384ae06b5fdfe5a99da704e2580154`; it stopped before browser startup
when Windows could not unlink `bufferutil.node` (`EPERM`, `-4048`). Synthetic
referral boundary evidence remains 12/12.

## Production boundary

Live service `srv-d8s9vej7uimc7384dfcg`, deploy `dep-dad08h740ujc73aprfcg`,
and live SHA `db5a2d447114c1e8a14185a9865ded50ee3f1ac6` are unchanged. Customer
approval, partner-lifecycle, and Referral V1 production authorities remain
absent; candidate migrations remain unapplied. No deployment, grant, account
change, email, price activation, payment, shipment, or other production
mutation occurred.

The next session should preserve this exact candidate and records, refresh the
heartbeat, and keep the production release candidate unset until Samuel gives
an exact-SHA production decision with prechecks and rollback conditions.

## Superseding final integration checkpoint — 2026-09-06

The earlier browser-blocked checkpoint is superseded by the exact-tree
Fable qualification below. The integrated local runtime candidate is now
`28e4b7802c84c01b4433040a36e622ce6bbf27de` with tree
`17b204350602f8be22b6b722eddd5d5a1c421930`, pushed on
`codex/xenios-seth-revenue-launch-20260905`.

### Browser/toolchain acceptance

Fable ran the browser harness in the clean detached checkout
`C:\\tmp\\xenios-fable-release-28e4b78-final-007` and wrote the packet to
`C:\\tmp\\xenios-fable-synthetic-28e4b78-final-007`. The exact manifest is
`synthetic-journey-evidence.json` (672,136 bytes,
SHA-256 `6e123d7e1703117f262087e7f6949c5590ebeb2aabd2495d7e8c3023e56d9e8b`).
Its 40-file artifact inventory (20 PNG and 20 text files) hashes to
`05e021f240db8c95e22370dca156da9ff950483db0ad6b8fbf42b653f475e377` with
zero missing, extra, or mismatched files. The 336-file built-dist inventory
hashes to `3c79e3c8ea4638ed6b49adb785c11f8ae033920019a7ee3c804d2446af398972`.

The run produced 20/20 captures: 16 `AUTOMATED_PASS`, four
`AUTOMATED_PASS_WITH_NOTES` for the two forged-reference denials and two
exact no-partner denials, zero automated failures, zero undeclared failures,
and zero external mutations. All 20 boundary assertions passed, no screenshot
was truncated, and the bounded cold-start catalog/Vite warmup passed in
13,668 ms. The packet is explicitly `claimScope=UI_PRESENTATION_ONLY`;
`piiPhiReview=MANUAL_PENDING_BY_DESIGN` remains open for the required human
review. Cleanup reported zero capture runners, Chrome processes, harness
processes, or listeners.

### Focused and full-suite validation

The current focused record is green: reconciliation route/Product Control
mount 59/59, account portal UX 105/105, canonical evidence 28/28, CDP
import/transport 5/5, Chrome readiness 4/4, combined evidence 32/32, and the
prewarm/evidence aggregate 91/91. Typecheck, build, route census, Xenios OS
validation, and the generated Site System of Record check all pass.

The latest parallel full-suite observation is recorded honestly as non-green
under host contention (873 passed files, two timed-out files, five skipped;
13,488 passed tests, three failed, 59 skipped, plus one worker-start error).
The two release-control migration-DAG cases pass serially at a 120-second
timeout (2/2), and the roster-privacy case also passes serially (1/1); no
assertion regression reproduced. This does not constitute a zero-failure full
suite gate.

### Production boundary

Live service `srv-d8s9vej7uimc7384dfcg`, deploy
`dep-dad08h740ujc73aprfcg`, and live SHA
`db5a2d447114c1e8a14185a9865ded50ee3f1ac6` remain unchanged. No production
deployment, migration apply, price activation, customer or partner grant,
invitation, notification, email, payment, shipment, or other provider/database
mutation occurred. The candidate remains local and gated pending an explicit
exact-SHA production decision with prechecks, postchecks, rollback, and smoke.

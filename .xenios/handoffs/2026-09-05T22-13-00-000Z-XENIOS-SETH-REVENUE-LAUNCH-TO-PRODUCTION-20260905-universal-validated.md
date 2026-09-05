# Xenios Health universal approved-user and partner launch

**Task:** `XENIOS-SETH-REVENUE-LAUNCH-TO-PRODUCTION-20260905`  
**Session:** `codex-seth-revenue-launch-20260905` (Astra-A)  
**Status:** local candidate validated; production authority not granted

## Exact candidate

- Branch: `codex/xenios-seth-revenue-launch-20260905`
- Pushed candidate SHA: `b267ec7dde3b314403b7cf0ea0e69e7a1bca17d7`
- Pushed candidate tree: `57ad797d7d41b8c8bb318da40731e8a805bc87da`
- Origin was fetched after push and matches this SHA/tree.
- Runtime code is based on the live production baseline `db5a2d447114c1e8a14185a9865ded50ee3f1ac6`.

## Included reusable slices

- Admin-approved customer access with the founder decision **remove memberships**. Approval creates or reuses canonical Auth/member identity, records `billing_state=not_started`, and does not require a paid membership. Historical billing and audit facts remain intact.
- Normal password sign-in and exact approved-customer claim resume, with server denial codes and same-principal refresh protection.
- Admin identity diagnosis and customer approval UI, with queued-not-delivered email status. No live approval or email was sent.
- Partner lifecycle operations (`prepare`, reviewed clearances, reviewed agreements, reviewed training, certify, activate, suspend, terminate, reinstate) with exact snapshots, idempotency, append-only evidence, and no fabricated proof. Agreement/training forms require the timestamp from the reviewed record.
- Partner lifecycle review panel mounted in the admin diagnosis flow and source-truthful partner onboarding/training surfaces.
- Canonical product price-version review and readiness filters in existing Product Control. This is review tooling; it does not activate prices or create a new pricing authority.

## Validation evidence

- Focused client launch tests: **208/208** across 14 files.
- Product price-review tests: **94/94**.
- Focused server launch tests: **58/58**.
- Release-control-plane gate: **51 passed, 1 intentional skip**.
- Route uniqueness: **426 registrations across 417 call sites**, PASS.
- Typecheck: `npm run check`, PASS.
- Production build: `npm run build`, PASS (known dynamic-import and large-chunk warnings only).
- Protected-site gate: PASS against `db5a2d447114c1e8a14185a9865ded50ee3f1ac6` with 28 protected hashes verified.
- Approved-customer PGlite rehearsal: **35 checks**, PASS.
- Partner-lifecycle PGlite rehearsal: **57 checks**, PASS.
- Quantity-tier PGlite rehearsal: **37 checks**, PASS.
- The broad repository suite was not green: it was interrupted after known legacy/integration assumptions failed (old paid activation, commerce fixtures, preview-harness guard, production-wiring assumptions, and one stale core/partner expectation). Those failures are not represented as a passing full-suite gate.

## Production truth and blockers

- Live service: `srv-d8s9vej7uimc7384dfcg`; live deploy `dep-dad08h740ujc73aprfcg`; live SHA remains `db5a2d447114c1e8a14185a9865ded50ee3f1ac6`; auto-deploy is off.
- Read-only schema evidence: `docs/revenue-launch/20260905/backend/production-account-partner-schema.json` (observed 2026-09-05T21:52:55.027685+00:00; SHA256 `daa4b7fbb775a8363168f44464dbbab3531ec86fd6c158cf5d9d51ad80f1f569`).
- Canonical production member/partner/notification/attribution tables exist, but the approved-customer authority and partner-lifecycle authority functions are absent. The candidate migrations are unapplied. Referral V1 production authorities are also absent.
- Production schema still has the legacy member access basis and application-state checks; exact candidate object parity, grants, RLS, and function compatibility require an authorized precheck.
- Seth's selected email is not ownership proof. Read-only diagnosis found no matching Auth/member/partner record for the selected email; no identity was merged or granted.
- No authenticated real-user revenue journey, price activation, referral production journey, payment, shipment, or email delivery was run.

## Required next action

A founder exact-SHA GO is required before any production precheck/apply, deployment, price/configuration activation, account approval, partner operation, email send, payment, or shipment. The GO must name the exact candidate SHA, migrations/functions, account/partner records, notification behavior, controlled purchase, and rollback. Until then keep `releaseCandidateSha` unset for production, `productionMutated=false`, and all new authorities dark.

Rollback remains separate: revert the application candidate; disable any explicitly approved price/configuration entry; and use the migration rollback only if the approved migration postcheck and rollback conditions require it. No rollback or production mutation was performed in this session.


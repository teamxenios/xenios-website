# Xenios Health universal approved-user and partner launch

**Task:** `XENIOS-SETH-REVENUE-LAUNCH-TO-PRODUCTION-20260905`
**Session:** `codex-seth-revenue-launch-20260905` (Astra-A)
**Status:** local candidate validated; production authority not granted

## Exact candidate

- Branch: `codex/xenios-seth-revenue-launch-20260905`
- Runtime candidate SHA: `f8804aa9fd48e19492b2b1ce2dab20bba54c741e`
- Runtime candidate tree: `5b1af342ccab698a58c25513694e992646234dc8`
- This runtime candidate is pushed. Later commits `0edb5b1`, `024e19a`, `0c7ef94`, `8ef1a4a`, `05e2c0e`, and `3e61213` add only QA/state/system-of-record records; the records checkpoint immediately before this handoff update is `3e6121374b2ac4abcf69ca383e15581198716e02` (tree `c3be3cb76fc3664f78fce3f5b9dbea193165cd43`).
- Runtime code is based on the live production baseline `db5a2d447114c1e8a14185a9865ded50ee3f1ac6`.

## Included reusable slices

- Admin-approved customer access with the founder decision **remove memberships**. Approval creates or reuses canonical Auth/member identity, records `billing_state=not_started`, and does not require a paid membership. Historical billing and audit facts remain intact.
- Normal password sign-in and exact approved-customer claim resume, with server denial codes and same-principal refresh protection.
- Admin identity diagnosis and customer approval UI, with queued-not-delivered email status. No live approval or email was sent.
- Partner lifecycle operations (`prepare`, reviewed clearances, reviewed agreements, reviewed training, certify, activate, suspend, terminate, reinstate) with exact snapshots, idempotency, append-only evidence, and no fabricated proof. Agreement/training forms require the timestamp from the reviewed record.
- Partner lifecycle review panel mounted in the admin diagnosis flow and source-truthful partner onboarding/training surfaces.
- Canonical product price-version review and readiness filters in existing Product Control. This is review tooling; it does not activate prices or create a new pricing authority.
- Server-owned reconciliation review adapter and deferred read-only presentation for formulation and identity exceptions; it adds no route or authority.

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
- Reconciliation adapter and presentation tests: **102/102**, PASS; build re-run after integration, PASS.
- Fresh broad repository suite (`npm test -- --reporter=dot`, 2026-09-05): **868 passed files, 7 failed files, 5 skipped; 13,480 passed tests, 12 failed, 59 skipped** (341 seconds). This supersedes the earlier 866-file count; the seven failing files and twelve failing tests are unchanged: the stale protected-seam hash test; the member-session wall's old expectation that `/api/research/partner/me` is unlisted; a stale sponsored-B2B SQL assertion; the old paid activation e2e; three legacy commerce partner-surface expectations; four disabled partner-read production-wiring expectations; and the portal route coverage assertion that omits the admitted `/api/research/partner/me` path. These remain explicit full-suite blockers and are not represented as a passing release gate.

## Production truth and blockers

- Live service: `srv-d8s9vej7uimc7384dfcg`; live deploy `dep-dad08h740ujc73aprfcg`; live SHA remains `db5a2d447114c1e8a14185a9865ded50ee3f1ac6`; auto-deploy is off.
- Read-only schema evidence: `docs/revenue-launch/20260905/backend/production-account-partner-schema.json` (observed 2026-09-05T22:43:06.5168+00:00; SHA256 `9254b6d9b7e8717c42b23e9752cb2eaccf90d43d9f1812d77eac44990d21cf77`).
- Canonical production member/partner/notification/attribution tables exist, but the approved-customer authority and partner-lifecycle authority functions are absent. The candidate migrations are unapplied. Referral V1 production authorities are also absent.
- Production schema still has the legacy member access basis and application-state checks; exact candidate object parity, grants, RLS, and function compatibility require an authorized precheck.
- Seth's selected email is not ownership proof. Read-only diagnosis found no matching Auth/member/partner record for the selected email; no identity was merged or granted.
- No authenticated real-user revenue journey, price activation, referral production journey, payment, shipment, or email delivery was run.

## Required next action

A founder exact-SHA GO is required before any production precheck/apply, deployment, price/configuration activation, account approval, partner operation, email send, payment, or shipment. The GO must name the exact candidate SHA, migrations/functions, account/partner records, notification behavior, controlled purchase, and rollback. Until then keep `releaseCandidateSha` unset for production, `productionMutated=false`, and all new authorities dark.

Rollback remains separate: revert the application candidate; disable any explicitly approved price/configuration entry; and use the migration rollback only if the approved migration postcheck and rollback conditions require it. No rollback or production mutation was performed in this session.

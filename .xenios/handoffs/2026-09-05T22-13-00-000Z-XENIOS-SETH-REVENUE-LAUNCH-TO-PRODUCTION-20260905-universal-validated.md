# Xenios Health universal approved-user and partner launch

**Task:** `XENIOS-SETH-REVENUE-LAUNCH-TO-PRODUCTION-20260905`
**Session:** `codex-seth-revenue-launch-20260905` (Astra-A)
**Status:** local candidate validated; production authority not granted

## Exact candidate

- Branch: `codex/xenios-seth-revenue-launch-20260905`
- Runtime candidate SHA: `14503661423a844e406d3cfc1ef75b4d9c436c30`
- Runtime candidate tree: `f37d439c3f9c84f57444a546cf205d23721b88f2`
- This runtime candidate is pushed. It includes the approved-customer e2e replacement, protected-seam review/repin, truthful disabled partner reads, UUID-compatible production partner creation, and ASTRA-B's reviewed partner-copy correction (`bb40cddd366394028ee58114dc002b516f031f35`, integrated as `5d2fa0b`).
- Records checkpoint: `548fa754ea0bdafc6a3ad4fbdb3204d60be25149` (tree `20b399ffab3a78799a457fdf79c80cbb0db01733`), pushed with the generated Site System of Record. This handoff update and the continuity pointer are pushed in the subsequent records commit.
- Runtime code is based on the live production baseline `db5a2d447114c1e8a14185a9865ded50ee3f1ac6`.

## Included reusable slices

- Admin-approved customer access with the founder decision **remove memberships**. Approval creates or reuses canonical Auth/member identity, records `billing_state=not_started`, and does not require a paid membership. Historical billing and audit facts remain intact.
- Normal password sign-in and exact approved-customer claim resume, with server denial codes and same-principal refresh protection.
- Admin identity diagnosis and customer approval UI, with queued-not-delivered email status. No live approval or email was sent.
- Partner lifecycle operations (`prepare`, reviewed clearances, reviewed agreements, reviewed training, certify, activate, suspend, terminate, reinstate) with exact snapshots, idempotency, append-only evidence, and no fabricated proof. Agreement/training forms require the timestamp from the reviewed record.
- Partner lifecycle review panel mounted in the admin diagnosis flow and source-truthful partner onboarding/training surfaces.
- Partner compliance and conversion copy now states that approved customer access has no paid-membership prerequisite; historical plan/billing records remain historical facts.
- Canonical product price-version review and readiness filters in existing Product Control. This is review tooling; it does not activate prices or create a new pricing authority.
- Server-owned reconciliation review adapter and deferred read-only presentation for formulation and identity exceptions; it adds no route or authority.

## Validation evidence

- Focused client launch tests: **208/208** across 14 files; ASTRA-B partner-copy checks **4/4**.
- Product price-review tests: **94/94**.
- Focused server launch tests: **58/58**.
- Integrated access/partner closure: **426/426** across 8 files, including the UUID-shaped production partner identifier assertion.
- Release-control-plane gate: **51 passed, 1 intentional skip**.
- Route uniqueness: **426 registrations across 417 call sites**, PASS.
- Typecheck: `npm run check`, PASS.
- Production build: `npm run build`, PASS (known dynamic-import and large-chunk warnings only).
- Protected-site gate: **36/36 PASS** against `db5a2d447114c1e8a14185a9865ded50ee3f1ac6`, with the two reviewed intentional seam hashes repinned and all other protections retained.
- Approved-customer PGlite rehearsal: **35 checks**, PASS.
- Partner-lifecycle PGlite rehearsal: **57 checks**, PASS.
- Quantity-tier PGlite rehearsal: **37 checks**, PASS.
- Reconciliation adapter and presentation tests: **102/102**, PASS; build re-run after integration, PASS.
- Fresh broad repository suite (`npm test -- --reporter=dot`, observed 2026-09-05 23:04–23:16 UTC): **870 passed files, 5 failed files, 5 skipped; 13,487 passed tests, 9 failed, 59 skipped** (741.22 seconds). Four failures were default 5-second resource/time-limit failures in repository scans/render-heavy suites; serialized 60-second reruns passed pgcrypto **17/17**, release-control-plane **51/51 + 1 intentional skip**, preview-harness **3/3**, and Kris presentation **16/16**. The remaining failure is the leased F7 sponsored-B2B assertion (`server/research/account-identity/b2b-sponsored-claim-sql.test.ts:60`), which expects two source-page call sites while the implementation has one. The exact account-identity lease is held by `claude-opus5-main`; this session did not edit, skip, or waive it, so the complete release suite is not yet a zero-failure gate.

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

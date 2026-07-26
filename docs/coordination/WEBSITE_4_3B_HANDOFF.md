# Website 4 — Release Train 3B handoff

## Frozen release relationship

- Session: Website 4 — Operations, Affiliates & Fulfillment
- Focused slice: immutable affiliate agreement publication and acceptance
- Branch: `feature/website-4-3b-partner-lifecycle`
- Stacked base: `feature/website-4-operations-affiliates`
- Frozen base SHA: `d162f1eafe249be57e9d23c87c65d99f1efdbc89`
- Final pushed SHA: use the exact draft PR head recorded by Website 2; do not substitute or amend the frozen 3A SHA.
- Merge/deployment owner: Website 2
- Production mutation performed by Website 4: none

## Completed checkpoint

- Named administrators can publish a complete, immutable affiliate agreement version through an authorized API and Xenios admin form.
- Publication records the exact content hash, version, title, required state, publisher, idempotency key, and append-only audit event.
- The current agreement pointer is mutable only through the publication RPC; published content and publication/acceptance events are append-only.
- An owning authenticated partner can read the complete current agreement and accept the exact current hash after an explicit affirmation.
- Acceptance is immutable, owner-bound, idempotent, and audited.
- A wrong hash or superseded version is refused.
- Partner activation refuses with the exact first-principles state `AFFILIATE AGREEMENT REQUIRED` until the current required version is accepted.
- Affiliate link issuance and dashboard access repeat the server-authoritative readiness check and fail closed.
- Partner responses omit internal notes, agreement keys, and unrelated ownership data.
- No agreement, contract, seed record, payout credential, provider result, or public operational fact was fabricated.

## Files and routes

Migration and verification:

- `supabase/research-operations-affiliates.sql`
- `supabase/tests/research-operations-affiliates.test.sql`
- `supabase/research-operations-affiliates-verification.sql`

Server:

- `server/research/operations/routes.ts`
- `server/research/operations/production-deps.ts`
- `server/research/operations/affiliate-service.ts`

Client:

- `client/src/research/adapters/adminOps.ts`
- `client/src/research/adapters/partner.ts`
- `client/src/research/pages/adminx/PartnersAdmin.tsx`
- `client/src/research/pages/partners/Onboarding.tsx`

New routes:

- `GET /api/admin/research/partner-agreements`
- `POST /api/admin/research/partner-agreements/affiliate-terms/publish`
- `POST /api/research/partner/agreements/:agreementVersionId/accept`

## Validation evidence

- Focused Website 4 suite: 14 files / 95 tests passed.
- Full repository suite: 149 files / 3,194 tests passed.
- `npm run check`: passed.
- `npm run build`: passed.
- Route parity: 20 partner adapter endpoints, zero enabled client endpoints without server registration on this branch.
- Disposable PostgreSQL 16: canonical base migrations 1–8, Track A, and Track B applied cleanly; Website 4 migration applied twice; behavior tests and verification passed.
- SQL behavior proves publication replay, wrong-hash refusal, owner acceptance, acceptance replay, activation refusal before acceptance, activation success after acceptance, readiness, and append-only mutation refusal.
- UI tests prove complete content, explicit confirmation, keyboard-focusable text, fail-closed integrity state, and accepted evidence.

Visual evidence:

- `docs/coordination/evidence/website-4-3b-affiliate-terms-desktop.png`
- `docs/coordination/evidence/website-4-3b-affiliate-terms-375.png`
- `docs/coordination/evidence/website-4-3b-affiliate-terms-320.png`
- `docs/coordination/evidence/website-4-3b-affiliate-terms-200-percent.png`

The evidence uses the actual exported agreement component and the existing `ResearchPartnerShell`. The temporary local evidence route was removed before the final build.

## Migration and production application

- Migration status: reviewed and dry-run verified; not applied to production.
- RLS: enabled on the new version, head, and event tables.
- Browser grants: none.
- Service-role grants: explicit for tables and routines.
- Existing records: no destructive rewrite or backfill.
- Production apply order: canonical migrations 20–26, then the Website 4 migration, then verification SQL and PostgREST schema reload if required.
- Rollback posture: disable the affected route/capability and revert application wiring; preserve immutable agreement and acceptance evidence.

Website 2 must verify production counts, apply the reviewed migration, register the shared routes, deploy, confirm the deployed SHA, and run admin/partner persona smoke tests. Website 4 remains available to correct integration findings and verify the live feature after release.

## Remaining Website 4 Release Train 3B scope

- Durable partner review, approval, claim, and activation lifecycle.
- Owner-scoped profile read/edit with optimistic concurrency.
- Private resource Storage authorization and compliance review.
- Payout statements, threshold review, and duplicate-safe batch construction; real payout execution remains provider-gated.
- Versioned Lawrence administration and partner projection; final economics remain blocked by an approved agreement.

These items remain in `WEBSITE_4_REMAINING_SCOPE.md` and must continue as disjoint focused checkpoints. They were not silently classified complete.

## Required inputs and readiness

- Required input implemented in this slice: `AFFILIATE AGREEMENT REQUIRED`.
- Administrator entry workflow implemented: publish full title, version, content, required state, and idempotency-protected evidence.
- Readiness validator implemented: current required terms must have an owner-bound acceptance matching the exact immutable version and content hash.
- External real input still required: the approved final affiliate agreement content.
- Website 2 retains ownership of the canonical cross-domain required-input model, shared readiness dashboard, pre-launch gate, launch switches, migration composition, and production application.

UI CONSISTENCY STATUS: MATCHES EXISTING XENIOS

PRODUCTION STATUS: NOT YET MERGED

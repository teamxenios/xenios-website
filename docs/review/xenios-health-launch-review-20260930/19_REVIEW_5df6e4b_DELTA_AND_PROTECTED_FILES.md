# Claude independent review: delta `7600943..5df6e4b` and protected-file review

## Identity

- **Runtime successor:** `5df6e4bc90b072c28d8d4e0696793ac1ab255bee`, tree `c5e20a4f87a041aaf5d6ad49aab2a345f7d93a4f`.
- **Records tip:** `377555759cdf6cbd9bf1e7167ac61c107b19a832`, tree `aa9721b6064af9ba8488e1d57a0a50d43b84108d`.
- **Ancestry:** `7600943` → `5df6e4b` → `3775557`, verified.
- **Delta:**
  - runtime `5df6e4b`: `finance.ts` +3 lines, so `verifyManual` also fails closed without an evidence adapter;
  - test `e186625`: a local PostgREST probe script;
  - records `a4260ba` and `3775557`.
- **No SQL change** in `7600943..5df6e4b`.
- **Reviewed:** 2026-09-30 18:01-18:30 CT. The provider or processor choice is deferred by the founder, and that is
  **not** treated as a blocker.

## Re-execution at `5df6e4b`

**Setup:** disposable Supabase Postgres 17.6.1.171 + PostgREST v14.13, rebuilt from the same eight canonical files,
using the composed finance probe (`sql/composed/hl12-finance-probe.mts`). The substitutions are unchanged, and the
production-shaped composition (`manualEvidence = null`) was also exercised.

**F1-F9 status at `5df6e4b`**

| Id | Status | Evidence |
| --- | --- | --- |
| F1 no independent manual evidence authority or grant procedure | **OPEN (P1)**, now fail-closed on both steps | P1 observe → 409 `manual_evidence_unavailable`. **P2** verify of an existing observation → 409 `manual_evidence_unavailable`. There is still no grant route. |
| F2 verified `paid` cannot reach fulfillment through the mounted route | **OPEN (P1)** | S7 HTTP → 409 `payment_verification_not_ready`. S8 SQL → accepted. `service.ts:837` is unchanged. |
| F3 no correction path for an erroneous unverified observation | **OPEN (P2)** | N8: the corrected observation → 409 `payment_reference_reused`. |
| F4 no durable customer notification or TS audit on verification | **OPEN (P2)** | S5: 0 outbox intents. |
| F5 the same external manual evidence can be attached to two orders in SQL | **OPEN (P2)** | N19b: ACCEPTED. `source_evidence_ref` is not unique. |
| F6 cancel after money was observed needs only free text | **OPEN (P2)** | C2: 200 → `cancelled`. |
| F7 status surfaces disagree; not derived from verification evidence | **OPEN (P2)** | Source is unchanged. `AssistedOrderStatusPage.tsx:41-42` says "Payment record under review" and `status-copy.ts:21` says "Payment verified". |
| F8 an expected financial refusal returns 500 | **OPEN (P3)** | C3: `supplier_processing` → `cancelled` over HTTP → 500 (`REFUND_AUTHORITY_NOT_READY` is unmapped). |
| F9 the verifier must equal the observer (no two-person control) | **OPEN (P3, policy)** | Unchanged SQL. |

**Still PASS:**
- 1 verification and 1 paid event; an identical retry replays.
- Concurrent identical verifies: 1/1, rollback delta 0, no hang.
- Historical unverified `paid` is frozen.
- SQL refuses cancel after paid.
- The whole-run rollback delta is 23, which is the refused calls, with no loop.

## New composed finding (source-verified; the harness does not mount the gateway)

**F10 · P2 · The customer quote routes are walled by the `/api/research` gateway unless `RESEARCH_PUBLIC=true`.**

- `server/research/index.ts:437-442` admits only `^/early-access/assisted-orders/XRR-…$` (the status GET) and the
  document writes. Its own comment says a new route under this namespace "is walled by default until it is listed on
  purpose".
- `GET …/:publicReference/quote` and `POST …/:publicReference/quote/accept` therefore reach the finance door only in
  public mode, or with a review cookie or bearer (`index.ts:716-757`). Otherwise the customer gets 401
  "Access required.".
- **Correction:** add exact anchored patterns for these two routes (the reference segment plus `/quote` and
  `/quote/accept`, with the method checked), plus gateway tests in both public and non-public mode.

## Historical `paid`: still required, not present

The records at `3775557` contain no preflight, runbook or rollback plan. What is required:

1. **A bounded, read-only, PII-free preflight**, for example:

   ```sql
   select count(*) as paid_without_verification,
          min(r.updated_at) as oldest,
          max(r.updated_at) as newest
   from public.research_assisted_order_requests r
   where r.status = 'paid'
     and not exists (
       select 1 from public.research_assisted_order_payment_verifications v
       where v.request_id = r.id);
   ```

   plus the same count for `supplier_processing` rows that passed through an unverified `paid` (via the events
   table). Run it only under an authorized managed read.
2. **An explicit disposition for each class.** Verification must **not** be fabricated for historical rows.
3. **An operator runbook:** the admin queue's Paid filter, customer contact, and who may resolve.
4. **Rollback and containment:** the apply order is app first, then migrations
   (guard → hold → authority → finance-bound). A rollback must not drop verification or observation rows or
   reopen arbitrary `paid` writes.

## Protected-file review (independent reviewer evidence; the repin is the owner's decision)

The core-site protection gate is **red** at `7600943` and later, on two protected files. That was recorded honestly
by Codex (full suite exit 1, and only these two tripwires failed). Claude reviewed the exact bytes.

| File | Pinned (manifest) | Pinned bytes last seen at | Current at `5df6e4b` | Changing commit |
| --- | --- | --- | --- | --- |
| `server/routes.ts` | `sha256:f17d518ee2a3bcda2ff4d4ffca6bc8475c0ced5f7c9f5f85b19bd189e09ea2ae` (`fileHashes.files`) | `c4ea8a9` | `sha256:7c21ea1ac26c6359c46d6070a9295a41b16f93355b3475a44f7831c668069137` | `8047e39` only |
| `server/index.ts` | `sha256:598ffd2e79038c35b5c9e6662cb05258a6b27a33bc3ee96b8b23757f9e2fd888` (P-17 amendment) | `fef7b313` | `sha256:1d6594d6389e2ac67d9af85213854e05387899dfe0102fa577e447565e68c315` | `7600943` only |

### Diff review

**`server/routes.ts`** (`c4ea8a9..5df6e4b`, +4 lines, all within `requireSupabaseAdmin`):
- It adds `(req as any).adminAuthUserId = data.user.id;` **after** all existing checks: token verification,
  recovery-purpose denial, and the admin email match with its 403.
- No authorization decision changes. No existing route is affected.
- The only consumer is the assisted-order admin viewer, which validates the UUID format (`express.ts`).
- **PASS.**

**`server/index.ts`** (`fef7b313..5df6e4b`, +22 lines, purely additive):
1. An `AssistedOrderFinanceService` import.
2. A finance composition gated by `RESEARCH_ASSISTED_ORDER_FINANCE_ENABLED === "true"` (**default off**), plus
   `supabaseConfigured()` and a composed bridge. It passes `manualEvidence = null`, which is fail-closed (F1).
3. The finance service is passed into the existing route table.
4. Five route mounts:
   - admin quote issue, manual observe and verify, each behind `requireSupabaseAdmin`;
   - customer quote read and accept, owner-bound in the handlers.
5. Flag off → `assistedOrderUnavailableDoor` (503 `assisted_order_unavailable`, reason
   `assisted_order_finance_disabled`, `no-store`).

**Not touched:** existing routes, middleware order, static serving, security headers and other composition.

**Risks noted:**
- F10 (the gateway wall lives in `server/research/index.ts`, which is not protected).
- Route uniqueness rose to 458 registrations, as recorded by Codex.

**Disposition:** **PASS for the reviewed bytes.** The changes are narrow, additive and default-off, and they
strengthen the admin identity binding. The manifest repin requires an owner-authorized amendment naming both
old/new hash pairs. Claude does not repin.

## Summary

| Area | Disposition |
| --- | --- |
| Shared SQL invariants | PASS (unchanged) |
| Mounted manual workflow | FAIL: F1, F2 (P1); F10 gateway (P2) |
| Card adapter | NOT PRESENT. The provider is deferred by the founder, not a blocker. |
| Historical and cancellation handling | PARTIAL: F6; the preflight, runbook and rollback plan are missing |
| Status consistency | FAIL: F7 |
| Protected files | PASS on review, pending the owner-authorized repin; the gate stays red until then |
| Production promotion | **NOT READY** |

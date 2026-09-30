# Claude independent review: HL-12 interim paid hold (`f318859`, records tip `a07e537`)

## Identity

- **Runtime and migration commit:** `f318859262812b8fc1fcb6d2c8e697d86a209349`, tree
  `d97f11fbb206de04f1a578fcb4a09f56f03ae167`.
- **Records tip:** `a07e537`. It adds the DAG registration (`1a79610`), the handoff and the verification note; no
  runtime drift.
- **Migration:** `supabase/migrations/20260930193033_research_assisted_order_quote_paid_hold.sql`, blob
  `9985517452f4bd88d67b6a07f2a5e2f75bf1138d`, 1,863 bytes, SHA-256
  `2a4ece6bb76e2e912285ae212331987708b44442a81ed66c91140fcb20376845`. It depends on the HL-26 guard migration, which
  depends on M71.
- **Reviewed:** 2026-09-30 14:45-15:10 CT.
- **Classification:** local and disposable only. Nothing is applied anywhere.

## Qualification run by Claude

**Environment:** disposable `supabase/postgres:17.6.1.171` (PostgreSQL 17.6) and `supabase/postgrest:v14.13`.
Applied: bootstrap, M71, `20260820190000`, `20260921` member history, the HL-26 guard (`084063a` bytes), then this
migration. The application is the composed HTTP → service → repository → PostgREST path at `f318859`. The
historical `paid` row was seeded with the trigger disabled and then re-enabled, to simulate pre-hold data.

| Case | Result |
| --- | --- |
| HTTP `paid` with `"x"` | 409 `payment_verification_not_ready` |
| HTTP `paid` with whitespace | 409 `payment_evidence_required` (the old 500 is fixed) |
| HTTP `paid` with amount, currency and reference | 409 `payment_verification_not_ready` |
| Direct PostgREST `set_status` `payment_review` → `paid` (the SQL trigger) | refused, `P0001` / `ASSISTED_ORDER_FINANCIAL_AUTHORITY_NOT_READY` |
| `payment_review` → `payment_pending`, and `reviewing` → `cancelled` | 200 (unaffected) |
| Historical `paid` → `supplier_processing` / `cancelled`, over HTTP and over direct SQL | all refused (409 / `P0001`) |
| Trigger | present and enabled (`O`). The guard's EXECUTE is owner-only, and it still fires on the definer paths. |
| Retry loop | none. Total rollbacks 3; 0 over 20 s idle. |
| `server/research/assisted-order` + `client/src/research/assisted-order` (single-worker) | 22 files, **402 passed** |
| Mutation check: the `c2580cd` service and repository against the new tests | 2 fail, as they should. Restored clean afterwards. |
| `tsc` | exit 0 |
| Migration DAG | `a07e537`: accepted, 40 nodes. At `f318859` it was also "accepted" with 39 nodes while the new migration file was unregistered. **P3 tooling gap:** the verifier does not detect unregistered migration files. |

## Disposition

**PASS as an interim fail-closed hold.** False financial state can no longer be written through the bridge in either
layer. Both layers refuse the same requests.

**HL-12 stays OPEN (P1).** There is still no accepted quote, observed amount, verification record or authorized
verifier binding.

## Findings (adversarially verified; severities after verification)

| Id | Severity | Finding | Smallest correction |
| --- | --- | --- | --- |
| HL12-H1 | **P2**, stricter before any managed apply | **Historical `paid` rows are frozen.** They can never reach `supplier_processing` or `cancelled`, so they can never ship or be refunded through the bridge (`service.ts:834-841`; `paid_hold.sql:29-33`). The number of such rows in production is unknown, because the connector returns 401. | A **preflight count** of `status = 'paid'` rows in every managed environment before apply. A founder-visible runbook for frozen rows (the admin queue already has a Paid filter, `AdminAssistedOrderQueue.tsx:79`). A state rollback rule: once the trigger is live, a runtime rollback to a build without the mapping turns refusals into 500s. |
| HL12-H2 | **P2** | **Payment is still solicited but can never be confirmed.** `payment_pending` and `payment_review` remain reachable. The customer copy asks for payment and promises verification (`AssistedOrderStatusPage.tsx:37-40`; `status-copy.ts:19-20`), and the admin intake email still says to send payment instructions. The only exits from `payment_review` are back to `payment_pending`, or to `cancelled` with free text and **no refund evidence**, so the HL-12 hazard moves rather than closes. | While the hold is in force, do one of: refuse entry to `payment_pending` in both layers; or require refund or no-funds evidence for `payment_review` → `cancelled`; and in any case reword the copy so it promises no verification result. |
| HL12-H3 | **P2** | **Reversal asymmetry.** Rows already in `supplier_processing` reached it through the same unverified `paid`, yet they can still be cancelled with a free-text reason only (`service.ts:96`, 224). | Apply the same refund-evidence rule to every cancel after money was solicited. |
| HL12-H4 | P3 | **Customer copy for historical `paid`** still says "Your payment is confirmed" / "Payment verified" / "Xenios will coordinate fulfillment" (`AssistedOrderStatusPage.tsx:41-43`; `status-copy.ts:21`). This contradicts the hold's premise. | Neutral copy, for example "Payment record under review". |
| HL12-H5 | P3 | **Tests cover half the control.** No test for the TS refusal of exits from `paid` (`service.ts:836-841` could be deleted and the suite would still pass). No executable SQL proof of the trigger branches; the verification note is prose. No client test that the paid option is hidden. The verification doc claims more test coverage than exists. | Add a service test with a seeded `paid` row. Commit an executable disposable SQL script (Claude's `sql/composed/` harness can be adapted). Add a client test. |
| HL12-H6 | P3 | **TS/SQL message parity.** SQL `23514` (allowlist or evidence) fires before the trigger. On a direct RPC, a disallowed paid exit returns a generic 500, and a historical exit reuses the "cannot be marked verified" text. | Optional: a distinct detail such as `ASSISTED_ORDER_PAID_LABEL_FROZEN`, mapped to the TS exit message. |
| HL12-H7 | P3 | **Rollout order is not stated.** Applying the migration before the app that maps the new detail turns operator actions into 500s. **Data-only restores** (COPY or `pg_restore --data-only`) of historical `paid` rows fail on the INSERT branch. | State the apply order: app first, then migration. Document the restore procedure (disable the trigger inside the restore transaction only). |
| HL12-H8 | P3 | The Founder Command Center counts only `submitted`/`reviewing`/`waiting_on_customer` (`founder-command-center-production.ts:149,621`), so stuck `payment_review` and `paid` rows are invisible there. | Include `payment_pending`, `payment_review` and `paid` in the founder queue. |
| nits | P4 | `.trim()` on a non-string id throws a 500 (`service.ts:198`). `SECURITY DEFINER` is unnecessary on the trigger function. | Optional. |

**Verified PASS notes:**
- Every writer of `status` is covered in both layers (only `updateStatus` via the admin PATCH).
- No automated downstream consumer of assisted-order `paid` exists: commission accrual, supplier release and order
  conversion are unwired, so nothing else breaks.
- The trigger's `TG_OP` handling is correct.
- The EXECUTE revoke does not stop the trigger firing.
- The repository mapping is consistent with HL-26.

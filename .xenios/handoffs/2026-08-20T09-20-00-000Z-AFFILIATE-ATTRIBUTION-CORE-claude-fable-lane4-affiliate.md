# Handoff: affiliate attribution core (Lane 4)

- **Session:** `claude-fable-lane4-affiliate`
- **Branch:** `lane/affiliate-attribution-core` (pushed to origin)
- **Exact SHA:** `8c3fdc60dbfb5d0e9140e2a48ef284a5ebd24a94`
- **Cut from:** `5bb3fa9d364f0d6497cebcb1766417a9bbd0ccf8` (launch integration head)
- **Worktree:** `C:/tmp/xenios-lane4-affiliate`
- **Integration packet:** `docs/research-launch/INTEGRATION-LANE-4-AFFILIATE-ATTRIBUTION.md`
- **Task state:** NOT mutated. `AFFILIATE-PRODUCTION` remains claimed by
  `claude-fable-desktop`; this lane wrote only unowned new files and did not
  take that lease. Accept or fold this SHA at the lead's discretion.

## What was closed

At `5bb3fa9`, `SupabaseEarlyAccessReferralGrantWriter` had **zero production
callers**, so the signed `xr_aff` cookie was the only carrier of attribution
across sign-in. A cleared cookie, a 30-day expiry, or a second browser
destroyed a legitimate affiliate's credit before any order existed.

Lane 4 adds the durable middle: the first request carrying BOTH a verified
cookie AND a resolved customer identity writes a customer-keyed binding.

## Files added (all previously unowned)

```
server/research/partners/customer-attribution-binding.ts
server/research/partners/customer-attribution-binding.test.ts
server/research/partners/early-access-grant-adapter.ts
server/research/partners/early-access-grant-adapter.test.ts
server/research/partners/attribution-spine.test.ts
supabase/candidates/20260819_research_affiliate_customer_bindings.sql
supabase/candidates/20260819_research_affiliate_customer_bindings_precheck.sql
supabase/candidates/20260819_research_affiliate_customer_bindings_postcheck.sql
docs/research-launch/INTEGRATION-LANE-4-AFFILIATE-ATTRIBUTION.md
```

No existing file was modified. `server/index.ts` was **not** touched.

## Gates run at this SHA

```
npx vitest run server/research/partners server/research/assisted-order shared/research/affiliate-program
  -> 21 files, 373 tests passed
npm run check
  -> tsc clean
```

## Integration hooks needed from the lead

1. **`server/research/early-access/register.ts:799`** — wrap the existing
   `const identity = ...` expression in `withCustomerAttributionBinding(...)`.
   Exact block in the integration packet, section (a). This file is currently
   dirty in the lead's tree, which is why Lane 4 did not edit it.
2. **The grant write** (packet section b) — call
   `writeEarlyAccessGrantFromBinding` only once the founder activates
   `AFFILIATE_PROGRAM_ENABLED`. Requires one composition-owned mapping,
   `affiliateCustomerRefFor`: partner id -> that affiliate's EA customer ref.
   Lane 4 deliberately did not invent this mapping; a fabricated mapping would
   fabricate an affiliate.
3. **No `server/index.ts` change and no core-protection manifest rehash** are
   required by this lane.

## Schema expectations

One new table, `research_affiliate_customer_bindings`, purely additive — no
existing table, column, grant, or routine is touched, so it cannot disturb the
live Early Access path.

- Precheck expects `APPLY_READY`; postcheck expects `DEPLOYED_AND_LOCKED`.
- `service_role` gets **SELECT + INSERT only**; RLS enabled, no policies;
  `anon`/`authenticated` get nothing. Append-only holds at the privilege level,
  so no application defect can re-point a landed attribution.
- **Applying it is a production mutation and needs Samuel's current explicit
  approval.** Until applied, the binder answers `store_unavailable`, the
  journey is untouched, and attribution is honestly not recorded.

## Negative guarantees pinned by tests

- Spoofed `affiliate_id` in a request body is ignored (no code path reads one).
- Forged, payload-tampered, or expired cookie binds nothing.
- Invalid code => normal journey, no cookie, no touch, no binding, no grant.
- Customer cannot change attribution after binding (rival cookie loses).
- Affiliate cannot create their own commission (self-referral refused twice).
- No cross-affiliate reads exist: the store has no partner-scoped enumeration.
- No economics without approval: null program binds as `pending_program`.
- Affiliate cannot mark payment paid: this lane writes no payout state at all.

## Not done, deliberately

- `affiliateCustomerRefFor` mapping (composition-owned; see hook 2).
- Repeat-order ordinal / `monthsSinceFirstOrder` derivation — that belongs to
  the settlement lane that already owns the accrual bridge.
- Any production mutation, deploy, or flag flip.

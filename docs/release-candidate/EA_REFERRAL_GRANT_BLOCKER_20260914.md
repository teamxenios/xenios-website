# The Early Access referral grant cannot be wired yet

**Date:** 2026-09-14. **Status:** blocked on a schema contract, not on effort.

**2026-09-21 local continuation:** the first candidate gap is now executable,
not just a helper plus dispatcher-edit instructions. It guards and updates
the existing dispatcher, preserves its owner/ACL, adds the actorless read,
and checks malformed inputs, privileges and authority invariants. Twelve
tests passed against a fresh disposable PostgreSQL instance, including the
actual service-role RPC and fail-closed cases. The candidate is still
**UNAPPLIED to managed databases**. The partner-to-Early-Access-customer mapping
and canonical hold-rate contract in gap 2 are still missing; no grant writer,
commission accrual or money-bearing mutation was enabled. See the
[2026-09-21 closeout](LOCAL_CLOSEOUT_20260921.md) for exact evidence.

The writer exists and is tested. The reader is wired. Nothing calls the writer,
so every Early Access order is permanently unattributed and every commission
hold is null. This document says exactly why it was not wired today, so the next
session does not rediscover it and does not invent its way around it.

## Two gaps, not one

### 1. There is no way to ask which partner a touch belongs to

Every Referral V1 operation that can map a captured touch to a partner requires
an authenticated actor:

| Operation | Actor it requires |
|---|---|
| `listOwn` | the partner themselves |
| `bind` | a signed-in member claiming their own binding |
| `getBinding` | the same |
| `listAdmin` | a canonical admin |

The visitor placing an Early Access order may never sign in. So the grant path
has no way to answer the only question it needs answered.

This gap is already addressed in candidate form:
`supabase/candidates/20260914_research_referral_v1_touch_attribution.sql`. It is
**not applied**. Until it is, `ReferralV1Store.attributionForTouch` answers
`unavailable` and the assisted-order attribution resolver attributes nothing —
which is exactly what it did before, now for a named reason.

### 2. The grant RPC wants a reference Referral V1 does not hold

`research_early_access_grant_referral` requires:

```text
p_customer_ref            the buyer's Early Access customer ref
p_referral_code           the code
p_affiliate_id            the affiliate id
p_affiliate_customer_ref  the PARTNER'S OWN Early Access customer ref
p_hold_basis_points       the hold rate
```

`SupabaseEarlyAccessReferralGrantWriter.grant` refuses before the database sees
it unless `affiliateCustomerRef` matches `REFERRAL_CUSTOMER_REF` and differs
from `customerRef`. That check is right: it is how the writer refuses to grant
an affiliate their own arrival.

But **Referral V1 does not know a partner's Early Access customer ref.** It
knows a `research_partners` id. The two identifier spaces are different, and
nothing in the V1 spine maps between them. There are three ways to close it and
only one of them is honest:

1. **Derive it in SQL.** The grant function resolves the partner's own Early
   Access customer ref from the partner id, inside the same transaction that
   writes the grant. The mapping stays in the database that owns both facts.
   This is the minimal correct change.
2. **Pass it from the application.** Requires the application to hold a mapping
   it has no authority over, and puts a money-bearing identifier on a code path
   that could get it wrong. Rejected.
3. **Accept it from the request.** Hands the browser the power to choose which
   partner an order pays. Rejected outright; it is the exact thing the assisted
   order path already refuses by design.

## What would have to be true

For the grant to be wired safely, all of these:

- `attributionForTouch` is installed, so a partner id can be derived from a
  verified touch without an authenticated actor;
- the grant RPC either derives `affiliateCustomerRef` from the partner id
  itself, or a reviewed mapping exists that the database owns;
- `holdBasisPoints` comes from canonical program policy, read server-side. It
  is money, and it must never arrive in a request body;
- the grant is idempotent per order, so a retry cannot pay twice.

## What was deliberately not done

No second speculative SQL candidate was written for the grant function. The
first gap has one, because its shape is unambiguous: a read-only lookup that
creates nothing. The second gap is a change to a money-bearing write path, and
the right shape of it depends on facts about the partner/customer identifier
mapping that are not visible from source. Writing that SQL blind would produce
a file that looks reviewable and is not.

## Consequence today

Early Access orders are unattributed and commission holds are null. That is the
same behaviour as before this session. Nothing regressed; what changed is that
the reason is now written down and the first of the two gaps has a reviewable
candidate sitting next to it.

# Production release record — M75 + typed affiliate code, 2026-08-20

| | |
|---|---|
| **Migration** | M75 `20260820190000_research_assisted_order_declared_affiliate_code.sql` |
| **Checksum** | `f9ab3892560bf5002417b3302919367d400971253ac8455a16e310b041403fda` |
| **Deployed SHA** | `77e782e0c4c1c5be5275711e6996d7f6dfb81fe0` |
| **Deploy ID** | `dep-da3o55gn74is73f9sdo0` (live 22:42:18Z) |
| **Predecessor / rollback** | `ce1590fa08dcb5eae299bcaf55e799ad9ea092d1` |

## The first apply was REFUSED, and that is recorded on purpose

M75's original post-condition tested the ACL text for `=X/` to catch the PUBLIC
pseudo-role. Every ordinary entry contains that substring, so production's
correct, already-secured ACL `postgres=X/postgres,service_role=X/postgres`
matched and the migration refused itself. It failed CLOSED: verified immediately
afterwards, 0 columns, 0 constraints, RPC still the M71 version, ACL untouched.

The rehearsal missed it because it exercised the migration's DDL and behaviour
but never ran the migration's own post-condition block. Corrected to enumerate
with `aclexplode`, where `grantee = 0` IS PUBLIC, and proven both ways against
real ACLs: 0 for the secured target, and 21 functions in `public` would flag.

## Applied state, verified

2 columns, 3 constraints, RPC is the M75 definition, SECURITY DEFINER with
`search_path=public`, ACL `postgres,service_role` only, `anon`/`authenticated`
EXECUTE false, table SELECT false for both, RLS ENABLED **and** FORCED.

## Expand-first proof

With M75 applied and the OLD runtime still serving: health, `/research/early-access`,
session, config all 200; `openAccess:true`; an anonymous session minted and read
back; agreements loaded; the assisted-order catalog served 200. Backward
compatibility held before anything was deployed.

## Controlled request — XRR-20260820-2E67BC3AA3

Submitted with the code typed **lowercase** (`dana10`) on purpose, to prove the
normalization the rehearsal forced.

- `declared_affiliate_code` = **DANA10**
- `declared_affiliate_code_state` = **captured_unmatched**
- `affiliate_attribution_ref` = **null** — separation held
- 1 line, 1 event, 1 access token
- Replay with the same idempotency key returned the SAME reference, left
  **1** request row, **1** customer notification, **1** admin notification, and
  did not rewrite the stored code.

Notification payloads: the ADMIN intent carries `declaredAffiliateCode=DANA10`,
a separate verified-attribution field, the XRR, one line, payment state and the
secure admin path. The CUSTOMER intent carries neither the code nor any
attribution field and no admin path. Neither payload matches
wholesale/margin/supplier/cost.

## Mobile

430, 390, 375, 360, 320: no horizontal overflow at any width, and every text
input computes to **16px**, so iOS no longer zooms on focus. Confirmed in the
deployed assets: the affiliate field, its `declaredAffiliateCode` submission,
and the `font-size:16px` rule.

## OPEN P0 FOUND DURING THIS SMOKE — NOT CAUSED BY THIS RELEASE

**No product in the live Early Access catalog shows a price.** All 420 items
project as `provider_request` (244), `request_pricing` (144) or
`request_activation` (32); **zero** are `direct_order_request` and **zero**
carry a `unitPriceCents`. Bindings now resolve correctly — the identities are
real Product Control UUIDs rather than `unbound:` — and `maximumQuantity` is
100, so the earlier binding and quantity repairs are confirmed live. What is
missing is the PRICE for an anonymous Early Access viewer: member pricing is
audience-scoped and an anonymous session is not a member, so every priced row
degrades to "request pricing".

This predates M75 and this deploy. It does not block the affiliate-code
release, but it does block the founder's Definition of Done for "full catalog →
retail pricing", and it is now the top P0.

## Rollback

Contain the feature first; M75 is additive and old-runtime compatible, so do NOT
drop the columns to roll back application code. Runtime rollback to `ce1590f`
only if required. Notes:
`supabase/production/research-assisted-order-declared-affiliate-code-rollback-notes.md`

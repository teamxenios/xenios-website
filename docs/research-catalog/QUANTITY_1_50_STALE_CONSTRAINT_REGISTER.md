# Quantity 1 through 50: stale constraint register

**Founder decision:** normal order quantity is 1 through 50, and quantity alone never
triggers review anywhere inside that band. The earlier architecture of 1 through 20
direct plus 21 through 50 manual review is superseded.

**Author:** the pack 03 catalog lane (`lane/pack03-full-catalog-search-pricing`).
**Scope of this document:** identification only, outside this lane. Pack 03 owns no
quantity constant and has repaired everything it owns. Every other item below is named
with its exact file and line so its owner can repair it in its own release chain. This
lane changed none of them.

## 1. What pack 03 owns, and its state

Pack 03 defines no quantity constant and never has. Quantity reaches the catalog only as
an injected `AcceptedExactVariantQuantityCapability`, and the selector renders whatever
band that capability states.

| Item | State |
| --- | --- |
| `client/src/research/master-offerings/integration-packet.ts` | No constant. Structural validation only. Already correct at any band. |
| `MasterOfferingDetail.tsx` quantity control | Renders the injected band. Verified rendering 1 through 50. |
| Test fixtures | Moved from the 20 band to the 1 through 50 band. |
| Quantity as a review trigger | Impossible here, and now pinned by test. |

The important property is structural rather than numeric: **quantity is not an input to
action resolution anywhere in this lane.** `resolveMasterOfferingAction` takes an
offering, a variant, and a Product Control resolution. It never receives a quantity, so
no quantity can turn `Add to Cart` into a request, at 21, at 50, or at any other value.
`client/src/research/master-offerings/quantity-band.test.tsx` walks 1, 2, 19, 20, 21, 25,
49 and 50 and asserts the action, the label and the CTA count never change.

Out of band is refused, never clamped. Fifty-one disables the submit and says
"Choose between 1 and 50" while leaving the field showing what the buyer typed. Silently
rewriting 51 to 50 would tell a buyer they asked for something they did not, and the M66
design note requires refusal rather than clamping for the same reason.

## 2. Stale constraints outside this lane

Each item states the exact location and the change the founder decision implies. None of
this was modified by pack 03.

### 2.1 The application band, on the quantity-50 candidate

`shared/research/early-access-quantity.ts` at `codex/xenios-quantity-1-50-candidate`
(`098e26d`) encodes the superseded split directly:

- `DIRECT_EARLY_ACCESS_MAX_QUANTITY = 20` is the stale direct ceiling.
- `REQUEST_MAX_QUANTITY = 50` exists only because 21 through 50 was a request band.
- `routeEarlyAccessQuantity` returns `{ kind: "manual_review" }` for anything above the
  direct limit. Under the founder decision this branch must not be reachable by quantity
  alone from 1 through 50.
- `isDirectEarlyAccessQuantity` and `isEarlyAccessAggregateQuantity` both close at 20.

Owner: the Q50 lane. The two ceilings collapse into one band of 50, and the manual-review
route stops being a quantity outcome. Note that `routeEarlyAccessQuantity` also returns
`manual_review` when the effective limit is invalid; that fail-closed behaviour is not a
quantity threshold and should stay.

### 2.2 The test that pins the stale number

`server/research/early-access/cart/quantity-band.test.ts:138` asserts
`expect(EARLY_ACCESS_MAX_QUANTITY).toBe(20)`, on both the accepted release (`ba9fa0a`)
and the quantity-50 candidate. It is the tripwire that will fail first, and it should:
update it in the same commit that widens the band, never before.

`server/research/early-access/cart/f012-quantity-domain.test.ts` pins the two-ceiling
shape and will need the same treatment.

### 2.3 The eligibility cap follows the constant

`server/research/early-access/catalog/eligibility.ts:438` bounds
`maxUnitsPerOrder <= EARLY_ACCESS_MAX_QUANTITY`. It needs no separate edit once the
constant moves, but it must be re-tested, because it is the point where a Product Control
declared limit above the band is refused.

### 2.4 The database band, and why it is a human gate

The canonical quantity checks on `research_early_access_cart_items` and
`research_early_access_cart_child_releases` are installed at `<= 20` by M65. Widening them
is M66, which the bundle ships as `M66_DESIGN_DO_NOT_APPLY.md`, explicitly design-only.

This is an irreversible migration against production data. It requires PG16 and PG17
proof, named-human migration and release authority, preflight, apply, immediate postcheck
and smoke. **No agent should apply it.** Its own note also requires the adversarial cases
`25 + 25 => 50`, `25 + 26 refused`, `50 untouched`, `75 untouched`, and rerun idempotence.

### 2.5 The founder release ceiling is the only real ceiling

Product Control has no store for `maxUnitsPerOrder`. The operative limit is
`approvedQuantityLimit` on the founder release decision, and that ledger is append-only,
so raising it to 50 is an append that must copy the product version rather than an edit.

Until that append exists for a given exact variant, that variant's real ceiling is
whatever its last approved decision says, regardless of what the application constant or
the database check allows. **This is a founder action and the last gate in the chain.**

### 2.6 The bundle overlay encodes the superseded design

`packs/10_QUANTITY_50_EXPANSION/src/shared/quantity-policy.ts` in the master bundle
contains `classifyQuantity`, whose `manualReview: !directPurchaseAuthorized || requested >
limit` is exactly the superseded rule. It is a reference overlay, not repository code, and
it must not be integrated as written.

## 3. Order of repair

1. Widen the application band and remove the quantity-based manual-review route (2.1),
   with its tests (2.2, 2.3).
2. Generate M66 from the exact post-M65 schema, prove it on PG16 and PG17, and hold it for
   a named human (2.4).
3. Append the founder release decision to 50 for each approved exact variant (2.5).
4. Re-run the Early Access cart, order, invoice and settlement regression cone.

Steps 2 and 3 are human gated. Step 1 is ordinary engineering in the Q50 lane.

## 4. What must not happen

- Do not widen the application band while the database still checks 20. The application
  would accept a quantity the database then refuses, at checkout, in front of a buyer.
- Do not clamp. Refuse.
- Do not treat a quantity between 1 and 50 as a reason for review. Non-quantity
  eligibility rules, such as audience, inventory, readiness, documentation and supplier
  authority, are untouched by this decision and must keep refusing exactly as they do now.

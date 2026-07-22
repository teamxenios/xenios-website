# Commerce and Distribution Supreme Audit

Date: 2026-07-20. Lane: Website 3.

## Repository root

`C:\Users\sboad\Downloads\xenios-website` (remote `teamxenios/xenios-website`).
Worktree `C:\Users\sboad\Downloads\wt-research-commerce-distribution-blitz`.

## Base SHA

`87150f488c68576c6fec5f49a4957f3d122eca01`, verified live as current `origin/main`
and confirmed to be the PR #25 merge commit. PR #26 (`f0e6ee4`) and PR #28 (`37965fa`)
are also merged. The base recorded in the pack is accurate.

## Existing products

`server/research/products-data.ts` holds a hand-maintained array of `Product` records
covering the 15 catalog items. Every record is `status: "hold"`, `lane: "research"`,
which correctly keeps commerce closed today.

**The records assert supplier facts as plain strings**, including exact strengths
(`"15 mg / 15 mg"`), prices (`priceCents: 33999`), and for KLOW a full composition
(`"KLOW combines TB-500, BPC-157, GHK-Cu, and KPV"`, `"5 mg / 5 mg / 10 mg / 5 mg"`).

## Existing catalog routes

```text
GET  /api/research/me                       open, reports gate state only
POST /api/research/access                   shared password gate
POST /api/research/logout
GET  /api/research/catalog                  requireActiveMember
GET  /api/research/member/catalog           requireActiveMember (member-route alias)
GET  /api/research/policies                 shared password only
POST /api/research/orders                   requireActiveMember
```

The order route is better than expected. It computes totals server-side from the
catalog (a browser-submitted price has no schema field and would be ignored), enforces
lane separation by rejecting mixed carts, requires a research attestation, and gates on
per-lane commerce flags. What it lacks is a state machine, inventory, and a payment
boundary.

## Existing product content

`content/research-products/` on branch `claude/research-product-guide-content-now`
(draft PR #29): 15 structured records where every supplier fact reads
`NOT CONFIRMED - see open supplier questions`.

## Existing Guide content

Same branch: 11 complete nine-file Guide packets, 3 partial, 6 not started, 6 blend
packets not started. No runtime Guide domain exists yet.

## Existing inventory data

**None.** No lot, COA, expiry, disposition, or allocation concept existed anywhere.

## Existing commerce code

Order intake only, as described above. No cart service, no checkout, no payment
provider, no order state machine, no subscriptions, no shipping provider, no
fulfillment, no refunds or replacements, no large-order review.

## Existing referral code

**Substantial and already built.** `server/research/referrals.ts` (18.7 KB) with
`referrals.test.ts` (27 KB), `shared/research/referral-types.ts`, plus
`supabase/research-referrals.sql`, `research-referral-fraud.sql`, and a seed file.
`server/research/fraud.ts` (13 KB) and `fraud-admin.ts` exist. **This lane must extend
these, not rebuild them.**

## Existing partner code

**None.** No affiliate, Research Rep, organization, event, training, certification,
attribution, commission, or payout concept exists. Referrals are member-to-member only.

## Proposed schemas

Delivered in this wave as typed contracts, ahead of any database work:

- `shared/research/capability.ts`: capability registry, `ProviderResult`.
- `shared/research/flags.ts`: eleven flags, all default false.
- `shared/research/catalog.ts`: lanes, availability, goals, `ProvenancedFact`,
  eligibility, supplement authorization.
- `shared/research/commerce.ts`: order and subscription state machines, large-order
  review, shipping quote presentation.
- `server/research/inventory/lots.ts`: lots, quality documents, FEFO, recall trace,
  split fulfillment.
- `server/research/providers/payment.ts`: payment boundary.

## Proposed migrations

Drafted but **not run**, and not yet written to `supabase/`. They follow the existing
file-per-concern convention seen in `supabase/research-*.sql`. Planned:
`research-catalog.sql`, `research-inventory-lots.sql`, `research-orders.sql`,
`research-subscriptions.sql`, `research-fulfillment.sql`, `research-partners.sql`,
`research-commission-ledger.sql`. Each needs constraints, foreign keys, unique
idempotency keys, state checks, and audit linkage. **No production SQL was run.**

## Provider boundaries

| Provider | Interface | Disabled | Test | Real adapter | Default |
|---|---|---|---|---|---|
| Payment | done | done | done | shell, returns MISCONFIGURED | **disabled** |
| Shipping | pending | pending | pending | pending | disabled |
| Fulfillment (Mitch) | pending | pending | pending | pending | disabled |
| Payout | pending | pending | pending | pending | disabled |

## File claims

This lane claims: `shared/research/{capability,flags,catalog,commerce}.ts`,
`server/research/providers/**`, `server/research/inventory/**`,
`docs/research-commerce/**`.

Not claimed and not touched: `server/research/{membership,members,member-auth,outbox,
referrals,fraud}.ts`, `client/**`, and the content trees owned by PR #29.

Sibling Session 1 claims `docs/research-legal/**` and
`docs/research-operations/document-control/**`. Disjoint, confirmed by message.

## Test strategy

Pure-logic domains are tested exhaustively without a database or a network, so the
whole commerce spine is exercisable with zero credentials. 78 new tests this wave.

Adversarial cases covered so far: unknown transition, actor not permitted, member
attempting a payment or fulfillment state, terminal-state escape, provider confirmation
required for every paid state, webhook replay, duplicate idempotency key, double
capture, over-capture, over-refund, refund without capture, test provider refused in
production, expired lot, quarantined lot, unknown expiry, retest overdue, excursion
pending, missing documentation, partial allocation refusal, recall traceability, and
split fulfillment grouping.

Not yet covered: pending and cancelled member catalog denial, state restriction,
stock reservation race, attribution race, commission reversal, organization isolation,
partner privacy, unpublished Guide denial, AI publish denial.

## External activation gates

Nothing in this wave needs a credential. Every provider defaults to disabled and every
flag defaults to false. No credential is requested, per the build-first policy: the
domain, interfaces, disabled paths, test paths, and tests must all exist first.

## Immediate risks

**1. Supplier-fact conflict between two sources of truth. This is the most important
finding and it needs Samuel, not an engineer.**

`products-data.ts` states exact compositions, strengths, and prices. The content review
recorded all of them as NOT CONFIRMED. The sharpest case is KLOW: the runtime file
asserts a four-component set (TB-500, BPC-157, GHK-Cu, KPV) at
`5 mg / 5 mg / 10 mg / 5 mg`, while the content lane deliberately declined to guess even
the ingredient set and raised it as an open supplier question.

Only one of these can be right, and the difference is a statement about what is in a
vial. This was **not** silently reconciled. Instead `ProvenancedFact` makes confirmation
structural: legacy values are retained and marked `unverified_legacy`, they are not
member-displayable, and `evaluatePurchaseEligibility` blocks purchase while any
commerce-critical fact is unconfirmed. Whichever source proves correct, the code is safe
in the meantime.

**Samuel must confirm each supplier fact against a written supplier document.**

**2. The legacy catalog is a hand-maintained array.** It has no provenance, no
inventory link, and no eligibility evaluation. Migrating it onto `CatalogProduct` is the
next structural step, and it must not lose the legacy values, which are evidence of what
was previously believed.

**3. Referrals and fraud already exist and are well tested.** The risk is a second lane
rebuilding them. Extension only.

**4. Peptide commerce is not approved.** Everything here is code behind default-false
gates. No part of this wave brings commerce closer to live without Samuel's written
approval.

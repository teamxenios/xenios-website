# EARLY ACCESS — ANONYMOUS RETAIL PRICING (P0)

- Session: `claude-opus5-main` (sole integration / release / production owner)
- Branch: `xenios/launch-integration-20260819`
- CODE RC: **`500bc88`** — frozen, NOT deployed. This is the only commit in
  this slice that touches source. Any commit after it on this branch is this
  handoff and the continuity JSON records, which change no source file, so
  the deployable artifact is identical. The SHA put to the founder for GO is
  the branch head at the moment of the request, stated exactly in that
  request rather than referenced from inside this file.
- Production at time of writing: `77e782e0c4c1c5be5275711e6996d7f6dfb81fe0`
  (deploy `dep-da3o55gn74is73f9sdo0`, rollback `ce1590fa08dcb5eae299bcaf55e799ad9ea092d1`)
- Migration state: unchanged. M75 remains the newest applied migration.
- Production pricing: unchanged. No env change, no flag change.

## The defect, confirmed from the composition rather than from the symptom

`server/index.ts` `masterOfferingServiceFor` carried the pricing viewer only
from the authenticated member row. Its own comment stated the consequence:

> A viewer without one (Early Access session, anonymous probe) still gets the
> catalog; identityFor resolves null and prices stay "Price on request".

Early Access has no password and no member account, so every Early Access
visitor was exactly that viewer. Measured live: **420 catalog rows, zero
prices, zero direct actions.**

## The decisive measurement that shaped the fix

`CUSTOMER_PRICE_AUDIENCES` contains `private_early_access`, which looks like the
natural audience to read. Production says otherwise:

| audience | active rows |
| --- | --- |
| `member` | 417 |
| `retail`, `private_early_access`, `professional`, `wholesale` | 0 |

Reading `private_early_access` would have resolved nothing and left the catalog
exactly as broken. The published customer retail schedule currently **lives on
the member audience**, so the authority reads that audience through one named
constant, `EARLY_ACCESS_RETAIL_PRICE_AUDIENCE`, with the consequence written
down in the file: while it is `member`, an anonymous visitor sees the same
number a signed-in member sees. The day Xenios wants member-only pricing, that
becomes its own audience plus a price release, and the change here is one line.

## What was built

- `server/research/master-offerings/early-access-retail-pricing.ts` — the
  authority, plus `pricingViewerForCustomerViewer`, the ONE derivation both the
  composition root and its tests call. A member's own viewer always wins; the
  fallback is reached only for an actual Early Access session carrying a
  session hash.
- `member-pricing-viewer.ts` — `pricingGrant` gained an optional explicit
  `audience`, defaulting to `"member"` so every existing member caller is
  byte-for-byte unchanged in behaviour.
- `server/index.ts` — the inline expression replaced by that shared function.
  One import, one hunk. Seam baseline re-registered in
  `docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json` with a dated review note.

No frontend change. `AssistedOrderPage` already renders `money(unitPriceCents)`
straight from the server payload and `money(null)` returns "Price pending",
never `$0`.

## Coverage, measured across the entire composed catalog

The 417 `(productId, variantId)` pairs in the committed binding artifact are
**byte-identical** to the 417 pairs holding an active, in-window,
member-audience price on a published product and approved variant in
production — both sides md5 `062a30f0d3d0a0571e78837b5b92d4f6` — with **zero**
non-positive amounts (min `$1.00`, max `$2,250.00`). So the coverage test's
price source reproduces production rather than being permissive.

Walking all pages to exhaustion:

| | count |
| --- | --- |
| TOTAL | 420 |
| PRICED | 417 |
| PRICE ON REQUEST | 3 — BAM15 500 mcg, FedEx Standard Overnight, Syringes & Alcohol Swabs |
| CARE (provider pathway) | 244 |
| HELD (request activation) | 32 |
| DIRECT (orderable outright) | 143 |
| RESEARCH USE ONLY | 153 |

Named rows verified at their real production prices: Kisspeptin 10 mg
`$65.00`, Retatrutide 50 mg `$1,075.00`, BAM15 has no active price row and
stays on request.

## Proof

19 tests across two new files, both mutation-tested: disabling the fallback
fails 5 of 9 and 4 of 10. The passes under mutation are the negative tests,
which is correct.

Covered: full-catalog paging (no clamp, no duplicates), priced vs on-request
split by name, never `$0`, price and ordering pathway kept separate (no 503A
row became directly orderable by gaining a price), catalog price equals
submit-time resolved price, a mid-visit price change moves the resolved price
AND the fingerprint so a stale page cannot pin an old price, no privilege
escalation (frozen viewer, no email, no capability, grant carries exactly two
keys), no browser influence (hostile headers/body/query), identical item set
with and without the grant across all 420 rows, and no procurement economics
on the wire on any page.

`assisted-order-pricing-seam.test.ts` had its Early Access case rewritten as a
**deliberate registration** of the changed decision, not a silent edit: it now
pins the narrower property it always really tested — no grant means no price.

## Gates

Typecheck clean · build clean · master-offerings + assisted-order lanes 491
passed · route uniqueness 395 registrations · migration DAG 34 nodes ·
release-control-plane 35 · core-site-protection 32 · source-auditability clean.

Two failures were found and fixed during the run, not worked around:

1. A raw NUL byte in a template delimiter in the new coverage test, caught by
   `server/source-auditability.test.ts`. Replaced with the escape sequence,
   delimiter unchanged so no key moved.
2. The `server/index.ts` seam hash tripwire, working exactly as designed.
   Re-registered with the reasoning written into the manifest.

**Known pre-existing, NOT from this slice:** the standalone
`verify-core-site-protection.mjs` script FAILs at branch level over
`client/src/pwa/register.ts`, last touched by commit `f024eef` (PWA shell).
The vitest gate that guards the seam hashes passes.

## Open items

1. Founder GO required before any deployment. Nothing here ships without it.
2. Founder to manually delete the paused rehearsal project
   `xenios-m75-rehearsal-disposable` (ref `bqwcvdkubxrlhecsuegk`).
3. Product question, surfaced not fixed: FedEx Standard Overnight and
   Syringes & Alcohol Swabs sit on the provider pathway with no price, so a
   customer cannot add shipping or supplies to an order.
4. Next in sequence after pricing: declared affiliate code end-to-end proof,
   then canonical order copy (hard prerequisite before canonical order
   conversion).

## Verified separately

Both queued intents for controlled order `XRR-20260820-2E67BC3AA3` transitioned
`pending` → **`sent`** on attempt 1 with a provider message id and no error:
`research.assisted_order.submitted.admin` → research@xeniostechnology.com and
`research.assisted_order.submitted.customer` → team@xeniostechnology.com.

---

# ROUND 2 — ADVERSARIAL REVIEW, AND WHAT IT CHANGED

Five hostile lenses (privilege, data exposure, money correctness, ordering
pathway, test integrity), 16 candidate findings, each handed to an independent
agent whose job was to REFUTE it. 21 agents, ~20 minutes.

**16 candidates, 0 survived refutation.** The refutations were substantive, not
rubber stamps: they checked the actual diff, ran the real suites, and killed
claims on their own facts. The three most serious:

- *unbound: identity forgery.* Real mechanic — `resolve()` takes the client's
  `{productId, variantId}` when the variant id carries the `unbound:` prefix.
  But price and pathway are both recomputed server-side from the variant the
  server itself walked to, `research_assisted_order_lines.product_id` has no
  foreign key and no consumer outside the bridge, and any authenticated member
  could already do it before this commit. Buys nothing. Logged as a data-hygiene
  nit for the assisted-order lane, not a blocker.
- *Per-request Product Control fan-out.* Pre-existing: the live
  `/api/research/early-access/catalog` door already did a full read per request
  before this commit, and `production-catalog.ts` is not in the diff.
- *The grant reaching the cart purchase gauntlet.* `EARLY_ACCESS_RETAIL_PRICE_AUDIENCE`
  is `"member"`, so `grant.audience ?? "member"` yields the exact string the old
  hard-coded line produced. Zero behavioural delta, and audience eligibility is
  one of ~15 necessary conditions in `selectCartProduct`, never sufficient.

## What the review actually corrected — in my own work

**A question I had assumed rather than checked.** The grant is handed only to a
viewer with a non-null `earlyAccessSessionHash`, and a cookieless visitor has
none. So: does this repair reach the person who sees no prices? I had not
proved it. It does, structurally: `createAssistedOrderViewerResolvers` sets
capabilities and pricing provenance in the SAME branch — member branch carries
a `pricingViewer`, identified Early Access carries a session hash, and the
anonymous fallback carries neither capabilities nor a hash. **A viewer that can
read the catalog is always priced; a viewer that is not priced cannot read the
catalog at all.** Production answers such a request HTTP 403, verified live.
Pinned in `early-access-pricing-reach.test.ts`.

**Tests that could not fail.** Both new files built their price fixtures FROM
`EARLY_ACCESS_RETAIL_PRICE_AUDIENCE` — the one constant the repair turns on.
Pointing it at `private_early_access` (zero production rows) left the whole
suite green while the live catalog would silently return to "Price on request".
Fixed: fixtures use a literal, the constant is asserted against the
measurement. **Flipping it now fails 13 tests; before, it failed none.**

Two assertions proved nothing and are replaced: one compared five constants in
the same file to each other; the other compared the binding artifact to a set
derived from that same artifact. The latter now fingerprints the artifact's
CONTENT against the md5 measured from production.

## CONCERN A — submit-path reach — CLOSED BY EXHAUSTION

`RESOLVE_MAX_PAGES` is 500 against a five-page catalog, so it was never the
bound. Proved rather than argued: **all 420 rows are resolved individually
through the submit path and compared on the authoritative fingerprint** (which
covers productId, variantId, price, priceVersion, catalogVersion and
workflowMode together). Zero unresolved, zero disagreements. Positional cases
named separately — first page, page-1 boundary, row 100, middle, last row —
plus Kisspeptin and BAM15, which must resolve while staying unpriced.

Real production prices at those positions: 5-Amino-1MQ `$200.00` (first),
Metformin HCl ER 500MG `$1.88` (row 99), Methylcobalamin `$75.00` (row 100),
Tesofensine `$5.63` (middle), Radient XO Serum `$750.00` (LAST ROW).

That test timed out at the 5s default under a loaded suite. It now has an
explicit budget and shares one parsed dataset — sampling fewer rows would have
given back the coverage it exists for.

## CONCERN B — pricingGrant audience — CLOSED BY AUDIT AND GUARD

The entire non-test codebase has **exactly two** grant construction sites: the
Early Access authority (explicit `member`) and `masterOfferingViewerForMember`
(no audience, so the `"member"` default — existing member behaviour byte-for-byte
unchanged). Nothing constructs `wholesale`, `professional`, `retail`, or
`private_early_access`. `pricingViewer` is assigned only in the composition root
and the member resolver; the browser has no path to either.

`pricing-grant-boundary.test.ts` pins all of it structurally. A rogue grant site
fails it; a commercial audience named in executable code at a grant site fails it.

## A COMMERCIAL OBSERVATION, SURFACED NOT FIXED

101 of the 417 priced rows are under $10 and 71 are under $5 (minimum $1.00) —
per-unit 503A compounded pricing. **All 101 are 503A Clinical Formulations on
the Care pathway**, so none is directly orderable: they render "Continue through
Care", not a $1.88 buy button. No `$0` anywhere. Worth an eyeball before launch,
but not a blocker and not a code defect.


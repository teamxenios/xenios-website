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

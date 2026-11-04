# Catalog imagery batch 002

This isolated batch supplies an original, logo-free Xenios service presentation for the exact FedEx Standard Overnight catalog row. It is a service visual, not physical product packaging, and it is not mounted in any runtime or public media path.

## Exact disposition

- Offering: `mo_003b0c272099eeb1f114`
- Source variant: `mov_9b65ad5bb184691e19e0`
- Canonical name: FedEx Standard Overnight
- Family: `shipping_and_fulfillment`
- Media kind: `service`
- Packaging state: `not_applicable`
- Binding: intentionally unbound; the binding artifact models the row as a fulfillment fee, not a purchasable product
- Trademark review: pending
- Independent review: pending
- Publication-authorized assets: 0

The generated catalog row carries a `care_pathway` display state, but the governing pathway authority evaluates the shipping family first as `non_merchandise_family` and returns `requiresProviderPathway: false`. The artwork therefore contains no provider, care, pharmacy, intake or customer-action language.

## Artwork boundaries

The presentation uses the exact nominative service name only. It contains no FedEx logo, carrier trade dress, trademark symbol, third-party photograph, parcel/product packshot, tracking element, barcode, rate, price, guarantee, cutoff, exact time or geographic claim. It does not imply carrier endorsement.

The artwork visibly states:

- `SERVICE PRESENTATION`
- `SHIPPING & FULFILLMENT SERVICE`
- `NOT PHYSICAL PRODUCT PACKAGING`
- `INTERNAL REVIEW — TRADEMARK REVIEW PENDING`

No image-generation call or supplier asset was used. The editable SVG is original deterministic vector artwork; the PNG master and optimized WebP are exact local derivatives.

## Assets

| Role | Path | Dimensions | Bytes | SHA-256 |
| --- | --- | ---: | ---: | --- |
| Primary service artwork | `assets/fedex-standard-overnight-service-v1.webp` | 1600×1000 | 76,390 | `75c5e7dd8b58afc03c4120b394f322ebc3a46c260e0263da2d6fccea2f1e06e1` |
| Raster master | `assets/fedex-standard-overnight-service-v1.png` | 1600×1000 | 602,126 | `6b99a7a03231bd2d5089489e7f8c7b5b7f602dad72841e4d12365d23493c5927` |
| Editable vector master | `assets/fedex-standard-overnight-service-v1.svg` | 1600×1000 | 4,677 | `b5477edc3a7557f0f5b444406cac1b68ab6f16fe689931215bee49b848174f6e` |
| Contact sheet | `contact-sheet-v1.png` | 1800×1200 | 352,672 | `da22b7f0a9216225fc8b841f9e8d601965f9492c4b1552450140dcfbf25fd38b` |
| Contact-sheet source | `contact-sheet-v1.html` | 1800×1200 viewport | 3,949 | `af82d8eb2a1fdf6c7d1ef64d7d7f84231b76d0560be9cc1007d28f237454fcb6` |

## Verification

Run:

```text
node deliveries/catalog-imagery/2026-11-04-batch-002/verify-batch.mjs
```

The verifier checks:

- portable committed catalog, binding and pathway-authority bytes;
- all 420 canonical offering/source-variant pairs;
- the exact FedEx service identity and intentionally unbound reason;
- `service` kind, `not_applicable` packaging and zero provider-pathway services;
- three active asset hashes, byte counts, dimensions and unique bytes;
- the contact sheet and its exact HTML source;
- all four required disclosures;
- no external SVG media, carrier signature color pair, trademark symbol or disallowed operational/commercial/customer-routing language;
- zero independently reviewed assets and zero publication-authorized assets.

The committed receipt is `verification-result.v1.json` and reports zero errors.

## Remaining release blockers

- Independent exact-byte and visual review.
- Trademark/legal review of the nominative service name.
- Product Control and release approval for any publication use.
- Explicit runtime/public integration decision by Root after the review gates.

Until those gates are closed, this batch remains internal review evidence only.

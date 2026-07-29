# Pricing presentation

The presentation layer for authoritative customer prices. Three pieces:

- `format.ts`: `formatCustomerAmountCents` (throws a typed `PriceFormatError`) and
  `tryFormatCustomerAmountCents` (returns a typed failure) turn positive integer
  cents into an exact, locale-fixed en-US string using integer arithmetic only.
  Zero, negative, non-integer, unsafe, and non-USD inputs are rejected, so a
  $0.00 render is impossible by construction. Also carries the audience phrase
  table and `priceAriaPhrase`.
- `PriceDisplay.tsx`: renders the `CatalogPriceProjection` union
  (`{ state: "priced", price }` or `{ state: "not_currently_available" }`). A valid price
  is a single text node carrying the full accessible phrase ("Price: $1,800.00
  per unit for members") with an optional visible audience qualifier. Anything
  else (explicit not-available, missing, malformed amount, error) renders the
  approved copy "Not currently available". Loading is a `role="status"` skeleton.
- `PriceUnavailable.tsx`: the unavailable state on its own, for surfaces that
  need it without constructing a projection.

## Adoption notes for the catalog and detail lanes

- Pass the authoritative `CatalogPriceProjection` straight through:
  `<PriceDisplay price={projection} unitLabel="per unit" />`. Do not unwrap the
  priced branch, do not pre-format, do not
  divide by 100, and do not branch on `amountCents` yourself; the component owns
  every honest state, including the error and loading ones (`loading` and
  `error` props).
- Where the surface already names the audience (a "Member price" definition
  label, a members-only page), pass `showAudience={false}` so the qualifier is
  not said twice visibly; the accessible phrase still speaks it.
- Replace ad hoc `Intl.NumberFormat(...).format(amountCents / 100)` call sites
  with the formatter when your lane touches them; float division on cents is
  exactly what this module retires.
- `compareAt` display is out of scope on purpose: compare_at is excluded from
  customer audiences, so these components never accept one.

## The shared-type swap

This branch's base commit predates `shared/research/pricing.ts`, so `format.ts`
defines minimal local structural types that mirror the shared contract exactly:
`CustomerPriceDto` mirrors `CustomerPrice`, and `CatalogPriceProjection` mirrors
`CatalogPriceProjection` (the priced branch nests the fields under `.price` with
a `state` discriminant). At integration, replace that one section of `format.ts`
with re-exports:

```ts
import type { CatalogPriceProjection, CustomerPriceAudience } from "@shared/research/pricing";
export type { CatalogPriceProjection, CustomerPriceAudience } from "@shared/research/pricing";
export type { CustomerPrice as CustomerPriceDto } from "@shared/research/pricing";
export type PriceNotAvailable = Extract<CatalogPriceProjection, { state: "not_currently_available" }>;
```

(The import line matters: a `export type ... from` re-export alone does not put
the names in module scope, and `format.ts` uses `CustomerPriceAudience` and
`CatalogPriceProjection` in its own declarations.)

and keep `isPriceUnavailable` as is. Component and test code in this folder
needs no other change; this was verified with a strict scratch compile of these
files against the real shared module.

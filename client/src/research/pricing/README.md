# Pricing presentation

The presentation layer for authoritative customer prices. Three pieces:

- `format.ts`: `formatCustomerAmountCents` (throws a typed `PriceFormatError`) and
  `tryFormatCustomerAmountCents` (returns a typed failure) turn positive integer
  cents into an exact, locale-fixed en-US string using integer arithmetic only.
  Zero, negative, non-integer, unsafe, and non-USD inputs are rejected, so a
  $0.00 render is impossible by construction. Also carries the audience phrase
  table and `priceAriaPhrase`.
- `PriceDisplay.tsx`: renders the price-or-unavailable projection. A valid price
  is a single text node carrying the full accessible phrase ("Price: $1,800.00
  per unit for members") with an optional visible audience qualifier. Anything
  else (explicit not-available, missing, malformed amount, error) renders the
  approved copy "Not currently available". Loading is a `role="status"` skeleton.
- `PriceUnavailable.tsx`: the unavailable state on its own, for surfaces that
  need it without constructing a projection.

## Adoption notes for the catalog and detail lanes

- Pass the authoritative projection straight through: `<PriceDisplay
  price={variant.price} unitLabel="per unit" />`. Do not pre-format, do not
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
defines minimal local structural types (`CustomerPriceDto`, `PriceNotAvailable`,
`CustomerPriceProjection`) documented as mirroring the shared contract and kept
assignment-compatible with it. At integration, delete that section of
`format.ts` and re-export the shared types instead; component and test code in
this folder needs no other change.

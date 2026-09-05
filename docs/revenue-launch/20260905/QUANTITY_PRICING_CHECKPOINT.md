# Canonical quantity pricing: first integration slice

Quantity tiers now belong to an existing `AdminProductPrice` version. The
canonical row selector rejects malformed ladders; the server pricing facade
selects the greatest threshold at or below the exact quantity. Cart binding
and revalidation supply the quantity, so the existing checkout recompute and
immutable order snapshot preserve the selected integer-cent amount.

Legacy scalar versions continue to work. New ladders must start at quantity
one with the scalar base amount, have strictly increasing thresholds and
positive nonincreasing prices, and stay inside JavaScript's exact integer
range (the database amount column is bigint). Invalid ladders, ambiguous or
unapproved versions, wrong audiences, stale windows and unsafe arithmetic
produce no customer price. Responses keep their existing explicit field
allowlist; they expose no source, approver or internal cost information.

Validation on Node 20.19.0: 138 tests passed in ten focused files. The new
integration test exercised all 117 Phase A target amounts using synthetic
approved canonical records, through the real resolver, cart, checkout and
order snapshot. It also verifies quantity changes require repricing and a
client cannot select a lower tier. These are local code tests, not product
approval, payment, receipt, fulfillment or production purchase evidence.
The full TypeScript check passed during this slice; the final integration
boundary will repeat it on the exact candidate. Seven Python source tests
also pass. No full release suite or build has yet been run for this slice.

Not yet complete: database storage and immutable tier writes, Product Control
intake/review/activation, Early Access single/cart paths, buyer-scoped pricing
precedence, customer tier display, live supplier/operational evidence and
production release. No migration exists or has been applied for tiers yet;
no existing database price has been changed. Production GO remains absent.

Next implementation must bind the full canonical tier/version identity into
the existing founder release fingerprint, preserve buyer-scoped prices, and
avoid stacking the legacy quantity promotion on an approved tiered version.
Then extend existing Product Control write and review authority with a
production-shaped migration candidate and disposable rehearsal.

# Early Access Final Completion — integration ledger

One row per package file. Package digest `193257eadc4070f52f3c2cd0e0e1dc9dceb8647a13f43aca47ffb7dda974dcd9`
(31 overlay files), validated before any repository file was touched.

Starting HEAD `b03f0406eea33a4ce73860ffa28820a029f0f5ad`.

## Identical, skipped (6)

Byte-identical after line-ending normalisation. Copying them would have been a
no-op, so they were not touched.

| file |
|---|
| `client/src/research/early-access/cart/cartStore.ts` |
| `client/src/research/early-access/cart/cartStore.test.ts` |
| `client/src/research/early-access/cart/history.ts` |
| `client/src/research/early-access/cart/history.test.ts` |
| `server/research/early-access/cart/cart.test.ts` |
| `supabase/migrations/20260807193000_research_early_access_cart_checkout.sql` |

## New, copied (18)

No repository file existed at these paths, so there was nothing to compare and
nothing to lose.

| file | kind |
|---|---|
| `client/src/research/adapters/earlyAccessCart.ts` | client transport |
| `client/src/research/early-access/cart/EarlyAccessCartCatalogue.tsx` | UI |
| `client/src/research/early-access/cart/EarlyAccessCartDetails.tsx` | UI |
| `client/src/research/early-access/cart/EarlyAccessCartLineIssues.tsx` | UI |
| `client/src/research/early-access/cart/EarlyAccessCartMount.tsx` | UI entry point |
| `client/src/research/early-access/cart/EarlyAccessCartPanel.tsx` | UI |
| `client/src/research/early-access/cart/EarlyAccessCartPayment.tsx` | UI |
| `client/src/research/early-access/cart/EarlyAccessCartReview.tsx` | UI |
| `client/src/research/early-access/cart/EarlyAccessMultiCartJourney.tsx` | UI journey |
| `client/src/research/early-access/cart/EarlyAccessProgress.tsx` | compact progress |
| `client/src/research/early-access/cart/cart-safety.test.ts` | test (repaired, below) |
| `server/research/early-access/cart/admin-routes.ts` | named-admin proof + settlement |
| `server/research/early-access/cart/production-store.ts` | durable composition |
| `server/research/early-access/cart/settlement.ts` | settlement service |
| `server/research/early-access/cart/settlement.test.ts` | test |
| `server/research/early-access/cart/supabase-store.ts` | durable store (repaired, below) |
| `server/research/early-access/cart/supabase-store.test.ts` | test |
| `supabase/migrations/20260808100000_research_early_access_cart_completion.sql` | migration 60 |

## Conflict, merged (7)

Method: the package files are supersets whose repo-only lines are almost
entirely reformatting. Rather than weave line by line (which invites a silent
semantic drop), each named safety invariant was COUNTED in both versions
first. Every one appeared in the package at equal or greater frequency:

| invariant | repo | package |
|---|---|---|
| `IDEMPOTENCY_CONFLICT` | 4 | 4 |
| `QUOTE_CHANGED` | 2 | 2 |
| `QUOTE_EXPIRED` | 2 | 2 |
| `expectedIntentHash` (full-intent binding) | 6 | 6 |
| alias-aware ownership | 4 | 4 |
| `LINE_REFUSED` (line-specific failures) | 4 | 4 |
| `AGREEMENT_REQUIRED` | 3 | 3 |
| cross-customer 404 | 3 | 6 |
| contact as a required fact | 4 | 6 |

Only then was the package version adopted, and the full cart suite plus a
whole-repository typecheck run to catch anything the count could not see.

| file | resolution |
|---|---|
| `shared/research/early-access-cart.ts` | package adopted; adds settlement, receipt, child-order and status surface |
| `server/research/early-access/cart/model.ts` | package adopted |
| `server/research/early-access/cart/ports.ts` | package adopted; adds settlement store ports |
| `server/research/early-access/cart/store.ts` | package adopted; `InMemoryEarlyAccessCartStore` still exported, so the F4 resolver is unaffected |
| `server/research/early-access/cart/quote-service.ts` | package adopted |
| `server/research/early-access/cart/checkout-service.ts` | package adopted |
| `server/research/early-access/cart/routes.ts` | package adopted |

## Repaired during integration (2 package defects)

Neither is a merge decision; both are defects in the package as shipped.

### 1. `supabase-store.ts` could claim a settlement it could not show

The durable store's fallthrough returned `already_settled` with
`settlement: null`, which does not typecheck against `CartSettlementCommit`
(that union permits `already_settled` only WITH a settlement).

The type error was protecting a real safety property. `admin-routes.ts`
answers `already_settled` with HTTP 200 and `paid: true`,
`receiptIssued: true`, `supplierReleased: true`, echoing `result.settlement`.
Had the union simply been widened, an admin would have been told three
settlement facts had occurred while the database had just failed to produce
the settlement row proving any of them. That is the same rule as the payment
proof: do not claim what you cannot evidence.

Fixed by narrowing rather than widening. If the RPC reports `already_settled`
and the settlement cannot be read back, that is an inconsistent durable state
and now throws `EarlyAccessPersistenceError`, exactly as an unrecognised
reason already did.

### 2. `cart-safety.test.ts` could not run on Windows

`path.dirname(new URL(import.meta.url).pathname)` yields `/C:/...`, so every
`readFileSync` resolved to `C:\C:\...` and threw ENOENT. The file's whole
purpose is scanning sources for PII and browser-side money, and it was
scanning nothing. Now uses `fileURLToPath`. This is the same portability
defect the package validator has.

## Rejected (0)

Nothing was rejected.

## Not yet wired at this ledger entry

The files are present, typechecked and tested, but the following composition
work is separate and is tracked in the successor report rather than implied
complete here: mounting the cart UI in the live route, wiring the durable
store and admin settlement routes in `register.ts` and `production-deps.ts`,
reconciling migration 60 into the DAG, and both database shapes.

`RESEARCH_EARLY_ACCESS_CART_ENABLED` remains false throughout.

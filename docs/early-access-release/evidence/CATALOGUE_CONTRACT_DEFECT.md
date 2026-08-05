# Release-blocking defect found in pre-production browser proof

Found while executing Phase B of the go-live prompt, at candidate
`05788ec2e7f925cb37376eeb0e27763c5865aa2a`. It was invisible to every gate that
had been run and would have shipped an empty storefront to the first customer.

## What a customer would have seen

The Private Early Access catalogue rendered **zero products**. In place of the
22 approved units the page showed:

> We could not load the research catalogue just now. This is a fault on our
> side, not an empty catalogue. Nothing has been ordered or charged.

The server was healthy throughout. `GET /api/research/early-access/catalog`
answered `200` with `ok: true` and all 22 units. The browser could not read it.

## Two independent contract drifts

**1. The array key.** The mounted route answers with its rows under `units`.
The browser reader (`client/src/research/adapters/earlyAccessCatalog.ts`)
accepted only `rows` or `products`, so `rowsOf` returned `null` and the payload
was classified `unreadable`. The reader's own comment recorded that the
projection "has been named both ways during this build"; it was renamed a third
time and the reader was not told.

**2. The row fields.** `client/src/research/early-access/earlyAccessCatalogView.ts`
re-derived availability from `row.blockers`, `row.supplierReady`, and a
lower-case `availability === "available"`. The server sends none of those: it
sends `productControlBlockers`, no `supplierReady` at all, and the upper-case
war-room vocabulary (`AVAILABLE` / `AVAILABILITY_CONFIRMATION_REQUIRED` /
`TEMPORARILY_HELD`). So even with the key fixed, every row would have resolved
to `TEMPORARILY_HELD` and the storefront would have been unsellable rather than
merely empty.

## Why 7,025 tests did not catch it

Each side was thoroughly tested against its own fixtures, and the fixtures
disagreed with each other. The server suite asserted the server's shape. The
client suite asserted a shape the server has never produced. Nothing in the
repository compared the two, so both suites were green while the product did not
function. No amount of additional same-side testing would have found this.

## The fix

The server is the authority, and it already says so in its own type:

- `availability` — "The canonical availability state. Server-derived, never client-inferred."
- `purchasable` — "True exactly when state is 'purchasable'. Stated so a client never derives it."

The client was violating both. The stale docblock on `availabilityStateOf`
described itself as "A TEMPORARY SEAM" to be replaced by reading the server
field "when it lands". It landed; the swap was never made. This change makes it.

1. `rowsOf` reads `units` first, keeping `rows` and `products` so an older
   payload is still read rather than reported unreadable.
2. `availabilityStateOf` reads the server's decision and validates it, instead
   of recomputing it. Unknown, missing or malformed resolves to
   `TEMPORARILY_HELD`, and a row the server did not mark `purchasable` is never
   rendered sellable whatever its state claims. Two server fields must agree
   before anything renders as sellable, so one wrong field cannot open a
   purchase path.
3. `blockers` and `supplierReady` are removed from the row type, so nothing can
   read a field the server does not send.

Fail-closed behaviour is preserved in the direction that matters: absence of
information never promotes a row toward orderable.

## The regression that pins it

`client/src/research/adapters/earlyAccessCatalog.contract.test.ts` builds its
fixtures from the **server's own exported types**
(`EarlyAccessStorefront`, `EarlyAccessStorefrontUnit`) and feeds them to the
**real browser reader**. A rename on the server stops this file compiling; a
rename in the reader fails its assertions. The drift now has to break something.

## Gate results after the fix

| Gate | Result |
| --- | --- |
| Full suite | 7,033 passed, 27 skipped, 0 failed (was 7,025) |
| Typecheck | 0 errors |
| Client build | green |
| Core site protection verifier | PASS (exit 0) |
| Protected files (`server/index.ts`, `server/research/index.ts`) | untouched |

Browser proof after the fix: 22 cards render, 18 `AVAILABLE`, 4
`TEMPORARILY_HELD`, on desktop and mobile. See `browser-artifacts/`.

## A separate finding, not a defect, for the founder

Three founder-released units render `TEMPORARILY_HELD` rather than available:

- PEP-007 Tesamorelin
- PEP-009 NAD+
- PEP-010 MOTS-C

Each carries the non-waivable blocker `STRENGTH_DISPUTE_UNRESOLVED`, the exact
condition migration 47's write gate governs. This is the system working as
designed: it fails closed on a disputed strength. It is a **data determination**,
not a code fault, and it has deliberately not been touched.

Whether these three are held in production depends on production's declared
facts, not on this harness. If they carry the same dispute there, the live
storefront opens with **18 purchasable units, not 21**. That is a founder
decision to make before go-live, not an engineering one.

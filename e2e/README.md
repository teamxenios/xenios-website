# Launch-invariant suite

The founder's "important negatives" for the Early Access revenue path, asserted
against the **composed** intake doors rather than against modules.

Every conversion defect found on 2026-08-20 lived in a seam between
individually-correct modules whose own unit tests were green: bindings resolved
by the wrong key, an unlock route and its repository configured into
disagreement, a client that never rendered a requirement its server enforced.
Module tests could not have caught any of them. This suite exists for that
class of failure.

## Running

Standalone, no change to the shared root config:

```bash
npx vitest run --config e2e/vitest.config.ts
```

## Folding it into the default suite (lead)

`vitest.config.ts` is a shared root file this lane does not own. To include the
suite by default, add `"e2e/**/*.spec.ts"` to `test.include`:

```ts
include: [
  "server/**/*.test.ts",
  "shared/**/*.test.ts",
  "client/src/**/*.test.{ts,tsx}",
  "e2e/**/*.spec.ts",
],
```

## What is covered

| Invariant | Status |
|---|---|
| A browser-declared unit price cannot become the stored price | covered |
| The authority's price is what is stored and totalled | covered |
| A request cannot declare itself paid | covered |
| An affiliate code cannot move price or total | covered |
| Quantity above the founder maximum (100) is refused | covered |
| One customer cannot read another's request | covered |
| An anonymous caller cannot read a request | covered |
| Duplicate submission collapses to one order | covered |
| A provider-pathway row cannot become a priced direct order | covered |
| A line naming an unserved variant is refused | covered |
| Wholesale, cost, margin, markup never reach a customer surface | covered |
| A zero price is never rendered as a real price | covered |
| Both customer and Xenios are notified on the durable outbox | covered |
| An accepted request survives regardless of notification outcome | covered |

## Not yet covered, and why

- **A held product cannot Buy Now.** Needs the direct-commerce selection
  authority composed in; that lane is `CATALOG-ACTION-UNIFICATION`, actively
  leased elsewhere.
- **An unpaid order cannot release to a supplier.** Needs the fulfillment mount,
  handed off by `claude-fable-s8-fulfillment` and awaiting lead integration.

Both are deliberate gaps rather than silent ones. Add them here once those
lanes land, so the negatives live in one place.

## Proving the suite has teeth

A negative-control suite that has never failed is not evidence. Three mutations
were applied to the harness and each was caught by exactly the expected test,
then reverted:

| Mutation | Test that went red |
|---|---|
| Authority honours the browser's declared price | refuses a submission whose declared unit price disagrees with the authority |
| Authority raises the ceiling to 1000 units | refuses one unit above the maximum |
| Member resolver answers "a" for every caller | does not disclose a request to a different signed-in member |

Re-run that check after changing the harness. A harness that cannot fail is a
harness that is not testing anything.

---

# LANE H — pricing cache adversarial verification

`pricing-cache-adversarial.spec.ts` attacks `BulkCatalogPricingSource`, the
3-query replacement for the 3,306-query catalog read. It does not ask whether
the cache caches; it asks whether any reachable upstream behaviour can still
show the customer a catalog with no prices in it.

**12 of 13 pass. One fails, and it is a confirmed defect.**

## Confirmed defect: an empty successful read poisons the cache

A read that RESOLVES with zero rows silently replaces a good snapshot. Every
product then answers `null` from `readProductForPricing`, so all 417 approved
prices render "Price on request" — cached for the full ttl, and re-poisoned on
each refresh.

This is the exact collapse the class was written to prevent, reached through a
quieter door: the failure path is guarded, the success-with-nothing path is not.
It is not hypothetical here — `.env.example` records a production incident on
this project where a key misconfiguration made "reads silently return empty".

**Ready-to-apply fix** (17 lines, refuse an empty read only when a non-empty
snapshot is held):

```bash
git apply e2e/proposed-fixes/bulk-catalog-pricing-empty-read.patch
```

Verified: with the patch the suite is 13/13; reverting it puts exactly the
empty-read test back to red. The file is the lead's active unpushed work, so
this lane proposes rather than applies it.

## Open policy question, deliberately not decided

A refresh returning 2 rows where 417 stood has the same causes as an empty read,
but "how small is too small" is a founder/lead judgement — too strict a ratio
would refuse a legitimate catalog reduction. The suite therefore pins today's
behaviour (the shrunken read is accepted) instead of asserting an unagreed
threshold, so the question stays visible rather than silent.

## What passed

Cold read, warm serve, ttl refresh, stampede collapse at 1/5/10/25 concurrent
cold callers (one upstream read each time), stale-while-error serving the last
verified snapshot, honest raise past the staleness ceiling, honest raise on cold
upstream failure, recovery to fresh data, and no customer identity in `stats()`.

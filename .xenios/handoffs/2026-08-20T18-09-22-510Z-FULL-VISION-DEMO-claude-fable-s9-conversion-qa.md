# FULL-VISION-DEMO (scoped to launch negatives) — handoff

Session: `claude-fable-s9-conversion-qa`
Branch: `lane/e2e-conversion-qa-20260819` (pushed)
Exact SHA: `c7bb20a42cb8e85eb8475ca0c6c73009667552aa`
Base: `cf649c1` (current integration head at claim time)
Worktree: `C:\xenios-wt\s9-conversion-qa`

`npx vitest run --config e2e/vitest.config.ts` → 16 passed.
`npx tsc --noEmit` → exit 0.
No production mutation. Payment authority untouched. No shared root file changed.

## Why this scope

The task is "production-isolated multi-persona lane with browser E2E". The
highest-value slice available right now is the negative half: five lanes have
handed off SHAs awaiting your integration, and integration is exactly when seam
defects appear. Every conversion defect this lane found on 2026-08-20 lived in a
seam between individually-correct modules whose own unit tests were green.
Module tests could not have caught any of them.

## What landed

`e2e/launch-invariants.spec.ts` — 16 controls over the composed intake door,
built with the real descriptor table, express adapter, viewer resolvers and
production composition; only infrastructure ports are fixtures.

Covered: a browser-declared price cannot become the stored price; the
authority's price is what is stored and totalled; a request cannot declare
itself paid; an affiliate code cannot move price or total; quantity 101 is
refused against a maximum of 100; one customer cannot read another's request; an
anonymous caller cannot read one; duplicate submission collapses to one order; a
provider-pathway row cannot be recorded as a priced direct order; an unserved
variant is refused; wholesale/cost/margin/markup never reach a customer surface;
zero is never rendered as a price; both customer and Xenios are notified on the
durable outbox; an accepted request survives the notification outcome.

`e2e/harness/assisted-order-door.ts` — the composition, with a caller-controlled
catalog so a Care row, a ceiling row or an unserved variant can each be
expressed without touching another lane's code.

`e2e/vitest.config.ts` — runs standalone, so nothing in the shared root config
had to change. One-line include for the default suite is in `e2e/README.md`.

## The suite is proven to fail

A negative suite that has never failed is not evidence. Three mutations were
applied and each was caught by exactly the expected test, then reverted:

| Mutation | Test that went red |
|---|---|
| Authority honours the browser's declared price | refuses a submission whose declared unit price disagrees with the authority |
| Authority raises the ceiling to 1000 units | refuses one unit above the maximum |
| Member resolver answers "a" for every caller | does not disclose a request to a different signed-in member |

Please re-run that check if you change the harness.

## One behaviour worth your eye

A provider-pathway row submitted with the browser claiming
`workflowMode: "direct_order_request"` is **accepted (201)**, not refused. The
browser's claim is correctly discarded and the authority's `provider_request`
is what gets stored, with a null unit price and a null order total — so the
invariant holds. Recording it because "intake accepts, checkout refuses" is a
real design decision and the test now pins today's behaviour either way.

## Deliberately uncovered, not faked

- **Held product cannot Buy Now** — needs the direct-commerce selection
  authority; `CATALOG-ACTION-UNIFICATION` is actively leased to
  `claude-fable-s7`.
- **Unpaid order cannot release to a supplier** — needs the fulfillment mount
  handed off by `claude-fable-s8-fulfillment`, awaiting your integration.

Both are named in `e2e/README.md` so they get added rather than forgotten.

## Also in this SHA

`docs/research-launch/QA-S9-CONVERSION-BLOCKERS.md`, carried forward because it
did not land on the integration head. Its `server/index.ts` fix is NOT carried:
that commit was dropped when this worktree was reset onto `cf649c1`, since you
reimplemented it properly at `28745ae`.

## Fleet-tooling defects reported separately

Two issues will affect every worker joining with the universal prompt:
`xenios-os next` reads only the task board and recommended a lane actively
leased to another session, and the `overlaps()` matcher makes REQUEST-CENTER,
NOTIFICATION-CENTER and ANALYTICS unclaimable against five unrelated sessions.
Detail in the message sent at 2026-08-20T17:56Z.

# Early Access agreement: browser verification matrix

Base SHA `0a25b0b90f787d7e82df3a81631d45d0954dffc1`. To be executed against a
successor SHA once the acceptance route is mounted.

**No step here changes production data except the single acceptance write in
B2, which is the deliberate exception.** Nothing deploys, no flag moves.

---

## Viewports

| | width | what it is for |
|---|---|---|
| mobile-min | 320 px | the narrowest real device; where policy text and the accept control collide first |
| mobile | 375 px | the common case |
| tablet | 768 px | |
| laptop | 1024 px | |
| desktop | 1440 px | |

Run the full sequence at **375** and **1440**. Run the layout-only checks at all
five, since that is where a wrapped or clipped accept control appears.

---

## A. Before acceptance

| # | step | expected |
|---|---|---|
| A1 | Unlock with the Early Access password | private area reachable |
| A2 | Open the catalogue | **22 cards** render |
| A3 | Count states | 18 orderable, 4 held |
| A4 | Find Cagrilintide | card **visible** |
| A5 | Cagrilintide price | **no `$`, no "per unit"** anywhere on that card |
| A6 | Cagrilintide action | control **disabled**; no enabled buy path |
| A7 | Attempt to order any orderable unit | **403 AGREEMENT_REQUIRED** |
| A8 | What the customer sees at A7 | a route into the agreement, not a raw error code |

**A5 and A6 are the founder's stated defect condition.** A price or an enabled
buy control on Cagrilintide is the failure, not a cosmetic issue.

## B. Acceptance

| # | step | expected |
|---|---|---|
| B1 | Open the agreement | the **research-use** policy renders |
| B2 | Read the document | title "Research Use Policy", updated "July 2026", four sections: Purpose, Prohibited use (five bullets), Order review, Communication |
| B3 | Confirm what is NOT shown | **no Terms of Service, no Privacy Policy**; both are operational drafts and must not be presented as accepted |
| B4 | Accept | records `early_access_terms` / `v1` |
| B5 | Accept again (double-click, or reload and re-accept) | **no error shown, and still exactly one row** |

B5 is worth doing by hand rather than trusting the constraint. A customer
double-clicking is the ordinary case, and a 500 there reads as "my acceptance
failed" and produces a support ticket for a system that worked.

## C. After acceptance

| # | step | expected |
|---|---|---|
| C1 | Order an orderable unit at the **correct** price | passes the agreement gate |
| C2 | Order with `expectedUnitPriceCents` **wrong by one cent** | **409 PRICE_CHANGED** |
| C3 | What the customer sees at C2 | the unit re-renders at the real price; not a dead end |
| C4 | Cagrilintide after acceptance | **still held, still no price, still no buy control** |

**C4 exists because acceptance must not widen anything.** An agreement is
permission to transact, not clearance of a founder hold, and a gate that opens
more than it should is easiest to catch immediately after it opens.

## D. Layout and behaviour, all five viewports

| # | check |
|---|---|
| D1 | No horizontal page scroll |
| D2 | Policy text readable without zoom; no clipped section or bullet |
| D3 | Accept control reachable without scrolling past it, and not overlapped |
| D4 | Card grid does not overflow; held card is not visually broken |
| D5 | Keyboard: policy scrollable, accept control focusable and activatable by keyboard |
| D6 | Focus visible on the accept control |
| D7 | Refusal messages announced, not colour-only |
| D8 | No layout shift that moves the accept control while it is being pressed |

## E. Console and network

| # | check | expected |
|---|---|---|
| E1 | Browser console across the whole run | **no new errors** |
| E2 | Failed requests | only the two deliberate refusals, 403 then 409 |
| E3 | Response bodies on the customer surface | **no internal blocker text**: `NO_FOUNDER_RELEASE`, "Product Control", "blocker", supplier names, cost, margin |
| E4 | Any request carrying a customer reference | the ref comes from the session, **never from a body the browser controls** |
| E5 | Money in any payload | matches the server; no client-computed total |

## F. Routes that must not 404

`/research` · `/research/early-access` · product detail · eligibility · the
agreement route · admin Product Control.

## G. Artifacts to capture

1. The 22-card grid, full page, at 1440 and 375.
2. **The Cagrilintide card alone, close enough to read**, showing no price and a
   disabled control. This one is requested specifically because it is the
   founder's stated defect condition.
3. The agreement screen showing the research-use policy.
4. The 403 before acceptance.
5. The 409 after acceptance, with the one-cent difference visible.
6. Console output for the whole run.

---

## What would make me return CHANGES_REQUIRED

- Fewer or more than 22 cards, or a count that disagrees with the server's own
  `received` minus `dropped`.
- Cagrilintide showing any price, any placeholder that reads as a price, or an
  enabled control.
- Acceptance succeeding while unauthenticated, or accepting on behalf of another
  customer.
- A second acceptance producing an error or a second row.
- Evidence carrying a secret, a raw session token, or PII beyond what was agreed.
- The gate opening for a kind or version other than `early_access_terms` / `v1`.
- The agreement check moved earlier than the identity check, which turns the
  endpoint into an oracle for another customer's signing status.
- Any order, payment, receipt, supplier order or commission created by the
  wrong-price attempt.
- Terms or Privacy presented as accepted legal text.
- New console errors, or internal blocker vocabulary on a customer surface.

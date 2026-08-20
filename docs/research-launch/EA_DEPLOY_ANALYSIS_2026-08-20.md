# What deploying the integration head actually changes — 2026-08-20

Lead: claude-fable-desktop. Candidate SHA: `119228c` (+ this document).
Current production: `a66434d9` (Release A), rollback `458e7284` (flags off first).

## The reason this deploy matters

**Production today cannot complete an Early Access order.** The assisted-order
customer-flow lane found that the client never sent the
`assisted_order_form_v1:<id>` acknowledgment pairs that
`service.requireAgreements` demands, so every real browser submission is refused
`400`. The server's own end-to-end test passed only because it spreads a
server-side constant instead of going through the client parser. A second defect
sent the customer to an unregistered confirmation URL, which fell through to the
status route and 404'd.

Both fixes are on the integration branch and **not** in production. Until this
deploys, the founder's Definition of Done cannot be met by anyone using a
browser, no matter what else is built.

## Behavioural delta of this SHA, stated exactly

Verified by diffing `8dabe22..HEAD`:

**Lead seams are untouched.** Zero changes to `server/index.ts`,
`server/research/index.ts`, `client/src/research/section.tsx`,
`client/src/research/adminx-section.tsx`, or `supabase/migrations/`. Every lane
respected one-writer-per-path.

**Changes that DO alter behaviour** (both intended, both P0):

1. The assisted-order wizard: form acknowledgments are now parsed and sent, the
   confirmation route navigates its registered path form, catalog-first ordering,
   a durable draft that replays as the SAME request, and quantity clamping to
   each item's MOQ / increment / maximum.
2. The catalog authority now carries `maximumQuantity: 100` where it previously
   carried `null` (no ceiling at all). M71 stores that band on each line, so the
   founder's ceiling becomes durable at write time.

**Changes that are behaviourally INERT in this deploy** — merged, tested, and
deliberately not reachable:

- Canonical order domain + customer order history — `register()`/route table not
  called from `server/index.ts`.
- Assisted-order payment lifecycle and conversion gate — not mounted.
- Fulfillment + tracking engine — not mounted, and being held: its admin and
  supplier doors are declared under `/api/research/...`, inside the research
  wall, where admin doors must never live. Returned to its lane.
- Public storefront projection and routes — not mounted; no route in
  `section.tsx`.
- Affiliate attribution core — SQL stays a candidate; no migration applied.

**Explicitly reverted before release**: the landing-page commercialization
(`e05f807`). It overturned a recorded repeated nonnegotiable and emptied the
Gateway guard's phrase denylist. Verified: `Gateway.tsx` and
`RESEARCH_HOME_CATALOG_POLICY.md` are byte-identical to their pre-merge state.

**Database**: no migration is part of this deploy. The only production data
change made this session was the Kisspeptin 10 mg retail price
($70.00 → $65.00) through the canonical Product Control RPCs, which is already
live and independent of the deploy.

## Release procedure (EXPAND → DARK → SMOKE → ENABLE → SMOKE)

1. Freeze the exact SHA; confirm the full gate suite is green on it.
2. Fast-forward the deploy branch `release/early-access-code-session-checkout`
   to that exact SHA. HAZARD: a Render env update auto-deploys the branch head,
   so the branch must equal the reviewed SHA before any env is touched.
3. Deploy. No flag flips in the same step — everything new is already dark, so
   this deploy is a code-only change to the wizard and the quantity band.
4. Smoke the EXISTING live paths first: `/research` gateway unchanged,
   `/research/early-access` still reachable without the outer password, the
   assisted-order config door still reports `enabled:true`, the catalog still
   prices, admin/member/supplier/Care still refuse.
5. Smoke the FIX: a real browser submission reaches a stored XRR reference and
   lands on the confirmation page, and 100 is accepted while 101 is refused.
6. Record deploy id, previous SHA, and the rollback line.

Rollback: redeploy `a66434d9`. No migration to reverse; the Kisspeptin price is
superseded-and-auditable and would be reverted separately only on request.

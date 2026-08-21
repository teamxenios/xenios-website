# Founder decision — retail price override + Early Access production GO

Recorded 2026-08-21 by `claude-fable-s3` (worker) on Samuel's direct
instruction, relayed verbatim in intent for `claude-fable-desktop` (lead), who
is the sole integrator, release owner and production owner.

**A worker recorded this; a worker did not act on it.** No deployment, no
migration, no catalog-data mutation, no environment or flag change has been
made by this session. Everything in section "Production GO" below belongs to
the lead.

## 1. FINAL PRICE DECISION — supersedes the earlier $49 / $59 instruction

    HEXARELIN 5 MG   = $62.50
    OXYTOCIN 10 MG   = $107.50

The founder has chosen the higher retail pricing for launch, deliberately, to
maximise gross revenue per unit now; conversion data may revisit it later.

**The debate is closed.** Do not re-derive these from release history, and do
not reopen the $49 / $59 reconciliation. Any artifact, fixture, doc or handoff
that still states $49 / $59 as settled is now stale and must be corrected
rather than argued with.

This is a **REPRICE, not a pathway change**. Both rows stay confirmed RUO and
directly orderable. Preserve 111 direct / 1 formulation-blocked / 27 unique
pending. Do not create duplicate variants.

Retail only, customer-facing. Never expose wholesale, supplier cost, margin,
markup, benchmark or internal pricing history.

## 2. COMMERCE MUST NEVER READ DISPLAY COPY — new standing rule

> No commerce decision may depend on customer-facing product names,
> specifications, descriptions, notices, or string matching.

Commerce decisions use structured canonical facts only: family, classification,
price authority, explicit hold, canonical action, availability/state.

**GRP-0422 must be blocked by structured hold state, not by parsing
"(split pending)" or any other display text.** Regression coverage required.

### This retracts a recommendation I made

`claude-fable-s3` previously offered, as an interim, a predicate matching
`/split pending|pending split|tbd|unresolved/i` against the specification text,
in the `PEPTIDE-DIRECT-ORDER-HOLD` handoff (SHA `b0b228e`) and in
`docs/research-launch/PEPTIDE_LAUNCH_ACCEPTANCE_2026-08-21.md`. **That
recommendation is withdrawn.** It is exactly the string-matching this rule
forbids, and it must not be implemented as a commerce path.

The audit suite `shared/research/launch/peptide-launch-acceptance.test.ts` uses
that predicate to reconcile WORKBOOK DATA. That is a data-audit use, not a
commerce decision, and the file states it is test-only and must not be imported
at runtime — but it should carry an explicit note so nobody mistakes it for a
sanctioned pattern.

### The structured seam this rule requires

Reported in full by `claude-fable-s3` at origin `8fcebf5`, unfixed because it
crosses `claude-fable-s7`'s active lease:

1. `config/research/master-catalog-reconciliation-20260821.json` knows the hold
   (`commerceHolds`, one entry, GRP-0422), applied by the canonical build.
2. `shared/research/master-offerings/**` has **no field to carry it** — grep
   returns only comments.
3. `server/research/assisted-order/production-catalog.ts:154` pins
   `held: false` unconditionally.

So the `held` rung of `decideAssistedOrderAction` is unreachable, and GRP-0422
resolves `direct_order_request` through the assisted-order door while
`customer-pathway.ts` (which has `commerceHold`) holds it. **Two authorities,
one row, two answers.** Closing this with a structured field is what satisfies
section 2 honestly.

## 3. Catalog data release requested by the founder

    Hexarelin 5 mg     $62.50
    Oxytocin 10 mg     $107.50
    Retatrutide 60 mg  $249
    MOTS-C 40 mg       $129
    Glutathione 600 mg $69
    GRP-0422           $99, visible, Request Order, structured formulation hold

Preserve canonical reconciliation and provenance. If code deploy and
catalog-data mutation are separate operational steps, execute and log them
separately, each with rollback evidence.

## 4. Production GO — LEAD ONLY

The founder explicitly authorises moving the Early Access launch forward now.
Production is `c371201` and still runs the slow catalog path; the founder
personally observed ~30–60s catalog loading on a phone and calls it
unacceptable.

Freeze and deploy the **final integrated launch RC** containing the optimized
catalog source, cache/SWR/empty-read guard, unified storefront, manual order
intake, submit-time canonical eligibility, customer/admin emails, quantity,
affiliate code and mobile-critical fixes.

> Do not deploy an older partial SHA merely because `ec4aaf6` was previously
> named. Report the exact SHA before/as the deploy is cut, and verify the live
> deploy is that SHA.

Automated payment is **not** required for this GO. The founder handles
availability, payment instructions, payment follow-up, supplier and fulfilment
coordination by hand.

### Performance is P0, and is a launch gate

    warm catalog                 ideally <= 1s
    first useful catalog content roughly <= 2s
    cold catalog                 roughly <= 3s where upstream permits
    30+ seconds                  FAIL

Measure the catalog endpoint, remote query count, server response time, first
product card, first visible price, mobile first useful content. Do not hide a
30-second backend problem behind a spinner.

**Known blocker against this gate**, reported by `claude-fable-s3`:
`/research/early-access` does **not** use the bulk path. The 3,306→3 work
landed on `BulkCatalogPricingSource` (master-offerings v2). The EA door resolves
to `LiveProductControlReader.readCatalog()`
(`server/research/catalog/product-control-reader.ts:146`), which does one
`list()`, then **two** `repository.get()` per published product via
`readStableDetail`, then a second `list()` — 2 + (2 × 217) = **436+ round
trips**, no cache, no SWR. The existing read-amplification test passes because
it exercises the bulk source, not this reader. **This must be fixed before the
performance gate can pass.** It sits in `claude-fable-s7`'s lease.

## 5. Post-cutover smoke, and rollback

Light controlled smoke only; do not hammer production. Fresh mobile/browser
proof of `/research/early-access`: no password, catalog appears quickly, retail
prices, Featured, All Products, search, eligible RUO CTA, quantity, affiliate,
customer info, shipping, agreements, submit, reference. Then verify exactly one
durable request, one customer notification, one admin notification. Controlled
founder-approved test order only if the existing smoke mechanism requires it.
**Never fake payment or shipment.**

Roll back the runtime on catalog outage, wrong prices, wrong orderability, Care
boundary failure, submit failure, notification duplication or security
regression — preserving durable order records. Do not blindly revert catalog
data if that would corrupt newer durable state.

## 6. Stop nonessential work until live

Deprioritise analytics, payment automation, advanced fulfilment, affiliate
platform expansion, commission automation, coordination refactors, architecture
documentation and polish.

The objective: **customer sees products fast, customer places an order, founder
gets the order by email.**

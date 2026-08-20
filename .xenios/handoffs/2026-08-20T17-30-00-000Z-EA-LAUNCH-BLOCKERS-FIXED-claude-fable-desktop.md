# HANDOFF — EARLY ACCESS LAUNCH BLOCKERS FIXED (lead)

Session: `claude-fable-desktop` (Session 1, lead / sole release owner)
Branch: `xenios/launch-integration-20260819`
Worktree: `C:/xenios-wt/general-platform`
Production: `a66434d9` (Release A, LIVE), rollback `458e7284` (flags off first)
Date: 2026-08-20

## The headline

**Production could not complete an Early Access order today, for six independent
reasons.** Each failed in a way that looked like a legitimate answer — a null, a
denial, a 400, a "temporarily unavailable" — so nothing complained, and every
one of them is fixed on the integration branch and NOT in production.

Three came from the conversion-QA lane's report. Three more came from a
six-seam adversarial hunt run afterwards (10 confirmed, 7 refuted by independent
skeptics). Every fix was verified by removing it and watching the new test fail.

## Fixed, in the order a customer would hit them

1. **The gate rejected the correct code.** The durable repository issued grants
   under `RESEARCH_EARLY_ACCESS_OWNER_ID` while the unlock route fell back to
   `PRIVATE_ACCESS_DEFAULT_OWNER_ID`, because `register.ts` never set
   `deps.ownerId`. The exchange refuses an owner mismatch and the route maps
   that to the same generic denial as a wrong password. The only configuration
   that worked was setting the env var to the hard-coded default.
   → The route now takes the owner FROM the repository. `8dfa9be`

2. **The lockout keyed on the CDN, not the customer.** `trust proxy` was 1, but
   production responses carry BOTH Cloudflare and Render markers: the chain is
   two hops. At 1, `req.ip` was the Cloudflare egress address shared by every
   customer in that colo, and the unlock lockout keys on exactly that. Five
   mistyped passwords from any mix of customers locked the shared bucket for
   fifteen minutes, and every correct password after that was refused with the
   message a wrong one produces. On a launch day handing out one shared code,
   indistinguishable from "the code is wrong" — and a one-line denial of service
   for anyone who wanted it. → `trust proxy` is 2. `ba5a51f`

3. **Orders could not be priced at all.** `loadBindingIndex` keys
   `offeringId|offeringVariantId`; the assisted-order seam passed a bare variant
   id, so all 417 lookups missed. Lines projected `unbound:`, approved prices
   were suppressed to "Price pending", the action degraded to `request_pricing`,
   and submit answered HTTP 500. → Named, tested `bindingsByOfferingVariantId()`
   beside the loader. `28745ae`

4. **320 of 420 rows could not be ordered.** The submission-time catalog re-read
   asked for one enormous page, but the search clamps `pageSize` to 100 and then
   slices, so "everything" was the alphabetically first hundred. A measured walk
   over the real composed pieces: 130 of the 175 addable rows failed, Kisspeptin
   among them. **Both halves were individually green** — the clamp has its own
   passing test, and this seam's double ignored paging. → The re-read pages
   through; the double now clamps and slices like the real one. `4649fec`

5. **A price-on-request row killed the whole basket.** BAM15 500 mcg is listed
   on purpose, but the list side minted a synthetic `unbound:` identity that the
   submit side asked the binding map to translate back — and that map by
   definition has no entry for an unbound row. Worse, ANY unresolvable line threw
   an untyped error, so the customer's entire request died as "temporarily
   unavailable" after they had accepted every agreement, with nothing stored, no
   operator notified, and no indication which line was at fault. → Minting and
   reading share one constant; the refusal is a field-scoped 400 naming the
   line. `16d6579`

6. **Every real browser submission was refused 400** — the client parsed only
   `requiredAgreements` and ignored the `formAcknowledgments` the server
   enforces. Found and fixed by the wizard lane; the server's own E2E had passed
   because it spread a server-side constant instead of using the client parser.

Plus two that are not customer-visible but are worse if they fire:

7. **One rejected database call took the site down.** 31 routes dispatched
   handlers as bare fire-and-forget promises; an unhandled rejection exits Node.
   A blip during checkout was a site-wide outage. → Contained, with a structural
   test that walks every dispatch site. `e7b95db`

8. **The shared research password had no working throttle.** Every research
   limiter keyed on the leftmost `x-forwarded-for` value, which the caller
   supplies, so a fresh bucket per request meant no limit at all — in front of a
   comparison with no lockout of its own. `member/claim` is worse in kind: it
   consumes a one-time claim token and sets a new password, so an unthrottled
   grind is account takeover. → Keyed on `req.ip`. `cac0364`

## Also landed by the lead

- Quantity 100 per exact variant in the live order lane (the authority carried
  `null`, i.e. no ceiling at all). M66-successor cart-band candidate written;
  production is still at the ORIGINAL 1..3 band, M65 and M66 both PENDING.
- All 426 workbook rows reconciled against LIVE Product Control. 415 already
  matched; Kisspeptin 10 mg applied $70.00 → $65.00 and verified. Recorded the
  trap that GRP-0425/0426 are duplicate rows of GRP-0407/0402 whose canonical
  variants already carry the newer price — a naive per-row join would revert two
  live products.
- Both order emails carry items, variants, quantities, retail money, payment
  state, next action; verified attribution and a customer-typed code kept as
  separate facts, the typed one labelled unverified.
- Eight lane merges integrated across six lanes, all seam-clean.
- Landing-page commercialization REVERTED pending founder confirmation.
- Fulfillment mount HELD: its admin/supplier doors are declared under
  `/api/research/...`, inside the wall where admin doors must never live.

## Open for the founder

1. **Deploy needs an explicit word.** RC frozen, gates green, predecessor is a
   clean fast-forward, no migration. Not fired: `CLAUDE.md` requires current
   explicit approval for every production mutation, and smoking the fix requires
   entering the Early Access code in a browser, which the assistant must not do.
2. Landing-page CTA: confirm the reversal or restore it.
3. Four catalog rows with no canonical variant: Retatrutide 60 mg ($249),
   MOTS-C 40 mg ($129), Glutathione 600 mg ($69) need variants created; the
   CJC-1295 WITH DAC + Ipamorelin combo ($99) stays non-direct per the founder's
   own ruling. GRP-0364 "FedEx Standard Overnight" is a shipping charge.

## Still open, confirmed, not yet fixed

- Member commerce WRITES are walled while reads are admitted: a signed-in member
  can see their cart but cannot add, quote, or place an order
  (`server/research/index.ts:417`). Same shape as the Early Access cart outage,
  one lane over.
- Nine P2s from the hunt, including a Care/provider pathway not consulted on the
  v2 add-to-cart branch, and outbox status counts capped at 500 so a growing
  backlog reads as a plateau.

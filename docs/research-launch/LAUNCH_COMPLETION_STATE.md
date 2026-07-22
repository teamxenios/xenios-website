# Launch Completion State

An honest map of what is complete, what is code-complete-but-gated, and what
genuinely remains. The website is code-complete; the remaining work is external
activation and human governance, plus a few small data-wiring items owned by
specific lanes.

## Complete and verified (reversible engineering, done)

- Five lanes integrated (member platform, commerce, frontend, content,
  paperwork) on one branch, one merge conflict resolved.
- Member platform fully wired and live behind merged guards; every external
  capability defaults to a truthful disabled state.
- Commerce router wired: the catalog and goal READ paths are real and
  provenance-gated; every stateful surface fails closed with `commerce_disabled`.
  Proven by `server/research/commerce/production-deps.test.ts`: the 15 SKUs
  render, no unconfirmed fact is shown as fact (price is null, never zero),
  nothing is purchasable, and every write fails closed.
- Member-platform email templates merged into the single durable outbox dispatch.
- Signed supplier master intaken, hashed, reconciled (165 facts; legacy prices
  and strengths corrected with history preserved).
- 26 migrations manifested and validated (idempotent, RLS-on, zero policies).
- Provider readiness matrix, consolidated production approval packet.
- 1529 tests green, typecheck clean, build clean, boot smoke passes.

## Code-complete but externally gated (NOT a code defect)

- **Product commerce.** Cannot be enabled for any SKU until: the actual COAs and
  quality documents arrive (0 of 65 present today), a payment processor is
  approved, the production commerce repository layer is wired, per-SKU
  eligibility passes (0/15), and the flag is turned on. This is supplier
  delivery + business approval, not engineering.
- **Every external capability** (email, identity, media, Telegram, Infinity,
  billing, shipping, fulfillment, payouts): code, disabled state, test provider,
  adapter shell, env validation, flag, and activation steps are done; each needs
  its credential and, for some, a webhook and approval. See PROVIDER_READINESS.md.
- **Deploy, migrations, merge**: Samuel's single approval packet.

## Governance-gated (must NOT be bypassed)

- **Guide publication.** 26 Guide content drafts exist in
  `content/research-guides/`, but a Guide is member-visible only after the
  evidence domain's five-role separation-of-duties review (idea -> draft ->
  scientific/claims/quality/legal/founder review -> published). The member Guide
  Library correctly shows no published guides until that human review runs. This
  is a deliberate control; it is not code that can be "finished".

## Small data-wiring items owned by a lane (safe, do next)

- **Goal navigation is empty.** `catalog.listGoals()` returns nothing because the
  legacy catalog adapter (`server/research/catalog/legacy-adapter.ts`) carries no
  goal->product mappings. The content lane (PR #29) owns the goal->product data;
  wiring it into the adapter populates Shop-by-Goal. Products render fine without
  it. (Finding surfaced by the catalog proof test.)
- **Member Guide Library surfacing.** The catalog exposes `relatedGuideSlugs`,
  but the member Guide list is empty until either guides are published (see
  above) or the content lane maps its drafts to `in_development`/`coming_soon`
  summaries. Neither publishes anything.
- **Commerce production repositories.** The commerce HTTP surface is complete and
  tested; its stateful surfaces fail closed until real repositories backed by
  migrations 20-26 and the payment/shipping/payout adapters are built. This is
  the next commerce build step and should not start until commerce is cleared to
  transact (COAs + processor + approval).

## Bottom line

Nothing reversible and verifiable remains undone in the integration. The site
boots private, serves the member platform and a safe provenance-gated catalog,
and sells nothing. Going further into "live" requires COAs, credentials, human
Guide review, and Samuel's deploy approval, none of which can or should be
manufactured here.

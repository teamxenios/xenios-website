# FLEET STATE CORRECTION — CLAUDE LANES ARE NOW ACTIVE (2026-08-20T14:45Z)

From: claude-fable-desktop (Session 1, lead). **This supersedes the activity
finding in `.xenios/CLAUDE_CODEX_FLEET_OWNERSHIP_2026-08-20.md`.** Read this
before you write a line.

When the Codex ownership map was published at 14:00Z, no Claude lane had pushed
in 13.5 hours and all eight Codex lanes were scoped against dormant lanes. That
is no longer true. Between 14:11Z and 14:35Z **six Claude lanes woke up and
pushed real work**, and the lead has integrated all six.

## Integrated into `xenios/launch-integration-20260819` (typecheck clean)

| Lane branch | SHA | What landed |
|---|---|---|
| `fable/assisted-order-customer-flow-20260819` | `33af738` | **Two P0 defect fixes** (see below) + catalog-first wizard, durable draft, quantity clamping |
| `fable/canonical-order-history-20260819` | `cb601c7` | Canonical order domain, conversion seam, customer order history (unmounted) |
| `lane/s6-request-quote-payment-20260820` | `29d77ea` | Assisted-order payment lifecycle, quote→order conversion gating |
| `lane/fulfillment-tracking-min` | `4b8ed62` | Fulfillment + tracking engine, unpaid-release gate, customer status (unmounted) |
| `lane/affiliate-attribution-core` | `8c3fdc6` | Durable affiliate attribution binding + SQL candidates |
| `lane/launch-public-storefront` | `3c7dcc7` | Public storefront projection/routes (**one commit reverted**, see below) |

### The two P0 defects that were making the journey unusable

Found and fixed by the assisted-order flow lane — these are why a real browser
submission could not succeed:

1. **Form acknowledgments were never sent, so every real submission was refused
   400.** The server requires each `assisted_order_form_v1:<id>` pair at its
   exact copy hash; the client config parser read only `requiredAgreements` and
   ignored `formAcknowledgments` entirely. The server's own E2E passed only
   because it spread a server-side constant.
2. **The confirmation route was unreachable.** The wizard navigated a
   querystring form while the registered route is
   `.../order-request/confirmation/:publicReference`, so it fell through to the
   status route and 404'd.

Anyone testing the journey before `2472158` was testing a broken flow. Re-test
against the current integration head.

## Lead-owned work completed since the map was published

- **Quantity 100 is live in the order lane.** The authority row carried
  `maximumQuantity: null` (no maximum at all); it now carries 100 and M71 makes
  that durable per line with no migration. The cart lane deliberately holds at
  its durable band — production is still at the ORIGINAL 1..3, with M65 and M66
  both PENDING in the ledger.
- **All 426 catalog rows are reconciled against LIVE Product Control**, not the
  stale 2026-08-19 snapshot. 415 rows already matched. Kisspeptin 10 mg was the
  only pending price change and is applied ($70.00 → $65.00, superseded/active
  verified). See `docs/research-launch/RETAIL_RECONCILIATION_426_2026-08-20.md`.

## Codex role changes — EFFECTIVE IMMEDIATELY

- **CODEX 2 (retail catalog): WRITER → VALIDATOR.** The reconciliation is done.
  Do not regenerate a price release. Your value now is (a) independently verify
  the reconciliation, and (b) **the trap**: rows GRP-0425/GRP-0426 are duplicate
  workbook rows of GRP-0407/GRP-0402, whose canonical variants already carry the
  newer price at version 2. A naive per-Group-ID join marks them "wrong" and
  would revert Oxytocin 10 mg to $107.50 and Hexarelin 5 mg to $62.50 on live
  products. Prove that trap is not present anywhere in the tooling.
- **CODEX 3 and CODEX 5: confirmed QA.** Their lanes now have active Claude
  writers pushing. Do not write implementation. Your conformance and money-safety
  tests are more valuable than ever — run them against the integrated head.
- **CODEX 6: still WRITER, but the boundary is now live.** `lane/fulfillment-tracking-min`
  is actively writing `server/research/fulfillment/**` and `shared/research/fulfillment/**`.
  Those remain FORBIDDEN to you. Your lane is the operating queue over the LIVE
  EA dispatch surfaces only.
- **CODEX 1, 4, 7, 8: unchanged writers.** Gate, emails, E2E, and auditor lanes
  have no active Claude writer.

## Founder decision items raised (do not resolve these yourselves)

1. **Landing-page commercialization was REVERTED on the integration branch**
   (`e05f807`). The storefront lane isolated it deliberately and asked for this:
   it overturns `docs/research/RESEARCH_HOME_CATALOG_POLICY.md`, a recorded
   repeated nonnegotiable (no catalog CTA of any kind on `/research`), and it
   empties the Gateway guard's phrase denylist. It is also outside today's P0.
   The storefront itself stays merged and reachable by direct link; restoring the
   CTA is one revert once Samuel confirms.
2. **Four catalog rows have no canonical variant** and need founder catalog
   decisions, not price work: Retatrutide 60 mg ($249), MOTS-C 40 mg ($129),
   Glutathione 600 mg ($69), and the CJC-1295 WITH DAC + Ipamorelin combo ($99,
   formulation unconfirmed — founder already ruled it stays non-direct).
   GRP-0364 "FedEx Standard Overnight" is a shipping charge, not a product.

## Standing rules unchanged

One writer per path. Lead owns every seam, migration, env, flag, price, and
deploy. Checkpoint every coherent slice. Push early; the lead integrates
continuously and has now proven that loop end to end.

# RESEARCH_PLATFORM_0_2: general catalog prices go real

Date: 2026-08-15. Owner: Fable release train (single production writer seat).
Predecessor: RESEARCH_PLATFORM_0_1 (f9f181d), which mounted the six v2 read
doors dark with zero commerce authority and every row on "Price on request".
This release completes God-mode Phase 0: the pricing DATA half plus the
reviewed binding store, so the general catalog shows real base prices to
authorized viewers with no route change.

## What changed, in one paragraph

Production Product Control now carries the complete general catalog: 217
products, 417 approved active variants, 417 approved member USD price rows,
initialized from the founder's master workbook (sha256 1be4f6720675...) with
`Suggested Sell Price` as the single-item base-price authority, per exact
listed unit. A reviewed committed binding artifact joins each of the 417
member-visible offering variants to its exact Product Control identity, the
composition root resolves a real member pricing identity per request, and the
price a viewer sees is one approved in-window Product Control row resolved by
the same authoritative resolver the member catalog uses. Purchase stays off on
this surface, and the Kris / Roman Health lane is untouched.

## The closed accounting (420 rows, unknown = 0)

- 417 rows became Product Control units with approved member prices.
- 2 rows are price pending and were NOT initialized, so they truthfully render
  "Price on request": GRP-0364 and GRP-0365 (BAM15 500 mcg; Syringes and
  Alcohol Swabs).
- 1 row is the shipping service row (GRP-0244, FedEx), modeled as a
  fulfillment fee rather than a purchasable product; no unit exists.
- The bindings build enforces this accounting in BOTH directions and refuses
  to emit on any deviation, including a production unit no catalog row claims.

## Production data initialization (already live in Supabase)

- Written 2026-08-15 through the governed SECURITY DEFINER admin RPCs only
  (create product, create variant, staged draft to in_review to approved to
  active, create price, approve price, publish), in 11 idempotent guarded
  plpgsql chunks; every chunk atomic; SELECT-guard idempotency throughout.
- Count verification after the final chunk, straight from production:
  products 217 (all published, active, public), variants 417 of 417 approved
  and active, approved member prices 417 on 417 distinct variants, zero stray
  draft price rows, Early Access untouched at 19 products.
- Spot checks: GEN-GRP-0354 4200 cents, GEN-GRP-0420 75000 cents,
  GEN-GRP-0362 3750 cents, all matching the planner.
- Planner: `scripts/research/initialize-general-product-control.ts` (committed
  in this release; the executed chunks were its `--emit-mcp-chunks` output).

## The reviewed binding store

- Generator: `scripts/research/build-master-offering-bindings.ts`. Joins the
  committed member-safe dataset (offering identity) to the production
  read-back (Product Control identity) through the workbook Group ID, which
  the initializer wrote as the variant sku (GEN-GRP-NNNN) for exactly this
  purpose. Alignment between dataset and intake is proven per row (family,
  specification, product name) plus a workbook sha equality check before any
  index is trusted. Banned-key and confidential-value scans run before a byte
  is written; repo output requires XENIOS_ALLOW_REVIEWED_CATALOG_OUTPUT=true.
- Artifact: `server/research/master-offerings/data/master-offering-bindings.generated.json`,
  417 bindings plus the 3 named exclusions, identity only (no amount, no
  audience, no purchase authority; the invariants block declares it).
- Reader: `server/research/master-offerings/production-bindings.ts`. Loads the
  committed artifact once per process (env override XENIOS_MASTER_OFFERING_BINDINGS
  wins, then the committed path with a bounded parent walk, mirroring the
  dataset reader). Fails closed whole: a missing, malformed, or duplicate
  carrying artifact loads as ZERO bindings, every row renders "Price on
  request", and the catalog stays up.

## The composition root wiring (server/index.ts, no route change)

- `bindings`: the production binding reader replaces the null reader.
- `identityFor`: the viewer object now carries a pricing grant derived from
  the SAME member row the silent guard authenticated
  (memberAudienceSourceVersion), and identityFor turns it into the
  server-authorized member audience with one evaluatedAt instant per request.
  No grant, no identity, no price. Nothing a browser sends can influence it.
- `selections`: the throwing seam became a truthful inert not-ok
  (product_commerce_unapproved), so a price view can never become a cart
  selection on this surface and a page of cards pays no exception churn.
- Serving posture unchanged: dark until RESEARCH_MASTER_OFFERINGS_ENABLED is
  exactly "true", then founder/admin scoped until the all-members decision.

## Gates at the release SHA

- tsc clean.
- Full vitest battery: 633 files passed, 4 skipped; 9472 tests passed,
  0 failed, 43 skipped (includes the census at 366 call sites / 375 routes
  unchanged, core-site protection with the recomputed server/index.ts seam
  baseline, source auditability, and the new
  `production-bindings.test.ts` closed-accounting suite).
- Kris / Roman Health surfaces: byte-untouched in this release; the Kris
  regression suites are inside the green battery.

## Deploy record (verified 2026-08-15)

- Branch: release/early-access-code-session-checkout.
- Release SHA: 2badac00710641dbf7478a2c81bd4c7bac51c8c1
  (tag RESEARCH_PLATFORM_0_2). Rollback: 8a33125 (ROMAN_RELEASE_0_6).
- Render deploy: dep-da022ic9v7es738dfcig on srv-d8s9vej7uimc7384dfcg,
  trigger api, status live at 2026-08-15T08:21:16Z; the deploy object's
  commit id equals the release SHA exactly.
- Production smoke at the live origin: anonymous tier 7 PASS, 0 FAIL
  (signed-in tier requires a real member session cookie and did not run,
  reported UNVERIFIED by the harness, never assumed). The v2 catalog door
  probed anonymously answered 401 {"ok":false,"code":"master_offerings_auth_required"}
  with no data in the body; /api/health answered 200.
- Founder-visible price verification requires the founder's own signed-in
  session (this train never handles credentials). The server-side path is
  proven by the committed-artifact closed-accounting suite, the composition
  tests, and the production price rows verified by count and spot checks.

## Founder actions (standing)

- F6 (Q100 quantity lane): decision packet outstanding; the dark lane
  fable/q100-dark (17cfb6c) holds M69 registered with fresh PG16/17 evidence.
- Supplier confirmations for the Early Access opening set expire
  2026-09-03T23:30Z (non-waivable launch gate; no code checks it).
- BAM15 500 mcg and Syringes and Alcohol Swabs need founder base prices; when
  set, run the initializer for those rows, regenerate the bindings artifact
  (the build will refuse until the exclusion list shrinks in the same
  reviewed change), and their prices appear with no other change.
- Turning the surface on for all members is a founder scope decision
  (RESEARCH_FULL_CATALOG_MEMBERS / the all-members flag), separate from this
  release.

## RESEARCH_PLATFORM_0_3 (same day): the truthful price basis

Tag RESEARCH_PLATFORM_0_3 = cfc83f4 (rollback 2badac0). Deploy
dep-da02g2gu01pc738aro40, commit verified in the deploy object, live at
2026-08-15T08:50:07Z. Anonymous smoke 7 PASS 0 FAIL after deploy; the v2
door still refuses anonymously with master_offerings_auth_required.

The workbook truthfulness audit (all 420 rows, run locally over the private
intake, never projected): zero prices below cost, zero sell prices that are
pack totals or tier prices, so the per-exact-listed-unit authority holds
uniformly. The priced view now carries `basis: "exact_listed_unit"`, the
detail page and price-list export state the basis sentence, and
docs/research/CATALOG_INGESTION_CONTRACT.md records the decision that
supplier MOQ and quote basis are procurement data, never member-facing and
never turned into an invented customer minimum. Battery 9472 passed, 0
failed at the release SHA.

## RESEARCH_PLATFORM_0_4: the Access Hub and the general member catalog rollout

Founder direction (2026-08-15 General Platform Foundation package, verified
sha-by-sha, 24 files): make the general platform the priority, mount the
account/organization pages, add the Access Hub, and release the full master
catalog to ordinary approved members.

What shipped in 0_4:
- The public Access Hub (/research/access-hub) and Supplier Access
  (/research/supplier-access) pages, linked from the Gateway by one reviewed
  text link (allowlisted in the Gateway catalog-guard with the policy doc
  updated; the hub is a role chooser, not a catalog CTA).
- "Full catalog" joined the member navigation, pointing at the canonical
  master catalog (/research/member/catalog).
- The founder-authorized scope flip to all approved members rode the same
  deploy: RESEARCH_MASTER_OFFERINGS_FOUNDER_ADMIN_ONLY=false.

What did NOT ship, and why (FOUNDER ACTION F7): the account and organization
page family stayed unmounted. The Pack 02 account API is mounted server-side,
but production holds only ONE of the eight Pack 02 tables
(research_organizations; missing: organization_users, organization_invitations,
account_claim_challenges, customer_account_bindings,
organization_order_ownership, account_binding_events,
organization_request_again), so the account context read itself fails against
the live database and mounting the UI would ship a broken front door. The
complete, tested mounting (including role-neutral login to the account home
selector) is parked on branch fable/pack02-account-mount. F7: authorize the
Pack 02 schema to land through the governed migration chain (registration,
PG16/17 certification, apply); the parked branch then merges and organization
login goes live with no further design work. The Access Hub's organization and
supplier cards state the honest interim (contact business support) until then.

0_4 deploy record: tag RESEARCH_PLATFORM_0_4 = b0fe396 (rollback cfc83f4).
The founder-authorized scope flip (RESEARCH_MASTER_OFFERINGS_FOUNDER_ADMIN_ONLY=false)
rode the env write, which deployed branch HEAD = exactly the release SHA:
dep-da07gcdbedkc73a3mka0, live 2026-08-15T14:32:06Z, commit verified in the
deploy object. Post-deploy: anonymous smoke 7 PASS 0 FAIL, the v2 catalog
door still refuses anonymous requests (all-members scope means approved
member sessions, never the public), /research/access-hub serves, health 200.
Every approved member now sees the 417-priced master catalog from the member
navigation.

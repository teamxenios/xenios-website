# KRIS_LAUNCH_A release evidence

The single release record for the Roman Health Early Access launch
(claude/kris-commerce-release). The frozen release is
`322a1636063a6a95f66ea11e15664651a94d5ac3`, tagged `KRIS_LAUNCH_A` (annotated
tag dereferences to exactly that commit), deployed live as Render deploy
`dep-d9v89npt0dsc73cgvo8g` on 2026-08-14T03:01Z with the deployed commit
verified equal to the frozen SHA through the Render API. Assembled by the
release integrators on 2026-08-13 evening; this file's post-freeze revision
records the gate and smoke results and changes no runtime behaviour.

## Deployment target (verified live via the Render API, read-only)

- Service: xenios-website, `srv-d8s9vej7uimc7384dfcg`, https://xenios-website.onrender.com
- Tracked branch: `release/early-access-code-session-checkout` (tip == live SHA before this release)
- autoDeploy: OFF; deploys are API-triggered
- ROLLBACK SHA (live before this release): `541b1049e3bee188ee2719f369e6513ae7123786`
- The rollback SHA is an ancestor of this release line; the release push is a fast-forward.
- Rollback procedure: push `541b1049e3bee188ee2719f369e6513ae7123786` back to
  `release/early-access-code-session-checkout` (force-with-lease from the tag) and trigger a
  deploy; no env change is needed because this release changes no env value.

## Production environment (read before deploy; agreement trap from the brief)

- `RESEARCH_EARLY_ACCESS_REQUIRED_AGREEMENTS` was ALREADY SET in production and byte-equal to
  the required launch value `[{"kind":"early_access_terms","version":"v1"}]`. No env write was
  performed for it (inspect-then-verify, never guess; the parser fail-closes on malformed).
- No other env change is required by this release: the Kris artifact ships in-repo
  (`XENIOS_KRIS_LAUNCH_A_DATASET` optional override), and the Buy Now bindings default to the
  reviewed in-repo file (`XENIOS_KRIS_LEGACY_BINDINGS` optional post-freeze override).

## What this release contains (since 67a99b0, the prior release head)

1. BUY NOW (Strike 2): the Kris catalog offers Buy Now only for rows carrying a reviewed
   identity binding (`server/research/kris-launch-a/data/kris-legacy-bindings.json`, identity
   only, no prices) whose economics the legacy order door's OWN catalog projection, founder
   release ledger, and M62 binding directory agree on at request time. Fail-closed at every
   disagreement; the door revalidates everything again at placement. Client: BUY NOW renders
   only for `direct_eligible` rows with a server-attached selection; provider_workflow /
   classification_pending / price_pending rows render their non-purchase CTAs. The stale
   browse-only tests were REWRITTEN (not deleted) to pin exactly that.
2. ORDER OWNERSHIP (Strike 3): M67, two read-only security-definer routines
   (`research_early_access_legal_bindings_for_member`, `research_early_access_placements_for_customers`),
   EXECUTE for service_role alone, no table grant anywhere; the application merges legacy
   orders into the ONE member orders service and re-checks ownership in code. The competing
   26fa012 bridge was merged then REVERTED in favor of this lane (09c4517); the separately
   pushed claude/strike3-order-ownership packaging (f417df2) is superseded by the in-tree
   composition and was not merged.
3. ACCOUNT (Strike 1): the pack02 sponsored B2B buyer claim + safe Roman B2B buyer bridge +
   pricing authority (14-commit chain through b1e9f8b) and the canonical account identity
   mount (fa99af0): nine method-and-path-exact account-identity routes, Bearer resolved via
   Supabase Auth downstream. The founder-facts lane (7540e60) was merged additively but is
   NOT mounted and its SQL candidate is NOT part of the apply set.
4. Post-deploy smoke `scripts/acceptance/smoke-kris-launch-a.mjs` (read-only, GET-only,
   fails when it cannot tell; 8 anonymous + 7 session checks; asserts 420/418/2 and
   143/243/32/2 exactly) and the core-site protection clear (four lane artifacts relocated;
   manifest and negative controls untouched by that commit).
5. Integrator commits: f446237 (activation-input expectation carries businessLegalName),
   0369973 (M67 DAG node 28 + ledger row 67 + rehearsal harness fixes).

## Explicitly excluded (and why)

- 499d77c sibling catalog (supersession preserved; absence verified by ancestry check).
- 334bf21, 4d96331, 91367ec, 2bb787e: cart-settlement-lane changes; the cart is disabled in
  production and Launch A uses the legacy single-order path (fast follow).
- 142789c isolated P0 app composition (would double-compose the catalog contract).
- 01790fe fresh-clone gate (edits package.json/script/build.mjs, which the core-site
  protection gate correctly refuses in a launch freeze; land via the sanctioned seam process).
- 2f25681 inventory hold sweeper, 8d466a0 Launch B red-team captures (not Launch A).
- 26fa012/a70197f order-history lane (superseded by M67; reverted in-tree).
- supabase/pack02-candidates/20260812_research_account_organizations.sql and
  20260812_roman_digital_existing_auth_binding.sql: touch the structurally different
  production research_organizations. NEVER APPLY.
- 20260813_research_buyer_account_activation.sql (superseded) and
  20260813_research_business_buyer_bridge.sql (competing unmounted lane). Do not apply.

## M67 rehearsal (run by the integrator, 2026-08-13)

`scripts/verify-m67-member-order-history.sh` PASS on disposable PostgreSQL 16 and 17:
preflight fails closed on a bare database leaving nothing behind; applied twice at psql
exit 0; 12/12 behavioural assertions after each pass over a deliberately two-member fixture
(every positive answer is also a does-not-return-the-other-member answer); no relation
created, no row written; a sabotaged service_role table SELECT aborts the re-apply on its own
post-condition; a stray anon EXECUTE grant is healed by re-apply with the healed state
proven. Production was not connected to or mutated. Two harness defects were fixed to get an
honest verdict (assertions 9-11 parse bug; heal-vs-abort expectation), recorded in 0369973.

## Production apply set (FOUNDER-RUN; no DB credential exists on the build machine)

In the Supabase SQL editor, in this order, after the read-only preflight:

0. `supabase/pack02-candidates/inspect_kris_identity_read_only.sql` - MUST still report
   NO_AUTHORITATIVE_KRIS_IDENTITY for info@romanhealthcollective.com; any evidence = STOP.
1. `supabase/pack02-candidates/20260813_research_b2b_buyer_bridge.sql`
2. `supabase/pack02-candidates/20260813_research_b2b_sponsored_claim.sql`
3. `supabase/migrations/20260813120000_research_early_access_member_order_history.sql` (M67)
4. The verify scripts beside them (read-only), then record the managed-migration ids in
   supabase/MIGRATIONS.md (rows for the two pack02 candidates; row 67 for M67).
5. Claim preparation per docs/pack02-roman-b2b-sponsored-claim-runbook.md with
   `supabase/pack02-candidates/roman_health_b2b_activation_input.json` (no password material;
   Kristopher chooses his own password through the canonical claim screen; activation after
   his claim via research_activate_sponsored_b2b_buyer, expiry-checked, single transaction).

Until step 3 lands, member order-history reads refuse (503 fail-closed); until step 5
completes and a reviewed Buy Now binding row exists, no Buy Now renders. Both are the
designed fail-closed states, not defects.

## Reviewed Buy Now bindings (founder-reviewed data, frozen with this release)

`server/research/kris-launch-a/data/kris-legacy-bindings.json` carries 21 reviewed
associations, every one a `ruo_research` (direct-eligible) Kris row bound to a production
Product Control product/variant UUID pair. Validated at freeze: all 21 krisIds exist in the
420-item artifact, no duplicate on either side, loader accepts the file. The bindings are
IDENTITY ONLY. Whether any row actually renders BUY NOW is decided per request by the order
door's own catalog projection, founder release ledger and M62 binding directory: the unit
must be released, the ledger price must equal the KRIS_VOLUME_PARTNER price exactly, and the
member must hold a bound Early Access customer. Any disagreement hides the control; the door
revalidates everything again at placement. `XENIOS_KRIS_LEGACY_BINDINGS` remains the
post-freeze channel for founder-approved additions without a code change.

## Gate results at the frozen commit (run by the release owner, 2026-08-13 late evening)

- TypeScript: `npx tsc` clean (exit 0), and `npm run check:release-control-plane` clean.
- Full suite: 605 files passed (4 skipped), 9225 tests passed (43 skipped), 0 failures,
  run against the frozen tree. (An earlier run recorded 2 failures caused by commits
  landing mid-run; the quiescent rerun is clean.)
- Focused release surfaces at this tree: kris-launch-a server 149 tests / 10 files (incl.
  10 new legacy-order-production tests), client research suites 794 tests / 61 files
  (Buy Now, rewritten access-presentation, checkout journey, proof upload), core-site
  protection 32/32 (seam baselines updated with reviewed diff notes, negative controls
  intact), release control plane 35 passed 1 skipped (M67 + 359/368 census pins).
- Route uniqueness: 368 static registrations / 359 call sites / 0 duplicates (measured).
- Migration DAG: 28 nodes accepted, canonical checksums verified; managed-migrations delta
  since 67a99b0 is exactly M67; MIGRATIONS.md ledger row 67 present.
- Production build: PASS (client 24.9s, server bundle dist/index.cjs 1.3mb).
- Buy Now bindings: 21 records validated (loader-accepted, all present in the 420 artifact,
  all ruo_research, no duplicate on either side).
- Ancestry: 541b1049 (live production) is an ancestor of this commit (fast-forward deploy);
  499d77c is absent; no masterOfferingCatalog mount; working tree clean at freeze.

## Post-deploy smoke (production origin, 2026-08-14T03:0xZ, read-only)

`node scripts/acceptance/smoke-kris-launch-a.mjs --origin https://xenios-website.onrender.com`
against the live deploy of the frozen SHA: **PASS 7, FAIL 0, UNVERIFIED 8** of 15 declared
(all 15 recorded). Anonymous tier fully green: health up; SPA catch-all probe; the Kris
catalog list and detail both refused anonymously (the list by the wall's bearer-only
admission, the detail by the door) with zero price/data leakage on the raw bytes; the
pre-existing cart grants nothing anonymously (SESSION_REQUIRED; two check expectations were
corrected post-freeze to state exactly what this deployment proves, see the script's
comments). The 8 UNVERIFIED: deployed-commit equality was established OUT OF BAND through
the Render API (deploy dep-d9v89npt0dsc73cgvo8g, commit == frozen SHA, status live), and the
7 signed-in-tier checks (420/418/2 counts, KRIS_VOLUME_PARTNER profile, 143/243/32/2 matrix,
Buy Now implication, private-field scan, agreement config) require Kristopher's claimed
session, which cannot exist until the founder-run database apply set and claim complete.
Re-run the smoke with SMOKE_SESSION_COOKIE after the claim to close them.

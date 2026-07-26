# Website 6 release evidence

## Base and scope

- Initial base: `a486b889503a8f9d42f86c4666e808af6c5e852c`
- Coordinated release base: `48cb57250c1ec54fe8714e59fa1071a9eb27f867`
- Branch: `test/website-6-final-qa`
- Changes: QA automation and evidence plus two focused shared-shell fixes for
  dark-surface ghost-button contrast and 320px overflow.

## Passing gates

- Repository tests: 132 files, 3,077 tests.
- Rebased production-main focused tests: 7 files, 104 tests.
- TypeScript: `npm run check`.
- Production build: `npm run build`.
- Bundle budgets: 209,055-byte initial JS gzip; 17,536-byte largest route gzip;
  36,512-byte largest referenced image.
- Leak scan: 1,045 tracked files and 101 built client artifacts.
- UI consistency: current palette/font/gradient/shadow/radius/button footprint
  frozen; no prohibited UI framework or unauthorized external font import.
- Migrations: 35-file disposable PostgreSQL 16 apply passed; 93/93 Research
  tables RLS-enabled; zero policies; no anon/authenticated table grants.
- Browser: 94 tests passed in the full responsive/accessibility/state matrix;
  the sole assertion-only failure was corrected and its targeted rerun passed.
- Automated WCAG: no serious/critical findings on six representative public
  routes after disabling presentation animations for deterministic analysis.
- Visual evidence: desktop, 375px, populated, empty, form, and unavailable/auth
  states captured and manually reviewed.

## Active release gates

- Website 4 candidate `6dba785b649a8b729d74d2691ac7d46b2a64e4f6`
  resolves all 16 partner adapter registrations. The generated inventory reports
  zero missing adapter routes, and 49/49 focused adapter/route tests pass.
- PR #47 exact frozen head `877ebfff75452f47b3b185e9879a0dcf156e0ef7`
  passes Website 6's domain-candidate QA. Production integration remains gated
  on Website 2-owned persistence, migrations, private providers/storage,
  shared registration, and authenticated smoke.
- PR #46 still requires its next coordinated frozen-head verification.
- PR #48 remains draft and requires production wiring and persona smoke tests.

## Release Train 0 — Assessment

- PR #52 exact approved head
  `534e8ab6895f67fba1b3cb83ca7ad4017d09036a` merged as
  `9dad933d37cbd84430487c77f6ea421e7ff2cf75`; coordinator wiring PR #54
  produced production main `68ee5d612df7d0452091ff0dfd2062d433943066`.
- Render deployment `dep-d9ilv150kf9s73bmj44g` is Live at `68ee5d6`.
- Migration `release_train_0_research_assessment_v2` is applied and verified
  with no live row-count changes.
- Candidate verification passed: 339/339 focused Assessment/Blueprint/legal/auth
  tests; 28/28 disposable PostgreSQL 16 checks; production build and leak scan;
  desktop, 320, 375, 430, and tablet disabled-state browser checks with WCAG
  A/AA, contrast, focus, touch targets, no overflow, and no sensitive browser
  state.
- Live read-only evidence: `/api/health` 200; signed-out Assessment and
  Blueprint review APIs return 401; desktop/375/320 have no overflow; focus is
  visible; no new serious Render errors.
- Assessment truthfully fails closed pending approved XR-MEM-012.
- Authenticated member/admin persistence smoke remains **pending, not failed**
  because no authorized production session was available; no identity or record
  was fabricated.
- Production status: **PARTIALLY LIVE**.

## Release Train 1 — Website 3 frozen candidate

- PR #47 exact candidate:
  `877ebfff75452f47b3b185e9879a0dcf156e0ef7`.
- Focused product/diagnostics routes and UI: 12 files, 76/76 tests passed.
- Route contract: 14/14 exported member/admin routes are present behind the
  injected active-member/admin guards; zero new Website 3 adapter mismatches.
  The 16 unrelated partner mismatches on the candidate's older base are already
  resolved by Website 4 candidate `6dba785b649a8b729d74d2691ac7d46b2a64e4f6`.
- UI matrix: 20/20 populated, error, unavailable, keyboard, overflow, touch
  target, browser-state privacy, and WCAG A/AA checks passed across desktop,
  320, 375, 430, and tablet. A separate 720-CSS-pixel reflow check representing
  200% zoom on a 1440px layout also passed.
- Production build, 1,084-file/101-artifact leak scan, and Xenios UI consistency
  budgets passed.
- PR #47 correctly contains no production migration or shared application
  registration. Website 2 must supply and verify the reviewed canonical
  migrations, Supabase repositories/RLS, private Storage providers, capability
  and route wiring, and authenticated production persistence smoke.
- Candidate QA verdict: **PASS; PRODUCTION INTEGRATION GATE CLOSED**.

## Release Train 1 - integrated candidate and production

- PR #53 exact candidate:
  `81d9a837a2ddfc13d708c7176e5464c388efa881`.
- Production merge/deployed SHA:
  `2cccbc0f7242172512ffa92f2137dd10c2b0294c`.
- Render deployment `dep-d9imnjhoagis7389s5dg` is `live` at the exact merge
  SHA. GitHub test, typecheck, and build checks pass.
- Integration-only tests: 7 files, 94/94 passed, covering Products/Diagnostics
  adapters and route registration, active-member/admin authorization,
  production repositories, admin save/remount persistence, Blueprint biomarker
  isolation, and outbox behavior. PR #47's already-green domain evidence was
  not rerun.
- Read-only route inventory: 436 records. Train 1 contributes zero
  adapter/server mismatches. The gate remains intentionally red only for the
  16 Website 4 partner endpoints absent from this Train 1 integration.
- The route scanner now recognizes `requireResearchSubject` on
  `/api/research/member/me`, removing a static-heuristic false positive without
  allowlisting the route.
- Disposable PostgreSQL 16 applied the canonical 35-file dependency sequence,
  then applied `research-products-diagnostics.sql` twice. Verification returned
  8/8 expected tables with forced RLS, zero browser table grants, zero browser
  grants to the security-definer biomarker-confirmation RPC, 4 supplement rows,
  3 metabolic pathway rows, and 1 disabled Superpower row.
- Production build passed with the existing large-chunk warning. Leak scan
  passed for 1,093 tracked files and 107 client artifacts.
- UI-system budgets passed: raw colors 91/91, gradients 14/14, shadows 2/2,
  font declarations 43/43, large radii 6/6, button selectors 23/27, no
  prohibited UI framework, and no unauthorized external font import.
- Candidate and live production-bundle browser checks covered
  `/research/member/products`, `/research/member/diagnostics`,
  `/research/member/supplements`, `/research/member/metabolic-care`, and
  `/admin/research/product-configuration`.
- At 1440, 375, 320, and 720-CSS-pixel reflow, tested routes had no page-level
  overflow. Inputs were labeled, headings were present, the access/password
  focus state visibly switched to the Xenios purple border, signed-out and
  unconfigured states were truthful, no Demo/Sample/Prototype wording appeared,
  and no browser warning/error was captured.
- Non-mutating production smoke passed 7/7. The member session probe and seven
  Train 1 APIs reject signed-out requests with 401.
- Production Supabase verification: 8/8 expected tables exist with forced RLS;
  browser table/RPC grants are zero; `research-coa-production` and
  `research-biomarker-reports-production` are private; operational member
  records for this train remain zero; the Superpower affiliate is not active.
- Recent post-deploy Supabase API logs show successful 200 responses. Website 3
  is responsible for the authenticated member/admin persistence smoke with
  authorized sessions.
- Low shared-shell follow-up: the existing Research access gate has no `<main>`
  landmark. It retains an H1 and labeled form, exposes no protected content, and
  is not a Train 1 regression.
- Production verdict: **LIVE; INDEPENDENT READ-ONLY QA PASS**.

## Queued future exact targets

- Website 4 Release Train 3A checkpoint
  `d162f1eafe249be57e9d23c87c65d99f1efdbc89` will not be rerun until Website 2
  publishes its integrated 3A SHA.
- The canonical internal pre-launch gate, seed-origin separation,
  required-input model, readiness validators, and launch switches remain
  Website 2-owned follow-on scope. Website 6 will test them only at a frozen
  integrated SHA.

## Pre-release live baseline

- `https://xeniostechnology.com` loaded on desktop with a canonical URL, semantic
  main content, and no captured browser console errors.
- At a live 320px viewport, document content measured 431px wide. The local QA
  branch fixes and tests this exact defect.
- Read-only production smoke passed health, homepage, sitemap, Research noindex,
  private member rejection, and JSON 404 behavior.
- The initial live `robots.txt` lacked `Sitemap:`. After production `main`
  advanced, the full read-only synthetic set passed, including `robots.txt`.

## Post-deploy acceptance owned with Website 2

1. Confirm Render deployment ID and deployed Git SHA.
2. Confirm `/api/health`, homepage, `robots.txt`, and `sitemap.xml`.
3. Recheck 320px and 375px layout and the dark CTA contrast.
4. Run affected public and authenticated persona flows.
5. Verify persistence without fabricating or rewriting production records.
6. Inspect Render and Supabase logs for serious new errors.
7. Post the final smoke result to Command Center #44.

PRODUCTION STATUS:

NOT YET MERGED

UI CONSISTENCY STATUS:

NEEDS REVISION

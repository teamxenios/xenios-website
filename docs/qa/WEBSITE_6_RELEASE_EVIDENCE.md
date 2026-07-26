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
- PR #46 and PR #47 require Website 2-approved Xenios visual revisions and new
  frozen heads before Website 6 cross-PR visual verification.
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

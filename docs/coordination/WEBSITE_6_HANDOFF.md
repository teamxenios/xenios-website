# Website 6 handoff - final QA, accessibility, and test automation

1. **Session:** Website 6 - Final QA, Accessibility & Test Automation
2. **Feature domain:** Cross-cutting release QA, accessibility, responsive behavior,
   test automation, migration verification, security/leak gates, performance, SEO,
   monitoring, production smoke, and UI consistency.
3. **Starting branch:** `test/website-6-final-qa`
4. **Starting SHA:** `a486b889503a8f9d42f86c4666e808af6c5e852c`
5. **Release base:** production `main` advanced to
   `68ee5d612df7d0452091ff0dfd2062d433943066` after Release Train 0.
6. **Final branch:** `test/website-6-final-qa`
7. **Current head SHA:** `eff0030cd0c1abe6ce05de1ba6944bf3af8b5286`.
8. **PR URL:** https://github.com/teamxenios/xenios-website/pull/51
9. **Merge SHA:** pending Website 2.
10. **Migration applied:** Website 6 adds no production migration. The exact
    35-file production sequence passes in disposable PostgreSQL 16 after rebasing
    onto the merged Website 2 fix.
11. **Render deployment ID:** pending Website 2.
12. **Deployed SHA:** pending Website 2.
13. **Live routes:** current production desktop shell and `/api/health` respond;
    the Website 6 fixes are not live until Website 2 merges and Render deploys.
14. **Production database result:** production ledger is on `main`; disposable
    verification reports 93/93 Research tables with RLS, zero policies, and no
    anon/authenticated table grants. No production mutation was performed here.
15. **Production smoke result:** baseline read-only smoke passed health, homepage,
    `robots.txt`, sitemap, Research noindex, unauthenticated member boundary, and
    JSON API 404 on 2026-07-25 after production `main` advanced.
16. **Mobile result:** local 320/375/430/tablet/desktop matrix passes after fixing
    the global hidden-button cascade and TopRibbon shrink behavior. Current live
    production reproduced 431px content at a 320px viewport before this release.
17. **Accessibility result:** serious/critical axe scans pass on `/`, `/product`,
    `/waitlist`, `/contact`, `/privacy`, and `/careers`; keyboard focus, labels,
    invalid state, target spacing, reduced motion, and horizontal overflow are
    covered.
18. **Authorization result:** existing server authorization suites pass; browser
    expired-session/concurrent-tab recovery passes; route inventory keeps server
    guards authoritative.
19. **Logs result:** live browser inspection found no console errors. Render and
    Supabase post-deploy log review remains Website 2 coordinated.
20. **Exact blockers:** the Website 4 16-endpoint mismatch is closed at exact
    candidate `6dba785b649a8b729d74d2691ac7d46b2a64e4f6`; generated inventory reports
    zero missing adapter routes and 49/49 focused tests pass. Release Train 1
    final-candidate verification and authenticated production persona/persistence
    smoke remain pending.
21. **Validation:** 132 files / 3,077 tests passed before the coordinated rebase;
    104 tests covering the rebased production-main changes passed afterward;
    typecheck, build, built-asset budgets, source/bundle leak scan, UI consistency
    budget, and disposable migration gate pass. Browser evidence is 94 unchanged
    passing tests plus the corrected auth-return test passing independently.
22. **Evidence:** `docs/qa/`, generated 412-record route inventory, five reviewed
    UI screenshots, Playwright reports, and Command Center #44 comments.
23. **Rollback:** revert the focused Website 6 commit(s). No production data,
    capability, provider, migration, or environment value was changed.

## Complete-the-unfinished-build reconciliation

- **Checkpoint SHA before reconciliation:** `230e4c94fdcec8dc73c8bde62b7a0e2888cf3613`
- **Remaining-scope source of truth:**
  `docs/coordination/WEBSITE_6_REMAINING_SCOPE.md`
- **Newly completed scope:** formal requirement-by-requirement classification
  with exact owner, branch, files, acceptance test, release train, and production
  outcome.
- **Changed reconciliation files:**
  `docs/coordination/WEBSITE_6_REMAINING_SCOPE.md` and this handoff.
- **Migrations:** none added; Website 6 continues to verify candidate migration
  order, RLS, grants, policies, constraints, and production read-only invariants.
- **Routes:** no domain route was added. The 16 partner endpoint mismatch is
  resolved at Website 4 candidate `6dba785b649a8b729d74d2691ac7d46b2a64e4f6`.
  QA commit `eff0030` also classifies the operations adapter's two composed base
  constants as prefixes rather than callable endpoints.
- **Remaining QA scope:** full persona/auth journeys, integrated uploads and
  private Storage, offline/retry, 200% zoom, broader state coverage, notification
  replay/concurrency, API p95 measurement, full SEO semantics, new-train
  migration/RLS checks, trust-layer verification, integrated screenshots, and
  per-train live verification.
- **Shared wiring:** Website 2 registers/integrates domain modules; Website 6
  reviews the frozen result and adds narrow regression coverage.
- **Next exact action:** verify the Release Train 1 frozen head, then re-run the
  integrated route, migration, responsive, accessibility, and no-leak gates
  without implementing domain business logic.

## Release Train 0 production evidence

- Approved PR #52 head:
  `534e8ab6895f67fba1b3cb83ca7ad4017d09036a`.
- Domain merge: `9dad933d37cbd84430487c77f6ea421e7ff2cf75`.
- Coordinator wiring PR #54 and production main:
  `68ee5d612df7d0452091ff0dfd2062d433943066`.
- Render deployment: `dep-d9ilv150kf9s73bmj44g`, Live at `68ee5d6`.
- Migration `release_train_0_research_assessment_v2`: applied and verified with
  no live row-count changes.
- Website 6 candidate gates: 339/339 focused tests, 28/28 PostgreSQL 16
  migration checks, production build, 1,061-file/101-artifact leak scan, and
  5/5 responsive disabled-state browser projects passed.
- Live evidence: `/api/health` 200; signed-out Assessment and Blueprint review
  APIs return 401; desktop/375/320 have no overflow; focus is visible; no new
  serious Render errors.
- Assessment remains fail-closed while `RESEARCH_HEALTH_DATA_ENABLED` is false
  or unset and no counsel-approved, published, effective, hash-valid XR-MEM-012
  exists.
- Authenticated member/admin persistence smoke is **pending, not failed**:
  no authorized Research gate/member/admin session was available, and no
  account or production record was fabricated.
- Command Center evidence:
  https://github.com/teamxenios/xenios-website/issues/44#issuecomment-5081358506
- Release Train 0 production status: **PARTIALLY LIVE**.

## Release Train 1 candidate evidence

- PR #47 frozen head:
  `877ebfff75452f47b3b185e9879a0dcf156e0ef7`.
- 76/76 focused tests pass.
- 14/14 exported Website 3 routes are present behind injected member/admin
  guards; zero new Website 3 adapter mismatches.
- 20/20 independent browser checks pass for populated/error/unavailable states,
  keyboard focus, WCAG A/AA, contrast, touch targets, sensitive browser state,
  and overflow across desktop/320/375/430/tablet.
- A 720-CSS-pixel reflow check representing 200% zoom on 1440px passes.
- Production build, leak scan, and Xenios UI consistency budgets pass.
- No migration exists in PR #47 by design. Production migrations, canonical
  repositories, RLS, private Storage/providers, shared wiring, and authenticated
  persistence smoke remain Website 2-owned integration gates.
- Candidate verdict: **PASS; NOT YET MERGED**.

Website 2 remains the sole merge/deployment coordinator. Website 6 must verify
the deployed SHA, live 320px behavior, contrast, logs, and smoke checks after
the Website 6 release.

PRODUCTION STATUS:

NOT YET MERGED

UI CONSISTENCY STATUS:

NEEDS REVISION

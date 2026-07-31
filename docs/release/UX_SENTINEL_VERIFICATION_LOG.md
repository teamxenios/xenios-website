# UX Sentinel verification log

Append-only evidence record. No credentials, tokens, cookies, supplier costs, or personal data appear here.

## 2026-07-29T23:19Z to 23:25Z, baseline sweep 1 (production, signed-out, desktop 1280)

Main SHA: `517c2191cfaef2d76d7ceeea27648be311bae2d1`. Deployment SHA: not exposed; health uptime 2981s at 23:19Z implies a restart near 22:30Z, minutes after the 517c219 merge at 22:29Z.

1. GET https://xeniostechnology.com/api/health -> 200. Body (sanitized): status "Xenios API is running", supabaseConfigured true, adminConfigured true, turnstileConfigured false, commerceEnabled false.
2. Home page: hero CTAs are Request Early Access and See How It Works. Header nav: Product, For Coaches, How It Works, Research, Careers, About, Request Early Access. Full site menu: 24 links, none of them a login or membership entry. DOM-wide anchor scan matching sign/login/member/admin/apply/partner/affiliate returned exactly one link: "Apply for Early Access" -> /waitlist. SEN-0001 confirmed.
3. /research -> review password gate page. Text: "This area is under review... ordering is not open." Interactive elements: one password field, one Enter button. No catalog control of any kind. Directive 2 passes at this SHA for the public variant.
4. Source check for the behind-gate variant: client/src/research/pages/Gateway.tsx on origin/main renders exactly apply, sign-in, privacy, terms, mailto support. Design comment states "No navigation, no catalog." Directive 2 passes at code level for the authenticated gateway variant.
5. /research/sign-in -> real member sign-in form (email, password, forgot-password). NOT behind the gate.
6. /research/apply -> password gate. /research/partners -> password gate. SEN-0002 confirmed: inconsistent gate boundary, application journey blocked at step 1.
7. /care -> "CARE PENDING" surface: eligibility, appointments, clinical review, pharmacy, instructions, support, all NOT YET AVAILABLE; fail-closed copy; emergency boundary present; zero console errors. SEN-0003 recorded as directive gap.
8. /clinical -> branded 404. No clinical route in client/src/App.tsx. SEN-0004.
9. /admin/research -> "SIGN IN REQUIRED" admin sign-in form; copy notes the same account signs in to /admin. Reachable. Credential verification not performed by the Sentinel (never handles passwords).
10. Catalog reconciliation on origin/main: docs/research-commerce/brand-catalog-notes.md documents 911 rows (Momentous 76, Pure Encapsulations 413, Life Extension 384, Superpower 38); classifications include 862 human_supplement and 38 blood_testing_health_service. Every row resolves DISPLAY_ONLY, derived through resolvePrivateLaneOfferMode; buildProduct throws at module load if a row resolves purchasable. Peptide catalog merged: PEPTIDE_CATALOG length 45 (workbook 15, expansion 27, regulatory_hold 3). NutriDyn appears in shared/research/catalog/supplement-catalog.ts. SEN-0005 recorded as directive gap. 70-variant reconciliation queued.
11. Release lease check: newest ref on the remote is origin/main at 517c219 (2026-07-29 17:29 -0500). No newer branch, commit, or coordination record from a new orchestrator session. docs/coordination/FILE_OWNERSHIP.json generatedAt 2026-07-29T07:03Z still lists the prior Website 1-6 lanes. No lease competition by the Sentinel.

Constraints noted: the Sentinel does not enter passwords, so the review gate and all signed-in lanes require the leader's fixture strategy or founder-run sessions. Playwright assertions for directives 1 and 2 need a leader file lease before the Sentinel adds test files.

## 2026-07-29T23:30Z, sweep 1 extension (mobile and API negative probes)

12. Home page at 375x812: DOM-wide anchor scan matching sign/login/member/admin/partner/affiliate returned zero links. SEN-0001 confirmed on mobile as well as desktop.
13. Signed-out API rejection probes (production): /api/research/member/profile 401, /api/research/member/orders 401, /api/research/capabilities 401 (all correctly rejected); /api/admin/research/members 404 (path shape unverified, not recorded as a finding).
14. /admin at 375x812 renders the admin dashboard sign-in with a forgot-password path. Reachable on mobile.

## 2026-07-29T23:47Z, founder clarification and correction sweep

Samuel clarified directive 1: the four entry links belong on /research, and Research is a hidden
destination that the main site must never link. SEN-0001 retracted accordingly.

15. Home page DOM scan for anchors with href starting /research: two persistent anchors, one in
    the header (labelled Research; offsetParent null because the header is fixed-position, but the
    element was confirmed rendered and interactive in the 1280 read at 23:21Z) and one visible in
    the footer. The full-site-menu overlay adds a third when open (confirmed 23:21Z, ref list).
    These are shared-layout components, so every marketing page carries them. SEN-0007 filed.
16. /research pre-gate interactive elements (from 23:21Z evidence): one password field, one Enter
    button, zero entry links. Post-gate Gateway.tsx at 517c219 renders Apply and Member sign-in
    plus policy and mailto links only: no Partner/Affiliate entry, no Admin entry. SEN-0008 filed.
17. Exhaustive disclosure sweep launched (workflow: marketing-surface links, sitemap/robots/
    llms.txt/SEO assets, copy mentions, gateway four-links analysis, each claim adversarially
    verified). Results will be appended when complete.

## 2026-07-30T00:05Z, exhaustive /research disclosure sweep results (23-agent workflow, every claim adversarially verified)

18. CONFIRMED hyperlink disclosures on the marketing surface: all three render surfaces trace to
    exactly TWO data lines. client/src/lib/nav.ts:18 (primaryNav) drives the desktop header link
    (Navbar.tsx:84-97, lg+ viewports, data-testid link-nav-research). client/src/lib/nav.ts:35
    (menuGroups Product group) drives BOTH the full-site menu overlay (Navbar.tsx:172-190, all
    viewports including mobile) AND the footer Product column (Footer.tsx:43-44). Navbar and
    Footer mount through PageShell on all 28 marketing pages. Verifiers confirmed byte-identity
    across 517c2191 and current origin/main, and found no test pinning a Research nav entry.
    Fix is two one-line data deletions. Extends SEN-0007.
19. Static assets CLEAN: zero mentions of research in public/sitemap.xml, public/llms.txt,
    public/robots.txt (workflow agent plus an independent grep of the worktree).
20. LATENT disclosures found by the adversarial pass (filed as SEN-0009): four public care pages
    carry a primary "Sign in securely" CTA to /research/sign-in in their auth_required branch
    (CarePrescriptionsPage.tsx:81, EligibilityPendingPage.tsx:186, CareConsentPendingPage.tsx:104,
    CareAppointmentsPage.tsx:116). Unreachable today because server/care/access.ts:40-57 checks
    the care capability BEFORE auth and production returns 503 care_disabled (live-probed). The
    branch becomes reachable for every signed-out visitor the moment Care is enabled. CI pin:
    eligibility-ui.test.ts:70 asserts the /research/sign-in href, so the fix must update the test.
21. REJECTED claims (recorded to prevent refiling): care boundary copy naming "Research" without
    a hyperlink (section.tsx:59/:118, CareAppointmentsPage.tsx:65/:165, CareConsentPendingPage.tsx:68,
    EligibilityPendingPage.tsx:143, CarePrescriptionsPage.tsx:92) does not violate the
    no-hyperlinks directive; moved to recommendation R-001 (copy rewording). A test-file
    disclosure (eligibility-ui.test.ts:70) is not user-reachable; tracked inside SEN-0009 as the
    CI pin. Note the verifier pool split on the four care CTAs (one confirmed, three refuted as
    latent-only); the Sentinel resolves the set consistently as SEN-0009 latent severity.
22. Gateway four-entries ground truth (independent re-derivation, verifier isReal=true): pre-gate
    PasswordPage (research/layout.tsx:67-119) has ZERO links. Post-gate Gateway.tsx renders
    exactly five links: Apply (:72), Member Login (:75), privacy (:86), terms (:87), mailto
    support (:88). Partner/Affiliate Login MISSING (and partners have NO credentialed login of
    their own anywhere: partner pages authenticate with the member session token,
    partners/Dashboard.tsx:59-63). Admin Login MISSING from the gateway (admin sign-in lives only
    at /admin/research and /admin destinations). sign-in and reset-password deliberately bypass
    the gate via RecoveryChrome (layout.tsx:272-274), which explains observation 6. Extends
    SEN-0008; SEN-0002 merged into the SEN-0008 design decision.

## 2026-07-30T00:35Z, sweep 2 (loop iteration 2): main moved, leader active, targeted regression

23. origin/main advanced 517c219 -> 4a45b89 (two commits). PR #143 (claude/f5/research-guard,
    merged 18:34 -0500): adds client/src/research/pages/Gateway.catalog-guard.test.tsx and
    docs/research/RESEARCH_HOME_CATALOG_POLICY.md. Test-and-doc only; no runtime change, so
    production behavior is unchanged from sweep 1 evidence.
24. PR #143 guard quality review (Loop B): three independent checks in one file: (a) DOM render
    of Gateway with a CLOSED ALLOWLIST, so any unexpected new anchor or button fails, not only
    denylist matches; (b) viewport and flag independence assertions (honest that jsdom cannot
    measure CSS hiding; proves rendered output reads no width, prop, or flag); (c) source-level
    scan of Gateway.tsx catching denylisted routes inside untaken branches (feature flags,
    dev-only blocks). Denylists cover catalog phrases and catalog hrefs including the legacy
    routes. Assessment: SATISFIES the founder's automated-assertion requirement for directive 2
    at the component level, and the closed allowlist is stronger than a text scan. Residual gap
    (small): no real-browser production check; a Playwright smoke against the deployed /research
    would complete the belt-and-suspenders. The Sentinel's own to-add-assertion item is now
    covered by the leader's guard.
25. Peptide reconciliation (queued from sweep 1) RESOLVED: peptide-catalog.test.ts asserts
    allVariants() has length 70 (workbook 21, expansion 33, regulatory_hold 16) across the 45
    products. The founder count of 70 peptide variant rows reconciles on main, in CI.
26. Leader activity: branches claude/f5/research-guard (merged as PR #143) and
    claude/f5/pricing-model (18:45, unmerged, "import the founder peptide pricing model, blocked
    from activation"). The Fable 5 leader session is ACTIVE. Coordination note: no release-lease
    or ownership record has been committed yet; docs/coordination/FILE_OWNERSHIP.json on main is
    still the 2026-07-29T07:03Z Website 1-6 snapshot naming Website 2 as release-manager. The
    Sentinel requests the leader publish its lease claim and current ownership matrix so findings
    can be routed by file area.

## 2026-07-30T00:47Z, sweep 3 (loop iteration 3): marketing-route crawl, redirects, zero console errors

27. Sync: origin/main unchanged at 4a45b89; no new remote branches since claude/f5/pricing-model
    (18:45 -0500). Leader quiet for about 50 minutes.
28. Marketing crawl (production, signed out, 1280): /product, /how-it-works, /for-coaches,
    /for-clients, /storefront, /waitlist, /contact, /book, /about, /careers ALL render real
    content with correct titles and h1s. ZERO console errors accumulated across the entire
    twelve-navigation crawl. /storefront is the thinnest page (748 chars of main text) but
    renders; /book carries its scheduling iframe; /careers lists three roles.
29. Waitlist form (the site's primary public CTA target): complete form present with eleven
    fields (two text, email, two selects, tel, three text, textarea, consent checkbox) and a
    "Join the waitlist" submit. Submission NOT exercised (Sentinel does not submit forms without
    an approved test procedure).
30. Redirect aliases verified client-side: /telemedicine lands on /product; /partners lands on
    /ecosystem. Remaining aliases (/agents, /developers, /enterprise, /ontology, /faq, /argos)
    queued.
31. Remaining unvisited marketing routes queued for sweep 4: /network, /ecosystem (direct),
    /for-practitioners, /manifesto, /security, /compliance, /investors, /press, /privacy,
    /terms, /disclosures, /early-interest, /concepts, /mvps, plus a 320/768 viewport pass and
    the accessibility first pass.

## 2026-07-30T01:20Z, sweep 4 (loop iteration 4): full public marketing surface crawled clean

32. Sync: origin/main unchanged at 4a45b89; claude/f5/pricing-model untouched since 18:45 -0500.
33. Crawled the remaining thirteen marketing routes (production, signed out, 1280): /network,
    /ecosystem, /for-practitioners, /manifesto, /security, /compliance, /investors, /press,
    /privacy, /terms, /disclosures, /early-interest (form present), /concepts, /mvps. All render;
    ZERO console errors across the crawl. Redirects /faq -> /product and /argos -> /mvps land
    correctly. With sweep 3 this completes the entire public marketing surface: 24 content
    routes rendering, 4 of 8 redirect aliases live-verified (the other four are identical
    one-line Redirect components in App.tsx, source-verified).
34. New P3s: SEN-0010 (/concepts is menu-linked but effectively empty, "New concepts are on the
    way", 129 chars) and SEN-0011 (/disclosures title uses "Disclosures - xenios", breaking the
    comma title convention every other page follows).
35. Queue for sweep 5: 320/768 viewport pass on home, waitlist, and gateway; accessibility first
    pass (headings, labels, focus) on home and waitlist; the four remaining redirect aliases
    live; storefront thinness noted for the leader's workstream 5 copy pass.

## 2026-07-30T01:52Z, sweep 5 (loop iteration 5): viewport and accessibility first pass, all clean

36. Sync: origin/main unchanged at 4a45b89; claude/f5/pricing-model still unmerged (18:45 -0500).
37. Home at 320x812: zero horizontal overflow, zero heading-order skips, zero images without
    alt, zero unnamed buttons or links, zero unlabeled inputs, exactly one h1 and one main.
38. Waitlist at 320x812: same clean results on labels, names, alts, overflow. Target-size scan
    found 30 sub-24px elements: 27 are inline footer links (WCAG 2.2 inline exception), the
    consent checkbox (16px) gains its target from its clickable label, and wl-website is a
    correctly built anti-bot honeypot (absolute wrapper at x=-9999, tabindex -1, labelled
    "Leave this field empty" so a screen reader user is instructed correctly). No finding.
39. Research gateway (password page) at 320: zero overflow, labelled Access password field at
    52px height. Home at 768: zero overflow, menu button visible and reachable.
40. Sweep 5 conclusion: no new findings. The signed-out surface is in genuinely good shape:
    every crawled route renders, zero console errors anywhere, accessibility basics pass at
    mobile widths. The open work concentrates in the P1 directive findings (SEN-0007, SEN-0008),
    the latent SEN-0009, and signed-in coverage blocked on a fixture strategy.
41. Queue for sweep 6: color-contrast spot check on home and waitlist; keyboard tab-order walk
    on the waitlist form; live verification of the four remaining redirect aliases; then idle
    watch for the pricing-model merge and the leader's lease record.

## 2026-07-30T02:30Z, sweep 6 (loop iteration 6): contrast sweep finds a real CSS regression

42. Sync: origin/main unchanged at 4a45b89; leader quiet since 18:45 -0500.
43. All eight redirect aliases now live-verified: /agents -> /product, /developers -> /ecosystem,
    /enterprise -> /contact, /ontology -> /product (plus the four from sweeps 3-4). All match
    App.tsx declarations.
44. Waitlist keyboard and contrast: natural DOM tab order (zero positive tabindex), honeypot
    excluded from the tab sequence, logical field order ending consent -> submit, ZERO contrast
    failures against solid backgrounds.
45. Home contrast sweep flagged one element at ratio 2.05, and verification proved it a REAL
    site-wide CSS regression (SEN-0012): the class string btn-ghost-on-dark matches no stylesheet
    rule (the sheet defines .btn-on-dark.btn-ghost as a two-class selector), so the anchor
    renders in browser-default link blue rgb(0,0,238) on the near-black rgb(14,14,14) closing
    sections. Computed contrast 2.05 (the scan and the hand computation agree exactly). Six
    occurrences across five marketing pages, including the About page's Request Early Access
    and Product's Join the Founding Cohort conversion CTAs. Fix is either six class-string edits
    or one CSS alias rule; a guard test asserting every .btn-* class used in JSX resolves to a
    stylesheet rule would prevent recurrence.
46. Queue for sweep 7: idle watch (main move, pricing-model merge, leader lease record); spot
    contrast pass on the five affected pages after the SEN-0012 fix lands; keyboard focus
    visibility walk when a real display is available for screenshots.

## 2026-07-30T03:40Z, sweep 7 (loop iteration 7): activation journey defect found

47. Sync: origin/main unchanged at 4a45b89; no new branches; production healthy, no redeploy
    (uptime 13419s at 03:19Z, same process since 22:30Z).
48. Sitemap consistency: 27 entries, all previously crawled-clean marketing routes; no /research,
    /care, or /admin disclosure (correct). The empty /concepts page IS in the sitemap, which
    strengthens SEN-0010. Career roles all listed and all three render fully (4.5k-6.7k chars).
49. Research access lane, fresh browser: /research/reset-password OPEN via RecoveryChrome with a
    labelled email field (correct); /research/application-status GATED; /research/activate GATED.
50. SEN-0013 filed (P2 now, P1 for any freshly approved member): the activation email's Continue
    activation button links to /research/activate (server/research/membership-activation/
    emails.ts:188), but the RecoveryChrome bypass in layout.tsx covers only sign-in and
    reset-password, so the emailed claim link lands on the review password wall from a fresh
    browser. This contradicts the layout's own design comment ("Account access works from a
    fresh browser WITHOUT the shared review password") and production has one member pending
    activation. The application-status gating is the same decision surface. Owner: leader
    workstream 1 (account continuity), coupled to the SEN-0008 gate-boundary decision.
51. Queue for sweep 8: idle watch; re-verify SEN-0012/0013 when fixes land; signed-in lanes
    remain blocked on the leader's fixture strategy.

## 2026-07-30T04:30Z, sweep 8 (loop iteration 8): idle sync plus a lease-contention observation

52. Sync: origin/main unchanged at 4a45b89; no new branches; production same process
    (uptime 17316s at 04:24Z). PR #144 (claude/f5/pricing-model, non-draft) is open: "Import
    Samuel's founder peptide pricing model as gated draft targets."
53. COORDINATION OBSERVATION for Samuel and the Fable 5 leader: PR #108 (release-manager session
    inventory) carries fresh comments from a CODEX release-manager session: a
    [CODEX_RELEASE_MANAGER_DIRECTIVE_RECONCILIATION] SINGLE-AUTHORITY HOLD at 2026-07-30T00:45Z
    (responding to a separate founder directive, XENIOS_CODEX_FULL_BLOCKER_RESOLUTION_AND_
    PRODUCTION_ACTIVATION_MASTER_DIRECTIVE_2026-07-29.md) and an authenticated read-only
    provider-evidence addendum at 01:06Z confirming main exactly 4a45b89. Two release-authority
    processes (the Fable 5 leader on claude/f5/*, the Codex release manager on PR #108) are now
    describing authority over the same repository, and neither has committed a lease record to
    main. The Sentinel arbitrates nothing and holds no lease; it flags the contention so the
    founder can designate the single release authority explicitly.
54. No new defects this sweep. Open verification work: SEN-0012 and SEN-0013 fixes, the SEN-0007
    nav deletion, the SEN-0008 four-entries decision, signed-in lanes pending fixtures.

## 2026-07-30T10:40Z, DIRECTIVE CHANGEOVER: the 2026-07-30 final master directive is now canonical

55. Samuel issued XENIOS_FINAL_CLAUDE_CODEX_FULL_WEBSITE_COMPLETION_MASTER_DIRECTIVE_2026-07-30.
    It supersedes the 2026-07-29 sentinel prompt and every earlier master prompt. New operating
    model: CODEX is the sole release manager, merger, migration operator, and deployer; this
    session is the continuous product completion and reliability reviewer and never claims the
    lease. The prior lease-contention observation (entry 53) is resolved by fiat.
56. Workbook ingestion: all five canonical source workbooks located in Downloads and SHA-256
    verified EXACTLY against the directive (activation model 345787a2, 2.5x pricing 5bc5a624,
    peptide master f11742ae, supplement catalog f09285fb, nutridyn wholesale 2b47a6b6).
    Arithmetic check: all 35 locked pricing rows (P001-P015 plus 20 NutriDyn) verify as
    ROUND(wholesale * 2.5, 2) exactly.
57. Codex activity: branch codex/founder-lock-release-reconciliation and PR #145 (reconciles
    production baseline 4a45b89 on Render dep-d9l8s8m7bikc73f9bj0g, pins workbooks, formalizes
    the five-migration DAG). Production identity is now Render-evidenced, upgrading the
    Sentinel's earlier uptime inference. PR #145 review running via workflow.
58. FINDING RE-MAPPING under the new directive:
    - SEN-0007 (main-site links to /research) SUPERSEDED: directive 9.2 keeps /research as a
      public or gated landing surface, and 8.1 requires login actions on the home page, so a
      main-site link to research surfaces is no longer a defect by itself.
    - SEN-0008 (four entries on /research) SUPERSEDED by 8.1: the four actions belong on the
      MAIN home page. The Gateway's existing Apply plus Member Login satisfies 9.2 for the
      landing surface; the shared review password must still be replaced by Supabase Auth
      entitlement (9.2), which SEN-0013 already evidences.
    - NEW SEN-0014 (P1, directive 8.1): the main home page exposes ZERO of the four required
      actions (evidence: sweeps 1 and 5, DOM scans at 1280 and 375 found no login, member,
      admin, partner, or apply-for-membership controls; only Apply for Early Access -> /waitlist)
      and no portal hub for Supplier/Lab, Clinical Staff, or Support logins. Owner: Codex.
    - SEN-0009 reframed: the care pages' /research/sign-in CTAs become a legitimate member
      sign-in route under 9.2; remaining question is routing consistency once /login exists.
    - SEN-0012 (ghost CTA CSS regression) and SEN-0013 (activation email lands on the review
      password gate) stand unchanged and are now defect packets for Codex.
59. Sentinel artifacts continue on sentinel/ux-reliability-continuous; the directive's shared
    ledgers (XENIOS_DEFECT_LEDGER.csv and companions) are seeded on this branch for Codex to
    adopt or relocate.

## 2026-07-30T11:15Z, workbook ingestion and PR #145 review results (22-agent workflow, all claims adversarially verified)

60. Workbook cross-verification: the two commercial models agree with the directive on every
    number. All P001-P015 and NutriDyn wholesale and final prices match exactly, and every final
    price recomputes as ROUND(wholesale x 2.5, 2) inside the workbooks themselves. Three
    cosmetic name annotations only (Magtein, Collagen Renew, Inflam-Eze carry supplier
    parentheticals the directive omits; same SKUs, same prices). Parser note for future readers:
    these workbooks store text as inline strings, so shared-strings-only xlsx parsers see blanks.
61. The ELEVEN presentation mismatches the directive says exist (12.2) were independently found
    and verified: P001, P003, P007, P008, P009, P010, P011, P012, P013, P014, P015. The stale
    supplier labels differ from the founder-confirmed presentations (largest: P001 source label
    15mg/15mg vs confirmed 5mg+5mg, and the P001 verification cites the signed 2026-07-21
    supplier master supporting the founder-confirmed strengths). Count matches the directive
    exactly. Codex must preserve these as mismatch history per 12.2; the Sentinel will verify
    the Product Control import keeps both.
62. PR #145 review verdict: APPROVE_WITH_NOTES at branch tip cfb9de3. Mechanically exact: all
    nine migration-DAG checksums independently recomputed from git blobs and matching, the five
    protected pending migrations in a strict serial chain, production pinned to 4a45b89 on
    Render dep-d9l8s8m7bikc73f9bj0g. Verified notes: (a) SEN-0015 filed, exact supplier
    wholesale costs for all fifteen peptide SKUs live in docs/research-commerce/
    PEPTIDE_CATALOG_BUILD_NOTES.md lines 82-98 on the public repo (directive 7.19/21.2 work);
    (b) the recorded founder addenda omit the 999/99 membership values and older 50/25 economics
    remain in repo docs; (c) the broken-protected-order half of the new test never exercises the
    validator; (d) P3s: mmd/json release-graph divergence, stale taskAssignments (baseSha two
    baselines old), em dashes in new doc content, branch mutated mid-review.
63. SEN-0016 filed as decision-required: the public About page presents Dr. Wesley Nahm, MD as
    CMO (About.tsx:8, live since June, deliberate). Directive 7.11 names him in the restricted
    roster and prohibits public display in marketing copy. An executive bio is arguably distinct
    from the care-delivery roster, and he is the long-disclosed CMO; one founder decision
    resolves it (recorded exemption or removal). Not treated as a unilateral defect.

## 2026-07-30T11:20Z, sweep: PR #145 merged, targeted regression clean

64. PR #145 merged as c8ffce4 (its two commits exactly: the reconciliation and the directive
    import; ten files, coordination docs plus test plus MIGRATIONS.md, zero runtime code).
    Production auto-redeployed minutes after the merge (health uptime 891s at 11:14Z) and is
    healthy: home 200, research gate 200, commerceEnabled false, turnstileConfigured false.
    Docs-only diff, so no route-behavior regression is possible; spot checks pass.
65. Codex has not yet replied to the two reviewer comments on PR #145; PR #144 (pricing model)
    remains open. Fix-verification queue unchanged: SEN-0014 (home four actions), SEN-0013
    (activation gate), SEN-0012 (ghost CTA), SEN-0015 (wholesale costs in public repo doc),
    SEN-0016 (founder decision), plus the five protected migrations still pending application.

## 2026-07-30T11:50Z, PR #144 review complete (5-agent workflow, verified): REQUEST_CHANGES

66. SEN-0017 filed (P1, blocks merge as-is): the pricing-model import predates the 2026-07-30
    directive and drifts on every substantive value. All 15 member price targets encode the
    superseded market-led numbers (examples: P001 109 vs locked 335.00, P007 79 vs 197.50, P012
    109 vs 222.50; full table in the ledger). The locked formula ROUND(wholesale x 2.5, 2)
    appears nowhere; instead the module implements a nearest-5 ladder for 39 expansion targets
    and the tests PIN the forbidden x9 ladder (expect overrideTargetCents % 1000 == 900).
    Presentation canon is inverted: the stale supplier label is the SKU identity and the
    founder-confirmed presentation sits as conflicting metadata, the reverse of directive 12.2.
67. Engineering quality verified GOOD: activation genuinely fail-closed (12 gates, member price
    display null for all 70 rows, nothing chargeable), the discount policy cannot break exact
    cents, no wholesale cost is client-reachable, zero em dashes (test-enforced). The eleven
    presentation mismatches are preserved with both versions matching the directive workbooks.
68. SEN-0018 filed (P2, pre-existing on main): peptide-catalog.ts computes customer amounts at
    1.80x and matrix amounts at 2.5x with a 99 floor and round-up-to-5; neither reproduces the
    locked table, and the branch's wholesale cents match the directive exactly on all 15, so the
    correct prices are derivable in-repo once the locked formula is implemented.
69. Verdict REQUEST_CHANGES posted to Codex on PR #144 with the per-SKU table and the five
    concrete pre-merge changes.

## 2026-07-30T21:45Z, integration-cycle status

70. SEN-0013 closed verified-fixed: Codex integrated the PR #147 content via PR #166 with its
    manifest pin; production verified (fresh browser reaches /research/activate). PR #147 closed
    as integrated. SEN-0016 closed verified-fixed via PR #146 on production.
71. PR #161 (drift reconciliation) closed by the release manager for current-base
    reconstruction: the member-UI endpoint family is re-planned as Website 2's exact 20-path
    plan with client units rebuilt after policy deployment. The reviewer lane returns to
    verify-and-review for that family; the audit and batches informed the plan.
72. Still open from the reviewer session: PR #155 (catalog-display wiring, lease-clean half) and
    PR #165 (add-to-cart affordance). Ecosystem active: Website 2 (member UI), Website 4
    (affiliate economics kernel, PR #164), Website 5 (application UI, merged), workstream 6
    Care architecture branch, and PRs #163/#167/#168 from parallel sessions.

## 2026-07-31T00:35Z, full-build forensic audit delivered

73. Thirteen read-only agents audited the whole build at main eb5226d (2.36M tokens, 894 tool
    calls, zero mutations). Package at C:/Users/sboad/projects/xenios-full-build-audit-20260730T231252Z:
    24 artifacts plus a verified 224KB ZIP. Scores: ~72% code, ~55% production, ~15% commercial,
    ~5% clinical, ~45% overall verified.
74. Three findings had no prior owner and were broadcast to the coordination thread (PR #108) and
    the pricing lane (PR #175): (a) P0, the checkout collects no payment instrument and the green
    happy-path test hides it by injecting a provider that authorizes without one; (b) P1, forced
    RLS missing on 62 of 142 applied tables with the fix for 57 sequenced behind unapplied commerce
    migrations and 5 covered by no migration at all; (c) P2, /kairos 307s to a login that lands on
    the marketing 404, breaking the only live MVP link.
75. Corrections to the record: PR #166 opened only /member/claim (the other three account-access
    lanes were already reachable), and PR #152's closed head e0246c1 was 16 files with ZERO failing
    tests, not the 21-file red-tripwire state earlier reports described.
76. Audit side effect disclosed and REPAIRED: the primary clone's node_modules was destroyed during
    an agent's worktree setup; npm install completed exit 0 and vitest/4.1.10 is verified restored.

## 2026-07-31T04:35Z, dead-client-call progress measurement at main 944d8ce

77. Re-ran the audit's dead-call analysis (Agent M's method) against current main after the
    contract-repair merges PR #177 (tracker), #181 (questions and Telegram), #184 (pricing).
    Raw result: 85 client-referenced API paths, 231 registered server routes, 28 apparent dead.
78. Five of the 28 are ARTIFACTS of matching a path with its query string; each base path IS
    registered and was verified individually: /api/research/tracker (2 registrations),
    /api/research/assessment (1), /api/research/applications/status (2), /api/admin/export (1),
    /api/admin/notes (2). Three more are BASE CONSTANTS rather than endpoints
    (/api/research/member, /api/admin/research, /api/research/activation).
79. TRUE remaining dead calls: about 20, and SIXTEEN of them are the partner lane
    (campaigns, campaigns/request, commissions, compliance, compliance/submissions, conversions,
    events, events/request, leads, onboarding, organizations, organizations/request, payouts,
    resources, security/sessions, training) plus two admin research paths and two esign paths.
80. PROGRESS: the audit measured 62 dead client calls on 2026-07-30. The member-prefix drift
    family that dominated that count is now largely closed by the Website 2 reconstruction, and
    the residue is concentrated almost entirely in ONE unimplemented lane (partner). This is the
    clearest quantitative evidence so far that the reconstruction approach is working.

## 2026-07-31T05:20Z, production probe of the repaired member contracts, and why it proves less than it looks

81. Main is e45ae5a (PR #187, profile private-header ownership). Production healthy, uptime 1698s.
82. Probed the six repaired member endpoints signed out (/tracker, /profile, /questions, /telegram,
    /documents, /blueprint). All six returned 401 {"ok":false,"message":"Access required."}.
83. THIS IS NOT VERIFICATION, and the control proves it: GET /api/research/definitely-not-a-route-xyz
    returns the IDENTICAL 401 and identical body. The gateway wall answers before routing, so under
    /api/research a 401 cannot distinguish a live route from a missing one. Recorded as
    NON-DISCRIMINATING rather than as a pass.
84. Discriminating probes that DO carry information, all outside the wall: /api/admin/research/
    fulfillment 404 and /api/admin/research/members 404 (still genuinely missing, matching the audit
    and GAP-008); /api/care/status 200 with state disabled (Care rail deployed and fail-closed);
    /api/research/pricing/.../price 503 pricing_disabled (the pricing adapter IS deployed and
    correctly refuses while the flag is off).
85. CONCLUSION: the member-contract repairs cannot be verified from outside without an authenticated
    session. Their correctness rests on the merged source and CI, not on a production probe. The two
    admin endpoints remain provably missing. This is the same limit the audit recorded; noting it
    again here so no later reader mistakes six 401s for six working endpoints.

## 2026-07-31T06:20Z, a reliable external discriminator for wall bypasses (method note)

86. Reviewed PR #191 (profile reads past the review wall, merged as 6908699). Verified correct at
    code and runtime: bypass is GET/HEAD only, both handlers carry requireActiveMember, and
    no-store is present, so the PR #188 header-before-auth ordering holds.
87. METHOD CORRECTION to log entry 83. I recorded that a 401 under /api/research proves nothing
    because the wall answers 401 for unknown paths. That is true of the STATUS CODE but NOT of the
    RESPONSE BODY, and the distinction is usable:
      "Access required."  = the gateway WALL answered (request never reached a route)
      "Sign in required." = the MEMBER GUARD answered (request passed the wall and hit the handler)
    Evidence at 6908699: GET /profile and GET /profile/sensitive return 'Sign in required.'; POST
    /profile and GET /nope-xyz return 'Access required.'
88. So a wall bypass IS externally verifiable without credentials: assert the bypassed read returns
    the guard message and that the same path under a write verb still returns the wall message.
    Use this for every future addition to DOWNSTREAM_MEMBER_GUARDED_READ_PATHS,
    OPEN_PUBLIC_READ_PATHS, OPEN_PUBLIC_WRITE_PATHS, or OPEN_ACCOUNT_WRITE_PATHS.
89. SEN-0022 re-probed at 6908699: /admin still returns no x-robots-tag. Still open.

## 2026-07-31T07:20Z, Xenios30 handover verified fixed at main 600288d (PR #193)

90. At 06:50Z I handed the Website 2 lane the measured Xenios30 contract analysis when it reserved
    that surface (PR #192), specifically warning that a path-only repoint would leave the page
    broken because three independent mismatches existed. PR #193 merged ~30 minutes later.
91. VERIFIED, all three closed at main 600288d:
    (1) PATH/SLUG: adapter now calls /api/research/plans/xenios30; zero occurrences of the old
        /member/plans/xenios-30 form remain.
    (2) ENVELOPE: Xenios30Response is typed { ok, current, history } matching the server, and the
        page validates it at RUNTIME with hasExactKeys(value, ["ok","current","history"]) plus
        current === null || isPlan(current), so the honest pending state is preserved.
    (3) ACKNOWLEDGE: acknowledgeXenios30(planId) posts to
        /api/research/plans/xenios30/:planId/acknowledge with an empty body, and planId is sourced
        from the loaded plan (Xenios30.tsx:170, dependency at :185).
92. The lane went BEYOND the handover in a way worth recording: rather than mapping the server
    projection down to the page's old flat string shape, it adopted the shared Xenios30Plan type
    directly and added runtime shape validation. That removes the lossy mapping layer my own
    proposal would have introduced. Their solution is better than the one I offered.
93. PATTERN CONFIRMED: analysis handed to the owning lane converted to a correct merged repair
    within 30 minutes. With merge access unavailable for reviewer branches, precise evidence
    delivered to the lane that owns the surface is the higher-throughput path.

## 2026-07-31T07:50Z, wall changes verified live, and the defect class they left behind

94. VERIFIED LIVE on production, PR #188 + #191 (main 600288d). GET /api/research/profile and
    /profile/sensitive now answer "Sign in required." (the member guard) instead of "Access
    required." (the wall), and both carry Cache-Control: no-store and x-robots-tag: noindex,
    nofollow ON THE 401 ITSELF. Headers on a denial that never reached the handler is direct proof
    that #188's ordering fix (privateMemberHeaders before requireActiveMember) is deployed.
    Control: /catalog and a nonsense path return "Access required." with neither header, so the
    header presence is route-specific and the result is not vacuous.
95. Static review found the change sound: the bypass is method-exact (GET/HEAD), and the downstream
    guard requireActiveMember verifies the JWT, active status, and billing parity, which is
    strictly stronger than the shared-password wall it replaced.
96. SEN-0023 FILED (P1, fails closed). The same defect class remains on 28 other member-guarded
    routes. The wall is satisfied only by isAuthed() = the xr_access cookie, minted at exactly ONE
    call site (setSessionCookie, index.ts:237, the shared review-password handler). Member login
    never mints it, and neither bypass covers these paths. So a member who signs in through Member
    Login without the review password is locked out of plans, documents, media, questions, tracker,
    assessment, blueprint, agreements, telegram, and PUT /profile.
    Production discriminator, no credentials: nine routes answered "Access required." (wall) while
    three controls answered "Sign in required." (guard).
97. This makes PR #193's repair unreachable for the flow the founder directive mandates, since the
    directive puts Member Login on the MAIN home page, where a member never meets the password gate.
    Two sharp edges recorded: #191 opened GET /profile but left PUT /profile walled (load succeeds,
    save fails), and POST /plans/xenios30/:planId/acknowledge is walled too, so a GET-only fix would
    let a member read the plan and still fail to acknowledge it.
98. SELF-CORRECTION, recorded because I nearly published the error. A raw
    `git diff origin/main <branch>` on PR #190 appeared to show it reverting the #188 and #191 wall
    fixes. That reading was WRONG. Against the true merge base (e45ae5a) #190 modifies only four
    client/src files and never touches server/research/index.ts or profile.ts, so a three-way merge
    preserves main's server state. The raw diff was reporting "branch is behind main," not "merge
    reverts." I tested merge-base semantics BEFORE reporting and published the corrected finding:
    #190 is a byte-identical no-op superseded by #193, close for hygiene, no regression risk.
    Rule reaffirmed: for any "this PR would revert X" claim, diff against the merge base, never
    against the tip.

## 2026-07-31T08:25Z, SEN-0023 blast radius, and a scan that under-counted

99. Measured which member pages SEN-0023 actually breaks. EIGHT, not the six my first scan reported:
    Assessment (agreements, assessment), Blueprint (blueprint), Documents (documents),
    PrivacyControls (agreements), Xenios30 (plans), Xenios90 (plans), Questions (questions,
    telegram), Tracker (tracker).
100. METHODOLOGY MISS, recorded so the number is not trusted blindly next time. My scanner matched
     adapter functions against literal "/api/research/..." strings inside the function body. It
     missed Questions.tsx and Tracker.tsx because those adapters resolve their path through a
     CONSTANT OBJECT (adapters/guides.ts exports guidesPaths.questions and .telegram) or live in a
     separate adapter module (adapters/tracker.ts). Indirection through a path map defeats a
     body-local literal match.
101. I caught it only because I listed the member page directory and noticed Questions.tsx and
     Tracker.tsx existed but were absent from the results, then resolved both by hand:
     guides.ts:26 questions -> "/api/research/questions", :29 telegram -> "/api/research/telegram",
     tracker.ts -> "/api/research/tracker". Confirmed all three are walled on production.
102. RULE: when an automated sweep produces a count, cross-check it against the directory listing of
     the things being counted. A scan that returns a plausible number is the easiest kind of wrong
     answer to publish. Reported the corrected 8 rather than the tidy 6.
103. PRE-MERGE CATCHES this pass, both handed to the owning lane before the wasted cycle:
     - #194 reserves plans.ts for private headers, which is the #188 half only. Without the #191
       half in index.ts the headers never reach the wire, since the wall answers first. Website 2
       already owns index.ts under OWNER-W2-PR86-SHARED-HOTFIX (state deployed, needs a fresh
       active reservation), so ownership is not the blocker.
     - #186 hardens the Documents UI against four routes that are ALL wall-shadowed today. Flagged
       while still draft, with the sequencing note and the GET-only-bypass trap (access and
       acknowledge are POSTs).

## 2026-07-31T08:55Z, why the directive's headline item has not moved: a governance conflict, not neglect

104. Quiet window, zero merges in 30 minutes and the wall unchanged on production, so I audited why
     SEN-0014 (directive 8.1, the four portal actions on the MAIN home page) has sat open through
     many merge cycles with nobody building it.
105. FOUND THE STRUCTURAL CAUSE. docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json freezes the main
     site. Its stated purpose: "the main xenios website outside /research and /care must not be
     redesigned, rewritten, or behaviorally modified." Two tiers:
     - fileHashes, described in the manifest as a HARD TRIPWIRE where "a mismatch is an
       unconditional FAIL". 21 files, INCLUDING client/src/pages/Home.tsx and client/src/lib/nav.ts.
     - protectedPaths.globs, which include client/src/pages/**, components/**, hooks/**, lib/**.
       Exempt subtrees are only research/**, care/**, and AdminResearchTab.tsx.
     Enforced by server/core-site-protection.test.ts (a real vitest test that loads the manifest and
     runs verifyHashes/classifyChangedFiles), not merely documented.
106. THE CONFLICT. Directive 8.1 (2026-07-30) requires putting four portal actions on the main home
     page. That means editing Home.tsx, and probably nav.ts. Both are hard-tripwire files, so the
     directive as written cannot be implemented without Samuel authorizing a manifest re-baseline.
     The directive is NEWER than the manifest baseline (capturedAt 2026-07-29), so it likely
     supersedes, but a reviewer must not assume that. This is a founder decision.
107. TRIAGE OF MY OWN STUCK PRs, now with the exact mechanism rather than my earlier vague "needs a
     manifest pin":
     - #179 (route error boundary) touches ONLY client/src/App.tsx among protected files, and
       App.tsx is a permittedSeamFile whose allowance is "route registration only, mounting a
       router". So it HAS a legitimate merge path: exclusive lease, minimum diff, focused regression
       test, QA confirmation of no unrelated change. All four are satisfiable.
     - #182 (six ghost CTAs) has NO path without a protection decision. Home.tsx is a hard tripwire,
       and the other four pages (About, ForCoaches, IcpPage, Product) are all captured by the
       client/src/pages/** glob.
108. I TESTED AND ABANDONED a split. My first idea was to carve #182 into a mergeable half (the four
     non-Home pages) and a blocked half (Home.tsx alone). That does not work: the pages glob
     protects all four. Only the new test file at client/src/button-class-resolution.test.ts sits
     outside every glob, and a test alone fixes no CTA. Recording the dead end so it is not retried.
109. NET: six genuinely broken CTAs on the live main site, and the founder's own headline directive,
     are both frozen by the same rule. Escalating to Samuel as a decision rather than continuing to
     file PRs that structurally cannot merge.

## 2026-07-31T09:20Z, PR #195 verified live, and a suspected pricing exposure cleared

110. PR #195 (e6a64b9) MERGED AND VERIFIED ON PRODUCTION. The #194 handover was acted on, and the
     lane solved the POST trap MORE TIGHTLY than I proposed. I suggested adding /plans to
     MEMBER_AUTHED_PREFIXES, which would open the whole prefix for every verb behind a bearer.
     They instead added a narrow write bypass anchored to one exact shape,
     /^\/plans\/xenios30\/([^/]+)\/acknowledge$/, with the planId validated as a UUID.
     Smaller surface than my suggestion. Recording that theirs is the better design.
111. DISCRIMINATING PROOF, both 401 so no state changed:
       POST /plans/xenios30/<valid-uuid>/acknowledge  -> "Sign in required."  (guard, bypass works)
       POST /plans/xenios30/not-a-uuid/acknowledge    -> "Access required."   (wall, UUID check works)
       GET  /plans/xenios30                           -> "Sign in required." + Cache-Control: no-store
                                                         + x-robots-tag: noindex, nofollow
     The non-UUID case is what makes this non-vacuous: it proves the bypass discriminates on shape
     rather than matching the prefix.
112. SEN-0023 downgraded to partially_fixed. Plans is closed. 24 routes across 6 pages remain:
     documents, media, questions, tracker, assessment, blueprint, agreements, telegram, PUT /profile.
113. SUSPECTED FINDING RAISED AND CLEARED, recorded because the near-miss is the useful part. While
     reading #195 I noticed the wall's read bypass also carries path.startsWith("/pricing/"), a
     PREFIX rather than an exact path, and the pricing routes register as
     app.get(PRICING_PRICE_ROUTE, privateHeaders, handle(...)) with NO auth middleware. That reads
     as a public pricing exposure, which would directly violate the directive's rule against
     exposing pricing. Production returns 503 pricing_disabled today, so the probe could not settle
     it, and a flag-gated exposure would still be a real latent defect with the price-approval batch
     pending.
114. I read the handler before filing, and there is no defect. Auth is INSIDE handle(): it calls
     authorizeAudience(req), returns 401 on a null grant, then re-brands via
     authorizeAudienceFromServerIdentity and returns 401 again if the brand fails, so an off
     allowlist audience or empty sourceVersion never reaches the resolver. The catch answers 503 and
     the comment is explicit that it is "never a 500, never an internal message, never a guessed
     price". It fails closed on every path.
115. RULE REAFFIRMED: absence of auth MIDDLEWARE is not absence of auth. Read the handler body
     before calling a route unguarded. I would have filed a false P0 against a well-built surface.

## 2026-07-31T09:55Z, consolidated the remaining wall work and caught a copy-the-pattern trap

116. #196 leased server/research/documents.ts for the documents access boundary, the same shape as
     #194: the lease omits server/research/index.ts, where the wall actually lives. On #195 the lane
     edited index.ts anyway, so this is a note rather than a blocker.
117. Rather than flag each lease one at a time for six more surfaces, measured the whole remaining
     set and handed it over in ONE packet: 24 routes, 18 of which need no regex at all (exact paths)
     and 6 of which carry a path parameter.
118. CAUGHT A TRAP BEFORE IMPLEMENTATION. #195 anchored its write bypass with z.string().uuid() on
     the planId, which is right for plans and WRONG for documents and questions:
       documents.ts:525  documentId: z.string().min(1).max(100)
       questions.ts:340  questionId: z.string().min(1).max(100)
     Real document ids in this repo are slugs, not UUIDs ("doc-fitness-1", "doc-v1", "doc_xyz").
     Copying #195 verbatim would wall every genuine documents request. Worse, it could PASS its own
     tests if those fixtures happen to use UUIDs, so the defect would reach production green.
119. VERB GAP, structural. The predicate admits GET/HEAD and POST only. Four remaining routes are
     PUT or DELETE (PUT /profile, PUT /media/retention-election, DELETE /media/:mediaId,
     DELETE /telegram/link) and stay walled regardless of which paths are listed until the branch
     is extended.
120. DECLARED AN UNKNOWN RATHER THAN GUESSING. I could not find an explicit id schema for mediaId,
     so the packet flags the two /media/:mediaId routes as unconfirmed shape and asks them to read
     media.ts before anchoring a pattern, instead of asserting a format I had not verified.
121. Asked for a NEGATIVE case per parameterised route, mirroring #195's non-UUID probe. Without one
     a test cannot distinguish a correct rule from an over-broad prefix match, which is the same
     anti-vacuity standard I hold my own evidence to.
122. Highlighted PUT /profile for sequencing: #191 opened the read and left the write walled, so a
     member can load the profile page and cannot save it. Two-line fix, visibly broken interaction.

## 2026-07-31T10:30Z, #197 verified, and I retracted a wrong warning of my own

123. PR #197 (4b0269a) merged. Documents partially closed, verified on production with UUID probes:
       GET  /documents                        -> "Sign in required."  fixed
       POST /documents/<uuid>/access          -> "Sign in required."  fixed
       POST /documents/<uuid>/acknowledge     -> "Sign in required."  fixed
       GET  /documents/<uuid>/download        -> "Access required."   STILL WALLED
     Three of four. The download is a GET with a path parameter, and the read branch is an
     exact-path Set plus two hardcoded prefixes, so a parameterised GET matches nothing. A member
     can list and acknowledge documents but cannot download one.
124. RETRACTED MY OWN WARNING. In the #196 packet I told the lane that anchoring the documents write
     bypass with z.string().uuid() would wall every genuine request because the ids are slugs. That
     was WRONG. The DDL is unambiguous: research_plan_documents.id, research_member_questions.id and
     research_private_media.id are all "uuid primary key default gen_random_uuid()".
125. HOW I GOT IT WRONG, worth recording as a rule. I read documents.ts:525
     "documentId: z.string().min(1).max(100)" as if it described the id FORMAT. It is a permissive
     REQUEST-BODY schema and says nothing about the stored shape. I then reinforced the mistake with
     grep hits that were different concepts entirely: "doc-v1" and "doc_xyz" are an e-sign
     documentVersionId and an OpenSign provider objectId, "doc-fitness-1" is a plans
     fitnessDocumentId. None are /api/research/documents ids. RULE: for a question about an
     identifier's format, the DDL is the authority. A validation schema is an upper bound on what is
     accepted, not a description of what exists, and grep hits on similar-looking strings are not
     evidence of a shape.
126. WHY THIS ONE MATTERED MORE THAN A TYPO: acting on it would have made the system worse, not just
     failed to help. Loosening the anchor to min(1).max(100) would admit arbitrary strings into the
     wall bypass. Codex shipped the tighter, correct version and my advice pointed away from it.
     Posted the retraction on both #197 and #196 (the packet's own thread) so the remaining surfaces
     are not implemented off the bad guidance, and stated plainly that the UUID anchor should be
     KEPT for questions and media.
127. The rest of the packet is unaffected and still open: the PUT/DELETE verb gap (PUT /profile,
     PUT /media/retention-election, DELETE /media/:mediaId, DELETE /telegram/link) and the
     exact-path routes for assessment, blueprint, media, questions, telegram, tracker, agreements.

## 2026-07-31T11:00Z, documents closed 4/4, and a second correction of my own

128. PR #198 (832bee6) merged; documents is now FULLY closed. Verified on production at 198cf13:
     list, signed download, access, and acknowledge all answer "Sign in required.".
129. THREE-WAY DISCRIMINATION on the download proves the rule is not over-broad:
       signed shape (exp + 43-char sig) -> "Sign in required."  guard, bypass works
       bare, no query string            -> "Access required."   wall, unsigned does not bypass
       sig of wrong length              -> "Access required."   wall, shape validation works
130. CORRECTED MYSELF TWICE ON THIS ONE ROUTE, both recorded because the second is the substantive one.
     (a) BAD PROBE. On #197 I reported the download as still walled after requesting the BARE path
         with no query string. The bypass keys on the signed-URL shape, so a bare request is
         supposed to be refused. The fix was already deployed and correct; my probe did not match
         the contract. RULE: when a bypass is defined over originalUrl rather than path, the probe
         must carry the query string, or it tests nothing.
     (b) MY PROPOSED SHAPE WAS LOOSER THAN THEIRS. I suggested
         /^\/documents\/([^/]+)\/download$/ with a UUID check. That would have admitted an UNSIGNED
         download past the wall on a well-formed UUID alone. Codex requires lowercase UUID + exp as
         a canonical safe integer (String(expiresAt) === rawExpiresAt rejects leading zeros and
         exponent forms) + sig of exactly 43 base64url chars, matched against req.originalUrl so the
         query string is visible to the predicate. Theirs is strictly tighter. Said so on the PR.
131. PATTERN NOW CONFIRMED TWICE IN A ROW: on both #195 and #198 the lane's implementation was
     TIGHTER than the shape I proposed. My value here is measurement and evidence, not prescribing
     the fix. Adjusting accordingly: keep handing over precise route inventories and discriminating
     probes, and stop proposing concrete regexes unless asked.
132. SEN-0023 remaining after documents: 20 routes across 5 pages (assessment, blueprint, media,
     questions, telegram, tracker, agreements) plus the PUT/DELETE verb gap. PUT /profile stays the
     one worth pulling forward, because it is the only case where the page LOADS and then silently
     cannot persist, rather than failing visibly.

## 2026-07-31T11:35Z, directive audit of the public bundle: catalog clause PASSES, one metadata finding

133. Wall work paused this cycle (#199 only extends a UI lease with shared/research/member-platform.ts),
     so I audited an unexamined area tied to a locked directive: "Do not expose them in public APIs,
     metadata, static bundles, page source, sitemap, structured data".
134. SITEMAP: PASS. /research is absent. The 6 apparent matches were false positives on the
     substring "care": /careers, /careers/*, /for/preventive-care, /for/healthcare-systems.
     Checked before reporting rather than counting grep hits.
135. ROBOTS/INDEXABILITY: /research and /research/apply both serve x-robots-tag: noindex, nofollow.
     / and /waitlist correctly do NOT, which is the control proving the header is route-specific.
     Leaving /research out of robots.txt is CORRECT, not a gap: robots.txt is public, so listing a
     hidden path there would advertise it. The noindex header is the right mechanism.
136. SEN-0022 CONFIRMED STILL LIVE: /admin serves no x-robots-tag. It is Disallowed in robots.txt,
     which prevents crawling but not indexing (a URL can still be listed without being fetched), and
     it is inconsistent with the research surfaces which do carry the header.
137. STATIC-BUNDLE CATALOG CLAUSE: PASS, and verified COMPLETELY rather than partially. Extracted
     all 13 lazy-chunk names from the single public bundle, fetched every one, and tested all 48
     catalog display names against all 14 files. ZERO matches. No compound or product name reaches
     any publicly fetchable asset. The /research landing chunk contains the generic word "peptide"
     3 times (its own page copy) and no compound names.
138. I initially scanned only 5 of the 13 chunks and got zero matches. Rather than report that as a
     clean result I fetched the remaining 8 and re-ran, because a partial sweep reported as complete
     is the same failure mode as the page-count under-count I recorded at entry 100.
139. SEN-0024 FILED (P3). The main bundle embeds source-derived chunk filenames, disclosing the
     route inventory of restricted surfaces to anonymous visitors: CarePrescriptionsPage,
     CarePharmacyOrdersPage, CareAppointmentsPage, CareConsentPendingPage, EligibilityPendingPage,
     Admin, adminx-section. Framed honestly as route-existence METADATA, not a catalog leak, and
     filed P3 rather than inflated. Note for whoever fixes it: the natural remedy is opaque chunk
     filenames in the build config, and vite.config.ts is a HARD-TRIPWIRE protected file, so it
     carries the same manifest blocker as SEN-0014 and #182.

## 2026-07-31T11:55Z, rendered-UX pass on the /research gateway (my remit, under-served until now)

140. No merges this cycle and the wall unchanged, so I ran the rendered-page verification I had been
     neglecting. I have been heavily API-focused; the Sentinel remit is UX/UI/reliability.
141. DIRECTIVE COMPLIANCE, PASS. The /research landing renders exactly the two actions the directive
     specifies, "Apply for Membership" -> /research/apply and "Member Login" -> /research/sign-in,
     with NO catalog CTA anywhere. Footer carries Privacy, Terms, Support.
142. HONEST STATES, PASS. /research/apply renders "Applications are being prepared" and states
     plainly that no application has been started or saved. The policy pages render with a
     "Documentation pending / In review" banner and describe themselves as starter language not
     approved for enrollment. These are the honest not-open states the canon asks for, not fake
     working forms. Zero console errors across every page visited.
143. SUSPECTED BROKEN LINK, CLEARED. The landing footer links /research/privacy while the apply page
     footer links /research/policies/privacy, and the apply page's own body uses the first form while
     its footer uses the second. That reads as a broken link or a stale path. I rendered BOTH and
     they serve the same Privacy Policy page, so they are aliases. Not a defect, not filed. Since
     /research is noindex, the duplicate path is not even an SEO concern.
144. SEN-0025 FILED (P3). /research/sign-in is a dead end. Full page text is the heading, the two
     fields, the submit button, "Forgot your password?" and one paragraph. No "Back to gateway", no
     footer, no Privacy, Terms or Support link. It is the only /research page with no exit, and the
     only credential-collecting page with no policy links. Verified by full text extraction rather
     than the accessibility tree alone, so a visually hidden footer would have been caught.
     Every sibling page has an exit: landing (footer), apply and policies ("Back to gateway" +
     footer), reset-password (Member Login + Support).
145. Worth noting for prioritisation: this one is NOT blocked by the protection manifest.
     client/src/research/** sits inside allowedWriteZones, so unlike SEN-0014, #182 and SEN-0024 it
     can be fixed without a founder re-baseline decision.

## 2026-07-31T12:15Z, SEN-0012 measured on production: a WCAG AA failure, not a cosmetic CSS nit

146. Third consecutive cycle with no merges, so I quantified the ghost-CTA defect (SEN-0012, my
     blocked PR #182) by MEASURING it on production rather than reasoning from source.
147. RESULT, and it is worse than I had been describing it. Every btn-ghost-on-dark CTA renders as
     unstyled default-link text: color rgb(0,0,238), transparent background, transparent border,
     sitting on the near-black section background rgb(14,14,14). Measured contrast ratio 2.05:1,
     which fails WCAG AA for normal text (4.5:1) and ALSO for large text (3.0:1). The elements are
     fully laid out and visible (193x64px on the home page), so this is not a hidden element.
148. NON-VACUOUS CONTROL on the same page: .btn.btn-primary resolves correctly to white on
     rgb(14,14,14). The stylesheet loads fine; only the ghost class fails to resolve. Without that
     control the measurement would be consistent with a stylesheet that simply had not loaded.
149. BLAST RADIUS IS 29 PAGES, NOT 6. I had been calling this "six ghost CTAs", counting SOURCE
     SITES. The IcpPage instance renders on every /for/:slug page, and the sitemap lists 25 of them.
     So: / (1), /about (2 CTAs), /for-coaches (1), /product (1), /for/:slug (25) = 29 pages,
     30 CTA instances. Corrected the ledger rather than keeping the tidier number.
150. FOUR OF THE SIX ARE PRIMARY CONVERSION CTAs: "Request Early Access", "Join the Founding
     Cohort", "Founding Coach Cohort", "See How It Works". This is revenue-path, not decoration.
151. SEN-0012 upgraded P2 -> P1 on this evidence. It remains structurally blocked: Home.tsx is a
     hard-tripwire file and the other four pages are captured by the client/src/pages/** glob, so
     the fix needs the same protection re-baseline decision as SEN-0014 and SEN-0024. That decision
     now gates a measured accessibility failure on 29 live pages.
152. Screenshot attempt failed (browser pane not displayed). Not chased: computed-style values plus
     the contrast computation are stronger and more checkable evidence than an image.

## 2026-07-31T12:55Z, PR #200 documents UI verified; client and server contracts agree

153. PR #200 (6e4bf9e) merged, hardening the member documents UI and download path. Reviewed the
     full client/server seam rather than the diff alone, because this is where the signed-URL
     contract has to line up exactly with the wall bypass shipped in #198.
154. CONTRACTS AGREE. Client validator in adapters/member.ts:326
       /^\/api\/research\/documents\/([0-9a-f-]{36})\/download\?exp=(\d+)&sig=([A-Za-z0-9_-]{43})$/
     Server bypass in research/index.ts
       /^\/api\/research\/documents\/([^/?]+)\/download\?exp=(0|[1-9]\d*)&sig=([A-Za-z0-9_-]{43})$/
     plus a uuid and lowercase check. The exp forms differ syntactically but not in effect: the
     client permits (\d+) then rejects non-canonical values via String(parsedExp) === match[2],
     which is the same leading-zero rejection the server encodes in its alternation.
155. CHECKED A UNITS MISMATCH THAT WOULD HAVE BROKEN EVERY DOWNLOAD, and it is clean. The client
     asserts parsedExp === Date.parse(grant.expiresAt), and Date.parse returns MILLISECONDS, so a
     server emitting exp in seconds would fail that equality on every request. The server uses
     milliseconds end to end: expiresAtMs = now.getTime() + TTL, exp: String(expiresAtMs), and
     expiresAt: new Date(expiresAtMs).toISOString(). Consistent. No defect.
156. The client also fetches grant.signedUrl VERBATIM, so the exp and sig query survive to the
     server, which matters because the wall bypass keys on originalUrl rather than path. Additional
     care worth recording: it rejects a grant whose documentId does not match the requested one,
     rejects tokens containing whitespace or newlines (header-injection guard), sets
     redirect: "error", and refuses any response that does not carry Cache-Control: no-store, so a
     cacheable response is never treated as a private document.
157. No response yet on the SEN-0012 P1 escalation (#182) or on the protection re-baseline question.
     Wall scope unchanged: 20 routes across 5 pages still shadowed (assessment, blueprint, media,
     questions, telegram, tracker, agreements) plus the PUT/DELETE verb gap.

## 2026-07-31T13:30Z, Care rail audited fail-closed as the lane begins building Care shells

158. #201 leases the Care pending shells, so Codex has moved from the wall to Care rather than
     finishing the remaining 20 walled member routes. Audited the Care rail now, before shells land,
     because it is the highest-stakes surface in the repo (prescriptions, pharmacy, intake).
159. FAIL-CLOSED CONFIRMED on production, every contract path, unauthenticated:
       GET  /api/care/status         200  {"state":"disabled","enabled":false}  honest capability report
       GET  /api/care/eligibility    503  care_disabled
       POST /api/care/consents       503  care_disabled
       GET  /api/care/intake         503  care_disabled
       GET  /api/care/appointments   503  care_disabled
       GET  /api/care/reviews        503  care_disabled
       GET  /api/care/prescriptions  503  care_disabled
       GET  /api/care/audit/access   503  care_disabled
     No clinical data, no route enumeration beyond the published contract, no 500s.
160. INDEXABILITY CONFIRMED: /care, /care/prescriptions and /care/eligibility all serve
     x-robots-tag: noindex, nofollow, applied by carePageGate before anything renders.
161. APPARENT ANOMALY RESOLVED AS MY OWN ERROR. GET /api/care/consents returns a bare 404 while every
     sibling returns 503, which reads like an unregistered route or a contract mismatch of the kind
     that broke Xenios30. It is neither: CARE_ROUTE_CONTRACTS.consents is registered as a POST
     (eligibility-routes.ts:162), so a GET is correctly Not Found. POST returns the same 503
     care_disabled as its siblings. Verified before filing. RULE: a 404 on a contract path is not
     evidence of a missing route until the VERB has been checked.
162. Design note worth recording: server/care/index.ts registers only two live routes, status and an
     audit permission probe. Every clinical module is exported but not wired, so the clinical
     surface area currently reachable is deliberately near-zero. That is the right posture while the
     capability is disabled.
163. REINFORCES SEN-0022. Care pages and research pages both carry noindex; /admin still does not.
     That makes /admin the single outlier across all three restricted surfaces, which strengthens
     the case for the header rather than leaving it as an isolated nit.

## 2026-07-31T16:50Z, live verification of the merges, and a correction to my own bundle audit

164. PR #208 (CI zone gate) verified on a real pull request. Tests, typecheck and build all SUCCESS;
     the zone job FAILS, flagging EXACTLY ONE path, .github/workflows/core-site-zone-gate.yml, which
     is the documented .github contradiction. Its two sibling files classified correctly and passed:
     scripts/acceptance/verify-changed-file-zones.mjs as infrastructure, server/core-site-zone-gate.test.ts
     as a reported test. No false positive on either. The gate does what it claims on real input.
165. #163 VERIFIED LIVE ON PRODUCTION by content, not by timing. All four strings it introduced are
     present in the deployed bundle: "Your cart is empty" (Cart, Checkout, kit chunks),
     "There is nothing to check out" (Checkout-D8S3VE0_.js), "it will wait for you here" and
     "Browse the catalog and add a product" (Cart-BZdQhpPd.js). Production also redeployed: the main
     bundle fingerprint moved from index-Cb1K3J51.js to index-CSrV0jnb.js, and uptimeSeconds 5638 at
     16:44Z puts process start near 15:10Z, minutes after the #163 merge. The fingerprint and string
     evidence is what establishes it; the timing alone would not have.
166. CORRECTION TO MY OWN EARLIER AUDIT, and it matters because I called it complete.
     At 11:35Z I reported the static-bundle catalog check as "verified COMPLETELY rather than
     partially", stating I had extracted "all 13 lazy-chunk names" and "fetched every one", 14 files
     in total. That was WRONG. The main bundle references 13 chunks, but those chunks reference
     further chunks. A transitive crawl finds 118 chunks totalling 2,077,069 bytes. My scan covered
     14 of 118, roughly 12 percent of the bundle, and I described it as exhaustive.
167. I found this only because a one-level crawl made #163 look UNDEPLOYED: two of its four strings
     were missing from the 14 files I had. Rather than report "not deployed" I widened the crawl,
     which both corrected that conclusion and exposed the audit error underneath it.
168. RE-RAN THE CATALOG SCAN AT FULL COVERAGE. 48 catalog display names against all 118 chunks:
     ZERO matches. Structural markers: semaglutide, tirzepatide, BPC-157, retatrutide, mg/mL all
     absent; only the generic words "peptide" and "vial" appear, in 2 chunks each. So the VERDICT IS
     UNCHANGED, the directive's static-bundle clause passes, but it now rests on 118 chunks instead
     of 14. The earlier answer was right by luck of sampling, not by method.
169. RULE, a sharper version of the one at entry 102: a bundle crawl must be TRANSITIVE. Chunks
     reference chunks. Enumerating only what the entry bundle names covers a small fraction of what
     is publicly fetchable, and any "no leak found" conclusion drawn from it is unsupported.

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

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

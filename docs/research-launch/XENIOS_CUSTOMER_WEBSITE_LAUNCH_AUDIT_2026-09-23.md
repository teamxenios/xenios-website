# Xenios customer website launch audit — 2026-09-23

## Scope and immutable source

- Source branch: `codex/xenios-checkout-privileged-authority-repair-20260923`
- Source commit: `e06b155489577287f4152a05e21b2f1833252fc5`
- Source tree: `f6eb2ae53c6e464a4078c081e51f2bdb6b2740ae`
- Candidate branch: `codex/xenios-health-launch-20260923`
- Candidate worktree: `C:\Users\sboad\.codex\worktrees\xenios-health-launch`
- Production mutation: none
- Checkout authority/security/persistence mutation: none; native checkout remains dark by default

The candidate was created directly from the supplied source commit. The source checkout was not edited, merged, reset, or cleaned.

## Executive result

The public Health gateway, Care request journey, Research orientation, Research ordering hub, account entry, recovery, quality, testing, documents, support, and policy orientation are coherent and professionally presented. The candidate removes several customer-trust contradictions that described the public Care routing request as a clinical intake or claimed nationwide availability without a live authoritative check.

Three launch limitations remain deliberate and fail closed:

1. The public Research storefront implementation is not mounted. Catalog access is available only through the authorized Early Access and member surfaces; direct public catalog URLs remain unavailable.
2. Open Research application/signup is held until approved legal document versions exist. Approved applicants can still claim an account through the controlled emailed-status flow.
3. Native direct checkout remains dark. Assisted ordering is the customer continuation for Research requests; provider-governed items route to Care.

These limitations must not be bypassed in the website layer because catalog visibility, legal consent, and payment capability belong to their server authorities.

## Customer route audit

| Surface | State | Customer-facing result |
| --- | --- | --- |
| `/` | PASS | Corporate Xenios site; Health is discoverable from the primary navigation. |
| `/health` | PASS | Primary Care + Research gateway with clear separation, professional long-form presentation, and working next-step links. |
| `/research` | PASS | Same primary Health gateway, with Research-specific navigation and boundaries. |
| `/research/access-hub` | PASS | Clear Care, Research, organization, partner, affiliate, supplier, and support routing. Care now starts with the truthful nonclinical request. |
| `/research/order` | PASS | Explicit ordering choices: Early Access, account, order tracking, assisted/volume requests, organizations, Care, and support. |
| `/research/early-access` | PARTIAL | Passwordless/open-access posture is presented honestly; availability and downstream actions remain server-authoritative. |
| `/research/early-access/order-request` | SOURCE / TEST PASS; API BROWSER UNVERIFIED | Real assisted request, confirmation, and status journey, independent of native direct checkout. The local static browser run could not exercise its API write. |
| `/research/catalog` and public detail URLs | BLOCKED | Components exist, but client and server routes are intentionally unmounted. Publication requires an explicit authority decision and production approval. |
| `/research/member/catalog/*` | PARTIAL | Authenticated routes exist; display and scope remain server controlled. |
| `/research/sign-in` | PASS | Supabase password sign-in, server principal verification, safe return routing, and recovery-session refusal. |
| `/research/reset-password` | PASS | Generic request response, bounded recovery, strong password floor, session cleanup, and safe continuation. |
| `/research/apply` | BLOCKED | Honest legal-pending state. It does not collect consent against draft or unapproved documents. |
| Approved-link account claim | PASS | Account creation occurs only for a valid, active approved claim token. |
| `/research/account/*` | PASS | Authenticated customer portal with server verification and inactive-state routing. |
| `/research/quality`, `/testing`, `/documents`, `/lots/:lotCode` | PASS | Evidence-aware quality, testing, document, and lot-verification orientation without inventing records. |
| `/research/about`, `/how-it-works`, `/faq` | PASS | Care and Research authorities are distinct; the public Care request is no longer mislabeled as clinical intake. |
| `/research/support`, `/contact`, `/policies` | PASS / PARTIAL | Support routes work; policy status is explicit. Draft or unconfirmed legal material is not presented as approved. |
| `/care` | PASS | Human-guided request pathway, separate secure clinical handoff, clinician/pharmacy boundaries, and lifestyle support. |
| `/care/schedule` | PASS | Nonclinical contact and routing form with live fail-closed availability check; no medical free-text collection. |
| `/care/portal` | PARTIAL | Honest handoff/instruction surface; no patient portal is falsely presented as live. |
| Care eligibility, consent, appointments, prescriptions | INTERNAL / PARTIAL | Server-guarded and mostly dark; no static nationwide promise remains. |
| Coaching/lifestyle support | PARTIAL | First-month lifestyle and optional continuation are described within Care; no standalone `/coaching` enrollment route exists. |
| Corporate privacy, terms, disclosures | PASS | Valid for the corporate site; they do not substitute for Research/Care legal authority. |

## Customer journey review

The route and interaction evidence below combines source-authority review with a static production-bundle browser run. API-backed submissions and authenticated state changes were not represented as end-to-end passes because this machine has no local Supabase configuration; those calls failed closed and are listed separately under verification.

### New visitor

`/health` provides two unambiguous choices: start a Care request or explore Research. The Care path collects routing details only. The Research path explains available access modes without exposing protected catalog or payment authority.

### Research customer

Visitors can understand Research, enter Early Access, begin an assisted order request, sign in, recover an account, inspect order-entry choices, and reach support. A direct public storefront remains unavailable by policy and composition. Direct checkout remains dark.

### Care customer

Visitors can review how Care works, reach the nonclinical routing form, and see the separation between Xenios support, licensed clinical review, and pharmacy fulfillment. The local production-bundle run populated the synthetic form fields but correctly kept submission disabled when the live capability check was unavailable; no write was attempted. Availability, treatment, prescription, and serviceability are never promised by static copy.

### Existing account

Supabase is the credential authority. The browser session is revalidated by the server before member data or protected routes are published. Logout clears the local Supabase session and customer state. Recovery tokens cannot enter ordinary member or admin routes.

### Product and order authority

The authoritative reconciliation contains 513 launch units:

- Direct-buy: 0
- Assisted order: 124
- Care-required: 242
- Unavailable: 147

The canonical runtime catalog contains 420 products/variants: 417 bound and 3 unbound. These are different scopes and must not be conflated. Product Control and the canonical catalog remain authoritative; the browser only receives projections.

## Native checkout boundary

No checkout-security architecture was changed in this lane. Native direct commerce stays dark unless independent exact-`true` gates, a non-disabled provider, durable execution/webhook/refund readiness, current product authority, inventory, positive price, and viewer permission all agree. Current reconciliation grants no direct-buy units.

## Copy and usability corrections in this candidate

- Replaced “Begin clinical intake” public CTAs with “Start Care request” and routed them to `/care/schedule`.
- Removed static “available nationwide” claims from public and eligibility pages.
- Explained that the public Care request is nonclinical and that any clinical information belongs in a later authorized secure handoff.
- Removed a static “Care requests are open” claim from the indexed gateway; the request page now owns the live check.
- Removed the unrelated professional-workspace waitlist ribbon and static “today” urgency from Care routes so they cannot be mistaken for live Care availability or pricing.
- Reconciled Early Access first-use copy with the passwordless/open-access posture.
- Removed stale “Have an early access password?” copy from the dormant storefront continuation.

## Local environment validation

Status below describes this worktree and current shell only. It does not assert Render production configuration.

### Required for local full-flow runtime

- `SUPABASE_URL` = MISSING
- `SUPABASE_ANON_KEY` = MISSING
- `SUPABASE_SERVICE_ROLE_KEY` = MISSING
- `SITE_URL` = MISSING

### Build

- External environment variables required = NONE

### Production baseline, locally unavailable

- `ADMIN_EMAIL` = MISSING
- `RESEND_API_KEY` = MISSING
- `FROM_EMAIL` = MISSING
- `REPLY_TO_EMAIL` = MISSING
- `RESEARCH_ACCESS_PASSWORD` = MISSING
- `RESEARCH_SESSION_SECRET` = MISSING

### Catalog and assisted ordering, locally unavailable

- `RESEARCH_MASTER_OFFERINGS_ENABLED` = MISSING
- `RESEARCH_ASSISTED_ORDER_BRIDGE_ENABLED` = MISSING
- `RESEARCH_ASSISTED_ORDER_ADMIN_EMAIL` = MISSING

### Early Access, locally unavailable

- `RESEARCH_EARLY_ACCESS_ENABLED` = MISSING
- `RESEARCH_EARLY_ACCESS_OPEN_ACCESS` = MISSING
- `RESEARCH_EARLY_ACCESS_SESSION_SECRET` = MISSING
- `RESEARCH_EARLY_ACCESS_OWNER_ID` = MISSING
- `RESEARCH_EARLY_ACCESS_REQUIRED_AGREEMENTS` = MISSING

### Optional or deliberately dark, locally unavailable

- `RESEARCH_PUBLIC_STOREFRONT_ENABLED` = MISSING
- `RESEARCH_MASTER_OFFERINGS_DIRECT_COMMERCE` = MISSING
- `NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED` = MISSING
- `PAYMENTS_PROVIDER` = MISSING
- `PAYMENT_PROVIDER` = MISSING
- `STRIPE_PUBLISHABLE_KEY` = MISSING
- `STRIPE_SECRET_KEY` = MISSING
- `STRIPE_WEBHOOK_SECRET` = MISSING
- `RESEARCH_SERVICEABLE_STATES` = MISSING
- `RESEARCH_EARLY_ACCESS_CART_ENABLED` = MISSING
- `EARLY_ACCESS_PAYMENT_INSTRUCTIONS` = MISSING
- `EARLY_ACCESS_PAYMENT_METHOD_REGISTRY` = MISSING
- `CARE_ENABLED` = MISSING
- `CARE_ENABLE_APPROVED` = MISSING
- `TEBRA_SCHEDULING_ENABLED` = MISSING
- `TEBRA_TELEHEALTH_ENABLED` = MISSING

No secret value was printed, copied, or generated. Package publication and inspection occur only from the final committed candidate SHA and are recorded in the exact-SHA handoff.

## Verification evidence

- Required Node: 20.19.0
- Required npm: 10.8.2
- TypeScript check: PASS
- Production build: PASS
- Final changed-surface suites: 69 tests PASS across 6 files
- Auth, authority, checkout-dark, storefront, catalog, and commerce suites: 730 tests PASS
- Catalog reconciler: 11 tests PASS
- Local control cockpit: 11 tests PASS, including live HTTP rejection of alternate Host, invalid Origin/CSRF, unknown actions, source traversal, BOM-safe helper state, and exact JSON API-health detection
- Browser acceptance generated `2026-09-24T00:13:54.733Z`: 20 routes × 3 representative viewports = 60 checks, 0 UI defects, 6 interaction journeys PASS, and 1 Care-submission journey BLOCKED as expected at the local API boundary
- Browser evidence: `C:\Users\sboad\Downloads\XENIOS-LAUNCH\browser-evidence\browser-acceptance.json`, companion Markdown, and screenshots
- Local API boundary observed fail-closed responses for `/api/care/access-request/status`, `/api/config`, `/api/research/early-access/assisted-orders/config`, `/api/research/early-access/session`, `/api/research/me`, and `/api/waitlist/count`

## Remaining launch blockers

1. Approve and publish exact Research application Terms and Privacy versions before opening self-serve application/signup.
2. Decide whether a public Research storefront is authorized. If yes, mount the already-built client/server surfaces and approve its production flag in a separate controlled change. The current homepage policy explicitly forbids a public catalog entry point.
3. Keep native checkout dark until the separate checkout-security lane is complete and Samuel explicitly authorizes an exact candidate SHA.
4. Supply a local non-production environment if full API/auth browser acceptance is required on this machine. The static production-client acceptance intentionally fails API calls closed rather than inventing credentials.

## Explicit non-actions

- No production deploy
- No merge to `main`
- No Render or Supabase mutation
- No database migration
- No token rotation
- No secret output
- No checkout enablement

## Release decision

`READY FOR SAMUEL GO: NO`

`CARE DEPLOYMENT VERIFICATION REQUIRED`: the local production-bundle run proved the Care UI fails closed when its capability API is absent, but this source-only lane did not inspect or mutate the intended deployed environment. The limitation is confirmed local; production impact is unverified.

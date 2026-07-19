# XENIOS RESEARCH
## Competitive Product, Website, Codebase, UI, Security, Content, and Growth Master Guide V1
### Canonical Assessment and Build Direction for Claude Code, Codex, Design, Security, Operations, and Growth

**Founder:** Samuel Boadu  
**Repository:** `teamxenios/xenios-website`  
**Current production surface:** `https://xeniostechnology.com/research`  
**Assessment date:** July 2026  
**Scope:** Xenios Research only  
**Primary benchmarks:** Momentous, Superpower, IM8  
**Adjacent benchmarks:** Function Health, InsideTracker, Seed, Oura  
**Status:** Working canonical guide. This document supersedes older Research UI assumptions wherever they conflict with Samuel's latest decisions.

---

# 0. THE DECISION

The current Xenios Research code has built too much **before member authentication** and too little **after member authentication**.

The present `/research` page is a long marketing page containing the whole-life framework, membership steps, product-category links, a product preview, and multiple calls to action. That is the wrong front door.

The correct architecture is:

```text
Shared Research password
→ minimal private gateway
→ Apply for Membership OR Member Login
```

Then:

```text
Applicant
→ application
→ verified communication
→ human review
→ approval
→ identity and age controls when enabled
→ $50 activation
→ $25 recurring monthly membership
→ secure personal account
→ full private Xenios Research member website
```

The full member website is where the real value belongs:

```text
Whole-Life Blueprint
Products
Peptides
Supplements
Quantum
Systems
Foundations
Protocols
Research Guides
Evidence
Quality
Orders
Subscriptions
Referrals
Store credits
Profile
Privacy controls
Support
```

The shared password is not membership authentication.

The shared password must never unlock the full catalog, member pricing, carts, orders, subscriptions, referrals, or private member data.

---

# 1. EXECUTIVE FINDINGS

## 1.1 What is already strong

The current repository has a useful modern foundation:

- React 19
- Vite
- Express
- TypeScript
- Supabase
- Resend
- Zod validation
- TanStack Query
- Wouter routing
- Helmet
- Vitest
- server-side product pricing
- feature-gated commerce
- a durable notification outbox
- server-side member JWT verification
- no product data in the public client bundle
- privacy-safe response logging for Research APIs
- explicit Research noindex behavior
- a dedicated production session secret
- applicant-status tokens
- referral-ledger foundations
- referral fraud controls
- application state transitions
- admin application review
- security and privacy documentation

These are meaningful foundations. The next move should be a disciplined architectural correction, not another rewrite from zero.

## 1.2 The biggest product problem

The existing route treats a person who knows the shared review password almost like an authenticated member.

After the shared password is accepted, the client loads the complete Research catalog and displays the large Research navigation, product pages, cart, programs, Quantum, supplements, wholesale, and policies.

That does not match the founder vision.

The system needs three distinct trust boundaries:

```text
Boundary 1
Private visitor / invited applicant

Boundary 2
Approved applicant / activation candidate

Boundary 3
Active authenticated member
```

Each boundary needs different permissions, routes, data, navigation, and copy.

## 1.3 The biggest UI problem

The current Research experience uses the same large navigation and footer across nearly every route.

The `/research` route should instead be a focused one-screen access experience.

The member website can have rich navigation after authentication.

## 1.4 The biggest content problem

The current copy mixes four different businesses:

- private whole-life membership
- legitimate nonclinical research-material catalog
- consumer supplements
- future clinical or provider-mediated services

Those lanes cannot be blended casually.

Every page must clearly identify which lane it belongs to:

```text
Membership education
Consumer supplement commerce
Nonclinical research-material information
Professional access
Clinical/provider-mediated service
Quantum qualification
```

## 1.5 The biggest security problem

The shared review gate currently authorizes too much.

Other high-priority gaps include:

- product APIs are not yet active-member-only
- member lookup is based on email instead of the authenticated user ID
- pending members can pass the generic member guard
- claim tokens are long-lived and reusable
- account creation and member-row creation are not atomic
- admin authorization is still a single-email allowlist rather than a proper role system
- Content Security Policy is disabled
- IP extraction and proxy trust need a single hardened implementation
- the shared gate cookie is scoped to the entire domain path
- the product catalog is hardcoded in source code
- product images, variants, evidence, documents, subscriptions, and inventory are not first-class entities

---

# 2. CURRENT CODEBASE MAP

## 2.1 Application shell

Current main application routing:

```text
client/src/App.tsx
```

The main Xenios website remains at `/`.

The entire Research section is lazy-loaded as one React chunk and mounted at:

```text
/research
/research/*
```

This is a good high-level separation, but every Research page is still bundled into one Research chunk.

### Required improvement

Lazy-load Research routes individually:

```text
Gateway
Apply
Sign In
Applicant Status
Activation
Member Shell
Catalog
Product Detail
Systems
Quality
Guides
Referrals
Orders
Subscriptions
Profile
Admin
```

The production build has already warned that the main JavaScript chunk is over 700 KB after minification. Route-level splitting, shared vendor chunks, and image optimization should become explicit performance work.

## 2.2 Research router

Current file:

```text
client/src/research/section.tsx
```

Current routes include:

```text
/research
/research/membership
/research/framework
/research/faq
/research/apply
/research/apply/status
/research/member/welcome
/research/sign-in
/research/professionals
/research/peptides
/research/quantum
/research/supplements
/research/programs
/research/shop
/research/build-a-system
/research/quality
/research/learn
/research/access
/research/wholesale
/research/cart
/research/products/:slug
/research/policies/:policy
```

### Problem

All of these routes currently exist inside one shared-password shell.

### Required route correction

#### Private visitor routes

```text
/research
/research/apply
/research/sign-in
/research/application/status
/research/support
```

#### Publicly reachable legal and trust routes

These should not require a secret merely to read legal terms:

```text
/research/privacy
/research/terms
/research/trust
/research/security
/research/accessibility
```

They may remain `noindex` while the private beta is active.

#### Approved applicant routes

```text
/research/activate
/research/account/claim
```

#### Active member routes

```text
/research/member
/research/member/blueprint
/research/member/products
/research/member/products/peptides
/research/member/products/supplements
/research/member/products/quantum
/research/member/products/:slug
/research/member/systems
/research/member/systems/:slug
/research/member/guides
/research/member/guides/:slug
/research/member/evidence
/research/member/quality
/research/member/orders
/research/member/orders/:id
/research/member/subscriptions
/research/member/referrals
/research/member/credits
/research/member/profile
/research/member/privacy
/research/member/support
```

#### Professional and wholesale routes

```text
/research/professionals
/research/wholesale
```

These should have separate verification and entitlement rules.

## 2.3 Research layout

Current file:

```text
client/src/research/layout.tsx
```

Current behavior:

- displays the shared password page
- after password acceptance, renders a sticky header
- renders eleven navigation items
- displays an Apply button
- displays a shopping-bag button
- renders a mobile horizontal-scrolling navigation
- renders a three-column footer
- loads the same chrome around every Research page

### Problems

1. The password page describes an internal review environment rather than a premium private club.
2. Shared-password access becomes the authorization layer for the entire Research site.
3. The gateway is visually and technically coupled to the full catalog.
4. The full navigation appears before personal member authentication.
5. The cart is visible before active-member authorization.
6. The mobile navigation becomes a long horizontal strip.
7. The footer contains internal access and wholesale pathways that should not appear on the minimal gateway.

### Required refactor

Split the layout into four components:

```text
ResearchReviewGate
ResearchGatewayLayout
ResearchApplicantLayout
ResearchMemberLayout
```

`ResearchReviewGate` should only establish that a visitor may see the private gateway and application.

`ResearchGatewayLayout` should be minimal.

`ResearchApplicantLayout` should support application, status, and activation.

`ResearchMemberLayout` should require a verified active member and then expose the full navigation.

## 2.4 Research core provider

Current file:

```text
client/src/research/core.tsx
```

Current behavior:

```text
GET /api/research/me
→ if shared password cookie is valid
→ GET /api/research/catalog
→ mark gate open
→ show complete Research experience
```

### Architectural conflict

The shared password currently causes the client to load the catalog.

### Required providers

Create:

```text
ResearchReviewAccessProvider
ResearchMemberAuthProvider
ResearchCatalogProvider
ResearchCartProvider
```

#### Review access provider

May know only:

```text
configured
reviewGateOpen
```

It must not fetch products.

#### Member-auth provider

May know:

```text
signedIn
memberId
membershipStatus
activationStatus
entitlements
MFA state
session state
```

#### Catalog provider

Must only load after the server confirms:

```text
member.status === active
membership subscription === active
required entitlement === present
```

#### Cart provider

May retain non-sensitive draft product IDs locally, but the server must always recalculate:

- availability
- eligibility
- current price
- quantity limits
- shipping
- discount
- credit
- tax
- subscription terms

## 2.5 Product types

Current file:

```text
shared/research/types.ts
```

Current product fields are too small for the intended business.

Current model includes:

```text
slug
name
category
lane
status
price
summary
description
highlights
tags
specifications
research context
quality notes
source URL
featured
badge
sort order
```

### Missing product fields

Add first-class contracts for:

```text
product ID
brand
product family
goal categories
member visibility
purchase eligibility
member price
subscription price
compare-at price
variant IDs
sizes
flavors
formats
inventory state
reserved inventory
fulfillment owner
shipping temperature
shipping class
quantity limit
manual-review threshold
product image set
image rights
documentation state
COA / lot documents
evidence rating
claim status
warnings
contraindication categories
ingredient list
supplement facts
allergen information
storage
replenishment interval
subscription eligibility
system compatibility
professional-only reason
state availability
country availability
launch approval
version
published at
archived at
```

## 2.6 Product data

Current file:

```text
server/research/products-data.ts
```

Strengths:

- product data stays server-side
- browser prices are never trusted
- items default to a controlled status
- research limitations are explicit
- primary sources are attached

Problems:

- products and prices are hardcoded in code
- there is no admin publishing workflow
- no image records
- no product revisions
- no inventory
- no supplier-cost data
- no margin data
- no subscription data
- no member-entitlement rules
- no lot-level document records
- no commercial authorization records
- no brand/image-rights records
- product wording changes require deployment
- dozens of new supplements will make the file difficult to govern

### Required architecture

Move canonical product records into Supabase.

Keep code types and seed fixtures, but make production product publishing database-driven.

Use a publication model:

```text
draft
legal_review
quality_review
commercial_review
approved
published
paused
archived
```

Every published revision should be traceable.

## 2.7 Research server gate

Current file:

```text
server/research/index.ts
```

Strengths:

- signed HTTP-only cookie
- dedicated session secret
- fail-closed configuration
- Secure and SameSite cookie attributes
- server-computed prices
- explicit commerce flags
- no catalog in public JavaScript
- noindex server header

Problems:

1. The review cookie authorizes every gated Research API.
2. The cookie path is `/`, broader than necessary.
3. The review password limiter is process-local.
4. IP extraction reads forwarded headers directly.
5. A shared review password should not authorize catalog or commerce.
6. The order API belongs behind active-member authorization.
7. The order contract predates the approved member architecture.
8. Review access and personal member access are conflated.
9. The shared-password session cannot be revoked individually.
10. There is no review-access version to invalidate all cookies except by rotating the signing secret.

### Required server split

```text
/api/research/review/access
/api/research/review/me
/api/research/review/logout

/api/research/applications
/api/research/application/status

/api/research/member/me
/api/research/member/catalog
/api/research/member/products/:slug
/api/research/member/orders
/api/research/member/subscriptions
/api/research/member/referrals
```

Use:

```text
requireReviewAccess
requireMember
requireActiveMember
requireProfessional
requireSuperAdmin
```

The shared-password middleware must never satisfy `requireMember`.

## 2.8 Member authentication

Current files:

```text
client/src/research/pages/SignIn.tsx
server/research/members.ts
```

Strengths:

- Supabase password sign-in
- server validates the Supabase JWT
- no UI-only member authorization
- signed emailed token is required to claim an account
- referral dashboard returns aggregates rather than invitee identities

Problems:

1. Member authorization resolves the member by email instead of `auth_user_id`.
2. The generic member guard blocks only `closed`, so `pending_activation` may access member endpoints.
3. There is no dedicated active-member guard.
4. Account claim creates the Supabase user before creating the member row.
5. A member-row failure can leave an orphan authentication user.
6. Claim tokens are not explicitly single-use.
7. The signed token is treated as complete email ownership proof for 90 days.
8. No forgot-password UI exists.
9. No MFA enforcement exists.
10. No passkey support exists.
11. No device-session view exists.
12. No session revocation UI exists.
13. Successful sign-in does not redirect to a true member dashboard.
14. The existing “member welcome” page is a static activation-pending page.

### Required changes

- resolve members by `auth_user_id`
- implement `requireActiveMember`
- use an atomic server procedure or compensation cleanup for account claim
- add a one-time claim-token record with a hash and consumed timestamp
- separate status, resubmission, claim, and activation token purposes
- shorten token life by purpose
- add forgot-password flow
- require admin MFA
- add member MFA / passkey roadmap
- redirect active members to `/research/member`
- redirect pending members to `/research/activate`
- block catalog APIs for pending members

## 2.9 Application

Current file:

```text
client/src/research/pages/Apply.tsx
```

Strengths:

- concise five-stage flow
- no payment
- no medical history
- applicant privacy fix for resubmission
- honeypot
- age confirmation
- structured acknowledgments
- secure-status email language
- server-side Zod validation

Problems:

- selected controls use black backgrounds and white text
- Samuel wants selected text and accents to remain purple
- validation does not automatically focus the first invalid field
- phone is optional and unverified
- no short data-use statement appears before entry
- applicants can type highly sensitive health details into free text
- no warning is shown beside free-text fields
- application-status delivery state is not clearly connected to the outbox status
- the progress indicator can become busy on small screens
- no save-and-return design exists
- referral input needs privacy-safe validation
- identity verification belongs later, not in this form

### Required UI corrections

Use a semantic selected state:

```text
purple text
purple border
soft purple background
check icon or other non-color indicator
aria-pressed
visible keyboard focus
```

Add:

```text
Please do not submit medical records, government identification, payment information, or emergency health information in this application.
```

Add word counts and sensitive-data guidance to free-text fields.

## 2.10 Admin authorization

Current file:

```text
server/routes.ts
```

Current Research admin authorization verifies:

```text
valid Supabase JWT
+
email equals ADMIN_EMAIL
```

This is better than a client-side check but is not the final role architecture.

### Required architecture

Create database-backed roles:

```text
super_admin
application_reviewer
member_support
order_operations
finance
privacy_officer
security_admin
content_editor
clinical_coordinator
```

Bootstrap:

```text
samuel@xeniostechnology.com
→ super_admin
```

Require MFA for privileged access.

Audit:

- role grant
- role removal
- application viewing
- exports
- refund
- credit adjustment
- member suspension
- identity override
- product publishing
- pricing changes
- security changes

Review and retire the legacy `ADMIN_API_KEY` path wherever it is no longer necessary.

## 2.11 Security headers and server setup

Current file:

```text
server/index.ts
```

Strengths:

- Helmet
- PII response logging suppression
- separate server and client build
- feature diagnostics without secret values

Major issue:

```text
contentSecurityPolicy: false
```

### Required hardening

Implement a real CSP in report-only mode first, then enforce.

Include controls for:

```text
default-src
script-src
style-src
img-src
font-src
connect-src
frame-src
frame-ancestors
object-src
base-uri
form-action
upgrade-insecure-requests
```

Also configure:

- explicit `trust proxy` for Render
- one canonical `req.ip` helper
- body-size limits
- stricter error serialization
- HSTS verification
- Permissions Policy
- Referrer Policy
- cache rules for secure pages
- no third-party scripts on status, identity, privacy, or admin pages
- dependency and secret scanning
- security.txt
- rate limits for authentication, application, status resend, privacy requests, and high-risk admin actions

---

# 3. CURRENT PAGE-BY-PAGE UI AND COPY ASSESSMENT

## 3.1 `/research` — Current Overview

Current content:

- “Your health is not a stack. It is a system.”
- membership explanation
- context section
- whole-life domains
- six membership steps
- evidence links
- product ecosystem
- featured catalog
- closing application CTA

### Decision

Remove this long page from the gateway.

Do not delete all of the content.

Redistribute it:

```text
Whole-life framework
→ member Blueprint education

Membership steps
→ application and activation pages

Evidence language
→ Quality and Evidence

Product ecosystem
→ member Products hub

Featured catalog
→ member dashboard and product catalog

Closing CTA
→ minimal gateway
```

## 3.2 `/research/membership`

Current strengths:

- clear $50 activation and $25 monthly copy
- no annual plan
- identifies who should apply
- states that access is not guaranteed

Current weaknesses:

- claims ongoing Blueprint updates, priority support, and future access that may not be operational
- overly long for a pre-application route
- repeats gateway messaging
- no direct comparison of what exists now versus coming later

### Recommendation

Turn it into a concise application explainer or modal.

Show:

```text
Apply free
Human review
$50 activation after approval
$25 monthly membership
What is included today
What is coming later
Cancellation
Privacy
```

Do not list a benefit as active until the product delivers it.

## 3.3 `/research/framework`

The content is thoughtful and strategically important.

It should not dominate the front door.

Move it into:

```text
/research/member/blueprint/about
```

A condensed preview may appear during application to explain the philosophy.

## 3.4 `/research/faq`

Current strengths:

- readable
- accessible accordion
- addresses cost, application, Blueprint, evidence, Quantum, professionals, and wholesale

Current risks:

- “used for two purposes only” is too narrow for the actual data flows
- “never sold” should live in an approved privacy promise, not an oversimplified FAQ answer
- the account-update and deletion language describes features that may not yet exist
- research-material definitions and wellness-membership copy create tension
- support-only cancellation is less sticky and less user-friendly than self-service cancellation

### Required FAQ categories

Model categories after high-performing health platforms:

```text
Membership
Application
Activation and billing
Accounts and security
Products
Supplements
Research materials
Quantum
Systems and subscriptions
Orders and shipping
Referrals and store credit
Privacy and data
Professional access
Support
```

## 3.5 `/research/sign-in`

Current strengths:

- clean form
- server-verified member session
- honest account-claim language

Required additions:

- forgot password
- show/hide password
- remember this device
- passkey and MFA readiness
- account-claim help
- application-status link
- support link
- redirect based on member status
- session-security notification
- no full Research navigation around the sign-in page

## 3.6 `/research/member/welcome`

Current page is a static “activation is opening soon” state.

Required replacement:

```text
Approval confirmed
Identity/age status
Membership covenant
$50 activation
$25 monthly billing
Payment summary
Next billing date
Cancellation disclosure
Create account / continue
Support
```

The page must be bound to the approved applicant, not simply reachable after the shared password.

## 3.7 `/research/peptides`

Current page is only a heading, notice, and generic product grid.

Required member experience:

- goal filters
- research-material class filters
- availability filters
- evidence status
- documentation status
- professional-only markers
- original product images
- saved items
- comparison
- related Guides
- related Systems
- clear nonclinical boundary

Do not use goal categories to imply human outcomes for nonclinical research materials.

## 3.8 `/research/supplements`

The current page exposes internal operational language:

```text
“The supplement catalog is ready for the wholesale list Mitch is sourcing.”
```

That should never be customer-facing.

Replace it with member-facing language.

Commercial partner names, internal sourcing status, and unfinished implementation notes belong in admin.

Required catalog architecture:

- curated top 30
- goal-first filters
- brand filters
- format
- dietary attributes
- certification
- subscription eligibility
- member price
- related system
- evidence and ingredient details
- authorized seller status
- fulfillment status

## 3.9 `/research/quantum`

Current strengths:

- separate page
- separate access path
- documentation language
- gated status

Current problems:

- “Backend by Quantum” is internal operational language
- “Quantum-held inventory” should not be public copy
- placeholder card has no actual visual identity
- “foundational platform” sounds like an efficacy claim without context
- it behaves like an ordinary product/cart path even though future operations require qualification, provider, location, scheduling, and administration

Required member flow:

```text
Learn
→ review verified documentation
→ qualification
→ provider/location confirmation
→ session selection
→ deposit or payment
→ scheduling
→ follow-up
```

## 3.10 `/research/programs`

The founder taxonomy has changed.

Primary names:

```text
Systems
Foundations
Protocols
```

“Programs” may still describe structured educational experiences, but it should not be the primary catalog category.

## 3.11 `/research/shop`

Current strengths:

- search
- category filters
- server-fed catalog

Current weaknesses:

- shared-password visitor can browse
- filters are too shallow
- active state is black/white instead of purple
- categories do not reflect the new taxonomy
- no product images
- no goal filters
- no eligibility filters
- no subscription filters
- no saved products
- no evidence/quality signals
- no member-personalized ordering

Replace with:

```text
/research/member/products
```

## 3.12 Product detail

Current strengths:

- specifications
- limitations
- source
- quality notes
- server price
- status
- no browser-trusted price

Current weaknesses:

- image area is only text on a gray card
- one source URL is insufficient for an evidence system
- no image gallery
- no brand
- no variant selection
- no subscription choice
- no delivery timing
- no inventory state
- no member eligibility state
- no related Guide
- no system context
- no COA/lot records
- no “what we know / what remains uncertain”
- no published-revision date
- no support path
- no product comparison
- research and consumer templates are too similar

## 3.13 Quality

Quality is one of the strongest content foundations.

Expand it into a complete trust system:

```text
The Xenios Standard
Supplier qualification
Identity
Purity
Assay
Sterility where claimed
Endotoxin where applicable
Stability
Chain of custody
Storage
Fulfillment
Recall
Lot lookup
Document definitions
What a COA proves
What a COA does not prove
```

## 3.14 Cart

The existing cart is an early prototype.

The final member cart must handle:

- member authorization
- product eligibility
- current price
- store credits
- subscription terms
- split shipments
- taxes
- shipping
- quantity review
- product-lane separation
- processor checkout
- order idempotency
- server inventory reservation
- refund policy
- recurring disclosure

Quantum must remain outside ordinary shipped-product checkout.

---

# 4. COMPETITOR DEEP DIVE

# 4A. MOMENTOUS

## 4A.1 Core positioning

Momentous positions itself as a high-trust performance and health brand built around:

```text
Science
Sourcing
Certification
```

It repeatedly uses those pillars across homepage, product pages, guides, quality, and expert content.

The brand does not merely say “premium.”

It explains the standard that makes the products premium.

## 4A.2 Main page system

Momentous currently uses major page families such as:

```text
Homepage
Shop All
Shop by Goal
Shop by Category
Stacks / Routines
Product Detail
The Momentous Standard
Product Success Guides
Routine Guide
Certificate of Analysis
Subscriptions
Experts
Blog
Help Center
Wholesale
Affiliate
Corporate Wellness
Account
```

Goal categories include areas such as:

```text
Athletic Performance
Cognitive Function
Sleep
Hormone Support
Foundational Health
```

## 4A.3 Product page anatomy

A strong Momentous product page commonly includes:

1. Multiple high-quality product and lifestyle images.
2. Clear product name.
3. Serving count.
4. Per-serving price.
5. Rating and review volume.
6. One-time purchase.
7. Subscribe-and-save.
8. First-order discount.
9. Recurring-order discount.
10. Delivery-frequency options.
11. Out-of-stock protection.
12. Cancellation or rescheduling language.
13. Key benefits.
14. Formula highlights.
15. Supplement facts.
16. How to use.
17. Certification.
18. Frequently purchased together.
19. Expert or customer context.
20. Research citations.
21. Reviews.
22. Shipping and guarantee.

## 4A.4 Subscription system

Momentous makes subscription flexibility part of the product value:

```text
1 month
2 months
3 months
skip
swap
reschedule
cancel
pre-shipment reminders
```

The lesson for Xenios is not simply “offer a subscription.”

The lesson is:

> Make the subscription feel controllable, transparent, and compatible with real life.

## 4A.5 Product guidance

Momentous directly answers:

```text
What should I take?
```

through a Guide and Product Success Guides.

This lowers decision friction and increases system sales.

For Xenios, the equivalent should be:

```text
Find your Foundation
Explore by goal
See what belongs together
See what should not be duplicated
Connect purchases to Blueprint actions
```

## 4A.6 Quality

Momentous turns quality into visible product content:

- sourcing
- independent certification
- lot-specific COA access
- testing descriptions
- expert standards
- transparent ingredients
- no proprietary blends

### Xenios lesson

Quality cannot be one generic page.

It must be visible on:

- catalog cards
- product pages
- lot pages
- system pages
- order history
- admin

## 4A.7 Wholesale and professionals

Momentous provides:

- wholesale application
- approval
- agreement
- account setup
- wholesale-only pricing
- passwordless access
- partner support
- corporate wellness
- affiliate partnerships

### Xenios lesson

Professional, affiliate, wholesale, and consumer membership should be separate account types with separate terms and permissions.

## 4A.8 What Xenios should borrow

- goal-first navigation
- science/sourcing/certification framework
- product success guides
- lot-specific quality access
- high-quality product imagery
- routine builder
- flexible subscriptions
- expert routines
- product pairing
- wholesale application
- member account controls

## 4A.9 What Xenios should avoid

- copying its exact language
- treating third-party certification as universal
- claiming a product is safe merely because a certificate exists
- overwhelming the user with dozens of equal-priority products
- publishing supplier claims without Xenios review

---

# 4B. SUPERPOWER

## 4B.1 Core positioning

Superpower leads with membership, diagnostics, and a clear action journey.

Products appear after the member understands their baseline and plan.

Its main promise is not “buy products.”

It is:

```text
Test
Understand
Build a protocol
Access what you need
Track
Retest
```

## 4B.2 Main page system

Superpower uses pages and content families such as:

```text
Homepage
How It Works
What We Test
Membership
Reviews
FAQs
Marketplace
Supplements
Peptides
Gift
Comparisons
Blog
Teams
Member Login
Privacy
Medical Privacy
Terms
```

Its FAQ is organized by:

```text
Membership
Lab Testing
Concierge
Payments
Marketplace
Privacy and Security
```

## 4B.3 Journey design

Superpower repeatedly explains a simple sequence:

```text
baseline
results
action plan
access
ongoing improvement
```

### Xenios lesson

Xenios needs an equally simple member journey:

```text
Understand your life
Build your Blueprint
Choose a Foundation
Use the system
Review and evolve
```

## 4B.4 Marketplace strategy

The Superpower marketplace is not the hero.

It is the next action after the member has data and a protocol.

That increases trust and reduces the feeling that recommendations exist only to sell products.

### Xenios lesson

The Whole-Life Blueprint and membership relationship must lead.

Products support the plan.

The page must never feel as if the application is merely a gate to a peptide store.

## 4B.5 Trust and privacy

Superpower makes privacy and security conversion content.

It discusses:

- encryption
- role-controlled access
- health-data ownership
- export
- correction
- deletion
- incident response
- clinical governance
- privacy rights

### Xenios lesson

Trust pages should be designed with the same care as product pages.

Do not add badges before the actual legal and technical state supports them.

## 4B.6 Reviews and comparison pages

Superpower uses:

- journey-based reviews
- comparison pages
- gift pages
- free educational downloads
- condition or audience landing pages
- repeated explanations of what membership includes

### Xenios lesson

Future acquisition surfaces can include:

```text
Why private membership
Why systems beat random stacks
Xenios versus an open storefront
Xenios versus buying from multiple vendors
Gift a membership
For athletes
For founders
For professionals
For recovery
```

These should be built only after the core private member product is real.

## 4B.7 What Xenios should borrow

- membership-first hierarchy
- simple journey
- dashboard as the product
- marketplace after plan
- privacy as conversion content
- organized FAQ
- clear member inclusion list
- reviews focused on transformation process
- data ownership controls
- gift and comparison architecture later

## 4B.8 What Xenios should not copy yet

- clinical or prescription positioning
- healthcare-provider claims
- HIPAA claims
- lab-testing promises
- care-team promises
- personalized clinical recommendations
- Rx and peptide access language

Those require a real provider, pharmacy, legal, licensing, and operational pathway.

---

# 4C. IM8

## 4C.1 Core positioning

IM8 concentrates enormous storytelling around a small product universe.

Its strongest techniques are:

```text
Daily ritual
Expert credibility
Luxury product imagery
Welcome kit
Subscription value
Transformation program
Science page
Quality page
Ingredient depth
Strong guarantee
Ambassador distribution
Audience-specific landing pages
```

## 4C.2 Main page system

IM8 currently uses page families such as:

```text
Homepage
Essentials Product
Longevity Product
Beckham Stack
Science
Research
Ingredients
Quality
About
Welcome
FAQ
Transformation Program
Ambassador Program
Audience Pages
Athlete Pages
Clinician Pages
Cart
Account
```

## 4C.3 Product page anatomy

A flagship IM8 product page commonly contains:

1. Large image gallery.
2. Product rating.
3. purchase and serving statistics.
4. Product identity.
5. Flavor selection.
6. One-time or subscription choices.
7. Monthly versus quarterly option.
8. Price per day.
9. Best-value label.
10. Welcome-kit value.
11. Guarantee.
12. Free shipping.
13. Transformation program.
14. Expected-experience claims.
15. Ingredient breakdown.
16. Formula comparisons.
17. Stack comparisons.
18. Cost comparison.
19. Clinical trial explanation.
20. Third-party testing.
21. Athlete and expert proof.
22. How to use.
23. Tasting notes.
24. FAQs.
25. Cross-sell.

## 4C.4 Ritual and onboarding

IM8 makes the first shipment feel like the beginning of a ritual.

It uses:

- welcome kits
- refill systems
- a 90-day transformation program
- expert masterclasses
- daily habit language
- member gifts

### Xenios lesson

Xenios can create a premium Founding Member Kit without copying IM8.

Potential contents:

```text
Private member card
Xenios welcome letter
Whole-Life Blueprint notebook or digital guide
Storage and documentation guide
Product-reference card
Referral invitation card
Member support instructions
```

Do not include administration equipment or imply medical use.

## 4C.5 Bundles

IM8 strongly sells:

```text
Essentials
Longevity
The complete stack
```

It shows:

- separate value
- combined value
- price per day
- monthly and 90-day options
- gifts and program access

### Xenios lesson

Each Xenios System should have:

```text
Who it is for
What it includes
Why the items belong together
What can be swapped
What is optional
What is excluded
30 / 60 / 90-day options
Savings
Blueprint actions
Education
Subscription behavior
```

## 4C.6 Ambassador system

IM8 provides:

- public ambassador application
- commission
- audience discount
- links and codes
- free products
- early access
- events
- tier progression
- earnings calculator

### Xenios lesson

Member referrals and public affiliates are different programs.

Build member store credit first.

Launch cash affiliates only after:

- product eligibility
- claims controls
- contracts
- fraud controls
- tax onboarding
- payment processing
- monitoring
- training

## 4C.7 What Xenios should borrow

- rich product image systems
- a focused product hierarchy
- premium ritual
- welcome kit
- 30/90-day value ladders
- strong bundle presentation
- science and quality hubs
- expert storytelling
- transformation education
- ambassador dashboard patterns
- responsive long-form product storytelling

## 4C.8 What Xenios should avoid

- aggressive countdowns
- unsupported outcome percentages
- universal claims
- replacing medical nuance with celebrity trust
- overstating “clinical dose”
- giant comparison claims without documentation
- dark-pattern subscription urgency
- using “feel it or refund” for products where outcomes are uncertain

---

# 4D. ADJACENT BENCHMARKS

## Function Health

Useful patterns:

- simple “how it works”
- health-history intake
- test scheduling
- member dashboard
- repeated testing cadence
- practitioner pathway
- transparent membership inclusions

Xenios lesson:

- show the member’s next step
- make time-based progress visible
- build professional-sharing carefully

## InsideTracker

Useful patterns:

- membership with or without new testing
- upload existing data
- wearable connection
- action-plan recommendations
- member-only repeat tests
- multiple purchase bundles

Xenios lesson:

- let members bring existing information later
- connect every data source to an actionable plan
- support retesting or re-evaluation rather than one-time delivery

## Seed

Useful patterns:

- focused catalog
- product-specific science
- rigorous testing language
- refillable welcome kit
- monthly refills
- subscription help
- practitioner resources

Xenios lesson:

- fewer, better-explained products beat an uncontrolled catalog
- make testing and product design understandable
- create a premium first shipment and lower-waste refill system where operationally appropriate

## Oura

Useful patterns:

- recurring membership tied to continuing insight
- session and data controls
- export
- deletion
- privacy education
- health-record import with explicit consent
- active-member features

Xenios lesson:

- the monthly fee must unlock continuing value
- privacy controls should be part of the member dashboard
- member data should remain portable

---

# 5. REQUIRED XENIOS RESEARCH PAGE SYSTEM

# 5.1 Minimal private gateway

## Route

```text
/research
```

## Goal

Make the user choose one of two clear actions:

```text
Apply for Membership
Member Login
```

## Exact recommended structure

```text
XENIOS RESEARCH

PRIVATE MEMBERSHIP

A private wellness and research environment for approved members.

[ Apply for Membership ]
[ Member Login ]

Application Status
Privacy
Terms
Support
```

## Visual specification

- one viewport
- no product cards
- no catalog
- no standard Research navigation
- no shopping bag
- no long footer
- no multiple sections
- no wholesale
- no product claims
- no giant marketing essay
- center or left-center alignment
- maximum content width around 460–560 px
- subtle black, warm white, or dark-violet atmosphere
- minimal purple glow
- highly visible keyboard focus
- one-column mobile
- two buttons may sit side by side on wider screens
- use `min-height: 100svh`
- respect safe-area insets
- no forced scrolling at standard desktop sizes

# 5.2 Application

Must include:

- short explanation
- five-minute expectation
- privacy notice
- required versus optional fields
- age attestation
- individual/professional choice
- referral field
- acknowledgment summary
- editable review
- secure submit
- accurate email state
- status-link resend
- support

Do not collect ID here.

# 5.3 Member login

Must include:

- email
- password
- show password
- forgot password
- account-claim help
- application-status link
- support
- security note
- passkey/MFA readiness
- redirect logic

No catalog navigation around this page.

# 5.4 Applicant status

Must include:

- current status
- last update
- next expected action
- request-information response
- approval expiration
- account-claim action
- activation action
- secure-link refresh
- support

Do not expose internal review notes.

# 5.5 Activation

Must show:

```text
$50 due today
$25 recurring monthly
next billing date
membership included
cancellation
privacy
identity/age status
payment status
```

No hidden recurring billing.

# 5.6 Member dashboard

Recommended modules:

1. Membership status.
2. Continue your Whole-Life Blueprint.
3. Current System or Foundation.
4. Next action.
5. Replenishment and subscriptions.
6. Recent orders.
7. Saved products.
8. Recommended Guides.
9. Quality or document updates.
10. Store credit.
11. Referral card.
12. Support.
13. New member drop.

The dashboard should not open with a wall of products.

# 5.7 Products hub

Primary browsing:

```text
By goal
By product type
By System
By brand
By subscription eligibility
By documentation state
```

Member sees:

- search
- saved products
- compare
- product type
- availability
- member price
- subscription price
- image
- quality indicator
- evidence indicator
- related Guide
- related System

# 5.8 Product page

Every product page must contain:

```text
Image gallery
Product identity
Brand
Format
Size
Member price
Subscription price
Availability
Eligibility
Inventory
Shipping estimate
Why Xenios selected it
What it is
What it is not
Ingredients or specifications
Evidence summary
What we know
What remains uncertain
Quality and documentation
Lot / COA access
Storage
Warnings
Related Guides
Related products
Related Systems
Support
Published revision
```

Research materials require a distinct template from supplements.

Quantum requires a distinct template from shipped products.

# 5.9 Systems, Foundations, and Protocols

Every offering needs:

- goal
- intended member
- 30/60/90-day option
- included items
- optional items
- substitutions
- duplicate-ingredient warnings
- education
- Blueprint actions
- savings
- shipping schedule
- subscription behavior
- professional review state
- exit or continuation path

# 5.10 Quality

Required pages:

```text
/research/member/quality
/research/member/quality/standards
/research/member/quality/lot-lookup
/research/member/quality/documents
/research/member/quality/suppliers
```

# 5.11 Research Guides

Required content types:

```text
Goal guide
Ingredient guide
Product guide
Evidence explainer
Quality explainer
System guide
Member onboarding guide
Subscription guide
Referral guide
Privacy guide
```

Each Guide needs:

- author/reviewer
- published date
- updated date
- evidence references
- scope
- limitations
- related products
- related Systems

# 5.12 Referrals

Member route:

```text
/research/member/referrals
```

Modules:

- premium purple invitation card
- unique QR
- copy link
- message
- WhatsApp
- email
- X
- invite count
- pending qualifications
- qualified referrals
- available store credit
- hold rules
- privacy rules

Never show invited person identity or application outcome details.

# 5.13 Subscriptions

Member can:

- see upcoming shipment
- see upcoming charge
- change date
- skip
- pause
- swap eligible supplement
- change quantity
- change frequency
- cancel
- see saved amount
- see order history
- contact support

# 5.14 Trust Center

Required modules:

- what Xenios collects
- why it is collected
- what is not collected initially
- identity verification
- age verification
- AI disclosure
- human review
- vendor categories
- data rights
- retention
- export
- deletion
- security overview
- incident contact
- HIPAA applicability language
- referral privacy
- marketing-data separation

# 5.15 Admin

Samuel's first screen should show:

```text
New applications
Oldest unreviewed
Email failures
Activation candidates
Active members
Revenue
Orders
Subscriptions
High-risk orders
Referral flags
Privacy requests
Security alerts
System health
```

---

# 6. VISUAL SYSTEM

## 6.1 Direction

```text
Scientific precision
+
luxury restraint
+
private-club calm
```

## 6.2 Color

Main:

```text
black
warm white
soft gray
purple
silver
```

Use different accent families for products, but do not let product accents replace the Xenios identity.

## 6.3 Spacing

Current global desktop hero tokens reach approximately:

```text
200px top
176px bottom
```

Those values make sense for occasional flagship marketing heroes, not every Research page.

Create compact Research tokens:

```text
--research-gateway-pad: clamp(24px, 5vw, 64px)
--research-page-top: clamp(32px, 6vw, 88px)
--research-section-y: clamp(44px, 6vw, 88px)
--research-card-pad: clamp(20px, 3vw, 36px)
--research-content-narrow: 560px
--research-content-reading: 720px
--research-content-wide: 1200px
```

## 6.4 Typography

Use fewer display sizes.

Gateway:

- wordmark
- small mono eyebrow
- one restrained headline
- one short supporting sentence

Product pages:

- clear hierarchy
- shorter line lengths
- data-rich labels
- no giant headings that push information below the fold

## 6.5 Buttons

Current buttons grow to 64px high at desktop.

That is appropriate for a hero CTA but too large for every action.

Create sizes:

```text
button-sm 40px
button-md 48px
button-lg 56px
```

Use purple focus and selected states.

## 6.6 Product imagery

Every Xenios-owned product needs:

1. Transparent pack shot.
2. Front image.
3. Angled image.
4. Label close-up.
5. Packaging image.
6. Scale or hand image.
7. System group image.
8. Member-dashboard thumbnail.
9. Mobile crop.
10. Editorial image.

For third-party products:

- obtain permission
- preserve official packaging
- store source and rights metadata
- do not create fake labels
- distinguish sold-by-Xenios from affiliate click-out

## 6.7 Image engineering

Use:

```text
AVIF
WebP fallback
responsive srcset
explicit dimensions
lazy loading below fold
priority only for hero image
blur placeholder
object-fit rules
asset manifest
alt text
image-rights record
```

Set performance budgets.

## 6.8 Motion

Use subtle:

- opacity
- scale
- glow
- card elevation
- page transition

Avoid:

- constant floating objects
- long parallax
- excessive animation
- countdown timers
- motion that slows checkout or login

Respect reduced motion.

---

# 7. SECURITY PRIORITY PLAN

# P0 — Before private member catalog

1. Separate shared review access from member authentication.
2. Require active membership for catalog APIs.
3. Add `requireActiveMember`.
4. Resolve member by Supabase `auth_user_id`.
5. Make account claim atomic or compensating.
6. Create single-use, purpose-scoped tokens.
7. Add token revocation.
8. Add proper admin roles.
9. Require admin MFA.
10. Add CSP in report-only mode.
11. Configure Render trust proxy and canonical IP handling.
12. Scope review cookie to `/research` or narrower.
13. Add CSRF protection for cookie-authenticated writes.
14. Keep products and prices server-side.
15. Keep payment methods with processor.
16. Keep raw IDs with identity provider.
17. Add security headers.
18. Add authenticated privacy controls.
19. Prevent sensitive analytics.
20. Add route and API authorization tests.

# P1 — Before commerce

1. Product database and publishing workflow.
2. Product revisions.
3. Inventory.
4. Fulfillment state.
5. Order idempotency.
6. Processor webhooks.
7. Subscription webhooks.
8. Store-credit ledger.
9. Refund and chargeback handling.
10. Fraud review.
11. quantity review.
12. shipping and tax.
13. product document vault.
14. signed document links.
15. audit records.
16. privacy request workflow.
17. data retention.
18. vendor inventory.
19. incident-response drills.
20. backup and restore test.

# P2 — Scale

1. Passkeys.
2. Member MFA.
3. device sessions.
4. step-up authentication.
5. SIEM.
6. WAF.
7. DLP.
8. SOC 2 readiness.
9. penetration testing.
10. formal HIPAA applicability review.
11. BAAs where required.
12. formal vendor risk program.
13. disaster recovery.
14. business continuity.
15. security center.

---

# 8. PERFORMANCE AND ENGINEERING

## 8.1 Bundle

Current production build warning shows a JavaScript chunk above 700 KB.

Actions:

- lazy-load non-home main-site routes
- lazy-load each Research page
- split React/vendor dependencies
- split charts/admin
- remove unused components
- analyze bundle
- prefetch only likely next route
- reduce duplicate dependencies
- defer noncritical scripts

Budgets:

```text
initial JavaScript under 250 KB gzip target
route chunk under 100 KB gzip target
gateway first-contentful paint under 1.5s on good mobile
no layout shift from images
```

## 8.2 Data fetching

- no catalog request on gateway
- no product data until active-member confirmation
- cache static Guide and product metadata carefully
- no-store for account and entitlement state
- invalidate after subscription or order changes
- use query keys by member and revision
- never cache private responses publicly

## 8.3 Error handling

Create member-friendly states:

```text
loading
empty
unavailable
permission denied
membership inactive
payment required
identity required
retry
support
```

Do not expose stack traces or provider details.

---

# 9. CONTENT STANDARD

Every claim receives a classification:

```text
Established
Supported human evidence
Early human evidence
Preclinical
Manufacturer-reported
Supplier statement
Operational assumption
Unverified
Prohibited
```

Every page should show:

- who wrote it
- who reviewed it
- when it was updated
- what sources support it
- what remains uncertain

Internal copy must never appear publicly, including:

- “Mitch is sourcing”
- “Backend by Quantum”
- implementation placeholders
- supplier margin
- internal legal notes
- unapproved pricing
- branch or feature names

---

# 10. REQUIRED DATA MODEL

Minimum production entities:

```text
research_products
research_product_revisions
research_product_variants
research_brands
research_product_images
research_image_rights
research_product_documents
research_product_lots
research_product_evidence
research_product_claims
research_product_warnings
research_product_availability
research_inventory
research_fulfillment_rules

research_systems
research_system_revisions
research_system_items
research_system_actions
research_system_durations

research_members
research_memberships
research_entitlements
research_identity_status
research_consents
research_sessions

research_orders
research_order_items
research_payments
research_refunds
research_shipments
research_subscriptions
research_subscription_items

research_referral_identities
research_referral_attributions
research_rewards
research_credit_ledger
research_fraud_flags

research_guides
research_guide_revisions
research_guide_sources

research_admin_roles
research_audit_events
research_privacy_requests
research_incidents
```

---

# 11. IMPLEMENTATION ORDER

## Phase 0 — Synchronize

- latest `origin/main`
- no stacked PRs
- preserve current working branches
- add canonical guide
- create status claim
- agree ownership

## Phase 1 — Access architecture

- minimal gateway
- split review access from member auth
- public legal/trust routes
- active-member route guard
- active-member catalog API
- sign-in redirects
- activation guard
- tests

## Phase 2 — Member shell

- member layout
- dashboard
- profile
- privacy
- support
- empty states
- membership status

## Phase 3 — Product platform

- database product model
- image model
- evidence model
- quality docs
- admin publishing
- supplement candidates
- all peptide profiles
- product cards
- product detail

## Phase 4 — Systems

- Systems
- Foundations
- Protocols
- 30/60/90 day
- Blueprint actions
- product compatibility
- subscription schedule

## Phase 5 — Commerce

- processor approval
- activation
- monthly membership
- cart
- order
- shipping
- subscription
- credits
- refunds
- chargebacks
- fulfillment

## Phase 6 — Referrals

- purple card
- share
- store credit
- 14-day hold
- fraud queue
- privacy

## Phase 7 — Quantum

- verified documentation
- qualification
- provider
- facility
- session options
- payment
- schedule
- follow-up

## Phase 8 — Trust, performance, QA

- CSP
- roles/MFA
- privacy center
- trust center
- accessibility
- responsive QA
- performance
- security testing
- incident drill

---

# 12. ACCEPTANCE CRITERIA

## Gateway

- one viewport
- Apply and Login visible
- no product or cart
- no full nav
- no long footer
- shared password unlocks only gateway/application
- active members bypass review gate
- policies accessible
- no index

## Security

- shared gate cannot access catalog API
- pending member cannot access catalog
- active member can
- another member cannot access someone else's data
- admin role enforced server-side
- MFA required for Samuel
- token reuse fails after claim
- CSP report has no unexplained violations
- secure routes have no third-party analytics

## UI

- 320, 375, 390, 768, 1440
- 200% zoom
- keyboard
- screen reader names
- visible focus
- reduced motion
- no overflow
- purple selected states
- correct empty/loading/error states

## Product

- every product has image, status, revision, evidence, documents, warnings, and availability
- prices come from server
- unpublished products never appear
- member entitlement enforced
- third-party image rights recorded

---

# 13. METRICS

## Acquisition

- gateway visits
- Apply clicks
- Login clicks
- application starts
- completion
- referral attribution

## Membership

- approval
- activation
- monthly start
- first login
- first Blueprint action
- first purchase
- retention

## Commerce

- product-view-to-cart
- system adoption
- subscription adoption
- average order
- contribution margin
- refund
- chargeback
- fulfillment time

## Engagement

- Guide reads
- saved products
- Blueprint actions
- return visits
- subscription changes
- referral shares
- credit redemption

## Trust

- privacy requests
- security incidents
- support response
- authentication failures
- identity abandonment
- email delivery
- document views

---

# 14. OFFICIAL RESEARCH SOURCE REGISTRY

## Momentous

- Homepage  
  https://www.livemomentous.com/
- The Momentous Standard  
  https://www.livemomentous.com/pages/momentous-standard
- Routine Guide  
  https://www.livemomentous.com/pages/guide
- Product Success Guides  
  https://www.livemomentous.com/pages/product-success-guides
- Subscriptions  
  https://www.livemomentous.com/pages/subscriptions
- Wholesale  
  https://www.livemomentous.com/pages/wholesale
- Certificate of Analysis help  
  https://help.livemomentous.com/hc/en-us/articles/51650518281235-Where-can-I-find-the-COA-Certificate-of-Analysis-for-my-product
- Example product  
  https://www.livemomentous.com/products/essential-multivitamin

## Superpower

- Homepage  
  https://superpower.com/
- How It Works  
  https://superpower.com/how-it-works
- FAQs  
  https://superpower.com/faqs
- Reviews  
  https://superpower.com/reviews
- Supplements  
  https://superpower.com/supplements
- Peptides  
  https://superpower.com/peptides
- Privacy  
  https://superpower.com/legal/privacy
- Data protection  
  https://superpower.com/blog/your-data-protected-and-in-your-control
- Gift  
  https://superpower.com/gift

## IM8

- Homepage  
  https://im8health.com/
- Essentials Pro  
  https://im8health.com/products/essentials-pro
- Beckham Stack  
  https://im8health.com/products/the-beckham-stack-pro
- Longevity  
  https://im8health.com/products/longevity
- Science  
  https://im8health.com/pages/science
- Quality  
  https://im8health.com/pages/quality
- About  
  https://im8health.com/pages/about-us
- Ingredients  
  https://im8health.com/pages/90-ingredients
- Ambassador  
  https://im8health.com/pages/im8-ambassador-program
- FAQ  
  https://im8health.com/pages/frequently-asked-questions

## Adjacent benchmarks

- Function How It Works  
  https://www.functionhealth.com/how-it-works
- InsideTracker store and membership  
  https://store.insidetracker.com/
- Seed DS-01  
  https://seed.com/daily-synbiotic
- Oura membership  
  https://support.ouraring.com/hc/en-us/articles/4409086524819-Oura-Membership
- Oura data protection  
  https://support.ouraring.com/hc/en-us/articles/360025586673-How-Oura-Protects-Your-Data

---

# 15. FINAL PRODUCT PRINCIPLE

Xenios Research should not become a larger version of a peptide storefront.

It should become:

> A private member operating environment where a person understands their life, builds a coherent plan, accesses carefully governed products and systems, manages recurring routines, owns their information, and returns because the system keeps becoming more useful.

The sequence is the product:

```text
Private gateway
→ application
→ trust
→ activation
→ Blueprint
→ product access
→ system
→ subscription
→ progress
→ referral
→ evolution
```

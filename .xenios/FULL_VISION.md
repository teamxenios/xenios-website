# XENIOS RESEARCH — CANONICAL FULL VISION AND BUILD STANDARD
**Version:** 2026-08-19  
**Repository:** `teamxenios/xenios-website`  
**Purpose:** Permanent product and engineering north star for every Claude Code, Fable, Codex, ChatGPT, or human session working on Xenios Research.

---

# 1. THE PRODUCT

Xenios Research is not only a peptide storefront.

It is the operating system for trusted Research commerce, professional relationships, business buyers, affiliates, suppliers, documentation, fulfillment, customer support, and future Care pathways.

The platform should let a legitimate customer discover products, understand the correct pathway, place business, pay through an approved method, receive fulfillment and tracking, and return for future business.

It should also let Xenios operate the company from one coherent system.

The revenue loop is:

```text
visitor
-> access
-> catalog
-> product / pathway
-> assisted order or Buy Now
-> agreements
-> payment
-> canonical order
-> supplier / fulfillment
-> tracking
-> customer status
-> affiliate credit
-> repeat business
```

The platform loop is broader:

```text
PUBLIC
MEMBER / CUSTOMER
ORGANIZATION / BUSINESS BUYER
AFFILIATE / STRATEGIC PARTNER
SUPPLIER / LAB / FULFILLMENT
ADMIN / OPERATIONS / FINANCE / QUALITY
CARE PROVIDER / CLINICAL OPERATIONS
```

---

# 2. GLOBAL PRODUCT LAWS

## 2.1 One canonical identity

Use one Supabase Auth identity system unless a later approved architecture replaces it.

Roles, organizations, affiliate relationships, supplier relationships, Care roles, and administrative authority are resolved server-side.

The browser never grants itself a role.

## 2.2 One canonical catalog

Product Control and the reviewed master-offerings catalog are the product and variant authority.

Do not create separate copied catalogs for:

- Early Access
- Kris / Roman
- affiliates
- organizations
- suppliers
- Buy Now
- Care

Those are projections and pathways over one canonical product/variant system.

## 2.3 One canonical price authority

Retail, buyer-scoped, organization-specific, quantity-tier, quote, and historical sold prices must reconcile through the canonical server-side price system.

Do not hard-code retail prices into React.

Do not use wholesale cost as customer retail.

Do not let browser totals become authoritative.

## 2.4 Visibility is not purchase permission

A product may be visible and priced while still resolving to:

```text
BUY_NOW
ASSISTED_ORDER
REQUEST_QUOTE
CARE
TEMPORARILY_HELD
NOT_AVAILABLE
```

Price does not automatically mean direct checkout.

## 2.5 Research and Care remain separate

Research-use products remain Research-use only.

Provider-required, prescription-required, or clinical products route through Care.

Do not create dosing, administration, treatment, prescribing, or individualized medical guidance on Research surfaces.

## 2.6 Truth over fake completeness

Never invent:

- price
- inventory
- supplier readiness
- COA
- lot
- purity
- payment
- shipment
- legal acceptance
- clinical approval
- affiliate commission
- production state

A truthful assisted/manual workflow is better than a fake automated workflow.

## 2.7 Manual operations are acceptable during launch

The first complete revenue loop may use:

- assisted ordering
- manual payment review
- admin supplier assignment
- manual tracking entry
- manual affiliate payout operations

Automate after the workflow works.

---

# 3. FOUNDER ACCESS DIRECTIVE — ONE EARLY ACCESS CODE

The customer-facing Early Access ordering journey should have **one shared access code prompt**, not two nested password prompts.

Founder-selected access code:

```text
XeniosGenesis
```

Display label:

```text
Xenios Genesis
```

Implementation requirements:

1. Remove the first/outer shared Research review-password requirement from the Early Access customer route and its Early Access customer APIs.
2. Keep the one dedicated Early Access access-code gate.
3. Store only a secure password hash in production environment secrets.
4. Never commit the plaintext code to Git, client bundles, logs, test snapshots, documentation intended for public distribution, or browser storage.
5. The access code unlocks the customer ordering surface only.
6. It never unlocks admin, supplier, affiliate, organization, Care provider, finance, or private customer data.
7. A customer still supplies contact/shipping information and accepts the current Research Use Policy before an order/request is created.
8. Admin and named-member authorization remains separate and stronger.

The intended customer flow is:

```text
/research/early-access
-> one Xenios Genesis code prompt
-> full Early Access catalog
-> select products
-> quantity
-> agreements
-> shipping/contact
-> request/order
-> status
```

There should not be a second customer-facing password before or after the Early Access code.

---

# 4. FOUNDER QUANTITY DIRECTIVE

A customer should be able to request/order up to:

```text
100 units per exact product variant
```

This must be implemented coherently across:

- shared contracts
- UI quantity controls
- server validation
- assisted-order validation
- cart validation
- quote logic
- order writer
- database constraints
- migration verification
- tests
- admin views

Do not leave hidden 20-unit or 50-unit limits in one layer.

Default global maximum:

```text
100
```

A lower product-specific limit is allowed only when it comes from a real, explicit availability, safety, supplier, or program rule. The UI must state the lower limit truthfully.

Do not interpret the 100-unit customer maximum as evidence that inventory is available.

---

# 5. FULL RETAIL CATALOG DIRECTIVE

The full master catalog must be discoverable.

The latest founder workbook is:

```text
XENIOS_MASTER_CATALOG_AFFILIATE_PRICING_2026-08-16(2)(2).xlsx
```

Canonical retail field:

```text
MASTER CATALOG -> Suggested Sell Price
```

Latest workbook state supplied by the founder:

```text
426 catalog rows
424 rows with numeric current retail pricing
2 rows with Price on request
```

The two rows without a numeric retail price are:

```text
BAM15 500 mcg
Syringes & Alcohol Swabs
```

They must display:

```text
Price on request
```

Never `$0`.

The machine-readable companion file is:

```text
XENIOS_FULL_CURRENT_RETAIL_PRICING_426_VARIANTS_2026-08-19.csv
```

Requirements:

1. Reconcile all 426 workbook rows against Product Control.
2. Do not guess product/variant mappings.
3. Classify unmatched rows.
4. Import/reconcile approved retail prices through canonical server-side price versioning.
5. Keep audit history.
6. Show current retail pricing on the catalog and product surfaces.
7. Preserve buyer-scoped prices.
8. Preserve approved quantity tiers.
9. Do not expose wholesale cost, margin, supplier identity, or internal pricing notes to customers.
10. The 39-row XRUO price book is a launch-priority and bulk-tier subset, not the full catalog.
11. Full catalog visibility does not authorize direct Buy Now.
12. Care products remain Care pathway products even when a retail price is displayed.

---

# 6. PUBLIC RESEARCH GATEWAY

The public Research gateway should make the platform understandable immediately.

Required entry choices:

- Explore Research
- Early Access
- Member / Customer Login
- Apply / Create Account
- Affiliate / Partner
- Organization / Professional Buyer
- Supplier / Fulfillment
- Support / Legal

The gateway should not expose private data.

It should not require a shared password merely to understand the offering.

The Early Access customer route uses the one Xenios Genesis access code.

---

# 7. CUSTOMER / MEMBER EXPERIENCE

The customer portal should include:

- Home
- Catalog
- Product details
- Saved items where useful
- Assisted requests
- Quotes
- Cart
- Checkout
- Orders
- Invoices
- Payment status
- Fulfillment status
- Tracking
- Reorder
- Membership/account
- Documents
- Notifications
- Support
- Security/privacy
- Care status where applicable

Customer experience must be simple.

Customers should not see internal terms such as:

- release ledger
- product projection
- entitlement resolver
- migration
- canonical source
- supplier mapping

They should see:

- price
- availability
- pathway
- quantity
- next action
- status

---

# 8. COMMERCE PATHWAYS

## 8.1 Assisted Order

Assisted ordering is the minimum complete revenue path.

```text
catalog
-> multiple products
-> exact variants
-> quantities
-> contact
-> shipping
-> agreements
-> review
-> XRR request
-> admin review
-> quote/payment
-> canonical order
```

## 8.2 Buy Now

Direct Buy Now is enabled progressively for ready products.

Required readiness:

```text
approved current retail price
authorized direct Research pathway
availability
supplier/fulfillment readiness
required documentation
shipping eligibility
agreements
legitimate payment path
```

## 8.3 Request Quote

Used when price or commercial terms require human review.

## 8.4 Care

Used for provider/clinical pathways.

## 8.5 Held / unavailable

No fake purchase action.

---

# 9. PAYMENT

Preferred:

- approved production payment provider

Launch fallback:

- approved manual payment workflow

Canonical states:

```text
payment_required
instructions_presented
proof_submitted
under_review
paid
rejected
exception
refunded
```

A proof upload is not payment confirmation.

Only an actual provider fact or authorized operator can mark paid.

---

# 10. CANONICAL ORDERS

There should be one canonical order system.

Order records include:

- order ID
- customer
- organization optional
- affiliate attribution optional
- request/quote lineage
- shipping
- line items
- sold price snapshot
- payment state
- fulfillment state
- timestamps
- audit history

Requests are not orders until converted.

---

# 11. AFFILIATES

Affiliate lifecycle:

```text
application
-> review
-> approval
-> agreement
-> active
-> code/link
-> attribution
-> conversion
-> commission
-> payout
```

Attribution must survive:

- landing
- browsing
- account creation/login
- assisted request
- cart
- checkout
- canonical order

Do not rely on localStorage alone.

Affiliate portal:

- dashboard
- link/code
- clicks where available
- attributed requests/orders
- commission ledger
- holds
- reversals
- statements
- payout status
- resources
- compliance
- support

Affiliates cannot:

- set their own commission
- mark payment paid
- modify customer price
- see unrelated customers
- see supplier cost or Xenios margin

---

# 12. ORGANIZATION / BUSINESS BUYERS

Organization portal:

- organization dashboard
- users and roles
- owner/admin/buyer/billing viewer
- buyer pricing profile
- catalog
- volume requests
- quotes
- orders
- invoices
- tracking
- addresses
- reporting
- support
- audit activity

Use the corrected account-organization system.

Do not collide with the older partner `research_organizations` system.

---

# 13. SUPPLIER / LAB / FULFILLMENT

Supplier portal should be minimum-data and anti-poaching by design.

Supplier sees:

- assigned Xenios reference
- assigned products/variants
- quantity
- minimum shipping information
- handling requirements
- documentation requirements
- lot/COA requirements
- SLA
- tracking
- exceptions
- Xenios relay contact

Supplier does not see:

- affiliate attribution
- customer retail economics unless required
- Xenios margin
- unrelated customer history
- other suppliers
- internal strategy

Fulfillment states:

```text
assigned
acknowledged
packing
tracking_created
shipped
delivered
exception
replacement
return
refund
recall
```

---

# 14. ADMIN / OPERATIONS

The operating cockpit should cover:

- applications
- accounts
- customers
- organizations
- affiliates
- supplier users
- catalog
- variants
- retail pricing
- holds
- documentation
- requests
- quotes
- payment review
- orders
- fulfillment
- tracking
- refunds
- exceptions
- commissions
- payouts
- support
- audit
- privacy/security
- feature flags
- release health

Prioritize actionable queues over decorative analytics.

---

# 15. CARE

Care remains a separate controlled rail.

Target capabilities:

- discovery/handoff
- eligibility
- intake
- appointment
- provider review
- prescription record
- pharmacy state
- instructions/status
- clinical operations
- patient support

No real clinical action is activated without real providers, jurisdiction coverage, pharmacy relationships, and approved workflows.

---

# 16. DOCUMENTATION / QUALITY

The platform should support:

- product specifications
- COAs
- lot references
- testing status
- storage/handling
- supplier documentation
- quality review
- expiry
- recall
- customer-safe documents
- private operator documents

Never fabricate a COA or lot.

---

# 17. AI RESEARCH COMPANION

Future/parallel platform capability:

- study search
- evidence summaries
- mechanisms
- COA parsing
- lot/document interpretation
- storage and handling education
- general Research education
- product comparison
- documentation search

It must not give individualized medical advice, dosing, administration, or treatment recommendations.

---

# 18. NOTIFICATIONS, ANALYTICS, AND OPERATIONS INTEGRATIONS

Target:

- one durable notification outbox
- customer notifications
- affiliate notifications
- supplier notifications
- admin alerts
- in-app notification center
- role-safe analytics
- conversion funnel
- affiliate performance
- fulfillment SLA
- exception monitoring
- Google Workspace integrations
- CRM views
- audit trails
- release observability
- backup/restore
- disaster recovery

Do not block the first revenue loop on these.

---

# 19. UX STANDARD

The site must work at:

```text
1440
1366
768
430
390
375
360
320
```

Required:

- keyboard access
- clear focus
- no horizontal overflow
- mobile-safe forms
- preserved cart/request through auth
- preserved affiliate attribution
- truthful loading/error/empty states
- one obvious next action
- no dead-end product cards
- no AI-sounding customer copy
- simple professional Research visual system

---

# 20. BUILD ORDER

## P0 — Revenue and continuity

1. Preserve all current dirty worktrees.
2. Establish one canonical integration base.
3. One Early Access code.
4. Full catalog and retail reconciliation.
5. Quantity 100 across the full stack.
6. Assisted ordering end to end.
7. Affiliate attribution.
8. Payment path.
9. Canonical order conversion.
10. Fulfillment/tracking.
11. Mobile live smoke.
12. Direct Buy Now for ready subset.

## P1 — Operating platform

1. Quote engine mount.
2. Affiliate onboarding/dashboard/commission/payout.
3. Organization accounts.
4. Supplier workspace.
5. Admin operations convergence.
6. Customer order history.
7. Notifications.
8. Expanded direct commerce.
9. Reorder/subscriptions where appropriate.

## P2 — Full platform expansion

1. Care completion.
2. AI Research companion.
3. Education/guides.
4. Analytics.
5. Google Workspace.
6. advanced supplier automation.
7. advanced affiliate programs.
8. reliability/DR.
9. future Xenios/Infinity rebrand only when explicitly authorized.

---

# 21. DEFINITION OF COMPLETE

Xenios Research is fully operating when every major persona can complete its legitimate journey through one coherent platform, with server-authoritative identity, catalog, pricing, money, orders, attribution, fulfillment, audit, and role boundaries.

The build is not complete merely because routes or components exist.

It is complete when the journeys are proven in the composed environment and production where authorized.

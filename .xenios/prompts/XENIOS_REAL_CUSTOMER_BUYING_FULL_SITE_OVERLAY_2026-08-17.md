# XENIOS RESEARCH — REAL CUSTOMER BUYING + FULL-VISION BUILD OVERLAY
## Use with the Universal Takeover Prompt + Cashflow-First Overlay + Full-Vision Demo Prompt

# FOUNDER INTENT

Do NOT interpret the Xenios demo as the end goal.

The actual product goal is a REAL production Xenios Research site where legitimate customers can:

DISCOVER
→ APPLY / CREATE ACCOUNT / SIGN IN
→ BROWSE THE FULL CATALOG
→ SEE THE CORRECT CUSTOMER-SAFE PRICE OR ACTION
→ ADD ELIGIBLE PRODUCTS
→ CHECK OUT OR SUBMIT A REQUEST
→ PAY THROUGH AN APPROVED PAYMENT FLOW
→ RECEIVE A REAL ORDER / REQUEST REFERENCE
→ TRACK STATUS
→ RECEIVE FULFILLMENT / SHIPPING
→ REORDER
→ MANAGE MEMBERSHIP / ACCOUNT
→ USE AFFILIATE / ORGANIZATION / CARE PATHWAYS WHEN APPLICABLE

The full-vision demo is a parallel validation environment.

The REAL production buying path is the actual company objective.

# TWO PARALLEL OUTPUTS

Build both:

## A. REAL PRODUCTION COMMERCE
Customer-facing, persistent, secure, real.

## B. FULL-VISION DEMO
Safe simulation of unfinished external systems so Samuel can experience the future product immediately.

Never confuse the two.

# PRIORITY ORDER

1. Get the assisted-order survey live so demand can be captured immediately.
2. Build real direct-purchase commerce for eligible products.
3. Build real request/quote conversion for products that cannot use direct checkout.
4. Build the real approved payment path.
5. Build order creation, fulfillment, tracking, notifications, and reorder.
6. Complete organization/B2B, affiliate, supplier, and Care pathways.
7. Continue polishing the entire Xenios platform.
8. Maintain the complete demo in parallel.

# REAL CUSTOMER PURCHASE JOURNEY

Create the shortest coherent production journey:

PUBLIC SITE
→ RESEARCH / SHOP ENTRY
→ ACCOUNT / EARLY ACCESS / MEMBERSHIP AUTHORITY
→ CATALOG
→ PRODUCT DETAIL
→ CART
→ SHIPPING
→ REVIEW
→ PAYMENT
→ ORDER CONFIRMATION
→ ORDER STATUS
→ TRACKING
→ REORDER

The customer should not need Samuel to manually intervene on ordinary direct-eligible products once the real commerce lane is ready.

Until then, the assisted-order bridge remains the fallback.

# PRODUCT ACTION ENGINE

Every catalog row must resolve to exactly one truthful customer action.

## DIRECT_BUY

Use when Product Control and legal/business rules approve direct commerce.

Customer can:

- select variant
- choose quantity
- add to cart
- checkout
- pay
- receive order

## REQUEST_QUOTE / REQUEST_PRICING

Use when:

- final price is not approved
- volume requires review
- buyer-specific pricing applies
- a manual commercial review is required

Never show `$0`.

## PROVIDER_WORKFLOW

Use when the product/service requires a medical/provider workflow.

Customer can:

- express interest
- start Care
- complete the approved intake
- schedule/request provider review

Do NOT turn this into direct checkout until the canonical clinical system has real authority to do so.

Never fabricate:
- prescription
- provider approval
- diagnosis
- medication authorization

## REQUEST_ACTIVATION / REVIEW

Use when classification or Product Control approval is pending.

## WAITLIST / OUT_OF_STOCK / REQUEST_ALTERNATIVE

Use truthful availability states.

## RUO

Research Use Only items retain their approved nonclinical research positioning and restrictions.

Do not turn RUO copy into human-use sales language.

# REAL CART

Build one canonical cart.

Do not create separate carts for every buyer type.

Cart line must include authoritative references to:

- product
- variant
- buyer/customer
- price authority
- quantity authority
- currency
- pathway
- source/version used for validation

At checkout, revalidate every line server-side.

Reject or refresh if:

- price changed
- variant changed
- product became held
- buyer lost access
- quantity became invalid
- pathway changed

Never trust browser price as payment authority.

# REAL CHECKOUT

The production checkout should cover:

1. Cart
2. Contact
3. Shipping
4. Billing
5. Review
6. Required agreements
7. Payment
8. Confirmation

Make it mobile-first.

Preserve idempotency.

A double click or retry must not create duplicate orders or duplicate charges.

# REAL PAYMENT

Use the canonical approved payment provider/infrastructure.

Do not invent a payment provider.

If the approved provider is not production-ready yet:

- keep direct checkout behind a feature flag
- use the real assisted-order/manual-payment workflow
- continue building the payment integration in parallel

Once enabled, payment flow must provide:

- payment intent/authorization
- idempotency
- amount/currency verification
- server-side price authority
- success/failure state
- refund/cancellation model
- payment audit
- order linkage

Never mark an order paid solely because the browser says payment succeeded.

# REAL ORDER MODEL

A successful direct purchase creates a canonical order.

Do NOT let assisted-order requests become a second permanent order system.

Relationship:

assisted request
→ quote if needed
→ canonical order

or:

direct checkout
→ canonical order

Order should expose customer-safe:

- order number
- placed date
- items
- quantities
- amount
- payment state
- fulfillment state
- shipment/tracking
- customer actions
- support

Internal-only fields must remain private.

# REAL FULFILLMENT

After legitimate payment/order creation:

- reserve/confirm availability
- assign supplier/fulfillment path
- provide minimum necessary fulfillment information
- capture supplier acknowledgement
- processing
- tracking
- shipped
- delivered

Do not expose private supplier economics or unrelated customer information.

# REAL CUSTOMER PORTAL

Customer/member should have:

- dashboard
- catalog
- cart
- saved request/cart state
- assisted-order requests
- quotes
- orders
- subscriptions when legitimate
- payment history
- shipping/tracking
- documents
- notifications
- profile
- addresses
- support
- referrals
- reorder

# REAL REORDER

For delivered/eligible prior products:

REORDER

Prefill:

- product
- variant
- quantity suggestion
- shipping address

Then revalidate all current authority.

Never carry forward stale:
- provider approval
- old price
- old inventory
- expired legal state
- restricted quantity override

# REAL B2B / ORGANIZATION BUYING

Organizations need:

- organization account
- owner/admin/member roles
- buyer profile
- negotiated pricing
- catalog permissions
- volume request
- quote
- invoice
- order history
- repeat ordering
- users/seats
- APIs/webhooks later

Roman Health is one organization/buyer configuration.

Do not hardcode Roman pricing as the platform default.

# REAL AFFILIATE SYSTEM

Build:

- application
- approval
- referral link/code
- attribution
- conversion
- commission eligibility
- reversal
- statement
- payout state

A commission should become eligible only after the canonical commercial event required by policy, such as a successfully paid/non-refunded order.

Affiliates never receive PHI, private supplier data, unrelated customer data, or internal margin.

# REAL SUPPLIER WORKSPACE

Supplier sees only the minimum data required to fulfill assigned orders.

Provide:

- fulfillment reference
- items
- quantities
- lot/COA requirements
- shipping destination fields required for fulfillment
- SLA/target
- tracking submission
- exception reporting

Do not expose:

- customer commercial relationship
- customer-facing price
- margin
- affiliate attribution
- unrelated orders
- private Xenios notes

# REAL CARE / PROVIDER PATH

Keep Care separate from research/direct commerce authority.

Provider-required journey:

PRODUCT
→ PROVIDER WORKFLOW REQUIRED
→ ELIGIBILITY
→ INTAKE
→ APPOINTMENT / REVIEW
→ REAL PROVIDER AUTHORITY
→ ONLY THEN any legally permitted next commercial step

The site should make this feel coherent to the customer without blurring the boundary.

# REAL ADMIN OPERATING SYSTEM

Admin must be able to run revenue operations end to end.

Dashboards/queues for:

- applications
- members
- organizations
- assisted-order requests
- quotes
- carts/checkout issues
- payments
- orders
- fulfillment
- tracking
- refunds/cancellations
- product control
- prices
- inventory
- lots/COAs
- suppliers
- affiliates
- commissions
- payouts
- Care/provider workflow status
- support
- notifications
- audit
- security/privacy
- release controls

# CASHFLOW FALLBACK RULE

Never block real business because the perfect automated lane is unfinished.

For any unfinished automation:

1. Capture the request durably.
2. Give the customer a reference.
3. Put it into the admin queue.
4. Notify operations.
5. Let Samuel/ops complete the step manually.
6. Keep building automation behind it.

Examples:

payment automation incomplete
→ assisted-order + manual approved payment

supplier API incomplete
→ admin supplier assignment + manual fulfillment handoff

tracking integration incomplete
→ admin enters tracking manually

agreement automation incomplete
→ admin sends/records agreement manually

The system should progressively replace manual boxes without shutting down revenue.

# FEATURE FLAGS

Use explicit production flags for high-risk releases.

Examples conceptually:

RESEARCH_ASSISTED_ORDER_BRIDGE_ENABLED
RESEARCH_DIRECT_COMMERCE_ENABLED
RESEARCH_PAYMENT_CHECKOUT_ENABLED
RESEARCH_ORGANIZATION_COMMERCE_ENABLED
RESEARCH_AFFILIATE_PAYOUTS_ENABLED

Current repo conventions win.

Default high-risk unfinished features dark.

# FULL-VISION DEMO STILL REQUIRED

In parallel, build `/research/demo` from the separate demo prompt.

The demo lets Samuel test future functionality before all real external integrations are ready.

But whenever a demonstrated capability becomes production-ready:

replace the simulation with the canonical production capability in the real product.

Do not let the demo become a forked second application.

# TEST THE REAL SITE END TO END

Create an isolated production-like test/staging journey:

1. Create/sign into test user
2. Browse catalog
3. Direct eligible product → cart
4. Add multiple eligible lines
5. Shipping
6. Review
7. Payment test/sandbox where supported
8. Canonical order
9. Admin sees order
10. Fulfillment assignment
11. Tracking
12. Customer order status
13. Delivered
14. Reorder

Also test alternate pathways:

- provider-required
- price pending
- held/out of stock
- classification pending
- RUO
- organization buyer
- affiliate-attributed purchase

# ACCEPTANCE: CUSTOMER CAN ACTUALLY BUY

The real production goal is not complete until Samuel can truthfully answer YES to:

- Can a legitimate customer enter the site?
- Can they create/sign into an account or use the approved access path?
- Can they find the product they want?
- Can they see a truthful action?
- Can eligible products enter a real cart?
- Can the server revalidate price/quantity/pathway?
- Can the customer provide shipping?
- Can the customer complete the approved payment path?
- Does successful payment create one canonical order?
- Can admin see it?
- Can fulfillment process it?
- Can tracking reach the customer?
- Can the customer see order history?
- Can the customer reorder?
- Can provider-required items route correctly instead of bypassing Care?
- Can non-direct products fall back to request/quote instead of dead-ending?

# BUILD ORDER AFTER PHASE ZERO

Once the assisted-order survey is live:

P1
Request review → quote/order conversion

P2
Real direct cart + checkout shell

P3
Approved payment integration

P4
Canonical order + payment + fulfillment orchestration

P5
Tracking + customer order portal + reorder

P6
Organization/B2B buying

P7
Affiliate attribution → commission → payout

P8
Supplier workspace

P9
Care/provider end-to-end

P10
Subscriptions/retention

P11
Analytics/CRM/notifications/Google Workspace

P12
Observability/release automation/DR

Continue the complete platform.

# MULTI-ACCOUNT EXECUTION

Use `.xenios` as shared memory.

Do not wait for one giant session.

Parallelize through disjoint leases:

Lane A:
Phase Zero live production

Lane B:
Direct commerce/cart/checkout

Lane C:
Payment/order orchestration

Lane D:
Admin/fulfillment/tracking

Lane E:
Full-vision demo

Lane F:
Affiliates/B2B

Only when file ownership permits.

# REQUIRED STATUS

At major milestones return:

[REAL XENIOS COMMERCE STATUS]

ASSISTED ORDER:
LIVE / READY / BLOCKED

DIRECT BUY:
LIVE / PARTIAL / DARK

CART:
LIVE / PARTIAL / DARK

CHECKOUT:
LIVE / PARTIAL / DARK

PAYMENT:
LIVE / MANUAL / SANDBOX / DARK

CANONICAL ORDER:
LIVE / PARTIAL / DARK

ADMIN ORDER OPS:
LIVE / PARTIAL / DARK

FULFILLMENT:
LIVE / MANUAL / PARTIAL / DARK

TRACKING:
LIVE / MANUAL / PARTIAL / DARK

REORDER:
LIVE / PARTIAL / DARK

ORGANIZATION BUYING:
LIVE / PARTIAL / DARK

AFFILIATE:
LIVE / PARTIAL / DARK

CARE:
LIVE / PARTIAL / DARK

FULL-VISION DEMO:
LIVE LOCAL / PARTIAL / NOT STARTED

HIGHEST CASHFLOW BLOCKER:

NEXT RELEASE:

PRODUCTION APPROVAL NEEDED:
YES / NO

Then continue building.

# FINAL DIRECTIVE

Do BOTH:

1. Build the safe full-vision clickable demo so Samuel can experience Xenios end to end now.
2. Build the REAL production Xenios site so legitimate customers can actually discover, select, request/buy, pay, receive, track, and reorder through the correct pathway.

Immediate cashflow comes first.

The assisted-order survey gets demand flowing.

Then automate the path all the way to real customer purchase and fulfillment.

Do not stop at a demo.
Do not stop at a survey.
Do not stop at a roadmap.

BUILD THE REAL BUSINESS.

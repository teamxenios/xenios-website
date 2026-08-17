# XENIOS RESEARCH — FABLE 5 FULL-VISION END-TO-END DEMO BUILD

## Purpose

Build a complete, clickable Xenios Research demo inside the existing `teamxenios/xenios-website` repository so Samuel can test the full vision end to end without touching production.

This is a product-validation/demo lane. It must not delay or modify the active Phase Zero cashflow release.

## Core Goal

Create a fully interactive demo covering:

PUBLIC
→ APPLY / LOGIN
→ MEMBER HOME
→ CATALOG
→ ASSISTED ORDER
→ ADMIN REVIEW
→ QUOTE
→ PAYMENT SIMULATION
→ SUPPLIER FULFILLMENT SIMULATION
→ TRACKING
→ DELIVERED
→ REORDER

Plus:

AFFILIATE
→ REFERRAL
→ CONVERSION
→ COMMISSION
→ PAYOUT SIMULATION

ORGANIZATION
→ TEAM / BUYER PROFILE
→ CATALOG
→ VOLUME REQUEST
→ QUOTE
→ ORDER HISTORY

CARE
→ PROVIDER-REQUIRED PRODUCT
→ CARE INTAKE
→ APPOINTMENT / REVIEW SIMULATION
→ NEVER FABRICATE A PRESCRIPTION

SUPPLIER
→ MINIMUM-DATA FULFILLMENT REQUEST
→ ACCEPT
→ PROCESSING
→ TRACKING

ADMIN
→ REQUEST QUEUE
→ CUSTOMER
→ QUOTE
→ PAYMENT REVIEW
→ SUPPLIER ASSIGNMENT
→ TRACKING
→ ANALYTICS

## Non-Negotiable Safety Boundary

Create an explicit demo mode, for example:

`RESEARCH_DEMO_MODE=true`

Enforce all of these:

1. Demo mode must refuse when `NODE_ENV === "production"`.
2. Demo routes must refuse in production.
3. Demo adapters must never write to production Supabase.
4. No real payment provider.
5. No real email.
6. No real SMS.
7. No real supplier notification.
8. No real prescription.
9. No real shipment purchase.
10. Any clinical/provider event is clearly labeled simulated.
11. Any payment event is clearly labeled simulated.
12. Add automated tests proving demo mode cannot activate in production.

## Demo Entry

Create:

`/research/demo`

Screen:

# Xenios Interactive Demo

Copy:

"Experience the Xenios platform across customers, organizations, affiliates, suppliers, Care and operations. All activity in this environment is simulated and does not create production orders, payments, prescriptions or shipments."

Buttons/cards:

- Start Demo
- Customer / Member
- Organization Buyer
- Affiliate
- Supplier
- Admin / Operations
- Care Journey
- Run Full Scenario

## Global Demo Bar

Persistent thin bar:

`DEMO MODE — No production actions`

Controls:

- Persona switcher
- Reset scenario
- Demo inbox
- Event timeline
- Exit demo

## Seeded Scenario

Customer:
- Jordan Carter
- jordan.demo@xenios.local
- Austin, Texas demo shipping address

Affiliate:
- Avery Demo Partner
- Referral code: AVERY-DEMO

Organization:
- Atlas Performance Lab

Supplier:
- Demo Fulfillment Partner

## Customer Journey

### 1. Gateway

Show a polished Xenios Research gateway with:

- Explore Xenios
- Apply
- Sign in
- Early Access
- Demo

In demo mode, allow:
`Continue as Jordan`

### 2. Member Dashboard

Show:

- Welcome
- Membership/status
- Blueprint teaser
- Requests/orders
- Recommended categories
- Recent activity
- Notifications
- Referral attribution when present

### 3. Full Catalog

Reuse the real canonical catalog projection where possible.

Demonstrate:

- Direct eligible
- Provider required
- Price pending
- Classification/activation required
- Out of stock/held
- RUO

Never display `$0` for a missing price.

### 4. Product Detail

Show:

- product
- strength/specification
- format
- customer-safe price when available
- pathway/status
- quantity
- relevant documentation/COA
- CTA

### 5. Assisted Order Survey

Reuse the real assisted-order UI.

Fields:

- name
- email
- phone
- 18+ confirmation
- organization optional
- shipping
- billing if different

Select multiple products, including:

- one direct product
- one provider-required product
- one price-pending product

### 6. Review

Show:

- items
- quantities
- priced lines
- price-on-request lines
- provider-required warning
- estimated total
- assisted_order_form_v1 acknowledgments

### 7. Submit

Create a demo request:

`XRR-DEMO-A7F92`

Persist only in demo state.

### 8. Customer Status

Timeline:

- Submitted
- Under Review
- Waiting on Customer
- Payment Pending
- Processing
- Shipped
- Delivered

Transitions happen only through demo controls.

## Admin Journey

Switch to Admin.

Use the real-looking admin shell.

Show:

- request reference
- customer
- contact
- shipping
- lines
- quantities
- estimated value
- pathway warnings
- affiliate attribution
- internal notes
- status
- agreement status
- payment status
- supplier status
- tracking

Admin can click:

`Review Request`

Then:

- confirm lines
- flag pricing follow-up
- route provider item to Care
- add notes

## Quote / Order Conversion

Create simulated:

`XQ-DEMO-1042`

and after acceptance:

`XO-DEMO-2042`

No production order.

Customer receives an in-demo notification:

"Your Xenios request has been reviewed."

Actions:

- Accept
- Ask a question

## Payment Simulation

Button:

`SIMULATE PAYMENT`

Display:

`Demo transaction — no funds will move.`

Result:

`PAID — SIMULATED`

Create demo event:

`demo_payment_verified`

Do not call real payment rails.

## Supplier Journey

Switch to Supplier.

Show only minimum fulfillment information:

- fulfillment reference
- products
- quantities
- shipping destination fields strictly needed for demo
- service level
- target date

Never show:

- customer price
- Xenios margin
- affiliate
- unrelated history
- private internal notes

Supplier actions:

Accept
→ Processing
→ Shipped

Demo tracking:

`1ZDEMO123456789`

## Customer Tracking

Customer sees:

Processing
→ Shipped
→ Delivered

Tracking:
`1ZDEMO123456789`

## Reorder

After Delivered:

`REORDER`

Prefill eligible prior lines.

Never carry provider approval or restricted state automatically into a reorder.

## Affiliate Journey

Affiliate dashboard:

- referral link
- referral code
- clicks
- leads
- submitted requests
- paid conversions
- pending commission
- approved commission
- simulated paid commission

Attribute Jordan to:

`AVERY-DEMO`

When simulated payment occurs, conversion becomes eligible.

Show:

`SIMULATED COMMISSION`

Lifecycle:

Pending
→ Approved
→ Payable
→ Paid — Simulated

## Organization / B2B Journey

Organization:

Atlas Performance Lab

Show:

- organization dashboard
- users/roles
- buyer profile
- organization pricing marker
- catalog
- large quantity request
- request quote
- invoices/history

For quantities above normal self-service authority:

`REQUEST VOLUME ORDER`

## Care / Provider Journey

Choose a provider-required product.

Show:

`Provider workflow required`

CTA:

`Explore Care`

Demo:

Eligibility
→ Intake
→ Appointment request
→ Provider review pending
→ Follow-up

Never show a prescription or provider approval as real.

## Demo Control Center

Provide controls:

### Customer
- Reset
- Add referral attribution
- Request document
- Simulate document upload

### Admin
- Under review
- Create quote
- Accept quote as customer

### Payment
- Simulate success
- Simulate failure

### Supplier
- Assign supplier
- Accept fulfillment
- Processing
- Add tracking
- Delivered

### Affiliate
- Approve commission
- Simulate payout

### Notifications
- Demo customer email
- Demo admin email
- Demo supplier notification

All notifications stay in an on-screen demo inbox.

## Event Timeline

Show a clear timeline, e.g.:

10:00 Customer entered Early Access
10:03 Request XRR-DEMO-A7F92 submitted
10:03 Admin notification queued
10:05 Admin opened request
10:07 Quote XQ-DEMO-1042 created
10:09 Customer accepted quote
10:10 Payment simulated
10:11 Order XO-DEMO-2042 created
10:12 Supplier assigned
10:15 Supplier accepted
10:30 Tracking added
11:15 Delivered
11:16 Affiliate commission eligible

## Visual Quality

Use the existing Xenios design system.

Target:

- premium health technology
- minimal
- restrained
- responsive
- polished
- clear hierarchy
- strong desktop and mobile
- useful empty/loading/error states
- not a generic developer dashboard

## Full Scenario

Add:

`RUN FULL XENIOS JOURNEY`

Progress:

1. Discover
2. Join
3. Browse
4. Request
5. Review
6. Pay
7. Fulfill
8. Track
9. Reorder
10. Refer

Samuel must still be able to click every step manually.

## Demo State

Use a separate demo adapter.

Preferred:

- browser/session state, or
- demo-only in-memory server store, or
- isolated local/staging database

Never production Supabase.

## Automated End-to-End Test

Use the repo-standard browser E2E framework.

Test:

1. Open demo
2. Continue as Jordan
3. Browse catalog
4. Add multiple products
5. Submit request
6. Verify XRR reference
7. Switch admin
8. Find request
9. Create quote
10. Switch customer
11. Accept quote
12. Simulate payment
13. Switch supplier
14. Accept fulfillment
15. Add tracking
16. Mark delivered
17. Switch customer
18. Verify delivered
19. Reorder
20. Switch affiliate
21. Verify conversion/commission

Also assert:

- provider-required never becomes direct
- price pending never becomes $0
- RUO limits remain
- supplier never sees customer price/margin
- demo mode refuses in production
- no external payment/email/supplier mutation occurs

## Make It Easy for Samuel

Create one command:

`npm run demo`

or repository-native equivalent.

At completion provide:

- exact command
- exact local URL
- personas
- 10-minute click-through
- screenshots if available
- automated E2E result
- known gaps

## Do Not Block Cashflow Release

This is a parallel lane.

Do not modify the active Phase Zero production-execution files or delay the live order-survey release.

Respect `.xenios` path leases.

## Deliverable

Return:

[COMPLETE XENIOS END-TO-END DEMO READY]

BRANCH:
FINAL SHA:
LOCAL COMMAND:
LOCAL URL:
DEMO ENTRY:
CUSTOMER:
ADMIN:
AFFILIATE:
ORGANIZATION:
SUPPLIER:
CARE:
CATALOG:
ASSISTED ORDER:
QUOTE:
PAYMENT SIM:
FULFILLMENT SIM:
TRACKING:
REORDER:
COMMISSION SIM:
DEMO INBOX:
EVENT TIMELINE:
MOBILE:
E2E TEST:
PRODUCTION ISOLATION TEST:
PRODUCTION MUTATED:
NO

Then give Samuel a 10-minute exact click-through script.

Do not stop at a plan.

BUILD THE DEMO.
TEST THE DEMO.
MAKE IT CLICKABLE.

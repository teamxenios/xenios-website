XENIOS FULL-VISION DEMO LANE

Execute:

.xenios/prompts/UNIVERSAL_TAKEOVER_PROMPT.md
.xenios/prompts/XENIOS_CASHFLOW_FIRST_EXECUTION_OVERLAY_2026-08-17.md
.xenios/prompts/XENIOS_FABLE5_FULL_VISION_END_TO_END_DEMO_PROMPT_2026-08-17.md
.xenios/prompts/XENIOS_REAL_CUSTOMER_BUYING_FULL_SITE_OVERLAY_2026-08-17.md

Read:

.xenios/VISION_GAP_MAP.md
.xenios/ACTIVE_TASKS.json
.xenios/CODE_OWNERSHIP.json

Claim:

FULL-VISION-DEMO

if it remains ready and unowned.

Expected disjoint ownership includes:

client/src/research/demo/**
server/research/demo/**
e2e/**

Do not touch:

the Phase Zero production-execution lease

the assisted-order conversion lease

shared composition files owned by another active account

Build the real clickable:

/research/demo

experience covering:

Customer
Member
Catalog
Assisted order
Admin review
Quote
Payment simulation
Supplier fulfillment
Tracking
Delivered
Reorder
Affiliate attribution
Commission simulation
Organization/B2B
Care/provider routing
Demo notifications
Demo inbox
Event timeline
Persona switching
Full journey

Use existing Xenios contracts and components wherever possible.

Use demo-only adapters for unfinished external systems.

Demo mode must be impossible to activate in production.

No real payment.
No real email.
No real supplier action.
No real prescription.
No real production database write.

Add a repository command such as:

npm run demo

Add an automated browser E2E suite.

Give Samuel:

local command
local URL
test personas
10-minute click-through
screenshots where possible
known gaps

Do not return another plan.

Build it, run it, test it, and make it clickable.

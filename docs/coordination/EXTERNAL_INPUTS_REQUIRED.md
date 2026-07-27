# External inputs required

Software work must remain truthful when these inputs are absent. No session may
invent a value, create a fake production record, or silently enable a capability
to make a readiness screen appear complete.

| ID | Status | Owner | Exact input required | Blocks | Safe behavior while absent |
|---|---|---|---|---|---|
| `EXT-AUTH-ADMIN-SESSION` | `PENDING_EXTERNAL` | Authorized Xenios administrator | An existing authorized admin session for authenticated Product Control empty-list and authorization smoke. Do not create an account for QA. | Authenticated production UI/API verification | Keep signed-out 401 and public gate evidence only; mark authenticated smoke pending. |
| `EXT-RENDER-WORKSPACE` | `PENDING_EXTERNAL` | Render workspace administrator | Explicit selection/access to the Xenios Render workspace and service log stream. | Detailed production error-log verification | Verify deployment identity and HTTP behavior; mark detailed log evidence unavailable. |
| `EXT-PRODUCT-MASTER-DATA` | `PENDING_BUSINESS_INPUT` | Xenios product owner | Reviewed real products, variants, canonical SKUs, audience classification, approved effective-dated prices, and approved media/object metadata. | Catalog publication and commerce readiness | Keep Product Control rows empty and catalog/commerce fail-closed. |
| `EXT-INVENTORY-LOT-COA` | `PENDING_OPERATIONS_INPUT` | Xenios operations/quality owner | Real inventory quantities, warehouse/location identity, exact lot IDs, expiry, disposition, and exact-lot COA objects/results. | Inventory eligibility, allocation, and checkout | Do not fabricate availability; checkout and allocation remain disabled. |
| `EXT-PAYMENT-PROVIDER` | `PENDING_PROVIDER_INPUT` | Xenios finance/provider owner | Approved production provider selection plus `PAYMENTS_PROVIDER`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_RESEARCH_ACTIVATION`, and `STRIPE_PRICE_RESEARCH_MEMBERSHIP`; price objects must match approved economics. | Activation billing, capture, refunds, subscriptions | Provider resolves disabled and payment mutations fail closed. |
| `EXT-SHIPPING-PROVIDER` | `PENDING_PROVIDER_INPUT` | Xenios fulfillment owner | Approved `SHIPPING_PROVIDER`, `RESEARCH_LIVE_SHIPPING_ENABLED`, production credentials/configuration required by the selected carrier, and reviewed `RESEARCH_SERVICEABLE_STATES`. | Live shipping rates and serviceability | Use no invented rates; live shipping remains disabled. |
| `EXT-MITCH-FULFILLMENT` | `PENDING_PROVIDER_INPUT` | Mitch/Xenios fulfillment owners | Written production configuration plus `RESEARCH_MITCH_FULFILLMENT_ENABLED`, `MITCH_PROVIDER`, `MITCH_ENDPOINT_URL`, `MITCH_API_KEY`, and `MITCH_WEBHOOK_SECRET`; no `MITCH_TEST_` markers. | Fulfillment transmission and webhook processing | Disabled provider; no external action or payload transmission. |
| `EXT-AFFILIATE-PROFESSIONAL` | `PENDING_BUSINESS_AND_LEGAL_INPUT` | Xenios partnerships, finance, and counsel | Approved affiliate terms, commission/payout rules, professional-account eligibility, tax/compliance workflow, and payout-provider configuration. | Affiliate payouts and professional accounts | Surfaces remain informational or disabled; no commissions/revenue fabricated. |
| `EXT-LEGAL-ACTIVATION` | `PENDING_LEGAL_INPUT` | Counsel and Samuel | Current written approval for each release-blocking agreement, consent, product claim, geography, provider, and final activation decision. | Public enablement of regulated or sensitive capabilities | Required-input/readiness and launch switches remain fail-closed. |

## Handling rules

- Record environment **names**, never secret values.
- A secret supplied in chat, source, a PR, a release manifest, or this document
  is a security incident, not completion evidence.
- Website 2 may mark an item complete only from observed provider/business/legal
  evidence and must append the exact evidence reference to the execution log.
- Completion of one input does not imply completion of another.
- Real inputs authorize verification of the bounded capability only; they do not
  authorize unrelated data creation or activation.

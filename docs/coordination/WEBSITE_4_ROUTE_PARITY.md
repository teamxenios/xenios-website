# Website 4 route parity

All routes below are server registered on the Website 4 branch. Shared registration into the production Express composition root remains Website 2’s release task.

## Operations adapter

| Method | Client path | Server registration | Authentication / role | Ownership | Repository / persistence | Test | Enabled state |
|---|---|---|---|---|---|---|---|
| GET | `/api/admin/research/operations/dashboard` | `server/research/operations/routes.ts` | verified admin | admin scope | canonical commerce + Website 4 projections | `routes.test.ts` | enable after migration/wiring |
| GET | `/api/operations/mitch/queues/:queue` | same | verified Supabase user + enabled Mitch/logistics assignment | assigned logistics role | `research_fulfillment_work_orders` + canonical fulfillment | `routes.test.ts` | enable after staff provisioning |
| GET | `/api/research/orders/:orderId/tracking` | same | active member | member resolved server-side | canonical order/fulfillment/shipment | `routes.test.ts` | enable after migration/wiring |
| POST | `/api/operations/mitch/orders/:orderId/acknowledge` | same | Mitch/logistics | staff assignment | atomic fulfillment RPC | `routes.test.ts`, SQL behavior test | enable after migration/wiring |
| POST | `/api/operations/mitch/orders/:orderId/expected-date` | same | Mitch/logistics | staff assignment | atomic fulfillment RPC | focused domain tests | enable after migration/wiring |
| POST | `/api/operations/mitch/orders/:orderId/allocate` | same | Mitch/logistics | staff assignment + exact canonical lot allocation | atomic fulfillment RPC | SQL behavior test | enable after allocation bridge |
| POST | `/api/operations/mitch/orders/:orderId/pick` | same | Mitch/logistics | staff assignment | atomic fulfillment RPC | SQL behavior test | enable after migration/wiring |
| POST | `/api/operations/mitch/orders/:orderId/pack` | same | Mitch/logistics | staff assignment | atomic fulfillment RPC | SQL behavior test | enable after migration/wiring |
| POST | `/api/operations/mitch/orders/:orderId/label` | same | Mitch/logistics | staff assignment | atomic fulfillment RPC + canonical shipment | SQL behavior test | provider label creation remains gated |
| POST | `/api/operations/mitch/orders/:orderId/ship` | same | Mitch/logistics | staff assignment + exact lot | atomic fulfillment RPC + canonical traceability | SQL behavior test | enable after migration/wiring |
| POST | `/api/operations/mitch/orders/:orderId/exception` | same | Mitch/logistics | staff assignment | Website 4 exception/audit tables | focused domain tests | enable after migration/wiring |
| POST | `/api/operations/mitch/orders/:orderId/note` | same | Mitch/logistics | staff assignment | Website 4 notes/audit tables | focused domain tests | enable after migration/wiring |
| GET | `/api/research/affiliate/dashboard` | same | verified partner | member → partner resolution | canonical attribution/commission/payout + metric events | affiliate + route tests | superseded by canonical partner dashboard after shared integration |
| POST | `/api/research/affiliate/links` | same | active verified partner | member → partner resolution | canonical partner links | affiliate + route tests | enable for active partners only |
| POST | `/api/research/professional-accounts/apply` | same | public intake | no privileged ownership | atomic professional-account RPC | route + SQL behavior tests | enable after migration |
| GET | `/api/admin/research/professional-accounts` | same | verified admin | admin scope | Website 4 professional tables | route tests | enable after migration/wiring |
| GET | `/api/admin/research/operations/crm` | same | verified admin | admin scope | Website 4 CRM tables | route tests | enable after migration/wiring |
| GET | `/api/admin/research/operations/outbox` | same | verified admin | admin scope | canonical notification outbox | route tests | enable after migration/wiring |

## Partner adapter

The first three rows are owned by canonical commerce registration. The remaining 16 were the reported parity blocker and are now registered literally in Website 4.

| Method | Client path | Server registration | Authentication / role | Partner ownership | Repository / persistence | Test | Enabled state |
|---|---|---|---|---|---|---|---|
| POST | `/api/research/partner/apply` | `server/research/commerce/routes.ts` | verified member | member resolved server-side | canonical partner/member store | commerce acceptance | existing commerce capability |
| GET | `/api/research/partner/dashboard` | commerce routes | verified member | member → partner | canonical partner/commission stores | commerce acceptance | existing commerce capability |
| GET | `/api/research/partner/links` | commerce routes | verified member | member → partner | canonical partner links | commerce acceptance | existing commerce capability |
| GET | `/api/research/partner/conversions` | operations routes | verified non-terminated partner | member → partner | canonical attribution conversions, aggregate only | `partner-route-parity.test.ts`, `routes.test.ts` | enable after migration/wiring |
| GET | `/api/research/partner/leads` | operations routes | same | same | canonical attribution touches, aggregate only | same | enable after migration/wiring |
| GET | `/api/research/partner/commissions` | operations routes | same | same | immutable canonical commission ledger | same | enable after migration/wiring |
| GET | `/api/research/partner/payouts` | operations routes | same | same | canonical payout batches; no credentials | same | capability-gated until provider configured |
| GET | `/api/research/partner/resources` | operations routes | same | same | preapproved canonical content assets; no invented URL | same | truthful empty/download-pending supported |
| GET | `/api/research/partner/training` | operations routes | same | same | canonical partner training | same | enable after migration/wiring |
| GET | `/api/research/partner/campaigns` | operations routes | same | same | private partner portal requests | same | enable after migration/wiring |
| POST | `/api/research/partner/campaigns/request` | operations routes | same | same | atomic idempotent partner request RPC | route + SQL behavior tests | enable after migration/wiring |
| GET | `/api/research/partner/events` | operations routes | same | same | private partner portal requests | route parity tests | enable after migration/wiring |
| POST | `/api/research/partner/events/request` | operations routes | same | same | atomic idempotent partner request RPC | route + SQL behavior tests | enable after migration/wiring |
| GET | `/api/research/partner/organizations` | operations routes | same | same | canonical organizations + private requests | route parity tests | enable after migration/wiring |
| POST | `/api/research/partner/organizations/request` | operations routes | same | same | atomic idempotent partner request RPC | route + SQL behavior tests | enable after migration/wiring |
| GET | `/api/research/partner/compliance` | operations routes | same | same | private partner portal requests | route parity tests | enable after migration/wiring |
| POST | `/api/research/partner/compliance/submissions` | operations routes | same | same | atomic idempotent partner request RPC | route + SQL behavior tests | enable after migration/wiring |
| GET | `/api/research/partner/onboarding` | operations routes | same | same | canonical partner gates and agreements | route parity tests | enable after migration/wiring |
| GET | `/api/research/partner/security/sessions` | operations routes | same | same | hashed verified-session records; no raw token/IP | route parity tests | enable after migration/wiring |

ROUTE PARITY STATUS: 0 ENABLED CLIENT ENDPOINTS WITHOUT SERVER REGISTRATION ON THIS BRANCH

# Xenios founder admin data-access matrix

Date: 2026-09-24  
Candidate base: `79414143d4355d5d3d14cd5fe6e5a536dc68d99d`  
Authority invariant: every data read and mutation remains behind the existing server admin guard and the authenticated Supabase bearer session. The UI does not infer authority from an email string. Recovery-purpose sessions are denied. Care visibility remains operational and minimum-necessary; this work creates no clinical-record bypass.

`Page adapter` below means the existing page-specific adapter/API already mounted by that surface. It does not imply a new endpoint or authority.

| SURFACE | ROUTE | API | AUTHORITY | SAMUEL ACCESS | DATA AVAILABLE | MUTATION AVAILABLE | STATUS | NEXT ACTION |
|---|---|---|---|---|---|---|---|---|
| Canonical admin entry | `/admin` | `/api/admin/me`, classic admin APIs | `requireSupabaseAdmin` | After server confirmation | Identity, waitlist, LOI, bookings, analytics, Research entry | Existing classic operations only | Live | Land a new confirmed login on command center |
| Research overview | `/admin/research` | `/api/admin/me`, system-status adapters | `requireSupabaseAdmin` | Same session | Research operations overview | Existing controls only | Live | Keep as complete operations entry |
| Founder command center | `/admin/research/command-center` | `/api/admin/research/command-center` | `requireSupabaseAdmin` | Same session | Privacy-minimal cross-workflow aggregate | None; navigation only | Live | Keep Today / needs-attention source-owned |
| Care requests | `/admin/research/care-requests` | Care admin adapter | Admin plus Care operational boundary | Same session | Operational routing/follow-up facts only | Existing workflow actions | Live | Preserve minimum-necessary clinical boundary |
| Referral lifecycle | `/admin/research/referral-lifecycle` | Referral lifecycle adapter | `requireSupabaseAdmin` | Same session | Referral lifecycle state | Existing guarded actions | Live | Keep linked from founder directory |
| Applications | `/admin/research/applications` | Applications admin adapter | `requireSupabaseAdmin` | Same session | Application queue | Existing review actions | Live | Keep direct queue link |
| Application detail | `/admin/research/applications/:id` | Application detail adapter | `requireSupabaseAdmin` | Same session | One authorized application | Existing approve/request-info actions | Live | Deep route rechecks authority |
| Members | `/admin/research/members` | Members admin adapter | `requireSupabaseAdmin` | Same session | Account inspection list/search | Existing account operations only | Live | Keep direct queue link |
| Member detail | `/admin/research/members/:id` | Member detail/access diagnosis adapters | `requireSupabaseAdmin` | Same session | One authorized account and access diagnosis | Existing guarded actions | Live | Deep route rechecks authority |
| Plans roster | `/admin/research/plans` | No supported mounted list read | `requireSupabaseAdmin` | Route retained | Unavailable | No | Authority unavailable | Do not advertise as live |
| Plan detail | `/admin/research/plans/:id` | Existing detail adapter where a valid id is supplied | `requireSupabaseAdmin` | Deep-link only | Record-dependent | Existing guarded actions only | Mounted, partial | Keep out of primary nav until list authority exists |
| Plan review | `/admin/research/blueprint-review` | Blueprint review adapter | `requireSupabaseAdmin` | Same session | Human review queue | Existing review actions | Live | Keep direct queue link |
| Products | `/admin/research/products` | Products admin adapter | `requireSupabaseAdmin` | Same session | Product lifecycle | Existing product actions | Live | Keep direct queue link |
| Product detail | `/admin/research/products/:id` | Product detail adapter | `requireSupabaseAdmin` | Same session | One product | Existing product actions | Live | Deep route rechecks authority |
| Product configuration | `/admin/research/product-configuration` | Website/product configuration adapter | `requireSupabaseAdmin` | Same session | Current configuration | Existing controlled configuration writes | Live | Keep discoverable |
| Product requests | `/admin/research/product-requests` | Product-request admin adapter | `requireSupabaseAdmin` | Same session | Request queue | Existing triage actions | Live | Keep direct queue link |
| Product request detail | `/admin/research/product-requests/:id` | Product-request detail adapter | `requireSupabaseAdmin` | Same session | One request | Existing triage actions | Live | Deep route rechecks authority |
| Inventory lots | `/admin/research/inventory/lots` | Inventory admin adapter | `requireSupabaseAdmin` | Same session | Inventory and lot records | Existing recorded commands | Live | Keep under Inventory |
| Exact-lot COAs | `/admin/research/inventory/coas` | COA admin adapter | `requireSupabaseAdmin` | Same session | COA state and controlled publication | Existing review/publication actions | Live | Keep under Inventory |
| Assisted orders | `/admin/research/assisted-orders` | Assisted-order admin adapter | `requireSupabaseAdmin` | Same session | Request queue | Existing workflow actions | Live | Add to founder directory |
| Assisted-order detail | `/admin/research/assisted-orders/:requestId` | Assisted-order detail adapter | `requireSupabaseAdmin` | Same session | One request | Existing workflow actions | Live | Deep route rechecks authority |
| Orders | `/admin/research/orders` | Orders admin adapter | `requireSupabaseAdmin` | Same session | Canonical order files | Existing order operations | Live | Keep direct queue link |
| Order detail | `/admin/research/orders/:id` | Order detail adapter | `requireSupabaseAdmin` | Same session | One order, shipping/tracking when available | Existing progression actions | Live | Deep route rechecks authority |
| Independent fulfillment | `/admin/research/fulfillment` | Superseded engine adapter | `requireSupabaseAdmin` | Route retained | Not release-authoritative | No new authority | Superseded | Use canonical order progression instead |
| Commerce queues | `/admin/research/commerce-queues` | Commerce queue adapter | `requireSupabaseAdmin` | Same session | Operational queue state | Existing controls only | Live | Keep direct queue link |
| Questions/support | `/admin/research/questions` | Questions admin adapter | `requireSupabaseAdmin` | Same session | Support queue | Existing answer workflow | Live | Keep direct queue link |
| Question detail | `/admin/research/questions/:id` | Question detail adapter | `requireSupabaseAdmin` | Same session | One support item | Existing answer workflow | Live | Deep route rechecks authority |
| Guides | `/admin/research/guides` | No supported admin read | `requireSupabaseAdmin` | Route retained | Unavailable | No | Authority unavailable | Do not advertise as live |
| Guide detail | `/admin/research/guides/:id` | No supported admin read | `requireSupabaseAdmin` | Route retained | Unavailable | No | Authority unavailable | Do not advertise as live |
| Partner/referral integrity | `/admin/research/partners` | Partner admin adapter | `requireSupabaseAdmin` | Same session | Partner and integrity state | Existing guarded lifecycle actions | Live | Keep direct queue link |
| Partner detail | `/admin/research/partners/:id` | Partner detail adapter | `requireSupabaseAdmin` | Same session | One partner | Existing guarded lifecycle actions | Live | Deep route rechecks authority |
| Resource Hub | `/admin/research/resource-hub` | Resource Hub admin adapter | `requireSupabaseAdmin` | Same session | Resource versions and publication state | Existing controlled publication | Live | Keep direct queue link |
| Security and notifications | `/admin/research/security` | System health, outbox list/drain/requeue/test-email APIs | `requireSupabaseAdmin` | Same session | Safe provider state, delivery counts, attempts and worker/system status where available | Existing drain/requeue/test-email controls | Live | Canonical notification-health destination; never show keys |
| Privacy queue | `/admin/research/privacy` | No supported queue read | `requireSupabaseAdmin` | Route retained | Unavailable | No | Authority unavailable | Do not advertise as live |
| Capabilities | `/admin/research/capabilities` | Capabilities adapter | `requireSupabaseAdmin` | Same session | Capability availability | Existing controls only | Live | Keep discoverable |
| Required inputs | `/admin/research/required-inputs` | Required-inputs adapter | `requireSupabaseAdmin` | Same session | Blocking/informational inputs | Existing controls only | Live | Keep discoverable |
| Payment verification | `/admin/research/activation-queue` | Activation queue adapter | `requireSupabaseAdmin` | Same session | Manual review queue | Existing guarded verification actions | Live | Keep direct queue link |
| Payment bridge | `/admin/research/activation-bridge` | Activation bridge adapter | `requireSupabaseAdmin` | Same session | Bridge state | Existing guarded actions | Live | Keep discoverable |
| Day 15 checklist | `/admin/research/activation-checklist` | Checklist adapter | `requireSupabaseAdmin` | Same session | Activation checklist | Existing guarded actions | Live | Keep discoverable |
| Reconciliation | `/admin/research/activation-reconciliation` | Reconciliation adapter | `requireSupabaseAdmin` | Same session | Cross-system reconciliation state | Existing guarded actions | Live | Keep discoverable |
| Readiness | `/admin/research/activation-readiness` | Readiness adapter | `requireSupabaseAdmin` | Same session | Evidence and blockers | Existing guarded actions | Live | Keep discoverable |
| E-signatures | `/admin/research/esign` | E-sign admin adapter | `requireSupabaseAdmin` | Same session | Document/signature state | Existing guarded actions | Live | Keep discoverable |
| Early-access releases | `/admin/research/early-access/releases` | Early-access release adapter | `requireSupabaseAdmin` plus server feature authority | Same session if enabled | Environment-dependent | Existing guarded actions | Feature gated | Show status; server remains authority |
| Early-access payments | `/admin/research/early-access/payments` | Early-access payment adapter | `requireSupabaseAdmin` plus server feature authority | Same session if enabled | Environment-dependent | Existing guarded actions | Feature gated | Show status; server remains authority |
| Early-access fulfillment | `/admin/research/early-access/fulfillment` | Early-access fulfillment adapter | `requireSupabaseAdmin` plus server feature authority | Same session if enabled | Environment-dependent | Existing guarded actions | Feature gated | Show status; server remains authority |
| Audit browser | `/admin/research/audit` | No supported admin read | `requireSupabaseAdmin` | Route retained | Unavailable | No | Authority unavailable | Do not advertise as live |

## Identity/config verification

- Expected business identity: `samuel@xeniostechnology.com`
- Production `ADMIN_EMAIL`: match verified through a read-only Render environment-variable metadata check on 2026-09-24.
- No secret value, token, key, password, or service-role credential is recorded here.
- No production configuration was changed.

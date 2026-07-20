# Route manifest (frozen expectations)

Input SHA 87150f4. LIVE = registered in merged main; PLANNED = a lane builds
it against these contracts. New member/commerce routes MUST reuse the merged
guards: `requireMember` (JWT + amr recovery-purpose denial), `requireActiveMember`
(active status + billing_state), `requireSupabaseAdmin` (also denies recovery
sessions). Do not invent parallel auth.

## LIVE in main (do not redefine; extend only by handoff)

Public/gate: `GET /api/research/me`, `POST /api/research/access`,
`POST /api/research/logout`, `GET /api/research/policies`,
`GET /api/config`, `GET /api/health`.
Applicant: `POST /api/research/applications`, `/applications/resend-link`,
`/applications/resubmit`, `GET /api/research/applications/status`.
Recovery: `POST /api/research/member/forgot-password` (wall-allowlisted),
`/research/reset-password` page.
Member: `POST /api/research/member/claim`, `GET /api/research/member/me`,
`GET /api/research/member/catalog` (active), `GET /api/research/catalog` (active),
`POST /api/research/orders` (active), `GET /api/research/member/referrals`,
`GET /api/research/invite/:code`.
Admin: `/api/admin/research/applications*` (review/approve/decline/request-info/
begin-activation/activate), `/outbox`, `/outbox/run`, `/outbox/:id/retry`,
`/test-email`, `/system-status`, `/referral-fraud*`; `/api/admin/*` dashboard.

## PLANNED (lane contracts — freeze before UI builds against them)

- G0 capabilities: `GET /api/research/capabilities` (member-safe booleans).
- G2: `GET /api/research/identity/status`, `GET/POST /api/research/agreements`,
  member activation + MFA endpoints.
- G3: `GET/PUT /api/research/profile`, `GET /api/research/assessment`,
  `POST /api/research/assessment/responses`.
- G4: `GET /api/research/blueprint`, `/plans/xenios30`, `/plans/xenios90`,
  `GET /api/research/documents`.
- G5: `GET/POST /api/research/tracker`, `/media`, `/questions`, telegram link.
- G6: `GET /api/research/products`, `/products/:slug`, `/guides`, `/guides/:slug`,
  `/goals`.
- G7: `/cart`, `/orders*`, `/subscriptions*`, `/shipping/quote`, fulfillment.
- G8: `/referrals*`, `/partners*`, `/commissions*`.
- G10: admin queues + `GET /api/admin/research/capabilities` (names+state, no values).

Each PLANNED route's request/response payload is frozen in API_CONTRACTS.md
before any UI or cross-lane consumer is built against it.

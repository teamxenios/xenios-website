# Xenios Account/Partner Production Handoff — 2026-09-07

## State

The explicitly authorized Universal Account and Partner Access release is deployed and serving. This is the narrow account/partner access release, not the full revenue launch.

## Exact identity

- Application SHA: `ff3c496245739233b71e46f9e5d6e26af9d57017`
- Application tree: `73734e113e8ef5f9e1f27ae4dae36bdf598abb25`
- Render service: `srv-d8s9vej7uimc7384dfcg`
- Deploy ID: `dep-dafcm567bikc7382rhng`
- Serving status: `live`
- Live completion: `2026-09-07T14:33:55.150237Z`
- Supabase project: `yvzeduaxbwgcwllhywff`

## Database receipt

Fresh read-only prechecks passed. Only the two authorized candidate migrations were applied, in order, with their exact LF SHA-256 values:

1. `20260905_research_approved_customer_access.sql` — `026ac29d3e17a86fa19100aa4c712e5d90fd66b2ef5de28774b8032965b171b5` — Supabase history version `20260907143147` — postcheck PASS.
2. `20260905_research_partner_lifecycle.sql` — `4f10c3e996cbe60e660981dc654e89af2d23e209f8252db067cb9a367b4f5bbb` — Supabase history version `20260907143204` — postcheck PASS.

Postcheck counts were `research_applications=3`, `research_members=3`, `research_application_events=10`, `research_notification_outbox=58`; and `research_partners=0`, `research_partner_agreements=0`, `research_partner_training=0`, `research_partner_lifecycle_events=0`.

## Smoke and observation

Public routes `/api/health`, `/`, `/research/apply`, `/research/sign-in`, and `/admin/research/members` returned 200. Protected catalog/member/customer-account reads and unauthenticated admin access inspection returned 401 as expected. A 60-second observation completed with the deploy live, health 200, and no Render error logs.

## Boundaries and remaining work

No real account approval or claim, partner activation, notification/email, payment, purchase, refund, shipment, clinical action, Resource Hub, recruiting, referral, price, commerce, or fulfillment activation occurred. Rollback was not used. Real-user verification remains pending separate approval naming the account and notification effects. Auto-deploy remains off and the release branch was not merged or rebound.

Canonical report: `docs/revenue-launch/20260905/PRODUCTION_DEPLOYMENT_REPORT_20260907.md`.

# Universal Account and Partner Access — Production Deployment Report

**Date:** 2026-09-07 14:35 UTC<br>
**Release lane:** Account/partner access only (not the full revenue launch)<br>
**Authorization:** Samuel Boadu's explicit exact-SHA production authorization<br>
**Evidence head:** `42153e2793df77ab3ae3c7313bea4ff6863c5af6`

## Exact release identity

- Application SHA: `ff3c496245739233b71e46f9e5d6e26af9d57017`
- Application tree: `73734e113e8ef5f9e1f27ae4dae36bdf598abb25`
- Render service: `srv-d8s9vej7uimc7384dfcg`
- Supabase project: `yvzeduaxbwgcwllhywff`
- Previous live/application rollback SHA: `db5a2d447114c1e8a14185a9865ded50ee3f1ac6`
- Render auto-deploy: off; release branch was not rebound.

## Preflight and migration receipts

Fresh read-only Supabase prechecks passed on project `yvzeduaxbwgcwllhywff`. The observed baseline was:

| Relation | Count |
|---|---:|
| `research_applications` | 3 |
| `research_members` | 3 |
| `research_application_events` | 10 |
| `research_notification_outbox` | 58 |
| `research_partners` | 0 |
| `research_partner_agreements` | 0 |
| `research_partner_training` | 0 |
| `research_partner_lifecycle_events` | 0 |

The candidate files were rehashed with LF normalization before apply and matched the authorized hashes:

1. `20260905_research_approved_customer_access.sql` — `026ac29d3e17a86fa19100aa4c712e5d90fd66b2ef5de28774b8032965b171b5`
2. `20260905_research_partner_lifecycle.sql` — `4f10c3e996cbe60e660981dc654e89af2d23e209f8252db067cb9a367b4f5bbb`

Both exact migrations applied successfully in the authorized order. Supabase migration history recorded them as:

- `20260907143147` / `20260905_research_approved_customer_access` — applied, postcheck PASS.
- `20260907143204` / `20260905_research_partner_lifecycle` — applied, postcheck PASS.

Postchecks returned the same expected counts (`3/3/10/58` for the customer-access relations and `0/0/0/0` for the partner relations). No additional migration was applied.

## Application deployment

- Deploy ID: `dep-dafcm567bikc7382rhng`
- Serving SHA: `ff3c496245739233b71e46f9e5d6e26af9d57017`
- Render status: `live`
- Finished/observed live: `2026-09-07T14:33:55.150237Z`
- The deploy was commit-pinned through the Render deploy API; the serving commit was re-read after completion and matched exactly.

## Public and read-only smoke

All checks were performed without authentication or data mutation:

- `GET /api/health` — 200.
- `GET /` — 200.
- `GET /research/apply` — 200.
- `GET /research/sign-in` — 200.
- `GET /admin/research/members` — 200.
- `GET /api/research/catalog` — 401 (unauthorized boundary expected).
- `GET /api/research/member/me` — 401 (unauthorized boundary expected).
- `GET /api/research/customer-account/overview` — 401 (unauthorized boundary expected).
- `POST /api/admin/research/access/inspect` without auth — 401 (unauthorized boundary expected).

The critical endpoint comparison matched the expected baseline/public-versus-unauthorized contract. No authenticated customer journey, account approval/claim, partner activation, notification, email, payment, purchase, refund, shipment, or clinical action was performed.

## Observation and rollback

A 60-second observation window completed with the deploy still `live`, `/api/health` returning 200, and the Render error-log query returning no entries. `RESEARCH_FOUNDING_ACTIVATION_ENABLED` and membership-billing configuration were not changed; commerce remained disabled. Rollback was not used.

Real-user verification remains pending and requires separate approval naming the account and any notification effects. Resource Hub, recruiting, referrals, price activation, commerce, payments, and fulfillment remain outside this release.

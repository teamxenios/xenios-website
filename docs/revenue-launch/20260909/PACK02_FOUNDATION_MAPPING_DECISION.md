# Pack02 foundation mapping decision

**Date:** 2026-09-09  
**Owner:** ASTRA-A  
**Status:** Source and staging decision recorded; no database mutation

## Decision

The existing `public.research_organizations` table remains the partner/reporting authority. It is not renamed, extended, or treated as the Pack02 buyer organization principal. Its observed shape includes `owner_partner_id` and `name`, and it does not have the Pack02 buyer columns (`slug`, `purchasing_email`, `billing_email`).

The first collision-free buyer path is the reviewed `research_b2b_*` bridge in `supabase/pack02-candidates/20260813_research_b2b_buyer_bridge.sql`:

- `research_b2b_buyer_relationships` is the temporary business relationship authority.
- `research_b2b_buyer_operators` binds a canonical `research_members` identity to that relationship and carries the reviewed buyer roles.
- `research_b2b_buyer_entitlements` is the fixed, versioned pricing entitlement (`KRIS_VOLUME_PARTNER`) and is not browser-selectable.
- `research_b2b_order_ownership` is immutable authorization metadata over canonical `research_orders`; it does not create an order, cart, payment, or fulfillment store.
- `research_b2b_buyer_events` is the append-only audit trail for bridge actions.

Supabase Auth remains the credential authority, `research_members` remains the personal identity authority, and `research_orders` remains the order authority. The existing Pack02 organization routes and `server/research/account-identity/production-store.ts` queries remain parked until a database-owner-approved migration establishes a collision-free permanent organization principal and updates those adapters together.

## Why the package SQL is not ready

`supabase/pack02-candidates/20260812_research_account_organizations.sql` directly creates `public.research_organizations` with the incompatible buyer schema. Applying it would collide with the partner/reporting authority and could make the account adapter read the wrong principal. The package CRM and organization candidates therefore remain un-applied.

## Required next gate

Before any staging or production write, the database owner must approve the bridge/permanent-organization boundary, provide an exact migration candidate, and pass isolated apply-twice, rollback, RLS, grants, SECURITY DEFINER, privilege, and concurrency checks. B may build against the DTO below without assuming organization-table availability.

## Stable DTO contract for B

Until the permanent organization principal is approved, business-buyer APIs must use:

```ts
type BuyerWorkspaceContext = {
  relationshipId: string;
  businessKey: string;
  businessDisplayName: string;
  roles: Array<"organization_owner" | "organization_admin" | "business_buyer" | "billing_viewer">;
  pricing: { profileKey: "KRIS_VOLUME_PARTNER"; profileVersion: number };
};
```

The server resolves this context only from the bearer-authenticated canonical member binding. A browser-supplied organization id, email, price profile, or role is never an authority. Zero or multiple active relationships/entitlements fail closed.

**Evidence:** `docs/PACK02_DEPLOYMENT_GATE_RESOLVED.json`, `.xenios/BLOCKED_EXTERNAL.md`, and the read-only staging preflight in `docs/revenue-launch/20260908/CRM_ORG_STAGING_PREFLIGHT_20260908.md`.

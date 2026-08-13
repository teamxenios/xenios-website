# Pack 02: client accounts and B2B identity overlay

Status: isolated implementation on `ba9fa0ae6a59059ea4ae8b53e709cd7bd26d07f0`. Routes, pages, SQL, grants, and RLS are not mounted or applied.

## Reused authorities

- Credentials, email verification, password changes, and sessions: existing Supabase Auth.
- Personal member identity and profile: existing `research_members` and `/api/research/profile` surfaces.
- Personal order history: existing `research_orders` API and tables.
- Guest/Early Access identity: existing durable `research_early_access_customers` and opaque `customerRef`.
- Early Access orders, invoices, and tracking: existing `research_early_access_placements`, cart checkout, invoice, and fulfillment tables.

The organization layer grants an existing Supabase Auth UID roles in an organization. It does not issue credentials. A `customerRef` binding assigns the existing customer/order scope to either one personal member or one organization; it does not copy or recreate orders.

Canonical commerce orders can carry one additive `research_organization_order_ownership` row keyed by the existing `research_orders.id`. It contains authorization provenance only—never totals, lines, payment state, invoices, or fulfillment state. Existing Early Access history is projected through the verified `customerRef` binding.

Normal order quantity is 1 through 50. Pack 02 displays 21 and 50 as ordinary canonical quantities and refuses a quantity-only `manual_review` projection inside that range while preserving genuine non-quantity review rules. The upstream dependency and superseded local Q50 candidates are recorded in `pack02-quantity-1-50-dependency.md`.

The unmounted account home now composes the existing member catalog, cart, product-request, order-history, profile, security, and password-recovery surfaces. It does not copy their data or create alternative APIs. Those links appear only when the verified Supabase subject has a canonical personal member row; an organization membership alone never unlocks personal commerce or history. Local-device sign-out uses the existing Supabase client with explicit local scope.

## Unmounted API overlay

- `GET /api/research/account/context`
- `POST /api/research/account/claims/request`
- `POST /api/research/account/claims/confirm`
- `POST /api/research/account/security/password-change-complete`
- `POST /api/research/account/organization-invitations/accept`
- `GET /api/research/account/organizations/:organizationId/dashboard`
- `PATCH /api/research/account/organizations/:organizationId/profile`
- `POST /api/research/account/organizations/:organizationId/users/invitations`
- `POST /api/research/account/organizations/:organizationId/orders/request-again`

Every route requires a server-verified Supabase JWT and confirmed email. Organization data additionally requires an active organization membership and appropriate role. The initial-password flag returns HTTP 428 until the existing Supabase password has been changed and the production dependency proves the change occurred after the flag was set.

## Claim rule

Claiming earlier history requires all of the following:

1. A non-recovery Supabase session with confirmed email.
2. An existing customer record for the opaque `customerRef`.
3. Exact normalized email match between Supabase Auth and the existing customer record.
4. An authorized target: the user's personal member row or an organization where the user is owner, admin, or buyer.
5. A one-time, expiring challenge delivered to the verified email.
6. An atomic challenge-consume plus unique customer-to-subject binding.

The raw challenge token is never stored; only its SHA-256 domain-separated hash is persisted. `customerRef` alone never establishes ownership.

## B2B behavior

Organization roles support owners, admins, business buyers, and billing viewers. Owners/admins can update business/billing/shipping profile fields and invite future users. Buyers can view organization-owned orders, invoices, and tracking and create an idempotent request-again intent. That intent references the existing order snapshot and is not an order, payment, or automatic reorder.

The dependent Roman Digital candidate uses the supplied existing Supabase Auth UID `20ec822d-8123-4088-ac05-9c8f4b2da784` and canonical email `info@romanhealthcollective.com`. It supersedes the old `k@romandigital.io` placeholder, requires the existing Auth row to be email-verified, binds owner/buyer roles, retains the password-change-required gate, and writes immutable audit evidence. It creates no Auth user and remains unapplied; see `pack02-roman-digital-binding.md`.

Kris's authoritative identity was not discoverable from the local worktree. The only name match is a synthetic unit-test fixture, and nothing proves the Roman Digital UID is Kris. Pack 02 therefore makes no guessed association. A read-only Supabase operator audit and the exact secure resolution path are prepared in `pack02-kris-identity-audit.md`.

## Integration work intentionally deferred

This lane now includes a tested, unmounted production dependency boundary for verified JWT resolution, hash-only challenge persistence, delivery handoff, and fail-closed password-change evidence. The final-base integration owner must implement its storage methods against the reviewed candidate tables and existing order projections, connect challenge/invitation delivery to a reviewed encrypted/immediate provider path, mount the registration function and pages, and add the candidate SQL to the reviewed migration DAG. None of those integration actions are safe on this sibling base.

# Roman Health Marketplace sponsored B2B claim packet

Status: candidate only. Do not apply, mount, send, or deploy from this lane.

## Locked business facts

- Login/contact email: `info@romanhealthcollective.com`
- Human operator first name: `Kris`
- Buyer display name: `Roman Health Marketplace`
- Relationship: B2B2C marketplace partner
- Roles: `organization_owner`, `business_buyer`
- Pricing profile: `KRIS_VOLUME_PARTNER`, owned by the Roman buyer relationship
- Orders: canonical `research_orders`, with immutable Roman ownership evidence

The last production read reported no Auth user, application, member, or conflict.
The preparation RPC repeats that exact-email check under a transaction-scoped
advisory lock before any insert. Any new evidence stops the write.

## Human facts still required

The canonical `research_applications` relation requires facts that must not be
invented:

1. Kris's exact last name.
2. Kris's country.
3. The correct existing applicant-type value: `individual` or `professional`.
4. The authoritative positive integer version of `KRIS_VOLUME_PARTNER`.
5. The authoritative entitlement effective timestamp.

No legal entity name, tax identifier, billing address, shipping address,
password, or public application essay is required to send the claim. Those
business profile facts can be collected through the later reviewed profile
workflow without blocking identity proof.

## Fast path C

1. Database owner fingerprints the exact application/member/role/order schema.
2. Rehearse `20260813_research_b2b_buyer_bridge.sql`, then
   `20260813_research_b2b_sponsored_claim.sql`, twice in an isolated PostgreSQL
   environment and prove rollback, grants, RLS, triggers, and RPC behavior.
3. Compose `createSupabaseSponsoredB2BClaimDeps` with:
   - the canonical Supabase service client for bounded identity reads and the
     delivery-acknowledgement RPC;
   - an actor-scoped Supabase client carrying the authenticated existing
     `super_admin` or `operations_admin` JWT;
   - the existing purpose-scoped `account_claim` notification/outbox delivery.
4. Call `prepareSponsoredB2BClaim` with the locked facts and the five exact
   human/pricing inputs above. The input schema is strict and rejects password
   material.
5. The database creates one approved B2B-sponsored application plus immutable
   sponsorship/audit evidence. It records `age_confirmed=false`, empty
   interests, null essays, and explicitly states that public applicant
   attestations were not collected or asserted.
6. Existing `account_claim` delivery sends the expiring claim link. Kris chooses
   his own password through the already-mounted canonical claim screen.
7. The canonical claim endpoint creates the one Supabase Auth user and one
   `research_members` binding, initially `pending_activation`.
8. An authenticated existing internal admin calls
   `research_activate_sponsored_b2b_buyer`. In one database transaction it:
   - proves the exact application/member/Auth/email sponsorship;
   - activates the canonical member;
   - creates or replays Roman's temporary buyer relationship;
   - binds Kris's two roles;
   - binds the exact `KRIS_VOLUME_PARTNER` version/effective time;
   - marks the sponsored application and sponsorship active;
   - appends audit evidence.
9. Checkout must call `research_claim_b2b_order_ownership` on the canonical
   draft order before any payment-provider authorization or capture.

The generic membership billing activation routes explicitly refuse the B2B
sponsorship source, preventing an active member from being created without the
Roman relationship and pricing entitlement.

## Migration path

The bridge is authorization/pricing/ownership metadata, not a second identity,
organization, order, or commerce system. When the existing partner/reporting
`research_organizations` shape and the final business-buyer principal converge,
an audited migration creates the canonical buyer principal, copies relationship
and operator identifiers, re-points immutable ownership by stable IDs, records
`migrated_organization_id`/`migrated_at`, verifies counts and hashes, then marks
the bridge `migrated`. History is retained; no bridge evidence is deleted.

## Mandatory stops

- Any Auth/application/member/sponsorship appears for the email.
- Exact last name, country, applicant type, profile version, or effective time
  is unavailable.
- Either candidate migration fails isolated rehearsal or security review.
- Claim delivery acceptance is uncertain.
- Claimed member/Auth/application/email evidence is inconsistent.
- Checkout cannot prove Roman ownership commits before payment I/O.

Production mutation performed by this packet: **NO**.

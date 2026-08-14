# Roman Health sponsored B2B claim packet

Status: candidate only. Do not apply, mount, send, or deploy from this lane.

## Locked business facts

- Login/contact email: `info@romanhealthcollective.com`
- Human operator legal name: `Kristopher Lopez`
- Buyer legal/entity name: `Roman Health`
- Country/state: `USA` / `Texas`
- Relationship: B2B2C marketplace partner
- Roles: `organization_owner`, `business_buyer`
- Pricing profile: `KRIS_VOLUME_PARTNER`, owned by the Roman buyer relationship
- Orders: canonical `research_orders`, with immutable Roman ownership evidence

The last production read reported no Auth user, application, member, or conflict.
The preparation RPC repeats that exact-email check under a transaction-scoped
advisory lock before any insert. Any new evidence stops the write.

## Founder-confirmed launch facts

The founder-confirmed legal name, buyer entity, country, state, email, and B2B2C
relationship are sufficient for claim preparation. The sponsored path derives
`applicant_type='professional'` from that relationship. Pricing version and
effective time are derived from the accepted catalog artifact, not typed by an
operator: schema version 1 and generatedAt from catalog source
`e7bc0b691ed813b5ce024f0026e8ab5ba64d74f4` after enforcing 420/418/2.

The founder-confirmed legal entity name is recorded as immutable sponsorship
and relationship evidence. No tax identifier, billing address, shipping
address, password, or public application essay is required to send the claim.
Those remaining business profile facts can be collected through the later
reviewed profile workflow without blocking identity proof.

## Fast path C

1. Database owner fingerprints the exact application/member/role/order schema.
2. Rehearse `20260813_research_b2b_buyer_bridge.sql`, then
   `20260813_research_b2b_sponsored_claim.sql`, twice in an isolated PostgreSQL
   environment and prove rollback, grants, RLS, triggers, and RPC behavior.
3. Compose `createSupabaseSponsoredB2BClaimDeps` with:
   - the canonical Supabase service client for bounded identity reads;
   - an actor-scoped Supabase client carrying the authenticated existing
     `super_admin` or `operations_admin` JWT;
   - a best-effort wakeup of the existing notification outbox (the RPC already
     owns durable queueing).
4. Call `prepareSponsoredB2BClaim` with the `.request` object from
   `roman_health_b2b_activation_input.json`. The input schema is strict,
   rejects password material, and resolves pricing from the accepted artifact.
5. The database creates one `approved_sponsored_b2b` application plus immutable
   sponsorship/audit evidence. It records `age_confirmed=false`, empty
   interests, null essays, and explicitly states that public applicant
   attestations were not collected or asserted. The same transaction inserts
   one idempotent `b2b_buyer_claim` outbox row; no send/ack gap exists.
6. The dedicated B2B template mints the same purpose-scoped `account_claim` at
   send time, asks for no personal membership payment, and sends the expiring
   link. Kris chooses his own password through the already-mounted canonical
   claim screen.
7. The canonical claim endpoint creates the one Supabase Auth user and one
   `research_members` binding, initially `pending_activation`.
8. An authenticated existing internal admin calls
   `research_activate_sponsored_b2b_buyer`. In one database transaction it:
   - locks the sponsorship row and captures database-authoritative time after
     the lock; exact-expiry and later activation attempts are refused before
     any member, buyer, entitlement, audit, or outbox mutation;
   - proves the exact application/member/Auth/email sponsorship;
   - activates the canonical member with `access_basis=sponsored_b2b` and keeps
     `billing_state=not_started` rather than fabricating payment verification;
   - creates or replays Roman's temporary buyer relationship;
   - binds Kris's two roles;
   - binds the exact `KRIS_VOLUME_PARTNER` version/effective time;
   - marks the sponsored application and sponsorship active;
   - appends audit evidence.
   An exact replay is read-only and succeeds only when the stored activation
   completed strictly before expiry and the same active member, Roman buyer,
   operator roles, and pricing entitlement still match.
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
- Founder-confirmed operator/buyer facts or the accepted catalog-derived
  pricing authority fail validation.
- Either candidate migration fails isolated rehearsal or security review.
- Claim delivery acceptance is uncertain.
- Claimed member/Auth/application/email evidence is inconsistent.
- The locked claim is at or past its database-authoritative expiry.
- Checkout cannot prove Roman ownership commits before payment I/O.

Production mutation performed by this packet: **NO**.

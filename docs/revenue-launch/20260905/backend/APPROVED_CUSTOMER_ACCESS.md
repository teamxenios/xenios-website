# Approved customer access — local implementation

Founder policy, September 5: remove paid memberships as an access prerequisite.
This candidate uses canonical Auth, research_applications, research_members,
research_application_events and research_notification_outbox. It creates no
parallel identity or entitlement table. Historical billing is preserved.

The protected admin inspection reports writer availability only when the exact
`approved_customer_access_20260905` database authority marker is present. The
explicit POST `/api/admin/research/access/approve-customer` takes normalized
email, names, an admin reason, an exact application ID/updated-at snapshot
(both null for an inspected absent application), and a durable idempotency key.
The canonical admin guard supplies authenticated authority; the verified JWT
subject supplies the audit actor. Body-selected actors or roles are refused.

The service-only transaction rechecks identities, snapshot and lifecycle,
records approved_customer with provenance/version, appends audit and queues an
email atomically. It neither creates Auth nor opens customer access by itself.
The result says queued, never delivered. Existing unverified or ambiguous Auth,
paused/closed accounts and sponsored business profiles require separate review.

The existing `/api/research/member/claim` requires a signed v2 account_claim
credential. New identities choose a password; existing identities must sign in
normally. An existing password is never reset by this new flow. The atomic claim
requires the exact verified Auth email and canonical bindings, sets active
account access with access_basis approved_customer, and preserves existing
billing facts (new records use not_started). An uncertain transaction response
does not delete Auth; normal sign-in and the same claim can retry safely.

New Health approval/welcome templates use team@xeniostechnology.com through the
existing outbox. A retry uses a deterministic expiry-bound token and the same
provider idempotency key. No token is stored in the outbox. Approval dispatch
rechecks recipient, status, version and expiry; superseded/revoked jobs are
recorded as failed, never falsely sent. No partner, affiliate, referral payout,
product, payment, fulfillment or Care authority is granted.

The legacy admin approve action is retired and directs operators to explicit
customer approval. Active account authorization no longer consults paid billing
state. Pending, past_due, paused and closed states are not silently migrated.
Full retirement of the old activation/renewal composition, all UI changes, and
the selected production pre/post/rollback packet are subsequent work before a
release can be proposed. This checkpoint is not deployment-ready.

Validation: 232 focused tests across seven files passed after claim/outbox/auth
integration; separate email/membership regression gate passed 139 tests before
the final claim additions. Full repository TypeScript check passed. Offline
PostgreSQL 18.3/PGlite 0.5.8 rehearsal passed 29 checks including apply twice,
service privileges, exact identity, expiry, idempotent replay, stale snapshots
and transaction rollback on outbox failure. Current candidate LF SHA-256:
`b416ef6a27f3dfec1aad25b29d46012c5f1104484f248c8f589f4532f126d53b`.

The rehearsal uses Git baseline application/member/outbox schemas and a minimal
synthetic Auth parent; it is not production object parity, cross-session
concurrency, restart, email delivery or real normal-user acceptance evidence.
Migration remains unapplied. No live grant, Auth creation, email, payment or
production mutation occurred. The founder-selected acceptance identity remains
private and is not hardcoded in runtime or committed evidence.

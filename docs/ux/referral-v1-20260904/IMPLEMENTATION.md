# Referral / recommendation V1 — local implementation

Task: `UX-REFERRAL-RECOMMENDATION-V1-20260904`

Base: `306b2996feb27578fa5434f6a20810cc8f6d83db` (tested auth code `c93c48704c6842f6f65fdc0698cfb3fe627cad2e` plus its records)

Production remains `db5a2d447114c1e8a14185a9865ded50ee3f1ac6`.

This is local candidate engineering, not a release or whole-website completion.
The exact tested commit and outstanding checks belong in the accompanying
checkpoint. No production migration, configuration, merge, deployment, partner
activation, real message, payment or clinical action is authorized by this work.

## Implemented journey and authority

An already-authorized Gen2 partner opens **Recommend Xenios** at
`/research/partners/links`, selects a bounded destination and creates a 30-day
link. The existing canonical member guard supplies the verified Auth identity;
SQL maps Auth UUID to the canonical member and that member's Gen2 partner. Only
current active/certified/activated partners with canonical readiness can issue.
Ordinary customers receive an honest eligibility state, not automatic enrollment.

The public `/r/r1_<opaque-token>` contains no partner/customer identity, email,
phone, name, order content or economics. A domain-separated HMAC derived from
the private link UUID creates the public token. SQL stores its digest, not the
raw public token. A valid signature alone is insufficient: resolution requires
the registered row and current eligibility, expiry and revocation checks.

The recipient sees a short explanation, a safe Care/Research distinction and
one Continue action. Health links offer a Care/Research choice; direct links
retain their bounded destination. Mere page resolution does not create a touch.
Explicit Continue bootstraps a signed HTTP-only visitor and CSRF value, persists
the durable winning touch, then signs the existing `xr_aff` cookie using a
distinct V1 format. Legacy money-bearing cookie verification rejects that format.
Care destinations retain only this nonclinical referral context; no patient
identity, intake content, clinician relationship or clinical conversion is inferred.

The existing closed auth return policy is reused, not replaced. Exact member
catalog/product destinations reach their existing member guard without first
asking for the unrelated review password. Sign-in, available account claim and
password recovery retain a permitted return destination. On guarded `/member/me`,
the optional binding hook revalidates the signed visitor/capture locator and
atomically binds only to the canonical Auth account. Optional attribution failure
does not grant access or prevent legitimate authentication.

## First-valid facts, not browser claims

- Capture has one immutable first winner per signed visitor subject; a later
  random valid link cannot silently replace it. A previously valid winner that
  is now ineligible remains historical with explicit current availability.
- Binding has one winner per canonical Auth account. One visitor capture cannot
  bind to two accounts on a shared browser. Closed/missing members and self-referral
  cannot obtain a new eligible account binding.
- The database transaction includes issuance/revocation idempotency and append-only
  audit. Retry fingerprints exclude newly generated IDs and moving timestamps.
  Audit insertion failure rolls back the actual mutation, not just its response.
- Current link/partner availability is separate from immutable historical facts.
  A signed cookie is a locator; it never overrides a revoked or expired row.
- Deleting all cookies or using another browser creates another anonymous visitor;
  V1 does not claim cross-device identity recognition before authentication. A
  canonical account's already-established winner remains server-owned.
- Key rotation makes old URLs unreconstructable from the new key and listing
  reports them unavailable. It does **not** automatically revoke an already-shared
  registered token: explicit row revocation remains necessary. Rotated visitor
  signatures fail closed. No automatic key-management/rotation system is claimed.

## Permitted status and admin visibility

Owners see only their links and aggregate recorded captures/account bindings.
These are not unique-human, new-account, conversion or commission claims. Native
Web Share uses the same link, with clipboard fallback and visible failures;
canceling native Share does not silently copy. No customer message is sent by the
server. Actual sharing to another person remains the user's explicit browser/OS
action. QR rendering is deferred: no existing renderer was found and adding a
dependency is not required for the first vertical slice.

The canonical admin guard protects `/admin/research/referral-lifecycle` and its
API. Operators see bounded link, touch, account binding and audit projections,
including current availability. Raw visitor hashes, public tokens, customer
contacts, clinical fields and supplier/financial facts do not cross this DTO.
Corrections are deliberately not implemented; there is no silent edit endpoint.

The optional separate lineage RPC maps a stored Auth binding through canonical
member identity to **post-binding member-owned** assisted-order request references
and Research order references. It always labels the result
`account_binding_only`. An account-owned record does not prove independent
order-level referral attribution. Pre-binding and EA-session-only/claim-later
records are excluded. Missing/drifted sources, duplicate or overflowing evidence
return unavailable, never a fabricated empty-success state. The bounded admin
snapshot is not a complete paginated CRM history or an EA conversion integration.

## Security / activation boundaries

All writes require same-origin JSON. Issuance/revocation require UUID idempotency
keys and strict field allowlists; capture requires visitor-bound CSRF. Existing
atomic durable rate limiting has no in-memory production fallback. New API and
document responses are no-store/no-referrer/noindex. `/r` is an isolated tracking
zone: marketing state is cleared and third-party marketing scripts are denied.
Cross-zone navigation uses the existing document-transition privacy policy.

The production controller is dark unless `RESEARCH_REFERRAL_V1_ENABLED` and the
canonical affiliate system/portal/codes capabilities are enabled, a sufficiently
strong existing partner-link secret is configured, and the exact database
authority and durable limiter succeed. Nothing here enables general commerce.
The canonical admin/member guards are retained; the service-role database RPC is
not independently an Auth verifier and must never be exposed directly to a browser.

The candidate extends existing Gen2 links/touches and adopts the previously
intended account-binding table. It adds an append-only event ledger, not another
partner registry or identity system. Both SQL candidates remain outside the
production migration DAG pending a separately authorized rollout. See
`supabase/candidates/20260904_research_partner_referral_v1_ROLLOUT.md` for target
preconditions, grant changes, real PostgreSQL rehearsal and evidence-preserving
rollback. No destructive rollback is automatic.

## Evidence classification

Tests separately identify pure/UI fixtures, real HTTP controller tests, actual
Research wall composition, strict RPC adapters, and a disposable real PostgreSQL
rehearsal. Browser Auth/provider responses use explicit synthetic local fixtures;
they are not an attestation of real Supabase email delivery or provider behavior.
Core referral controller, persistence and lineage in the browser preview must use
the actual SQL backend, not network fulfillment of successful referral responses.
Synthetic database records do not attest that a real customer submitted an order.

Browser QA targets widths 1440, 1366, 1024, 768, 430, 390, 375, 360 and 320 with
44px targets and no horizontal overflow. Share/clipboard capability tests are
explicit synthetic browser shims and never operate the user's clipboard or send
a real share. Service-worker/privacy behavior is not bypassed. Missing or failed
journeys must be labeled as such in the exact checkpoint.

After the referral vertical slice checkpoint, deterministic supplier-test clock
maintenance is a separate task/commit/handoff, followed by the separately scoped
PWA sensitive-workflow promotion policy. Live supplier expiry is not extended to
make tests pass. Install promotion is not an update-notice or SW-registration policy.

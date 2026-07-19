# Consent registry

Status: Draft v0.1 (for counsel review)
Owner: CLAUDE_PRIMARY
Date: 2026-07-18
Review trigger: enabling RESEARCH_MEMBER_COVENANT_ENABLED, shipping any
consent-collecting UX, adding a consent kind, or counsel guidance on consent
record requirements.

## 1. How consent is recorded today

Today the only consent capture is on the application form: acknowledgement
booleans stored directly on the application row (research-purpose terms and
similar attestations). There is no separate consent table in active use, no
versioning of the text the applicant saw, and no withdrawal flow. This is the
honest current state and every trust-facing page must describe it this way.

The target registry schema exists in supabase/research-consent-covenant.sql
and has shipped in this branch, with RLS enabled and no public policies. It
is inert: no code writes to it until the consent flows ship. The application
booleans remain the record of consent until then.

## 2. Target model: append-only consent events

The registry is the table public.research_consent_events. Design rules:

1. One row per consent event. Rows are never updated or deleted.
2. Withdrawal is a new row with granted=false, never an edit. The latest row
   per (subject_type, subject_id, consent_kind) is the current state.
3. Each row records: subject_type (applicant or member), subject_id, the
   consent_kind, granted, policy_version, presented_text_hash, ip,
   user_agent, and created_at.
4. Subjects are applicants or members; the registry spans the whole
   lifecycle so an applicant's consent history follows them into membership.

## 3. Consent kinds

The closed set, from shared/research/security-types.ts and enforced by a
check constraint in the SQL:

1. application_terms: the application acknowledgements.
2. marketing_email: non-transactional email.
3. membership_covenant: acceptance of the membership covenant.
4. research_use_policy: the research-purpose-only use policy.
5. age_attestation: self-attested or verified age status.
6. identity_verification: consent to the vendor verification flow
   (see docs/security/IDENTITY_PROOFING_STANDARD.md).
7. health_data_collection: reserved; nothing collects health data today and
   this kind must not be written until the health-data flags and legal gates
   clear (Prohibited zone until then).
8. data_export_archival: consent to planned export or archival features.

Adding a kind requires editing the shared type, the SQL check constraint,
and this document together, in one change.

## 4. Versioned policies and presented-text hashing

1. Every consent-collecting screen displays text tied to a policy_version
   string. Changing the text means minting a new version, never editing in
   place.
2. presented_text_hash stores a hash of the exact text shown at the moment
   of consent, so we can later prove what the person saw even if the policy
   document moves. The canonical text for each version is kept in the repo.
3. A new policy version does not invalidate old consent automatically.
   Whether re-consent is required per version bump is a per-policy decision,
   and for any legally significant policy counsel must confirm.

## 5. Membership covenant

Covenant acceptance uses its own append-only table,
public.research_covenant_acceptances: member_id, covenant_version, accepted,
presented_text_hash (required), ip, created_at, unique per member and
version. It is gated by RESEARCH_MEMBER_COVENANT_ENABLED, which defaults
false; no covenant UX exists yet. The member contract exposes only
covenantRequired and covenantAcceptedVersion, never the underlying rows.

## 6. Migration rule: no backfilled fake consent

When the registry goes live, existing application acknowledgement booleans
are NOT converted into consent events, because we cannot honestly reconstruct
the presented text, timestamp precision, or context of the original click.
Backfilling would fabricate evidence. Instead:

1. Historical acknowledgements stay on the application rows as the record
   for their era, clearly documented as pre-registry.
2. New consent events are written only from real, live consent moments.
3. If a member's consent state matters for a new feature, ask them again
   through the real flow rather than inferring from the old boolean.

## 7. Reading consent

1. Server-side reads resolve current state as latest-row-wins per kind.
2. The member security page consumes the consents array on
   MemberSecurityState: kind, granted, policyVersion, timestamp. Booleans
   and versions only; never IPs, hashes, or raw rows.
3. Admin visibility into consent history follows the existing single-role
   admin model (ADMIN_EMAIL allowlist); there is no granular RBAC yet.

## 8. Honest posture

xenios research is not HIPAA compliant and collects no health data today, so
no health-related consent exists or may be implied. Whether this registry
design satisfies specific consent-record requirements under applicable
frameworks (Texas consumer privacy law, FTC expectations) is a legal
question: counsel must confirm before consent screens ship.

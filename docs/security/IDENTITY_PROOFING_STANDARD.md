# Identity proofing standard

Status: Draft v0.1 (for counsel review)
Owner: CLAUDE_PRIMARY
Date: 2026-07-18
Review trigger: selection of an identity verification vendor, any change to
RESEARCH_IDENTITY_VERIFICATION_ENABLED or RESEARCH_AGE_VERIFICATION_ENABLED,
or any regulatory guidance from counsel on age or identity verification.

## 1. Current status: NOT BUILT

Identity verification and age verification are not built. No vendor has been
selected. xenios collects no government ID, no ID images, no biometrics, and
no age documents anywhere in the platform today. The only related record is
the applicant's self-attested acknowledgements on the application form.

Two feature flags exist in shared/research/security-types.ts and default to
false: RESEARCH_IDENTITY_VERIFICATION_ENABLED and
RESEARCH_AGE_VERIFICATION_ENABLED. Until each flag is deliberately enabled in
production, every capability in this document is planned, not existing. No
document, page, or support reply may describe verification as live.

## 2. Why this standard exists now

Writing the architecture before the build prevents the default failure mode:
a rushed integration that stores raw ID images in our own database. This
standard fixes the data boundary in advance so the eventual build inherits it.

## 3. Planned architecture: vendor-based, evidence stays with the vendor

1. Verification is performed by a specialist vendor (for example a document
   plus liveness provider). Vendor selection follows
   docs/risk/VENDOR_RISK_STANDARD.md before any contract is signed.
2. The member is redirected or handed off to the vendor's hosted flow. ID
   images, selfies, liveness video, and any biometric templates are captured
   by the vendor and remain with the vendor.
3. xenios never receives, proxies, stores, caches, or logs raw ID images or
   biometric data. This is a hard architectural rule, not a configuration
   preference. Under the data zone model in security-types.ts, identity
   documents are Restricted zone and biometrics are Prohibited zone; neither
   may land in xenios systems.
4. The vendor returns a signed verification result only: outcome
   (pass, fail, needs review), verification type (identity, age, or both),
   a vendor reference id, and a timestamp.

## 4. What xenios stores

1. Booleans and minimal metadata only: identityVerified, ageVerified, the
   vendor reference id, the vendor name, the result timestamp, and the policy
   version under which verification was requested.
2. The member-facing contract (MemberSecurityState) exposes booleans only.
   It never exposes vendor identifiers, tokens, or evidence.
3. A consent event of kind identity_verification is recorded in the consent
   registry (see docs/security/CONSENT_REGISTRY.md) before the member is sent
   to the vendor. Age checks record an age_attestation event.
4. No date of birth is stored unless counsel confirms a specific need; the
   preferred record is the boolean "over the required age at time T".

## 5. Re-verification triggers (planned)

Re-verification is required when any of the following occurs:

1. The member changes the legal name or email on the account.
2. The vendor reports the original verification as revoked or disputed.
3. The verification result is older than a maximum age set at go-live
   (proposed 24 months; counsel must confirm whether any framework requires
   a shorter interval).
4. An admin flags the account for suspected account sharing or transfer.
5. A policy version bump explicitly requires fresh verification.

## 6. Failure handling and human review

1. A vendor "fail" or "needs review" result never auto-rejects a person. It
   routes the case to the existing admin review queue, and a named human
   makes the decision. This mirrors the platform's application review model.
2. The member is told plainly that automated verification did not complete
   and that a human will review, with a support contact. No detail from the
   vendor's evidence is echoed back to the member.
3. Repeated failures rate-limit further attempts rather than locking the
   account silently.
4. Admin review outcomes are recorded in the append-only application event
   audit pattern already used by the application state machine.

## 7. Legal posture

xenios research is not HIPAA compliant and collects no health data today.
Identity verification does not change that. Whether age or identity
verification is legally required for this membership model, and which
framework applies (state age-verification laws, Texas consumer privacy law,
FTC guidance on biometric data), is undetermined: counsel must confirm before
either flag is enabled. Any vendor contract must satisfy the requirements in
docs/risk/VENDOR_RISK_STANDARD.md, also subject to counsel confirmation.

## 8. Go-live checklist (all required before enabling either flag)

1. Vendor passed the vendor risk assessment and a signed DPA exists
   (counsel must confirm terms).
2. Verified in staging that no request or response path carries image or
   biometric payloads through xenios servers or logs.
3. Consent registry flow live for identity_verification and age_attestation.
4. Human review path staffed and tested.
5. Rollback plan: disabling the flag returns the platform to today's
   behavior with no orphaned vendor sessions.

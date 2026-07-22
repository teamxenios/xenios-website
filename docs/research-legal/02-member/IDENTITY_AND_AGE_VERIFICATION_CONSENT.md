# Identity and Age Verification Consent

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-MEM-011 |
| Title | Identity and Age Verification Consent |
| Audience | applicant |
| Required member state | approved, pre-verification (presented immediately after approval, before the verification flow starts) |
| Trigger | start of the identity and age verification step, before hand-off to the verification provider |
| Route | /research/apply (post-approval activation flow, verification step) |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX); state biometric statutes review pending |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | verification result and provider reference per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period]; raw ID images and biometric data are not retained by Xenios (held by the provider under its own schedule) |
| Acceptance event | checkbox + timestamp + document version + applicant reference recorded server-side, before provider hand-off |
| Withdrawal supported | partial (the applicant may decline or stop verification at any time before completion, which stops activation; consent to provider processing already performed cannot be undone, but deletion rights against the provider and Xenios still apply) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-MEM-010, XR-MEM-012, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; NIST SP 800-63A identity proofing guidance |
| Review date | 2026-07-19 |

## 1. Purpose

Xenios Research is a private, 21+ membership. After your application is approved, and before
agreements and payment, you must complete identity and age verification. This consent
explains what the verification involves, who processes your information, what Xenios keeps,
and what happens if verification fails. You give this consent before anything is collected.

## 2. What verification checks

- that you are 21 or older,
- that you are the legal identity you applied under,
- document authenticity, where a government ID document is used,
- liveness (that a live person, not a photo or recording, is completing the check), where
  justified by the method used,
- fraud signals,
- that your phone number and email are verified.

## 3. Who processes your information

1. Verification is performed by a specialist identity verification provider
   `[CONFIG: identity verification provider name]`, not by Xenios staff reading your documents.
2. You are handed off to the provider's flow. Your ID document images, selfie, and any
   liveness capture are collected by the provider and remain with the provider, under its own
   privacy notice, which is shown to you in its flow.
3. The provider returns a result to Xenios: pass, fail, or needs review, plus a reference
   identifier, the verification method, a timestamp, and a minimal failure code when relevant.

## 4. What Xenios retains

Xenios is designed to retain only:

- the provider reference identifier,
- the verification result and the verified-age result,
- the timestamp and method,
- a minimal failure code, when verification does not pass.

Xenios does not retain raw government ID images, selfies, or liveness video unless counsel
and the final identity design conclude a specific retention is required, in which case this
consent will be updated and re-presented before any such retention starts. Xenios does not
store biometric templates, and face blur used elsewhere in the product (progress media) is
image processing, not facial recognition.

## 5. Biometric data consent

Where the verification method includes a facial scan, liveness check, or another biometric
process performed by the provider, you consent to that processing for the sole purpose of
verifying your identity and age for this membership.

- The biometric data is collected and held by the provider, not by Xenios.
- It is not used for marketing, profiling, or any purpose other than verification.
- The provider's retention and destruction schedule applies to biometric data it holds.
- `[COUNSEL: state biometric statutes; confirm the required consent wording, retention and
  destruction disclosures, and whether a separate standalone written release is required in
  specific states before any biometric processing]`

## 6. If verification fails

1. You may retry with corrected information. There is no formal appeal process.
2. Persistent failure may receive technical support, but identity and age requirements cannot
   be waived or overridden by anyone, including the founder.
3. If you do not complete verification, activation stops. You do not pay anything, because
   payment comes after verification and agreements.

## 7. Your choices

1. Verification is required for membership. If you decline this consent, the activation
   process ends and no verification data is collected.
2. You may stop mid-flow. Stopping before completion leaves you unverified and ends the
   activation attempt; you may restart later while your approval remains valid.
3. Deletion and privacy rights. Your privacy rights, including any deletion rights under
   applicable law, apply to the result data Xenios holds and, under the provider's notice and
   applicable law, to the data the provider holds.

## 8. What this consent does not do

This consent does not waive rights that cannot be waived under applicable law, and it does
not relieve Xenios or the provider of duties imposed by law. It authorizes only the
processing described here, for the purpose described here.

## Open items for counsel

- State biometric statutes: required consent wording, standalone-release requirements,
  retention and destruction disclosures, and private-right-of-action exposure:
  `[COUNSEL: state biometric statutes]`.
- Confirm the retention period for the verification result and provider reference under
  XR-POL-005: `[COUNSEL: confirm period]`.
- Confirm whether any retention of raw ID images is required by the final identity design,
  and if so, re-scope this consent before build: `[COUNSEL: raw ID image retention decision]`.
- Name the verification provider once selected and complete vendor due diligence:
  `[CONFIG: identity verification provider name]`.
- Reconcile with the earlier repository draft docs/security/IDENTITY_PROOFING_STANDARD.md,
  which sets the same evidence-stays-with-the-vendor architecture; counsel to confirm the two
  documents stay aligned and decide which controls member-facing wording.
- Confirm the exact legal entity name to substitute for `[ENTITY]`.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |

# Age 21+ Attestation

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-PUB-008 |
| Title | Age 21+ Attestation |
| Audience | applicant |
| Required member state | pre-application (captured at application submission) |
| Trigger | submission of the membership application |
| Route | /research/apply |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | Per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | Checkbox + timestamp + document version + applicant reference recorded server-side with the application; recorded as an age_attestation event in the consent registry |
| Withdrawal supported | No. The attestation records a fact as of submission. An applicant may withdraw the application, but the attestation record is retained under the retention schedule. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-PUB-009, XR-PUB-010, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md |
| Review date | 2026-07-19 |

## 1. Purpose

Xenios Research membership is limited to people who are 21 or older. This attestation is the
applicant's own sworn-style statement of age, captured at the moment the application is
submitted. An attestation is a formal statement that you personally confirm is true.

This attestation is the first of two age controls. The second is formal identity and age
verification, which happens only after an application is approved and before any agreement is
signed or payment is made. The attestation does not replace verification, and verification
does not make the attestation unnecessary: each protects a different point in the process.

## 2. The attestation

By checking the attestation box and submitting the application, you state:

1. I am 21 years of age or older on the date I submit this application.
2. I am submitting this application for myself, about myself, and not on behalf of any other
   person.
3. I understand that Xenios Research is a private, approved-member program for people 21 and
   older, and that my age will be formally verified after approval before I can become a
   member.
4. I understand that misrepresenting my age is grounds for denial of my application, and, if
   discovered later, grounds for termination of my membership, subject to applicable law.

## 3. What happens after approval

If your application is approved, the activation sequence is: approval, then identity and age
verification, then the required agreements, then payment, then password and mandatory
multi-factor authentication. Formal verification confirms that you are 21 or older and that
your legal identity matches your application before any agreement or payment step.

Verification is designed to be performed through a specialist provider. Xenios intends to
retain only the minimum verification record: provider reference, result, verified age result,
timestamp, method, and a minimal failure code where relevant. Xenios does not retain raw
government ID images unless counsel and the identity design require it, and no biometric
templates are stored by Xenios.

If verification does not complete, there is no formal appeal, but you may retry with corrected
information. Persistent failure may receive technical support; the age and identity
requirements themselves are not waivable by anyone, including the founder.

## 4. Consequences of misrepresentation

A false age attestation is a material misrepresentation. Consequences include:

- denial of the application,
- termination of membership if the misrepresentation is discovered after activation, handled
  under the membership termination and cancellation terms and subject to applicable law,
- and preservation of related records under the retention schedule.

Termination for misrepresentation is never a fine; any payment consequences follow the
payment and refund terms in effect, subject to applicable law.

## 5. What this attestation does not do

This attestation does not waive rights that cannot be waived under applicable law, and it
does not relieve Xenios of duties imposed by law. It does not make you a member, does not
guarantee approval, and is not an agreement to purchase anything. It is a statement of fact
that Xenios relies on in reviewing your application.

## 6. Records

The attestation is recorded server-side with a timestamp, the document version you saw, and
your applicant reference, alongside your application. The preferred durable record after
verification is the fact "over 21 at the time of verification" rather than a stored date of
birth, unless counsel confirms a specific need to store the date of birth.

## Open items for counsel

- [COUNSEL: confirm whether a date of birth must be collected and stored at application, or
  whether a 21+ declaration plus post-approval verification is sufficient; the application
  form currently allows either.]
- [COUNSEL: confirm the retention period for attestation records, including for denied and
  withdrawn applications; reconcile with the earlier draft docs/privacy/RETENTION_POLICY.md.]
- [COUNSEL: reconcile with the earlier drafts docs/security/IDENTITY_PROOFING_STANDARD.md and
  docs/security/CONSENT_REGISTRY.md. Those drafts record that identity and age verification
  are not yet built and default to disabled; no public page or support reply may describe
  verification as live until it is. Confirm this attestation text remains accurate in the
  pre-verification interim.]
- [COUNSEL: confirm whether any state requires more than self-attestation at the application
  stage, given that no product access exists before approval, verification, and activation.]
- [ENTITY]: exact legal entity name and state of formation.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |

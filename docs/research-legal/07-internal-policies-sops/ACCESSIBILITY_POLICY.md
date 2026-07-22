# Accessibility Policy

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-035 |
| Title | Accessibility Policy |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | in force from adoption; applied to every surface build, release, document template, and accessibility feedback item |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | test results, audit reports, feedback records, and remediation logs per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | n/a (internal policy; adoption recorded by owner sign-off with version and date) |
| Withdrawal supported | n/a (internal policy, not a consent) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-PUB-006, XR-POL-005, XR-POL-012 |
| Sources | See 00-register/SOURCE_REGISTRY.md; W3C Web Content Accessibility Guidelines (WCAG) |
| Review date | 2026-07-19 |

## 1. Purpose and relationship to the public statement

This is the internal policy that makes the public Accessibility Statement (XR-PUB-006) true. The statement tells members and applicants what we target and where we fall short; this policy tells the program how to build, test, and fix. The two documents must stay synchronized: whenever this policy's known-limitations register changes (section 7), XR-PUB-006 is updated in the same release.

## 2. Standard and conformance target

The target standard is the W3C Web Content Accessibility Guidelines (WCAG) at [CONFIG: conformance version and level; working target WCAG 2.1 Level AA], the same target published in XR-PUB-006. The target applies to every program surface: the /research entrance, application flow, member site, assessment, tracker, checkout, Document Center, and admin surface, and to member-delivered documents. Current status is partially conformant, and the program says so publicly rather than overclaiming.

## 3. Requirements by area

1. Keyboard: every interactive flow (entrance, application, assessment, checkout, tracker, cancellation) must be operable without a mouse, with visible focus and no keyboard traps. Cancellation deserves specific attention: a self-service cancellation flow that cannot be completed by keyboard is both an accessibility defect and a consumer-protection risk.
2. Screen reader: semantic structure, labeled form fields, correctly associated error messages, and descriptive link and button text on all surfaces. Status changes (upload complete, question answered, plan ready) must be announced, not only shown.
3. Contrast and readability: text and interface contrast checked against the target standard; information never conveyed by color alone.
4. Forms and errors: required fields identified, errors explained in plain language next to the field, and failed submissions never silently discard entered data.
5. Captions and transcripts: instructional audio and video content receives captions or transcripts as produced. Member voice notes are not automatically transcribed at launch; text remains an equal-alternative support channel, and this limitation is disclosed in XR-PUB-006.
6. Accessible PDFs: plan documents (Blueprint, fitness, nutrition PDFs, delivered monthly) are generated from templates, so template-level fixes (tagged structure, reading order, alt text, real text rather than images of text) propagate to every member's documents. Until templates fully conform, plan content is provided in an alternative format on request at no cost.
7. Third-party surfaces: identity verification, payment, and Telegram run on platforms Xenios does not control. Accessibility is a vendor selection consideration recorded in vendor review [COUNSEL: confirm the weight accessibility must carry in vendor selection], and a member blocked by a third-party surface is offered a human-assisted path.

## 4. Build and release process

1. Accessibility is a release-checklist item for every new or changed surface, not a retrofit. A release that introduces a known blocker to a core flow (application, activation, login, plan access, ordering, cancellation) does not ship until fixed or given an alternative path.
2. Templates and shared components are fixed at the source so conformance compounds instead of being re-fought per page.
3. AI-drafted content (XR-POL-034) follows the same rules when published: heading structure, alt text, plain language.

## 5. Testing cadence

1. Automated checks run on every release [CONFIG: automated tooling and threshold].
2. Manual testing (keyboard-only pass and screen reader pass on core flows) runs at [CONFIG: manual testing cadence; working target quarterly, and always before launching a new core surface].
3. A formal audit against the target standard is planned [COUNSEL: confirm whether an external audit should precede publication of XR-PUB-006, consistent with the open item in that document].
4. Test results, defects found, and fixes are recorded and retained (section 8).

## 6. Feedback and remediation

1. Intake: accessibility feedback arrives by email to research@xeniostechnology.com (the path published in XR-PUB-006) and through support channels. Feedback reaches the founder, Samuel Boadu, the named accountable person.
2. Response target: [CONFIG: response target; working target 5 business days], the same figure published in XR-PUB-006.
3. Triage: a report that a member cannot complete a core flow at all is a blocker, worked ahead of routine items; degraded-but-usable issues are scheduled [CONFIG: remediation targets by severity].
4. Alternative access is immediate even when the fix is not: blocked content or functions are provided in an alternative format or with human help, at no extra cost and with no reduction in what the member receives.
5. Each feedback item is logged with the surface, the assistive technology involved, the resolution, and the dates, feeding the known-limitations register.

## 7. Known limitations register

The program keeps one internal register of known accessibility limitations (currently: plan PDF tagging, visual-only progress comparisons, untranscribed voice notes, third-party surfaces, tracker visuals without full text equivalents). Each entry names the limitation, the interim alternative, the planned fix, and the owner. The public summary of this register is section 4 of XR-PUB-006, and the two are updated together.

## 8. Records

Test results, audit reports, feedback items, remediation logs, and register changes are retained per XR-POL-005, so the program can show a consistent pattern of testing and remediation [COUNSEL: confirm the evidentiary retention period appropriate for ADA-related demand or litigation defense].

## Open items for counsel

- [CONFIG: conformance version and level; working target WCAG 2.1 Level AA]: confirm target (2.1 AA versus 2.2 AA), jointly with the identical open item in XR-PUB-006 (section 2).
- [COUNSEL: confirm the weight accessibility must carry in vendor selection for identity, payment, and messaging platforms (section 3)]
- [CONFIG: automated tooling and threshold; manual testing cadence; remediation targets by severity (sections 5 and 6)]
- [COUNSEL: confirm whether an external audit should precede publication of XR-PUB-006 (section 5)]
- [COUNSEL: confirm the evidentiary retention period for accessibility testing and remediation records (section 8)]
- Keep this policy and XR-PUB-006 reconciled; counsel to review both together so internal practice and public statement never diverge.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |

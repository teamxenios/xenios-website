# Face Blur and Image Processing Consent

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-TRK-007 |
| Title | Face Blur and Image Processing Consent |
| Audience | member |
| Required member state | active member, mandatory assessment complete (tracker unlocked) |
| Trigger | first use of the face blur option on a progress photo or exercise video |
| Route | /research/member (tracker, media options) |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX); state biometric laws review pending |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period]; blurred and original versions follow the same media retention rules and the member's XR-TRK-009 election |
| Acceptance event | checkbox + timestamp + document version + member reference recorded server-side, on first use of the face blur option |
| Withdrawal supported | yes (the option is per-upload and can simply not be used; consent to the processing is revocable in member privacy settings, which disables the option) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-TRK-004, XR-TRK-006, XR-TRK-009, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FTC Health Breach Notification Rule materials |
| Review date | 2026-07-19 |

## 1. What face blur is

Face blur is an optional privacy feature for your tracker media. When you choose it, the system
processes your progress photo (or, where offered, exercise video) to obscure the face region
before the media is displayed or compared. You choose it per upload. Nothing is blurred unless
you ask.

Face blur exists for one reason: some members want body-change records without a recognizable
face in them. It is a privacy tool for you, not an analysis tool for Xenios.

## 2. What face blur is, technically, and what it is not

1. It is image processing. To blur a face, software must locate the face region in the frame
   and apply an obscuring filter to those pixels. That detection step is transient: it finds a
   region, blurs it, and is done.
2. It is not facial recognition. The system never determines who a face belongs to, never
   compares a face against any other face or database, and never links a face to an identity.
3. No face templates are stored. No faceprint, embedding, geometry map, or any other biometric
   template is created for storage or reuse, from the blur step or from any other tracker
   processing. What is stored is the image itself (original and/or blurred version per your
   settings and your XR-TRK-009 election), never a derived identifier of your face.
4. This is consistent with the program-wide rule: no facial recognition is ever run on member
   media, for any purpose (XR-TRK-004).

## 3. Processing failures never cost you your media

Image processing can fail (an unreadable file, a face the detector cannot locate, a job error).
The rule is: a processing failure never silently discards the only copy of your media.

1. If blur processing fails, the original upload is kept, you are told the blur did not apply,
   and you choose what happens next (retry, keep the original unblurred, or delete it).
2. An unblurred original is never displayed as if it were blurred. If blur was requested and
   failed, the media stays hidden from display until you decide.
3. The same never-lose-the-only-copy rule governs all tracker media processing, including
   transcription and any future analysis (see XR-TRK-009).

## 4. Limits you should understand

1. Blur is applied to the face region. Tattoos, backgrounds, and other identifying features are
   not blurred unless a broader tool is offered later.
2. If you keep the original unblurred version (your choice), that original remains in private
   storage under the protections in XR-TRK-004: private storage, signed URLs, access audit.
3. Blur settings apply prospectively. Applying blur later to an existing photo creates a
   blurred version; whether the unblurred original is then deleted is your choice.
   `[CONFIG: whether original retention after later blur defaults to keep or delete]`

## 5. What this consent does not do

This consent does not waive rights that cannot be waived under applicable law, and it does not
relieve Xenios of duties imposed by law. It does not change what your media may be used for:
the uses and prohibitions in XR-TRK-004 and XR-TRK-006 (no facial recognition ever, never
marketing without a separate release, no advertising platforms) apply equally to blurred and
unblurred media.

## Open items for counsel

- State biometric laws: confirm that transient face detection for blurring, with no template
  stored, falls outside state biometric-identifier definitions, and whether any state requires
  specific notice or consent wording for the detection step:
  `[COUNSEL: transient face detection under state biometric statutes]`.
- Confirm whether this consent should be merged into XR-TRK-004 as a section rather than a
  separate acceptance event, to reduce consent fatigue:
  `[COUNSEL: standalone versus merged consent]`.
- Confirm the default for original retention after a later blur:
  `[CONFIG: whether original retention after later blur defaults to keep or delete]`.
- Confirm the retention period alignment with XR-POL-005: `[COUNSEL: confirm period]`.
- Reconcile with the earlier repository drafts docs/privacy/DATA_CLASSIFICATION.md and
  docs/security/CONSENT_REGISTRY.md; counsel to confirm alignment or supersede.
- Confirm the exact legal entity name to substitute for `[ENTITY]`.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |

# Media Handling SOP

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-033 |
| Title | Media Handling SOP |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | in force from adoption; applied to every member media upload, access, processing job, retention decision, and deletion |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | media files per the member's retention and deletion election (XR-TRK-009) and the Retention and Deletion Schedule (XR-POL-005); access audit logs minimum [COUNSEL: confirm period] |
| Acceptance event | n/a (internal policy; adoption recorded by owner sign-off with version and date) |
| Withdrawal supported | n/a (internal policy; member-side consent withdrawal and deletion elections are covered by XR-TRK-004 through XR-TRK-009) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-TRK-004, XR-TRK-005, XR-TRK-006, XR-TRK-007, XR-TRK-008, XR-TRK-009, XR-POL-004, XR-POL-005, XR-POL-007, XR-POL-012, XR-POL-036 |
| Sources | See 00-register/SOURCE_REGISTRY.md; OWASP file upload guidance |
| Review date | 2026-07-19 |

## 1. Purpose and scope

This SOP governs every piece of member media Xenios Research handles: progress photos, exercise videos, and voice notes (including voice notes arriving through Telegram), plus thumbnails, derived versions, and their metadata. Member media is among the most sensitive data in the program (body images, movement, voice, sometimes health context), and it is classified accordingly under XR-POL-004. The rules here are pipeline rules: they apply automatically, to every file, with no per-file discretion.

## 2. Consent before capture

No media feature accepts an upload until the matching consent is active:

- progress photos: XR-TRK-004,
- voice recording and any transcription: XR-TRK-005,
- exercise videos: XR-TRK-006,
- face blur and image processing: XR-TRK-007,
- pose and movement analysis: disclosed under XR-TRK-008.

Sexual-wellness related media or context is separately consented (XR-TRK-003) and private by default. Consent state is checked server-side at upload time, not just hidden in the interface. A revoked consent closes the feature going forward; the member's retention election (XR-TRK-009) and XR-POL-005 govern the already-stored files.

## 3. Upload pipeline: validate, then scan, then store

Every upload passes these gates in order. A file that has not passed all gates does not exist as far as members and features are concerned.

1. File validation: type checked by content inspection, not file extension; size limits enforced (voice notes capped at 60 seconds); container and format sanity checks; images and video re-encoded or stripped of active content where feasible. Executables, scripts, archives, and unexpected formats are rejected outright.
2. Malware scanning: every file is scanned before it is written to the member-visible store. A file that fails or cannot be scanned is quarantined, never served.
3. Storage: only after validation and scanning does the file land in private storage under section 5.

## 4. Failed-processing safety rule

If validation, scanning, or any processing step fails or produces an ambiguous result, the file fails closed:

1. The file never becomes accessible to the member, staff, or any feature. It is quarantined or rejected, never partially processed into visibility.
2. The member is told the upload did not complete and can retry. The error message never includes scanner output or file internals.
3. Quarantined files are retained only for investigation, access-restricted, and purged on a defined schedule [CONFIG: quarantine retention period].
4. A pattern of failures (same member, same file type, or same pipeline stage) is investigated as a possible attack or defect, and a suspected malicious upload is handled under the Incident Response Plan (XR-POL-007).

Err toward rejection. A lost upload is an inconvenience; a served malicious or unscanned file is an incident.

## 5. Storage: private, encrypted, signed access only

1. All media lives in private storage. No public buckets, no publicly listable paths, no permanent public URLs, ever.
2. Files are encrypted at rest and in transit; keys are managed under the security program, never embedded in application code or documents.
3. Access is only through short-lived signed URLs generated for an authenticated, authorized request. Signed URLs expire quickly [CONFIG: signed URL lifetime], are scoped to a single file, and are never posted to any external channel. Plan PDFs and raw media never travel over Telegram (XR-POL-031).
4. Backups of media stores inherit the same encryption and access restrictions.

## 6. Access control and audit

1. Least privilege: a member can access only their own media. There is no cross-member visibility anywhere in the product.
2. Staff access is restricted to what a task genuinely requires, and founder access is not exempt: every access, including Samuel's, is written to the access audit log (XR-POL-012) with who, what, when, and why.
3. The access audit trail for a given file must be producible on request, because it is the evidence behind the member-facing promise that private media is actually private.
4. Anomalous access patterns (volume, scope, odd hours) are alertable conditions routed through Infinity (XR-POL-032) with opaque references only.

## 7. Processing rules: what we do and refuse to do

1. Face blur is image processing, not facial recognition. It detects that a region is a face in one image and blurs it. It does not identify anyone.
2. No biometric templates are created or stored for progress media. No face embeddings, no faceprints, no gait signatures.
3. No facial recognition, anywhere in the program, for any purpose.
4. Pose and movement analysis for exercise videos runs only as disclosed in XR-TRK-008 and produces coaching-relevant output, not identity data.
5. Derived files (thumbnails, blurred versions, transcripts where consented) are treated as media under this SOP: same storage, same access control, same retention and deletion handling as the original.

## 8. No advertising surface, ever

No advertising pixels, trackers, or third-party analytics run on any surface that displays or handles member media. No media, no tracker data, and no health data is ever sent to an advertising platform, in any form, aggregated or not. This is a hard program rule backing the FTC and consumer-health privacy posture (XR-POL-008), not a configurable setting.

## 9. Retention, deletion elections, and legal hold

1. Each member's raw media is retained per their retention and deletion election (XR-TRK-009) and the Retention and Deletion Schedule (XR-POL-005).
2. A member deletion request or election removes the file and its derived versions from the member-visible store and schedules purge from backups on the documented backup cycle [CONFIG: backup purge window].
3. Deletion is suspended only where the Legal Hold SOP (XR-POL-036) places the file in scope of an active hold, where law permits; the member-facing handling of that case follows counsel's guidance under XR-POL-036.
4. Deletion events, like access events, are audited.

## 10. Incidents

Any suspected unauthorized access to member media, any served unscanned file, and any media found outside private storage is treated as Sev1 by default under the Incident Response Plan (XR-POL-007), because media exposure carries the strictest notification analysis (XR-POL-008, XR-POL-009).

## Open items for counsel

- [COUNSEL: confirm the retention period for media access audit logs (metadata table)]
- [CONFIG: quarantine retention period for failed uploads (section 4)]
- [CONFIG: signed URL lifetime (section 5)]
- [CONFIG: backup purge window after member deletion (section 9)]
- [COUNSEL: confirm the state biometric-law analysis supporting the position that face blur without stored templates is not biometric identification, and identify any state where additional consent or notice is still required (section 7)]
- [COUNSEL: confirm how deletion elections interact with legal hold, and what the member is told when a hold defers a deletion (section 9, with XR-POL-036)]
- Reconcile with the earlier drafts docs/privacy/DATA_CLASSIFICATION.md and docs/privacy/RETENTION_POLICY.md; counsel to confirm XR-POL-004 and XR-POL-005 supersede those on classification and retention, with this SOP governing media operations.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |

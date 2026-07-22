# Progress Photo Consent

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-TRK-004 |
| Title | Progress Photo Consent |
| Audience | member |
| Required member state | active member, mandatory assessment complete (tracker unlocked) |
| Trigger | first tracker progress photo upload; re-presented if this consent was previously revoked |
| Route | /research/member (tracker) |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX); state biometric and consumer-health-data laws review pending |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period]; raw photos also subject to the member's Raw Media Retention and Deletion Election (XR-TRK-009) |
| Acceptance event | checkbox + timestamp + document version + member reference recorded server-side, before the first photo upload is accepted |
| Withdrawal supported | yes (revocable at any time in member privacy settings; revocation stops new photo collection and photo-based comparison; stored photos may be deleted by the member; legally required records are retained) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-MEM-012, XR-TRK-007, XR-TRK-009, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FTC Health Breach Notification Rule materials |
| Review date | 2026-07-19 |

## 1. What you are consenting to

The Xenios Research tracker lets you upload progress photos so you and Xenios can see how your
body and appearance change over time. "Progress photos" means photos of yourself that you choose
to upload into the tracker after your mandatory assessment unlocks it. This consent covers the
collection, storage, processing, display, and deletion of those photos. It does not cover voice
notes or exercise videos, which have their own consents (XR-TRK-005 and XR-TRK-006).

Uploading progress photos is optional. The tracker's "Body and appearance" metric can also be
logged manually. Declining this consent never affects the rest of your membership.

## 2. What the photos are used for

1. Your own record. Photos appear in your private tracker timeline.
2. Side-by-side comparison. The tracker can display two of your photos next to each other (for
   example, day 1 next to day 90) so change is visible. Comparison happens inside your private
   member account only.
3. Plan review. During the founding phase, Samuel Boadu personally reviews member plans. Photo
   context you have uploaded may inform that review, in the same private, audited environment.

Photos are not used for anything else. In particular:

- No facial recognition, ever. Xenios does not run facial recognition on progress photos and
  does not store face templates or any biometric identifier derived from them (see XR-TRK-007).
- Never marketing. Progress photos are never used in marketing, testimonials, advertising, or
  any public or partner-facing material. Any future request to feature a member photo would
  require a separate, specific, written release for that exact use, which you would be free to
  refuse. This consent does not grant that release.
- No advertising platforms. Tracker and health data, including photos, are never sent to
  advertising platforms, and media pages carry no ad pixels.
- No affiliate access. Affiliates and Research Reps never see member photos and are prohibited
  from storing member health information.

## 3. How photos are protected

1. Private storage. Photos are stored in private storage, not on any public URL.
2. Signed URLs. Photos are served only through short-lived signed URLs tied to your
   authenticated session. A "signed URL" is a temporary, expiring link that only works for the
   person it was issued to.
3. File validation and malware scanning. Every upload is validated and scanned before it is
   accepted into your record.
4. Access audit. Every access to your photos, including any founder or administrative access,
   is logged in an audit trail you can ask about through a privacy rights request (XR-MEM-027,
   if adopted; otherwise the member privacy workflow).
5. Optional face blur. You may apply face blur to any photo before or after upload. Face blur
   is optional image processing under XR-TRK-007. It is not facial recognition.
6. Not over Telegram. Telegram is never the system of record. Raw health media, including
   progress photos, is not sent or accepted over Telegram.

## 4. Retention and deletion

1. Member deletion. You can delete any of your progress photos at any time from the tracker.
   Deletion removes the photo from your timeline and from comparison views, and removal from
   storage follows, subject to backup cycles and any legally required records, per XR-POL-005.
2. Raw media election. If you elect raw media deletion under XR-TRK-009, the raw photo file is
   deleted after verified successful processing, and only derived data (for example the metric
   entries and comparison references you kept) is retained per the retention schedule. A failed
   processing job never deletes the only copy of your photo.
3. Cancellation. If you cancel your membership, access ends immediately, so download any photos
   you want to keep before confirming cancellation. Records Xenios must keep by law are retained
   under the retention schedule. Privacy rights survive cancellation.

## 5. What this consent does not do

This consent does not waive rights that cannot be waived under applicable law, and it does not
relieve Xenios of duties imposed by law. It does not make the tracker medical care, a medical
device, or an emergency service, and photo review is not a diagnosis (see XR-MEM-009). It does
not grant any marketing, publicity, or likeness release.

## Open items for counsel

- Confirm the retention period for raw and derived photo data under XR-POL-005:
  `[COUNSEL: confirm period]`.
- State biometric and consumer-health-data laws: confirm that storing member photos without any
  face-template extraction keeps Xenios outside state biometric-identifier definitions, and
  identify any state that treats photographs themselves as regulated biometric or health data:
  `[COUNSEL: state biometric and consumer-health-data analysis for progress photos]`.
- Confirm the form of any future marketing release (separate, specific, revocable, written) and
  that this consent's "never marketing" statement is operationally enforced.
- Reconcile with the earlier repository drafts docs/privacy/RETENTION_POLICY.md (which has no
  media retention rows yet) and docs/security/CONSENT_REGISTRY.md (which reserves health data
  consent kinds); counsel to confirm alignment or supersede.
- Confirm the exact legal entity name to substitute for `[ENTITY]`.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |

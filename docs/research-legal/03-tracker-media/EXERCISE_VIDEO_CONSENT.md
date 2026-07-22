# Exercise Video Consent

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-TRK-006 |
| Title | Exercise Video Consent |
| Audience | member |
| Required member state | active member, mandatory assessment complete (tracker unlocked) |
| Trigger | first tracker exercise video upload; re-presented if this consent was previously revoked |
| Route | /research/member (tracker) |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX); state biometric and consumer-health-data laws review pending |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period]; raw video subject to the member's Raw Media Retention and Deletion Election (XR-TRK-009) |
| Acceptance event | checkbox + timestamp + document version + member reference recorded server-side, before the first video upload is accepted |
| Withdrawal supported | yes (revocable at any time in member privacy settings; revocation stops new video collection; stored videos may be deleted by the member; legally required records are retained) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-MEM-012, XR-TRK-008, XR-TRK-009, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FTC Health Breach Notification Rule materials |
| Review date | 2026-07-19 |

## 1. What you are consenting to

The tracker accepts exercise videos of up to 60 seconds so your training can be reviewed in
context. "Exercise videos" means short clips of yourself performing an exercise that you choose
to upload into the tracker. This consent covers the collection, storage, human review, and
deletion of those videos. Uploading exercise videos is optional. The Performance and function
metric can be logged manually without any video. Declining this consent never affects the rest
of your membership.

## 2. What exercise videos are used for

1. Review purposes. Videos exist so your exercise execution can be reviewed by a human and
   inform your plans. During the founding phase, Samuel Boadu personally reviews member plans;
   video context you upload may inform that review inside your private, audited record.
2. Your own record. Videos sit in your private tracker timeline next to the session they
   document, feeding the Performance and function metric you log.
3. Plan feedback, not medical care. Feedback informed by your video is coaching-style program
   feedback. It is not a diagnosis, not physical therapy, and not medical advice
   (see XR-MEM-009).

What they are never used for:

- No biometric templating. Xenios does not extract or store any biometric template from
  exercise videos: no face template, no gait signature, no body-geometry identifier. No facial
  recognition is run on any member media.
- No automated movement analysis at launch. Automated pose and movement analysis is a possible
  future capability. It is disclosed in XR-TRK-008 and would require its own separate opt-in
  before it ever touches your videos. This consent does not opt you into it.
- Never marketing. Exercise videos are never used in marketing or any public material. Any
  future use of that kind would require a separate, specific, written release.
- No advertising platforms, no affiliate access. Tracker media is never sent to advertising
  platforms; affiliates and Research Reps never see member media.

## 3. How videos are protected

1. Private storage and signed URLs. Videos are stored privately and served only through
   short-lived signed URLs tied to your authenticated session.
2. File validation and malware scanning. Every upload is validated and scanned before it enters
   your record.
3. Access audit. Every access to your videos, including founder and administrative access, is
   logged.
4. Not over Telegram. Telegram is never the system of record; raw health media, including
   exercise videos, is not sent or accepted over Telegram.
5. Others in frame. Film only yourself where you have the right to film. Do not upload videos
   that capture other identifiable people (for example other gym members); Xenios may reject or
   remove such uploads.

## 4. Retention and deletion

1. Member deletion. You can delete any exercise video at any time from the tracker, subject to
   backup cycles and legally required records under XR-POL-005.
2. Raw media election. Under XR-TRK-009 you can elect deletion of the raw video file after
   verified successful processing, keeping only the derived data (for example the session log
   entry and review notes). A failed processing job never deletes the only copy.
3. Cancellation. Cancellation ends access immediately, so download anything you want to keep
   before confirming. Legally required records are retained per the retention schedule, and
   privacy rights survive cancellation.

## 5. What this consent does not do

This consent does not waive rights that cannot be waived under applicable law, and it does not
relieve Xenios of duties imposed by law. It does not make the tracker or video review medical
care, a medical device, or an emergency service, and it does not opt you into any future pose
or movement analysis capability (XR-TRK-008). Train within your abilities; the assumption of
risk acknowledgment (XR-MEM-008) applies to your training itself.

## Open items for counsel

- Confirm retention periods for raw video and derived data under XR-POL-005:
  `[COUNSEL: confirm period]`.
- State biometric laws: confirm that storing and humanly reviewing exercise video without any
  template extraction stays outside biometric-identifier definitions in all states:
  `[COUNSEL: state biometric analysis for exercise video]`.
- Confirm the policy and mechanism for uploads that capture third parties (rejection, blurring,
  or removal) and whether member-facing terms need a stronger warranty from the member:
  `[COUNSEL: third parties in frame]`.
- Confirm the boundary language between program feedback and physical therapy or medical
  practice satisfies state professional-licensure concerns:
  `[COUNSEL: licensure boundary for form feedback]`.
- Reconcile with the earlier repository drafts docs/privacy/RETENTION_POLICY.md and
  docs/security/CONSENT_REGISTRY.md; counsel to confirm alignment or supersede.
- Confirm the exact legal entity name to substitute for `[ENTITY]`.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |

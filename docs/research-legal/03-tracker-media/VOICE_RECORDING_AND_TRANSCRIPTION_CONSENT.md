# Voice Recording and Transcription Consent

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-TRK-005 |
| Title | Voice Recording and Transcription Consent |
| Audience | member |
| Required member state | active member, mandatory assessment complete (tracker unlocked) |
| Trigger | first tracker voice note recording or upload; re-presented if this consent was previously revoked |
| Route | /research/member (tracker) |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX); state biometric (voiceprint) and consumer-health-data laws review pending |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period]; raw audio subject to the member's Raw Media Retention and Deletion Election (XR-TRK-009); derived transcript text retained per schedule |
| Acceptance event | checkbox + timestamp + document version + member reference recorded server-side, before the first voice note is accepted |
| Withdrawal supported | yes (revocable at any time in member privacy settings; revocation stops new voice collection and transcription; stored voice notes may be deleted by the member; legally required records are retained) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-MEM-012, XR-TRK-009, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FTC Health Breach Notification Rule materials |
| Review date | 2026-07-19 |

## 1. What you are consenting to

The tracker accepts voice notes of up to 60 seconds so you can log observations by speaking
instead of typing. This consent covers recording or uploading those voice notes, processing
them into text ("transcription"), storing the recording and the transcript, and using the
transcript in your tracker record. Voice notes are optional. Everything a voice note can do,
manual and text logging can also do. Declining this consent never affects the rest of your
membership.

This consent covers tracker voice notes. Voice messages you choose to send through Telegram
support are governed by the Telegram support terms (XR-MEM-023); Telegram is never the system
of record and raw health media does not belong there.

## 2. How voice notes are processed

1. Recording. You record or upload a voice note of up to 60 seconds in the tracker.
2. Validation and scanning. The file is validated and malware-scanned before acceptance.
3. Transcription. The audio is processed into text. The transcript becomes part of your tracker
   record and can feed your metrics (for example, a spoken sleep observation feeding the Sleep
   and recovery metric). Transcription may use a service provider under a contract that
   restricts use of your data. `[CONFIG: transcription provider and processing location]`
4. Derived text retained. The transcript and any structured entries derived from it are
   "derived data". Derived data is retained per the retention schedule (XR-POL-005) so your
   record stays complete, even if the raw audio is later deleted.
5. Raw audio deletion election. Under XR-TRK-009 you can elect to have the raw audio file
   deleted automatically after verified successful processing. If processing fails, the raw
   audio is kept, because a failed job never deletes the only copy of your data.

## 3. What voice notes are never used for

- No voiceprint identification. Xenios does not create, store, or use a voiceprint, voice
  template, or any biometric identifier from your voice. Your voice is transcribed for content,
  never analyzed for identity.
- No advertising. Voice notes, transcripts, and derived data are never sent to advertising
  platforms.
- Never marketing. Your voice is never used in marketing or any public material. Any future
  request of that kind would require a separate, specific, written release.
- No affiliate access. Affiliates and Research Reps never receive member voice notes or
  transcripts and are prohibited from storing member health information.
- No diagnosis. Transcripts inform your plans and metrics. They are not analyzed to diagnose a
  condition, and the tracker gives no diagnosis, dosing, or medication direction (XR-MEM-009).

## 4. Protection, accuracy, and correction

1. Private storage and signed URLs. Raw audio and transcripts live in private storage and are
   served only through short-lived signed URLs tied to your session.
2. Access audit. Every access to your voice notes and transcripts is logged.
3. Transcription errors. Automatic transcription is imperfect. You can review, correct, or
   delete any transcript in your tracker. Where a transcript feeds a metric, the corrected
   version controls.
4. Third parties in the room. Record voice notes only where you have the right to do so. Do not
   record other people. Some states require every party's consent to record a conversation;
   tracker voice notes are designed as single-speaker self-logs, not conversations.

## 5. Retention, deletion, and cancellation

You can delete any voice note and its transcript at any time from the tracker, subject to
backup cycles and legally required records under XR-POL-005. If you cancel your membership,
access ends immediately, so export anything you want to keep first. Records Xenios must keep by
law are retained under the retention schedule. Privacy rights survive cancellation.

## 6. What this consent does not do

This consent does not waive rights that cannot be waived under applicable law, and it does not
relieve Xenios of duties imposed by law. It does not make the tracker medical care or an
emergency service. If you are experiencing an emergency, contact emergency services (911 in the
US); do not record a voice note.

## Open items for counsel

- Confirm retention periods for raw audio and for derived transcript text under XR-POL-005:
  `[COUNSEL: confirm period]`.
- State biometric laws: confirm that transcription without voiceprint extraction stays outside
  state voiceprint and biometric-identifier definitions, and whether any state requires
  additional notice for voice processing: `[COUNSEL: state voiceprint and biometric analysis]`.
- Recording laws: confirm the single-speaker self-log framing adequately addresses all-party
  consent recording statutes, and whether member-facing guidance must say more:
  `[COUNSEL: recording-consent statutes]`.
- Confirm the transcription provider contract restricts use, prohibits model training on member
  audio unless separately consented, and addresses processing location:
  `[CONFIG: transcription provider and processing location]`.
- Reconcile with the earlier repository drafts docs/privacy/RETENTION_POLICY.md and
  docs/security/CONSENT_REGISTRY.md; counsel to confirm alignment or supersede.
- Confirm the exact legal entity name to substitute for `[ENTITY]`.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |

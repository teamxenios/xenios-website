# Tracker Privacy Notice

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-TRK-001 |
| Title | Tracker Privacy Notice |
| Audience | member |
| Required member state | active member, mandatory assessment complete (the tracker unlocks only after the assessment) |
| Trigger | tracker unlock (first entry into the tracker after the mandatory assessment); re-presented on any material change |
| Route | /research/member (tracker), with a persistent link inside every tracker screen |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX); state consumer-health-data laws review pending |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period]; raw tracker media is deleted after successful processing per the tracker design; notice presentation records retained |
| Acceptance event | n/a (notice only); presentation, timestamp, and document version are logged server-side; collection itself is consented separately under XR-TRK-002, XR-TRK-003, and XR-TRK-010 |
| Withdrawal supported | n/a for the notice itself; every underlying collection consent is revocable (see XR-TRK-002, XR-TRK-003, XR-TRK-010, and XR-TRK-012) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-TRK-002, XR-TRK-003, XR-TRK-010, XR-TRK-011, XR-TRK-012, XR-TRK-013, XR-MEM-012, XR-MEM-027, XR-PUB-004, XR-POL-005, XR-POL-008, XR-POL-009 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FTC Health Breach Notification Rule materials; HHS HIPAA applicability guidance; NIST security guidance |
| Review date | 2026-07-19 |

## 1. What this notice covers

The Xenios Research tracker is the part of your membership that measures progress. This
notice explains what the tracker collects, where each piece of data comes from, how it is
used, who can see it, how long it is kept, and how you export or delete it. It supplements
the General Privacy Notice (XR-PUB-004). It is a notice, not a consent: the consents that
actually authorize collection are separate documents (XR-TRK-002 for manually logged data,
XR-TRK-003 for optional sexual-wellness data, XR-TRK-010 for future wearable connections).

The tracker unlocks only after you complete the mandatory assessment. Until then the tracker
is locked and collects nothing.

## 2. What the tracker measures

The tracker organizes your data into five metric areas, with data completeness shown
separately:

1. Plan adherence: how closely you followed your Xenios 30 plan.
2. Body and appearance: measurements, progress photos, and comparisons.
3. Sleep and recovery.
4. Energy, stress, and vitality.
5. Performance and function.

Data completeness is displayed as its own indicator. It describes how much data you have
logged, not how well you are doing. A low completeness score is not a health signal, and the
tracker never treats missing data as a bad outcome.

## 3. What is collected, by modality

At launch, every tracker entry is something you choose to log:

1. Manual observations: structured entries in the five metric areas.
2. Text notes.
3. Voice notes up to 60 seconds.
4. Progress photos, with an optional face blur you control. Face blur is image processing,
   not facial recognition. Xenios does not run facial recognition on your media and does not
   store biometric templates from progress media.
5. Side-by-side photo comparisons built from your own photos.
6. Exercise videos up to 60 seconds.

For voice and video, Xenios processes the file into derived data (for example a transcript
or logged observation). When you select raw-media deletion, the raw file is deleted after
processing is verified successful, and the derived data is retained. A failed processing job
never deletes the only copy of your media.

## 4. Sources and provenance

Every tracker entry carries provenance: the source (at launch, always you), the entry
method (manual, text, voice, photo, video), and the timestamp. You will always be able to
see where a number came from.

Wearable and platform integrations (Apple HealthKit, Android Health Connect, Oura, WHOOP)
are planned but not live. If and when they launch, each connection will require its own
consent (XR-TRK-010), every synced value will be labeled with its source, and a conflict
between a manual entry and a wearable value will be surfaced to you rather than silently
overwritten. Connecting a wearable also changes the legal analysis described in section 8,
which is one reason these integrations are gated.

## 5. How tracker data is used

Tracker data is used to:

- compute your five metric areas and your data completeness indicator,
- power your monthly check-in and Monthly Review Week comparison,
- inform updates to your Blueprint, Xenios 30 plan, and Xenios 90 roadmap,
- support Samuel's founding-phase review of your plans,
- answer support questions you raise, with your context.

The tracker describes and organizes. It does not diagnose, dose, or direct medication, and
it is not a medical device or an emergency service (see XR-TRK-013).

## 6. What tracker data is never used for

1. No advertising use. Tracker and health data are never sent to advertising platforms,
   never used to build advertising audiences, and never used for ad measurement. Tracker and
   media surfaces carry no advertising pixels.
2. No sale of tracker data.
3. No affiliate or Research Rep access. Affiliates and Research Reps are prohibited from
   storing health information and never receive tracker data.
4. No facial recognition, and no biometric templates from progress media.
5. No automated health inference beyond the metrics described in this notice without a new
   notice and, where required, new consent.

## 7. Who can access tracker data

1. You, through the tracker and your Document Center.
2. Samuel Boadu, as founder and reviewer, during plan review and support.
3. The systems that store and process it, under least-privilege access, row-level
   authorization, and encryption. Media lives in private storage behind signed URLs, is
   validated and malware-scanned on upload, and every access is audited.
4. Service providers only as needed to run the platform, under contracts that restrict use.
5. An outside professional, only if you direct it through a Professional Sharing
   Authorization (XR-TRK-011), which you can revoke (XR-TRK-012).
6. No one else, unless the law requires disclosure.

## 8. Legal status of this data

1. Consumer health data framing. Xenios treats tracker data as consumer health data.
   Several states regulate consumer health data with specific consent, access, and deletion
   rights. `[COUNSEL: confirm which state consumer-health-data statutes apply to the tracker
   and whether this notice and the related consents satisfy them]`
2. HIPAA is not claimed. Xenios does not represent itself as a HIPAA covered entity for
   direct-to-consumer services. The HIPAA applicability analysis is pending (XR-POL-009; see
   also the earlier repository draft docs/compliance/HIPAA_APPLICABILITY_ANALYSIS.md).
3. FTC Health Breach Notification Rule. The tracker is designed to draw from manual
   entries, plans, and later wearables and integrations. The applicability analysis for the
   FTC Health Breach Notification Rule is pending (XR-POL-008; see also the earlier
   repository draft docs/compliance/FTC_HBNR_APPLICABILITY_ANALYSIS.md). If the rule applies,
   a breach of security involving unsecured identifiable health information is intended to
   trigger notification to affected members, the FTC, and in some cases media, on the
   timelines counsel confirms from the current rule text. Xenios does not assert that the
   rule does or does not apply before that analysis is complete.
4. Incident handling. Any suspected unauthorized access to or disclosure of tracker data is
   escalated to Samuel Boadu, reviewed with counsel for notification duties, and documented,
   per the incident response plan.

## 9. Export

You can export your tracker data from your member account in a commonly used, machine-
readable format `[CONFIG: export formats and delivery method]`. Export includes your logged
entries, derived metrics, and provenance labels. Exports are delivered through the secure
member account, not over Telegram. Telegram is never the system of record, and raw health
media is not handled over Telegram.

## 10. Deletion and retention

1. You can delete individual tracker entries and your own media at any time from the
   tracker.
2. You can request deletion of tracker categories or your tracker history through your
   privacy settings or a privacy rights request (XR-MEM-027). Deletion is honored subject to
   applicable law.
3. Raw voice and video files are deleted after verified successful processing when you
   select that option; derived data is retained until you delete it or your retention
   period ends.
4. Records Xenios must keep by law (transaction, payment, agreement, safety, security, and
   audit records) are retained under the Retention and Deletion Schedule (XR-POL-005) even
   after deletion requests or cancellation.
5. Cancellation ends member access immediately and you should export desired data first.
   Privacy rights survive cancellation, and a limited non-member privacy workflow remains
   available.

## 11. Changes to this notice

Xenios may update this notice as the tracker evolves (for example when wearable
integrations launch). Material changes are presented to you in the member site before they
take effect, with the version and date shown. Continued use of the tracker after a material
change is not treated as consent to new collection; new collection categories always get
their own consent.

## Open items for counsel

- Confirm applicable state consumer-health-data statutes and whether this notice plus the
  XR-TRK-002/003/010 consents satisfy their notice and consent requirements: `[COUNSEL:
  state consumer-health-data statutes]`.
- Complete the FTC Health Breach Notification Rule applicability analysis (XR-POL-008) and
  reconcile with the earlier repository draft docs/compliance/FTC_HBNR_APPLICABILITY_ANALYSIS.md,
  including the feature-flag gates it defines for structured health data, lab uploads, and
  wearables; counsel to confirm whether tracker launch itself moves Xenios from the boundary
  into clear scope.
- Complete the HIPAA applicability analysis (XR-POL-009) and reconcile with
  docs/compliance/HIPAA_APPLICABILITY_ANALYSIS.md.
- Confirm retention periods for tracker entries, derived data, media, and presentation logs
  under XR-POL-005 and reconcile with the earlier repository draft
  docs/privacy/RETENTION_POLICY.md: `[COUNSEL: confirm period]`.
- Confirm export formats, delivery method, and any verification requirements for export and
  deletion requests: `[CONFIG: export formats and delivery method]`.
- Reconcile with the earlier repository drafts docs/privacy/DATA_CLASSIFICATION.md and
  docs/security/CONSENT_REGISTRY.md (the health_data_collection consent kind is reserved
  until legal gates clear); counsel to confirm alignment or supersession.
- Confirm the exact legal entity name to substitute for `[ENTITY]`.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |

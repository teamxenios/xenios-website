# Raw Media Retention and Deletion Election

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-TRK-009 |
| Title | Raw Media Retention and Deletion Election |
| Audience | member |
| Required member state | active member, mandatory assessment complete (tracker unlocked) |
| Trigger | first tracker media upload of any kind (photo, voice note, or exercise video); changeable afterward in tracker privacy settings |
| Route | /research/member (tracker privacy settings) |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX); state consumer-health-data deletion rights review pending |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | election records kept per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period]; raw media retention governed by the member's current election; derived data retained per schedule |
| Acceptance event | explicit election (delete-after-processing or retain) + timestamp + document version + member reference recorded server-side; every later change recorded the same way |
| Withdrawal supported | yes (the election is changeable at any time in tracker privacy settings; changes apply prospectively; a change to delete does not resurrect already-deleted media, and a change to retain does not restore media already deleted) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-TRK-004, XR-TRK-005, XR-TRK-006, XR-MEM-012, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FTC Health Breach Notification Rule materials |
| Review date | 2026-07-19 |

## 1. What this election is

Tracker media comes in two layers:

1. Raw media: the original files you upload, meaning progress photos (XR-TRK-004), voice notes
   (XR-TRK-005), and exercise videos (XR-TRK-006).
2. Derived data: what processing produces from them, meaning transcripts, metric entries,
   comparison references, review notes, and similar records that make your tracker useful.

This election lets you choose what happens to the raw layer after processing succeeds:

- Delete after processing. The raw file is deleted automatically after verified successful
  processing. Only derived data remains, retained per the retention schedule (XR-POL-005).
- Retain. The raw file is kept in private storage under the protections of its consent
  document, until you delete it or your retention period ends.

You make the election at your first media upload and can change it at any time.

## 2. "Verified successful processing" is the gate

Deletion under this election happens only after the system verifies that processing succeeded:
the transcript exists and is stored, the photo's derived entries and any blurred version are
stored, the video's record entries are stored. Verification is checked before deletion runs,
not assumed.

The protective rule, stated plainly: a failed processing job never deletes the only copy of
your media. If processing fails, the raw file is kept, the failure is logged, you can be
notified, and the job can retry. Deletion waits until success is verified. This mirrors the
face blur failure rule (XR-TRK-007): failures never silently discard your only copy.

## 3. What deletion does and does not remove

1. Removed. The raw file leaves active storage, and removal from backups follows the backup
   cycle under XR-POL-005.
2. Kept. Derived data is retained per the retention schedule, because it is your record: your
   metrics, comparisons, and plan history stay intact and useful.
3. Kept. Audit records of uploads, access, processing, and deletion are retained, because
   security and accountability records must survive the media they describe.
4. Not reversible. A deleted raw file cannot be restored. If you may ever want the original
   (for example a first-day photo), either elect retain or download your copy first.

## 4. Changing your election

1. Where. Tracker privacy settings, at any time.
2. Prospective only. A change governs uploads processed after the change. Switching to delete
   does not go back and purge previously retained media automatically (you can delete those
   individually, or request bulk deletion). Switching to retain does not restore anything
   already deleted.
3. Recorded. Every election and every change is recorded with timestamp and document version,
   so your current instruction is always provable.
4. Per-item deletion is always available. Regardless of this election, you can delete any
   individual media item at any time under its consent document.

## 5. Interaction with cancellation and legal duties

Cancellation ends member access immediately, so download any media you want before confirming.
This election is a data-minimization instruction, not a legal-records override: records Xenios
must keep by law (transaction, agreement, safety, security, and audit records) are retained
under XR-POL-005 regardless of your election. Deletion obligations under state privacy law are
honored through the privacy rights workflow and survive cancellation.

## 6. What this election does not do

This election does not waive rights that cannot be waived under applicable law, and it does not
relieve Xenios of duties imposed by law. It does not change what media may be used for while it
exists (see XR-TRK-004, XR-TRK-005, XR-TRK-006), and it does not alter the rule that no
biometric templates are ever created from your media.

## Open items for counsel

- Confirm the retention period for derived data and for election/audit records under
  XR-POL-005: `[COUNSEL: confirm period]`.
- Confirm the backup purge cycle commitment that follows an active-storage deletion, and how it
  should be described to members: `[COUNSEL: backup deletion window]`.
- Confirm whether the default election (before the member chooses) should be delete-after-
  processing or retain, and whether state consumer-health-data laws constrain the default:
  `[COUNSEL: default election and state-law constraints]`.
- Confirm that retaining derived data after raw deletion satisfies state deletion-right
  requests, or whether a full-deletion path must also purge derived data:
  `[COUNSEL: derived data under state deletion rights]`.
- Reconcile with the earlier repository draft docs/privacy/RETENTION_POLICY.md, which has no
  media retention rows yet; counsel to confirm alignment or supersede.
- Confirm the exact legal entity name to substitute for `[ENTITY]`.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |

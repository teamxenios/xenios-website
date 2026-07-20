# Tracker Non-Diagnostic and Emergency Notice

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-TRK-013 |
| Title | Tracker Non-Diagnostic and Emergency Notice |
| Audience | member |
| Required member state | active member, mandatory assessment complete (acknowledged at tracker unlock, before first use) |
| Trigger | tracker unlock (presented with the Tracker Privacy Notice, XR-TRK-001); a persistent link remains inside the tracker |
| Route | /research/member (tracker) |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period]; acknowledgment records retained |
| Acceptance event | checkbox acknowledgment + timestamp + document version + member reference recorded server-side at tracker unlock |
| Withdrawal supported | no (acknowledgment of a disclosure; it records that the boundary was explained, and it does not waive rights that cannot be waived under applicable law) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-TRK-001, XR-MEM-007, XR-MEM-008, XR-MEM-009, XR-PUB-013 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FDA device and software guidance materials |
| Review date | 2026-07-19 |

## 1. Why this notice exists

The tracker records what you log and shows you trends. Because it handles health-related
numbers, it could be mistaken for something it is not. This notice draws the line before
you use it, plainly, so you never rely on the tracker for something it does not do.

## 2. The tracker diagnoses nothing

1. The tracker is a record-keeping and progress tool. It computes the five metric areas
   and data completeness from what you and, in the future, your connected devices provide.
2. It does not diagnose, treat, cure, or prevent any disease or condition. No score,
   trend, comparison, or completeness indicator is a diagnosis, a screening result, or a
   clinical measurement.
3. It gives no dosing and no medication direction, ever.
4. Plans, Guides, and support built from tracker data are education and organization, not
   medical care (see XR-MEM-009 and XR-MEM-013 context in your member documents).

## 3. Not a medical device

The tracker is designed, described, and operated as a general wellness and record-keeping
feature, not as a medical device, and Xenios makes no medical-device claims for it.
`[COUNSEL: confirm the tracker's design and copy stay within general wellness framing
under FDA device and software guidance, and flag any feature (for example future pose
estimation or wearable-based alerts) that would change that analysis before it ships]`
Xenios never describes the tracker as FDA approved, FDA cleared, or clinically validated.

## 4. No monitoring, no alerting duty

This is the part members most often assume wrong, so it is stated bluntly:

1. Nobody is watching your tracker in real time. Entries are reviewed in the plan and
   check-in cycle (including Samuel's founding-phase review), not continuously.
2. The tracker has no alarm function. It is not designed to detect a dangerous value, an
   emergency, or a deteriorating condition, and it will not alert you, Samuel, or anyone
   else if your logged data looks concerning.
3. Logging something is not telling Xenios about it. If you need a response, ask through
   support; if you need care, contact a professional. A logged entry creates no duty for
   Xenios to notice it, interpret it, or act on it. This allocation of responsibility is
   subject to applicable law, and this notice does not relieve Xenios of duties the law
   imposes.

## 5. Concerning symptoms go to a professional

If anything you are logging or noticing worries you (pain, chest symptoms, breathing
trouble, dizziness, mood changes, anything persistent or unusual), take it to a licensed
healthcare professional. Do not wait for a check-in, a plan update, or a support reply.
Support is not clinical triage: the Telegram question channel targets a response in
approximately 12 hours and is not read continuously (see XR-PUB-013).

## 6. Emergencies go to 911

If you may be experiencing an emergency, call 911 (or your local emergency number)
immediately. Do not use the tracker, Telegram, email, or any Xenios channel to report an
emergency. Xenios channels are not monitored for emergencies and cannot dispatch help.
Support messages containing emergency language are answered with direction to emergency
services, not with clinical help.

## 7. What your acknowledgment means

Your acknowledgment records that this boundary was explained to you before you used the
tracker. It does not waive rights that cannot be waived under applicable law, and it does
not relieve Xenios of duties imposed by law. It works together with the Assumption of Risk
Acknowledgment (XR-MEM-008) and the No Guarantee and Outcomes Acknowledgment (XR-MEM-007).

## Open items for counsel

- Confirm the general wellness framing of the tracker under FDA device and software
  guidance, and define the review trigger for future features (pose estimation, wearable
  alerts, professional sharing) that could change the analysis: `[COUNSEL: general
  wellness framing]`.
- Confirm the no-monitoring and no-alerting-duty language in section 4 is enforceable as
  written and consistent with any duties applicable law imposes: `[COUNSEL: duty
  allocation]`.
- Confirm consistency with the earlier repository draft
  docs/research-legal/01-public-applicant/SUPPORT_AND_EMERGENCY_BOUNDARY_NOTICE.md
  (XR-PUB-013) and reconcile wording so the emergency routing is identical everywhere.
- Confirm retention of acknowledgment records: `[COUNSEL: confirm period]`.
- Confirm the exact legal entity name to substitute for `[ENTITY]`.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |

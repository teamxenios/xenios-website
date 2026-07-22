# Pose and Movement Analysis Disclosure

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-TRK-008 |
| Title | Pose and Movement Analysis Disclosure |
| Audience | member |
| Required member state | active member (informational; shown with tracker settings and alongside the exercise video consent) |
| Trigger | first exercise video upload (linked from XR-TRK-006) and tracker settings; re-surfaced before any pose capability launch |
| Route | /research/member (tracker settings and exercise video flow) |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX); state biometric laws review pending |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | n/a for the disclosure itself; presentation logging per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | n/a (notice only); the future capability will require its own separate opt-in consent with its own acceptance record |
| Withdrawal supported | not applicable (notice only); the future capability's own consent will be revocable at any time |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-TRK-006, XR-TRK-009, XR-MEM-009, XR-MEM-012 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FTC Health Breach Notification Rule materials |
| Review date | 2026-07-19 |

## 1. Why you are seeing this

This is a disclosure about a capability Xenios Research does not offer yet. At tracker launch,
exercise videos are reviewed by a human only (see XR-TRK-006). Xenios is considering a future
capability called pose and movement analysis. This document tells you now what that capability
would and would not be, so nothing about it surprises you later. It asks for nothing and
activates nothing.

## 2. What pose and movement analysis would be

"Pose estimation" is software that locates body landmark points (for example shoulders, hips,
knees) in a video frame and tracks how they move. From those points the system would compute
derived movement metrics for your exercise clips, for example joint angles through a squat,
bar-path consistency, tempo, or range-of-motion change over time. Those metrics would feed the
tracker's Performance and function area and give your plan reviews more precise context.

The master specification lists pose estimation as a later phase, after the manual tracker. A
technical spike comes first, and no member-facing feature exists until it clears review.

## 3. What it would never be

1. Derived movement metrics, not identity. The analysis would measure movement, not identify
   people. No face template, gait signature, or other biometric identifier would be created or
   stored, consistent with the program-wide rule for member media (XR-TRK-004, XR-TRK-007).
2. Not automatic. Pose and movement analysis would be separately opted into at launch. Your
   existing exercise video consent (XR-TRK-006) does not and will not enable it. If you never
   opt in, your videos are never analyzed this way.
3. Form feedback is not medical advice. Any feedback produced from movement metrics would be
   program feedback: how your execution compares to the plan. It would not be a diagnosis, an
   injury assessment, physical therapy, or medical advice, and the tracker's hard boundary
   stands: no diagnosis, no dosing, no medication direction (XR-MEM-009). Pain, injury, or
   medical concerns belong with a licensed professional, and emergencies go to emergency
   services (911 in the US).
4. Same media rules. Videos and any derived metrics would stay in private storage, behind
   signed URLs, access-audited, never sent to advertising platforms, never used in marketing
   without a separate written release, and covered by your raw media deletion election
   (XR-TRK-009).

## 4. What would happen before launch

Before any pose capability reaches members, Xenios intends to complete:

- a technical spike and accuracy review, so feedback is not built on unreliable measurements,
- a state biometric-law analysis of the specific landmark data the chosen method produces,
- an updated consent document specific to this capability, presented for separate opt-in,
- retention rules for landmark data and derived metrics under XR-POL-005,
- counsel review of the licensure boundary for automated form feedback.

These steps are design intent, subject to counsel confirmation. If the capability never clears
them, it does not launch, and this disclosure simply remains a description of something that
did not happen.

## 5. What this disclosure does not do

This disclosure does not enroll you in anything, does not change any current consent, and does
not waive rights that cannot be waived under applicable law. It does not relieve Xenios of
duties imposed by law, and it does not commit Xenios to launching the capability.

## Open items for counsel

- Confirm whether body landmark coordinates from pose estimation constitute biometric
  information under any state statute even without identification use:
  `[COUNSEL: landmark data under state biometric statutes]`.
- Confirm whether automated form feedback crosses any state professional-licensure line
  (physical therapy, athletic training): `[COUNSEL: licensure boundary for automated feedback]`.
- Confirm this disclosure's placement (with XR-TRK-006 and tracker settings) is sufficient
  advance notice, or whether it should also appear in the general privacy notice:
  `[COUNSEL: notice placement]`.
- Confirm the presentation-logging retention period: `[COUNSEL: confirm period]`.
- Reconcile with the earlier repository draft docs/privacy/DATA_FLOW_MAP.md when pose data
  flows are added; counsel to confirm alignment or supersede.
- Confirm the exact legal entity name to substitute for `[ENTITY]`.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |

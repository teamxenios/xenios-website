# Manual Health Data Consent

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-TRK-002 |
| Title | Manual Health Data Consent |
| Audience | member |
| Required member state | active member, mandatory assessment complete (presented at tracker unlock, before the first manual log) |
| Trigger | first attempt to log a manual tracker observation, text note, voice note, progress photo, or exercise video |
| Route | /research/member (tracker) |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX); state consumer-health-data laws review pending |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period]; raw media deleted after verified successful processing when selected |
| Acceptance event | checkbox + timestamp + document version + member reference recorded server-side; a consent event is written to the consent registry |
| Withdrawal supported | yes (revocable at any time in member privacy settings; revocation is prospective, stops new collection, and degrades or stops personalization that depends on tracker data; legally required records are retained) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-TRK-001, XR-TRK-003, XR-TRK-013, XR-MEM-012, XR-MEM-027, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FTC Health Breach Notification Rule materials |
| Review date | 2026-07-19 |

## 1. What you are consenting to

This consent authorizes Xenios to collect and use the health-related observations you
choose to log in the tracker yourself. "Manually logged" means every entry you create:
structured observations in the five metric areas (plan adherence, body and appearance,
sleep and recovery, energy, stress and vitality, performance and function), text notes,
voice notes up to 60 seconds, progress photos with optional face blur, and exercise videos
up to 60 seconds.

This consent does not cover:

1. Optional sexual-wellness data, which has its own separate consent (XR-TRK-003) and is
   never bundled into this one.
2. Wearable or platform integrations, which are a future feature with their own per-
   connection consent (XR-TRK-010).
3. The mandatory assessment, which is consented under the Sensitive Health Data Consent
   (XR-MEM-012).

Logging is always your choice. The tracker never logs anything on its own at launch.

## 2. Purposes

Your manually logged data is used for three things:

1. Plans. It informs updates to your Blueprint, your monthly Xenios 30 plan, and your
   Xenios 90 roadmap, including Samuel's founding-phase review of each plan.
2. Check-ins. It powers your monthly check-in and Monthly Review Week comparison, so the
   next plan responds to what actually happened.
3. Progress. It computes your five metric areas, your side-by-side photo comparisons, and
   your data completeness indicator so you can see change over time.

It is not used for advertising, never sent to advertising platforms, not sold, and not
shared with affiliates or Research Reps. How the data is stored, secured, exported, and
deleted is described in the Tracker Privacy Notice (XR-TRK-001).

## 3. What logging is not

Logging an observation is a record, not a request for care. The tracker does not diagnose,
does not prescribe, does not give dosing or medication direction, and is not monitored in
real time. Xenios has no duty to detect or react to any value you log (see XR-TRK-013).
If something you would log worries you, take it to a licensed professional. In an
emergency, call 911.

## 4. Revoking this consent

1. How. You can revoke this consent at any time in your member privacy settings. No fee,
   no penalty, no effect on your membership status itself.
2. Effect on collection. Revocation is prospective. New manual logging stops and the
   tracker locks. Entries made before revocation are handled per section 5.
3. Effect on personalization. This is the real cost, stated plainly: without tracker data,
   monthly check-ins lose their comparison basis, and plan updates fall back to your
   assessment and whatever you tell Samuel directly. Your plans continue but become less
   responsive to your actual week-to-week results. Re-granting consent restores logging
   from that point forward.

## 5. Deletion and retention after revocation

On revocation you may also elect deletion of your previously logged tracker data, honored
subject to applicable law. If you do not elect deletion, existing entries are retained
under the Retention and Deletion Schedule (XR-POL-005) and remain visible to you. Records
Xenios must keep by law (transaction, payment, agreement, safety, security, and audit
records) are retained regardless. Privacy rights, including deletion requests under
XR-MEM-027, survive cancellation.

## 6. What this consent does not do

This consent does not waive rights that cannot be waived under applicable law, and it does
not relieve Xenios of duties imposed by law. It does not make any collection lawful that
the law does not permit, and it does not convert the tracker into medical care or a
medical device.

## Open items for counsel

- Confirm whether this consent and XR-MEM-012 (Sensitive Health Data Consent) should be
  consolidated or remain separate consent events; reconcile scope boundaries between the
  assessment consent and this tracker consent.
- Reconcile with the earlier repository draft docs/security/CONSENT_REGISTRY.md: the
  health_data_collection consent kind is reserved and must not be written until legal
  gates clear; counsel to confirm the consent-registry kind and gating for this document.
- Confirm state consumer-health-data consent sufficiency for manually logged tracker data,
  including any required granularity per category: `[COUNSEL: state consumer-health-data
  consent requirements]`.
- Confirm retention period for logged entries and for the consent record itself:
  `[COUNSEL: confirm period]`.
- Confirm the revocation flow (prospective effect, deletion election, verification)
  satisfies applicable state deletion and revocation rights.
- Confirm the exact legal entity name to substitute for `[ENTITY]`.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |

# Professional Sharing Authorization

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-TRK-011 |
| Title | Professional Sharing Authorization |
| Audience | member |
| Required member state | active member, mandatory assessment complete; professional sharing is a future feature (Performance mode) and is disabled at launch |
| Trigger | member initiates a sharing request naming an outside professional, once the feature launches; one authorization per professional |
| Route | /research/member (privacy and sharing settings) |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX); state consumer-health-data and medical-records rules review pending |
| Effective date | Not effective. Requires counsel approval and formal publication. Additionally gated on the professional sharing feature being approved and enabled. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period]; the authorization record and its access audit are retained after expiration or revocation |
| Acceptance event | electronic authorization completed by the member: named professional + selected scope + duration + checkbox + timestamp + document version + member reference recorded server-side; a consent event is written to the consent registry |
| Withdrawal supported | yes (revocable at any time through the Professional Sharing Revocation flow, XR-TRK-012; revocation is prospective; disclosures already made cannot be recalled) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-TRK-001, XR-TRK-003, XR-TRK-012, XR-MEM-012, XR-POL-005, XR-POL-009 |
| Sources | See 00-register/SOURCE_REGISTRY.md; HHS HIPAA applicability guidance |
| Review date | 2026-07-19 |

## 1. What this authorization is

This authorization lets you, the member, direct Xenios to share selected tracker data with
one named outside professional you choose (for example your physician, therapist,
dietitian, or trainer). Sharing is member-directed only. Xenios never initiates it, never
suggests a specific professional, and shares nothing with any professional without an
authorization you completed. This is a future Performance-mode feature; nothing can be
shared until it launches and this document is approved.

## 2. Who the professional is, and who Xenios is not

1. You identify the professional by name and contact or delivery detail
   `[CONFIG: supported delivery methods, for example a secure download link to a verified
   email]`. Xenios verifies the destination as designed by the identity and delivery
   review `[COUNSEL: what verification of the recipient is required or prudent]`.
2. Xenios is not the professional. Xenios does not employ, supervise, vouch for, or take
   responsibility for the professional or for anything the professional does with the
   data. Choosing the professional and evaluating their advice is yours.
3. No HIPAA status is claimed. Xenios does not represent itself as a HIPAA covered entity
   for direct-to-consumer services; the HIPAA applicability analysis is pending
   (XR-POL-009). If the professional is a HIPAA covered entity, the data they receive may
   become protected health information in their hands under their obligations, which are
   theirs, not Xenios's. `[COUNSEL: confirm this framing and whether sharing with covered
   entities creates any business associate exposure for Xenios]`
4. This sharing is not a referral, not treatment, and not medical care by Xenios.

## 3. Scope: you pick exactly what is shared

The authorization form requires an explicit scope selection before anything is shared:

1. Categories: which metric areas (plan adherence, body and appearance, sleep and
   recovery, energy, stress and vitality, performance and function), and whether plans or
   check-in summaries are included.
2. Sexual-wellness data is excluded unless you name that category explicitly (see
   XR-TRK-003). It is never included by a "share everything" default.
3. Time range: all history or a date range you set.
4. Ongoing or one-time: a single export delivered once, or continuing access for the
   duration you set `[CONFIG: whether launch supports one-time export only, or also
   continuing access]`.

Anything not selected is not shared. Widening the scope later requires a new
authorization; a scope cannot be widened silently.

## 4. Duration and expiration

Every authorization has an expiration you choose, up to a maximum
`[CONFIG: maximum authorization duration]` `[COUNSEL: confirm a reasonable maximum and any
state-required maximums]`. When it expires, sharing stops without any action from you.
Continuing after expiration requires a new authorization. You can revoke earlier at any
time (XR-TRK-012).

## 5. Audit

Every disclosure under an authorization is logged: what was shared, with whom, when, under
which authorization version, and by what delivery method. You can view the audit for your
own authorizations in your privacy settings, and the audit record is retained under
XR-POL-005 even after the authorization ends.

## 6. What this authorization does not do

This authorization does not waive rights that cannot be waived under applicable law, and
it does not relieve Xenios of duties imposed by law. It authorizes only the disclosure you
selected, to the professional you named, for the duration you set. It does not authorize
Xenios to use your data for any new purpose of its own, and it does not make the
professional's use of the data Xenios's responsibility.

## Open items for counsel

- Confirm whether member-directed sharing with licensed professionals triggers any state
  medical-records, consumer-health-data, or authorization-form requirements (content,
  signature, expiration limits): `[COUNSEL: state authorization requirements]`.
- Confirm the HIPAA framing in section 2 and whether any sharing pattern could make Xenios
  a business associate; reconcile with XR-POL-009 and the earlier repository draft
  docs/compliance/HIPAA_APPLICABILITY_ANALYSIS.md.
- Confirm recipient verification requirements and supported delivery methods:
  `[COUNSEL: recipient verification]`, `[CONFIG: supported delivery methods]`.
- Confirm whether launch supports one-time export only or continuing access, and the
  maximum duration: `[CONFIG: one-time versus continuing]`, `[CONFIG: maximum
  authorization duration]`.
- Confirm retention of the authorization record and disclosure audit after revocation or
  expiration: `[COUNSEL: confirm period]`.
- Confirm the exact legal entity name to substitute for `[ENTITY]`.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |

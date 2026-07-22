# Professional Sharing Revocation

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-TRK-012 |
| Title | Professional Sharing Revocation |
| Audience | member |
| Required member state | active member with at least one active Professional Sharing Authorization (XR-TRK-011); also available through the limited non-member privacy workflow after cancellation |
| Trigger | member initiates revocation of an active sharing authorization from privacy and sharing settings |
| Route | /research/member (privacy and sharing settings); non-member privacy workflow after cancellation |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. Gated with the professional sharing feature (XR-TRK-011). |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period]; the revocation event and the closed authorization's audit trail are retained |
| Acceptance event | confirmed revocation request: authorization identified + confirmation step + timestamp + document version + member reference recorded server-side; written confirmation sent to the member |
| Withdrawal supported | n/a (this document is the revocation instrument for XR-TRK-011; a revocation itself is not withdrawn, a new authorization is created instead) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-TRK-011, XR-MEM-027, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md |
| Review date | 2026-07-19 |

## 1. Your right to revoke

You can revoke any Professional Sharing Authorization (XR-TRK-011) at any time, for any
reason or none, at no cost, with no effect on your membership. Revocation is designed to
be as easy as granting: the same settings page that shows an active authorization shows
its revoke control.

## 2. How to revoke

1. Open privacy and sharing settings in your member account and select the authorization.
2. Confirm the revocation. The confirmation step shows what will stop and what cannot be
   undone (section 3) before you commit.
3. Xenios records the revocation with a timestamp and sends you a written confirmation
   `[CONFIG: confirmation channel, at minimum email to the member's verified address]`.
4. If you cannot access your account, you can revoke through a privacy rights request
   (XR-MEM-027), including through the limited non-member privacy workflow after
   cancellation. Identity verification applies so that no one else can revoke or
   manipulate your sharing.

Telegram is not a revocation channel of record. A Telegram message asking to revoke will
be answered with directions to the settings page or the privacy rights workflow.

## 3. Effect: prospective, stated plainly

1. What stops. On confirmation, sharing under that authorization stops. No new
   disclosures are made, continuing access (if the feature supports it) is cut off, and
   any scheduled delivery that has not gone out is cancelled. Target effect is immediate
   upon confirmation `[CONFIG: technical propagation window, if any, disclosed here]`.
2. What cannot be recalled. Disclosures already made cannot be recalled. Data the
   professional already received is in their possession and under their control. Xenios
   cannot delete it from their systems and does not represent that it can. If you want it
   deleted, ask the professional directly; their own legal and professional obligations
   govern what they do.
3. No gap re-opens it. A revoked authorization never reactivates. Sharing with that
   professional again requires a completely new authorization under XR-TRK-011.

## 4. Confirmation and audit

Every revocation produces:

1. A written confirmation to you, identifying the authorization, the professional, and
   the effective time.
2. An audit entry linking the revocation to the authorization's disclosure history, so the
   full record shows what was shared while it was active and exactly when sharing stopped.
3. Retention of the closed authorization record and its audit trail under XR-POL-005.
   These records are kept, not to continue sharing, but to prove what was and was not
   disclosed.

## 5. What this document does not do

Revocation does not waive rights that cannot be waived under applicable law, and it does
not relieve Xenios of duties imposed by law. It does not undo past disclosures, does not
impose obligations on the professional through Xenios, and does not delete tracker data
itself (tracker deletion is handled under XR-TRK-001 and XR-MEM-027).

## Open items for counsel

- Confirm any state requirements for the form, channel, or timing of revocation of a
  health-data sharing authorization, including maximum processing time:
  `[COUNSEL: state revocation requirements]`.
- Confirm the identity verification standard for out-of-account and non-member
  revocations under XR-MEM-027.
- Confirm the technical propagation window, if any, and how it is disclosed:
  `[CONFIG: propagation window]`.
- Confirm retention of closed authorization and revocation records:
  `[COUNSEL: confirm period]`.
- Confirm the exact legal entity name to substitute for `[ENTITY]`.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |

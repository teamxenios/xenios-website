# Quantum Commerce Activation Checklist

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-QTM-008 |
| Title | Quantum Commerce Activation Checklist |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | any proposal to enable Quantum commerce; this checklist is the gate |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | n/a (internal gate; sign-off recorded per row plus final written activation approval) |
| Withdrawal supported | no (internal record) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-QTM-001, XR-QTM-002, XR-QTM-003, XR-QTM-004, XR-QTM-005, XR-QTM-006, XR-QTM-007 |
| Sources | See 00-register/SOURCE_REGISTRY.md |
| Review date | 2026-07-19 |

## 1. Purpose

This is the hard gate before any Quantum commerce. Quantum commerce is disabled at the
server level today. It may be enabled only when every row below is checked, with evidence
attached and a current review date, and Samuel has given written activation approval. This
checklist enforces the product spec rule that Quantum stays Coming Soon until its exact
operating lane is approved, and the compliance rule that no production commerce proceeds
until every required row is approved, owner assigned, evidence attached, and review date
current.

## 2. How to use this checklist

- Every row starts unchecked ("[ ]").
- A row may be checked only when its owner attaches the supporting evidence and counsel or
  the named owner signs off, with a date.
- If any single row is unchecked, Quantum commerce stays disabled. There is no partial
  activation.
- Checking a row is a factual record that the underlying work is done, not a legal
  opinion; the legal opinions live in the referenced documents.

## 3. The gate

| Done | Gate item | Owner | Evidence reference | Sign-off and date |
| --- | --- | --- | --- | --- |
| [ ] | Classification memo approved (product identity, manufacturer, establishment/registration, HCT/P, section 361, drug/biologic, homologous use, minimal manipulation, combination status), per XR-QTM-003 | Counsel | [COUNSEL: attach approved classification memo] | [COUNSEL] |
| [ ] | Claims approved and matched to the classification lane; claims registry entry created | Counsel | [COUNSEL: attach approved claims and registry entry] | [COUNSEL] |
| [ ] | Administration and facility settled (who administers, what facility, professional involvement), per XR-QTM-004 baseline | Counsel plus operations | [CONFIG: attach settled administration/facility decision] | [COUNSEL] |
| [ ] | State matrix complete with per-state permissibility conclusions; non-permitted states disabled server-side, per XR-QTM-004 | Counsel | [COUNSEL: attach completed state matrix] | [COUNSEL] |
| [ ] | Quality documents in place (approved supplier, specifications, COA/testing, lot/expiry, storage, stability, recall path) | Operations plus counsel | [CONFIG: attach quality documentation set] | [COUNSEL] |
| [ ] | Payment processor written approval of the Quantum product category | Operations | [CONFIG: attach processor written approval] | [COUNSEL] |
| [ ] | Insurance in force covering the Quantum lane (product liability and any professional liability as applicable) | Operations plus counsel | [CONFIG: attach insurance confirmation] | [COUNSEL] |
| [ ] | Adverse-event and concern process live, with responsibilities allocated in writing, per XR-QTM-007 | Counsel plus operations | [COUNSEL: attach adverse-event process and written allocation] | [COUNSEL] |
| [ ] | Transaction structure decided and documented (who sells what to whom, professional involvement, payment flow, liability), per XR-QTM-005 | Counsel | [COUNSEL: attach transaction-structure decision] | [COUNSEL] |
| [ ] | Member-facing Quantum consent (if required) drafted, approved, and wired to the correct step, replacing the XR-QTM-006 placeholder | Counsel | [COUNSEL: attach approved consent or a written decision that none is required] | [COUNSEL] |
| [ ] | Coming Soon and interest list copy reconciled with the activation, and interest list members' notification prepared, per XR-QTM-001 and XR-QTM-002 | Operations | [CONFIG: attach reconciled copy and notification plan] | [COUNSEL] |
| [ ] | Samuel's written activation approval | Samuel Boadu, Founder | [CONFIG: attach signed activation approval] | Samuel Boadu, [date] |

## 4. Activation rule

Quantum commerce activates only when every row above is checked with evidence and current
review dates, and the final row (Samuel's written activation approval) is signed. The
server-side commerce control for Quantum stays disabled until that final approval is
recorded. If any referenced document changes materially after activation, the affected
rows must be re-verified and, if needed, commerce is disabled again pending re-approval.

## 5. Relationship to other gates

This checklist does not replace the general production gate in the compliance master or
any broader release checklist. Quantum must clear both this Quantum-specific gate and any
program-wide production gate. Where they overlap, the stricter requirement applies.

## Open items for counsel

- [COUNSEL: confirm each gate item is the correct and complete precondition, and add any missing precondition.]
- [COUNSEL: confirm who may sign off each row and what evidence is sufficient.]
- [COUNSEL: confirm whether a member-facing Quantum consent is required, closing the XR-QTM-006 placeholder question.]
- [COUNSEL: confirm the retention period for this checklist and its evidence under XR-POL-005.]
- [COUNSEL: confirm this checklist is consistent with the program-wide production gate and state which controls on conflict.]

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |

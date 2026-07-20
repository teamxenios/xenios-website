# Tax and Payment Requirements

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-AFF-016 |
| Title | Tax and Payment Requirements |
| Audience | affiliate / research_rep / organization_partner |
| Required member state | n/a (partner document; must be satisfied before the first payout) |
| Trigger | Presented at partner onboarding with the governing partner agreement. A valid tax form and a verified payment method must be on file before any commission is paid. |
| Route | Offline agreement (electronic signature); tax forms and payment details collected through a secure channel Xenios designates; surfaced again in the partner portal when that portal is built |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); tax and payment records minimum [COUNSEL: confirm the periods federal and state tax law require] |
| Acceptance event | Wet or electronic signature, with document version, date, and partner reference recorded; receipt of each tax form logged separately |
| Withdrawal supported | No. These are contractual payment conditions. They end with the governing agreement, and tax and payment records are retained as law requires. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-AFF-001, XR-AFF-002, XR-AFF-003, XR-AFF-007, XR-AFF-011, XR-AFF-012, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; IRS Form W-9 instructions; IRS Form W-8 series instructions; IRS Form 1099-NEC instructions; IRS backup withholding guidance |
| Review date | 2026-07-19 |

## 1. Purpose and scope

This document sets the tax and payment conditions for every Xenios Research partner who can be paid in money: affiliates, Research Reps, and organization partners. It attaches to and forms part of the partner's governing agreement with Xenios (the "Agreement"). The partner is "the Partner".

Member referral rewards are outside this payout process. They are store credit only, never cash, and are governed by the Member Referral Terms (XR-AFF-001). Section 8 flags the tax questions store credit raises.

## 2. Independent contractor status

1. The Partner is an independent contractor. Nothing in the Agreement or this document creates employment, a partnership, a joint venture, or an agency for any purpose beyond the limited activities the Agreement describes.
2. The Partner is responsible for the Partner's own income taxes, self-employment taxes, and business filings.
3. Xenios does not withhold taxes from commission payments except where backup withholding or another legal duty requires it (Section 5). This allocation is designed to reflect the independent contractor relationship and is subject to counsel confirmation.

## 3. Tax documentation before any payout

1. No valid tax form, no payout. This is a fixed program rule. Commissions that would otherwise be payable accrue in the held state (Section 7) until the required documentation is complete and valid.
2. United States persons must provide a current, signed IRS Form W-9 with a correct taxpayer identification number before the first payout.
3. Non-United States persons must provide the appropriate IRS Form W-8 series form. [COUNSEL: confirm whether non-US partners are accepted at launch, which W-8 forms apply to which partner types, and what withholding applies to any US-source payments to foreign partners]
4. Entity partners (an organization partner or a Partner operating through a business) must provide the tax form for the entity that will receive payment, and the payment method must belong to that same entity.
5. Tax forms contain sensitive identifiers. They are collected only through the secure channel Xenios designates, never over Telegram, and never in an ordinary chat message. Telegram is not a system of record for the program and carries no identification or payment data.
6. The Partner must submit a corrected form promptly when any information on file changes (name, entity, address, or taxpayer identification number), and must refresh expiring forms (W-8 forms expire on a schedule) before the expiry.
7. Xenios may validate taxpayer identification numbers against IRS records where that service is available, and may hold payouts while a mismatch is unresolved.

## 4. Information reporting

1. Xenios intends to file the information returns the law requires for partner payments, for example IRS Form 1099-NEC for US persons whose payments meet the federal reporting threshold. [COUNSEL: confirm the current federal thresholds, the correct form for each payment type, and all state information-reporting and registration duties]
2. If payouts are made through a third-party settlement platform, reporting may instead or additionally run through that platform (for example on IRS Form 1099-K). [COUNSEL: confirm the reporting allocation for the chosen payout rail so payments are not double-reported or unreported]
3. The Partner must keep a current legal name and mailing address on file so tax documents can be delivered. Electronic delivery of tax forms requires the Partner's consent where the law requires consent.
4. Commission statements and information returns are prepared from the Xenios commission ledger, which is the system of record for partner payments.

## 5. Backup withholding

1. Federal law requires backup withholding from certain payments in defined situations, including a missing or incorrect taxpayer identification number or an IRS instruction to withhold.
2. Where backup withholding applies, Xenios will withhold at the rate federal law sets and remit the withheld amount to the IRS. Amounts properly withheld and remitted are treated as paid to the Partner for ledger purposes and are not recoverable from Xenios. [COUNSEL: confirm the current backup withholding rate, the trigger events, and the remittance and reporting procedure]
3. Xenios will tell the Partner when backup withholding starts and what the Partner can do to resolve the underlying issue.

## 6. Payment methods and minimums

1. Approved payout methods: [CONFIG: the approved payout method list; proposed primary method is ACH transfer to a verified US bank account held in the Partner's own name or the contracted entity's name].
2. No cash payments, ever. No payouts to a third party's account. No payouts over Telegram or social media payment features. The payout account identity must match the tax form identity on file.
3. Minimum payout threshold: [CONFIG: minimum payout amount; balances below the minimum roll forward to the next payout cycle and are not forfeited by remaining below the threshold].
4. Payout cadence: [CONFIG: proposed monthly, in arrears, covering commissions whose hold and refund window has closed and that have reached the approved state].
5. Xenios may charge no fee for the standard payout method. Optional expedited or alternative methods, if offered, may carry a disclosed fee. [CONFIG: fee schedule, if any]
6. The Partner collects no payments personally, from anyone, for anything. All member and customer payments run through Xenios checkout. This is a fixed rule of the program, restated from the governing agreements.

## 7. Commission lifecycle, holds, and reversals

1. Every commission moves through defined states: pending, held, approved, paid, reversed, disputed. The commission ledger records each state change with a timestamp.
2. The eligible commission base is collected product revenue minus refunds, chargebacks, tax, shipping, store credit, discounts, and excluded products. Commission percentages are configurable and set by Samuel Boadu. Membership commissions require separate approval. Peptide and Quantum commissions are disabled until their commercial and claims lanes are approved, so no payout includes them while disabled.
3. Hold window. A conversion enters a hold covering the refund and chargeback window before its commission can reach the approved state. [CONFIG: hold window length, aligned with the refund and dispute policy]
4. Reversals. If an order is refunded or charged back after the related commission was paid, the commission is reversed. Reversed amounts are offset against the Partner's future payouts, or, if the Agreement has ended or the balance is insufficient, are repayable by the Partner on notice.
5. Investigation holds. Xenios may hold commissions during an investigation of suspected fraud, a claims violation, or a privacy violation, consistent with the governing agreement. Fraud patterns the program screens for include self-referrals, duplicate identities, circular orders, refunded conversion farming, code stuffing, fake leads, and rep-created accounts. No sales volume offsets a claims or privacy violation.
6. Disputes. The Partner should raise a ledger discrepancy within [CONFIG: proposed 60 days] of the statement that shows it. Xenios will review and correct verified errors. Raising a dispute does not suspend the rest of the ledger.

## 8. Store credit rewards

Member referral rewards ($15 store credit to the existing member, $10 store credit to the new member, after a 14-day hold) are store credit only and are never converted to cash. They are issued under XR-AFF-001, not under this payout process. [COUNSEL: confirm whether and when store credit rewards create tax reporting or income characterization duties for members or for Xenios]

## 9. Sanctions and legal screening

1. Partner verification may include sanctions screening where appropriate to the partner's profile and channels.
2. Xenios will not make any payment that is prohibited by law, including payments blocked by sanctions rules, and may suspend payouts while a screening question is resolved.

## 10. Records and audit

1. Xenios keeps the commission ledger, payout records, tax forms, and filed information returns under the retention schedule (XR-POL-005) and applicable tax law.
2. The Partner must keep the Partner's own records of program income for the Partner's tax filings. Xenios does not provide tax advice, and nothing in this document is tax advice.
3. Xenios may audit attribution and payout records under the governing agreement, and the Partner must cooperate.

## 11. Legal posture

This document is designed to satisfy federal and state tax documentation, reporting, and withholding duties for payments to independent partners, subject to counsel confirmation. It does not waive rights that cannot be waived under applicable law, and it does not relieve Xenios or the Partner of duties imposed by law. Payment amounts, methods, minimums, and cadences are configurable and apply prospectively with notice when changed.

## Open items for counsel

- Confirm the tax and payment record retention periods required by federal and state tax law (metadata and Section 10).
- Decide whether non-US partners are accepted at launch, which W-8 forms apply, and what withholding applies to US-source payments to foreign partners (Section 3.3).
- Confirm current federal information-reporting thresholds, the correct form per payment type, and state reporting and registration duties (Section 4.1).
- Confirm the reporting allocation if a third-party settlement platform is used for payouts (Section 4.2).
- Confirm the backup withholding rate, triggers, and remittance procedure (Section 5.2).
- Confirm the [CONFIG] values: approved payout methods, minimum payout threshold, payout cadence, any expedited-payout fees, the commission hold window, and the ledger dispute window (Sections 6 and 7).
- Confirm the tax treatment of member referral store credit for members and for Xenios (Section 8).
- Confirm the independent contractor characterization and any state-specific contractor classification exposure for Research Reps (Section 2).

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |

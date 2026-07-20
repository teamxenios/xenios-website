# Commission Schedule Templates

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-AFF-007 |
| Title | Commission Schedule Templates |
| Audience | affiliate, research_rep, organization_partner, internal |
| Required member state | n/a (partner program document; a completed schedule is attached to each partner agreement before the partner is Active) |
| Trigger | attached as a completed schedule at partner agreement signature; reissued whenever a rate, hold period, or exclusion changes |
| Route | offline agreement (schedule attachment); partner dashboard later |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | wet/electronic signature on the completed schedule as part of the partner agreement, with schedule version recorded |
| Withdrawal supported | no (a schedule is a compensation term, not a consent; changes apply prospectively through a reissued schedule with notice) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-AFF-001, XR-MEM-026, XR-AFF-008, XR-AFF-009, XR-AFF-013, XR-AFF-014, XR-AFF-015, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FTC Business Guidance Concerning Multi-Level Marketing; FTC Endorsement Guides |
| Review date | 2026-07-19 |

## 1. Purpose

This document holds the template commission schedules for the Xenios Research partner programs. A "schedule" is the one-page compensation attachment that is completed with real numbers and attached to a specific partner's agreement. The templates below use `[CONFIG]` markers where a percentage, dollar amount, or period is admin-configurable and intentionally not hardcoded. No template creates a right to compensation by itself. Compensation exists only under a signed partner agreement with a completed schedule.

Percentages remain configurable until product margins are known. Every completed schedule must be approved by Samuel Boadu before it takes effect.

## 2. Definitions used in every schedule

- "Eligible commission base" means the amount defined in Section 3.
- "Direct attributable sale" means an order that the attribution system links to the partner's own approved link, code, or contracted group. No compensation is ever paid on another person's recruiting activity or on an open-ended downline.
- "Hold period" means the number of days a commission waits in the pending or held state before it can be approved, covering the refund and chargeback window. Default hold period: [CONFIG: days].
- "Excluded products" means any SKU or lane marked commission-disabled, including all peptide SKUs and Quantum (Section 5).

## 3. The eligible commission base (applies to every percentage schedule)

Every percentage in this document is applied to the eligible commission base, calculated per order as:

```text
Collected product revenue
minus refunds
minus chargebacks
minus tax
minus shipping
minus store credit applied
minus discounts
minus excluded products
```

Plain-language rules:

- Only money actually collected counts. An authorized but uncaptured payment is not collected revenue.
- Refunds and chargebacks reduce the base retroactively. A commission already approved or paid on a later-refunded order is reversed (Section 7).
- Tax and shipping charges pass through to authorities and carriers and never generate commission.
- The portion of an order paid with store credit, and the value of any discount, is excluded from the base.
- Revenue from excluded products is removed from the base entirely, even when the order also contains eligible products.

## 4. Schedule templates by program

### Template A: Member Referral (store credit, not commission)

For active members only. This is a fixed reward, not a percentage, and it is governed by the member-facing Member Referral and Store Credit Terms (XR-MEM-026) and the program-level Member Referral Terms (XR-AFF-001).

```text
Reward to referring member: $15 store credit
Reward to new member: $10 store credit
Hold: 14 days
Form: store credit only, never cash
```

No applicant information is exposed to the referrer. This template exists here only so the full compensation architecture is visible in one place.

### Template B: Affiliate

For creators and partners who publish approved content and links.

```text
Commission rate: [CONFIG: percent] of eligible commission base
on direct attributable sales
Hold period: [CONFIG: days]
Payout method: [CONFIG: method]
Minimum payout threshold: [CONFIG: amount]
Payout cycle: [CONFIG: cycle]
```

No payment on tax, shipping, refunded orders, chargebacks, store credit, discounts, or excluded products.

### Template C: Research Rep

For trained, certified independent representatives serving private communities and direct relationships.

```text
Commission rate: [CONFIG: percent] of eligible commission base
on direct attributable sales
Approved event bonus: [CONFIG: amount or formula] per approved event,
payable only for events approved in advance under XR-AFF-013
Hold period: [CONFIG: days]
Payout method: [CONFIG: method]
Minimum payout threshold: [CONFIG: amount]
```

A Research Rep schedule may be signed at certification, but commissions accrue only on sales attributed while the rep holds Active status (XR-AFF-003 section 2.4). Certification requires completion of the required training modules and assessment.

### Template D: Organization Partner

For gyms, teams, clubs, companies, private communities, and professional networks. Economics are negotiated per partner and may include:

```text
Direct-attribution revenue share: [CONFIG: percent] of eligible
commission base on sales attributed to the approved contractual group
Sponsored Founding Membership cohort: [CONFIG: structure]
Education event compensation: [CONFIG: structure]
```

An organization owner may receive a disclosed organization-level override only on direct attributable eligible sales from an approved contractual group. Never on an open-ended recruiting chain, and never on the recruitment of reps itself.

### Template E: Wholesale / Sub-distributor (future, not yet offered)

Wholesale operates on wholesale margin, not commission.

```text
Wholesale price: [CONFIG: per-SKU price list]
Approved territories and channels: [CONFIG: list]
Eligible products: [CONFIG: per-SKU eligibility]
```

Prerequisites before any wholesale schedule is issued: business verification, resale certificate, insurance, quality system, storage, chain of custody, claims training, and approved territories and channels. A consumer affiliate may not buy inventory for resale under an affiliate agreement. [COUNSEL: wholesale agreement and schedule require separate drafting before this lane opens.]

## 5. Exclusions and disabled lanes

- Membership commissions (the $50 activation and $25 monthly membership fees) require separate written approval by Samuel Boadu before any schedule may include them. No template in this document includes membership revenue by default.
- Peptide commissions are disabled. Peptide products are research products whose classification and permitted marketing lane are under formal review, and they generate no commission until that review approves rep promotion.
- Quantum commissions are disabled. Quantum is Coming Soon, with no commerce, so there is no revenue to commission and no promotion lane for partners.
- Supplement commissions apply only to SKUs cleared for sale (reseller authorization and related confirmations complete) and not otherwise excluded.

## 6. Anti-MLM constraints (baked into every schedule)

Every schedule, present or future, must satisfy all of these. A schedule that violates any of them is invalid and must not be signed.

1. No payment merely for recruiting another rep or partner.
2. No unlimited downline levels. Compensation reaches at most the partner's own direct attributable sales plus one disclosed organization-level override on an approved contractual group.
3. No inventory purchase is ever required to qualify for compensation.
4. Rank and tier are never primarily recruitment-based. Tiers may reflect eligible sales, training, compliance, answer quality, retention, and partner development.
5. No claims violation or privacy violation can be offset by sales volume.

## 7. Commission states

Every commission moves through a defined lifecycle. The ledger records every state change with a timestamp and actor.

```text
pending -> held -> approved -> paid
                 -> reversed
any state -> disputed
```

- Pending: earned on an attributed order, inside the hold period.
- Held: frozen beyond the normal hold, for example during a fraud review or an investigation under XR-AFF-014. Held is not an accusation; it is a pause.
- Approved: cleared for the next payout cycle after the hold period and any review.
- Paid: disbursed to the partner's payout method.
- Reversed: cancelled, for example after a refund, chargeback, attribution error, or confirmed violation. A paid commission that is reversed becomes a debit against future payouts or a repayment obligation, subject to applicable law.
- Disputed: under review through the Commission Dispute Policy (XR-AFF-015). A disputed commission is not paid and not finally reversed until the dispute is decided.

## 8. Payout administration

- Tax documentation (for example a completed W-9 or applicable equivalent) must be on file before the first payout, and Xenios reports payments as required by law. [COUNSEL: confirm information-reporting thresholds and forms for each partner type.]
- Payouts below the minimum threshold roll forward to the next cycle.
- Xenios may deduct previously reversed paid amounts from a payout, subject to applicable law.
- Samuel Boadu may set rates, hold or release commissions, and audit the ledger, as recorded in the admin audit log.

## 9. Changes to schedules

Rate, hold, threshold, and exclusion changes are prospective only. A change takes effect through a reissued schedule with notice to the partner, and it never reduces a commission already earned in the pending, held, approved, or paid state, except through reversal for the causes listed in Section 7. Disagreements about a schedule change or a commission decision go through XR-AFF-015.

## Open items for counsel

- [COUNSEL: confirm retention period for signed schedules and ledger records under XR-POL-005.]
- [CONFIG: commission percentages, hold periods, payout methods, minimum thresholds, and payout cycles for Templates B, C, and D are unset and admin-configurable.]
- [COUNSEL: confirm information-reporting thresholds and required tax forms (W-9 and equivalents) for each partner type.]
- [COUNSEL: wholesale agreement and per-SKU wholesale schedule (Template E) require separate drafting before the wholesale lane opens.]
- [COUNSEL: confirm the enforceability of reversal and repayment of already-paid commissions in relevant states.]
- [COUNSEL: confirm whether membership-fee commissions, if ever approved, raise additional compensation-plan review issues under FTC MLM guidance.]
- [COUNSEL: reconcile this document with any commission terms inside the individual partner agreements so one source controls rates.]

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |

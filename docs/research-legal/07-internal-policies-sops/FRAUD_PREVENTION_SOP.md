# Fraud Prevention SOP

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-028 |
| Title | Fraud Prevention SOP |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | A fraud signal fires in referral, affiliate, Research Rep, order, or claim activity; or a periodic fraud review runs |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period for investigation and enforcement records] |
| Acceptance event | n/a (internal SOP; adoption recorded in the decision log; member and partner consequences flow through their own agreements) |
| Withdrawal supported | no (internal SOP, not a consent) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-POL-005, XR-POL-026, XR-POL-027, XR-POL-029, XR-AFF-001, XR-AFF-002, XR-AFF-003, XR-AFF-014, XR-AFF-015, XR-MEM-026 |
| Sources | See 00-register/SOURCE_REGISTRY.md; Master pack 05 (Affiliate, Research Rep, and Distribution Program Master) sections 2, 11, 14; Master pack 01 section 22; FTC Endorsement Guides |
| Review date | 2026-07-19 |

## 1. Purpose and scope

This SOP defines how Xenios detects, holds, investigates, and resolves fraud across the programs that move money or credit: member referrals ($15 store credit to the referrer, $10 to the new member, 14-day hold, store credit only, never cash), affiliate commissions, Research Rep commissions, organization partner revenue shares, product orders, and refund claims. It protects the commission base rule: compensation is a configurable percentage of eligible direct attributable net collected revenue, net of refunds, chargebacks, tax, shipping, store credit, discounts, and excluded products. Fraud that inflates that base, or extracts store credit or refunds, is what this SOP exists to stop.

## 2. Fraud signal catalog

Reviewers and automated rules watch for at least the following, drawn from the program canon:

- Self-referrals: a member or partner referring themselves through a second identity or household account to collect referral credit or commission.
- Duplicate identities: the same person holding multiple applications, accounts, or partner records (name, email, phone, address, device, or payment overlap).
- Circular orders: orders placed between related parties, or funded and refunded in a loop, to generate attributed revenue or credit.
- Refunded conversion farming: driving conversions that are refunded or charged back after the commission or credit is earned.
- Code stuffing: broadcasting referral or affiliate codes into channels that generate attribution without a genuine relationship (including prohibited coupon sites and misleading paid search).
- Fake leads: fabricated or recycled applicant submissions from a rep or affiliate.
- Rep-created accounts: a Research Rep or affiliate creating, controlling, or completing member accounts, which is also forbidden because reps never handle passwords, IDs, or payments.
- Order-side signals feeding the Large Order Review SOP (XR-POL-027): billing and shipping mismatch, velocity spikes, resale-scale quantities.
- Claim-side signals feeding the Refund and Replacement SOP (XR-POL-026): repeat damage or loss claims, claim velocity, substitution in photo evidence.

## 3. Detection

- Automated rules score every referral conversion, commission accrual, order trigger, and claim, using identity, device, address, payment, and attribution overlap.
- The 14-day referral hold and the affiliate hold and refund window exist so most fraud is caught before anything pays out. Nothing pays while held.
- Periodic sweep: at least [CONFIG: fraud sweep cadence, recommended monthly], review attribution concentration (one partner producing an outsized share of conversions), refund rates by attribution source, and duplicate-identity clusters.
- Any staff member or Infinity alert can open a fraud case manually.

## 4. Holds

- Commission ledger states are: pending, held, approved, paid, reversed, disputed. A fraud signal moves the affected entries to held immediately, before investigation, and Xenios may hold a partner's whole unpaid balance during investigation per the program canon and the partner agreements (XR-AFF-002, XR-AFF-003).
- Referral store credit under signal is frozen: not spendable, not transferable.
- Orders under signal are not captured or shipped (XR-POL-027 flow).
- Holds are protective, not punitive: they preserve the state while facts are gathered, and they release promptly when the investigation clears the activity.

## 5. Investigation

1. Open a case with a unique ID, the signal, and the parties.
2. Preserve evidence first: attribution records, account and device data, order and refund history, communications, and ledger entries. Do not tip off the subject before evidence is preserved.
3. Review attribution end to end: link, code, application, approval, activation, conversion, hold, accrual.
4. Contact parties where appropriate with neutral, specific questions. Never disclose detection methods. Reps and affiliates see only their own aggregate data, never applicant health data or rejection reasons.
5. Decide. Samuel decides every case outcome during the founding phase; there is no delegated fraud adjudication at launch.
6. Record the outcome and move ledger entries to their final state (approved, reversed, or disputed).

Target: first evidence review within [CONFIG: case triage target, recommended 2 business days]; resolution within [CONFIG: case resolution target].

## 6. Consequences

Consequences are applied through the governing documents, not invented per case:

- Members: reversal of fraudulent store credit, loss of referral privileges, and where the conduct breaches the membership terms, membership action up to termination under the member agreement. Refund abuse also ends claim eligibility for the affected pattern, subject to applicable law.
- Affiliates and Research Reps: commission reversal, forfeiture of held amounts attributable to fraud, suspension, or termination under the Suspension and Termination Policy (XR-AFF-014). The canon lists fraudulent orders and identity misuse among immediate-suspension causes. Disputes over commission outcomes follow the Commission Dispute Policy (XR-AFF-015).
- Organizations: the same measures applied at organization level, including removal of the organization override.
- No offset: a claims or privacy violation can never be offset by sales volume, and clean revenue never buys back a fraud finding.
- External referral: cases involving payment instruments or identity theft may be reported to the processor and, where appropriate, law enforcement. [COUNSEL: confirm criteria and process for processor and law-enforcement referral.]

## 7. Records

Each case retains: signals, evidence, ledger states and transitions, communications, decision, decider, and consequence, under XR-POL-005. Quarterly, Samuel reviews closed cases to tune rules, thresholds, and the signal catalog. Findings about content or claims conduct (not money movement) are handed to the Affiliate Compliance Monitoring SOP (XR-POL-029).

## Open items for counsel

- [CONFIG: fraud sweep cadence], [CONFIG: case triage target], [CONFIG: case resolution target].
- [COUNSEL: confirm the legal basis and limits for holding and reversing commissions and store credit in each partner agreement and the member referral terms (XR-AFF-001, XR-MEM-026), including state wage and independent-contractor considerations.]
- [COUNSEL: confirm criteria for processor and law-enforcement referral and any duty to report identity misuse.]
- [COUNSEL: confirm retention period for investigation records under XR-POL-005.]
- [COUNSEL: reconcile referral fraud consequences across XR-AFF-001 and XR-MEM-026, which intentionally coexist, so both state the same enforcement outcomes.]

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |

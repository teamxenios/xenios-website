# Master Fulfillment Agreement

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-FUL-001 |
| Title | Master Fulfillment Agreement |
| Audience | fulfillment_partner |
| Required member state | n/a (partner agreement) |
| Trigger | Partner onboarding. Must be fully executed before Mitch holds any Xenios inventory or receives any fulfillment order. |
| Route | offline agreement |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period for executed partner agreements] |
| Acceptance event | Wet or electronic signature by an authorized representative of each party; executed copy retained by both parties. |
| Withdrawal supported | No. The relationship ends through the termination and transition provisions of this Agreement, not through withdrawal. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-FUL-002, XR-FUL-003, XR-FUL-004, XR-FUL-005, XR-FUL-006, XR-FUL-007, XR-FUL-008, XR-FUL-009, XR-FUL-010, XR-FUL-011, XR-FUL-012, XR-FUL-013, XR-FUL-014, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md |
| Review date | 2026-07-19 |

## 1. Parties and purpose

This Master Fulfillment Agreement (the "Agreement") is between [ENTITY] ("Xenios"), the operator of the Xenios Research Founding Membership program, and [ENTITY] ("Mitch"), the initial fulfillment partner for peptide and Quantum inventory.

Purpose: Xenios sells research products to approved, verified members of a private, 21+ membership program. During the initial launch period, Mitch holds and fulfills the peptide and Quantum inventory on Xenios's behalf. Xenios separately fulfills supplement products itself. This Agreement defines what each party owns, what Mitch must do, what data Mitch may receive, how orders flow, how money settles, and how the relationship ends or transitions.

## 2. Definitions

- "Member" means an approved, identity-verified, active member of the Xenios Research Founding Membership.
- "Fulfillment Order" means a single instruction from Xenios to Mitch to pick, pack, and ship specified SKUs to a specified shipping address. One member order may generate multiple Fulfillment Orders across fulfillment owners.
- "SKU" means a product record in the Xenios product master. The current peptide and research product range comprises 15 SKU records (P001 through P015).
- "Quantum" means the product line whose classification, claims, administration, facility, state, quality, and transaction structure are under formal review. Quantum has no commerce lane under this Agreement (see Section 6).
- "Product Master Data" means the per-SKU data set defined in the Product Supply Schedule (XR-FUL-002).
- "COA" means a certificate of analysis for a specific lot.
- "FEFO" means First Expire, First Out lot picking.
- "Excursion" means any storage or transport condition outside the approved range for a SKU or lot.

## 3. Scope of services

3.1 Mitch will receive, store, hold, pick, pack, and ship peptide and Quantum inventory for Xenios, and will perform the inventory, quality, data, and reporting duties in this Agreement and its schedules.

3.2 Duration of the split-fulfillment period. The parties intend this arrangement to cover approximately the first 60 days after launch. The arrangement continues until Xenios confirms in writing that it is operationally ready to self-fulfill, and does not end automatically on day 60. Operational readiness is determined through the Transition Plan in Section 17.

3.3 Xenios retains and Mitch does not acquire: the member relationship, the website, payment processing, subscriptions, member support, marketing, pricing, and all member-facing communication. Mitch does not communicate with members except as expressly required by a carrier or by this Agreement, and never markets to them.

3.4 Xenios separately fulfills supplement products. Supplement fulfillment is outside Mitch's scope.

3.5 Products are research products whose classification and permitted marketing lane are under formal review. Nothing in this Agreement authorizes either party to make human-use, therapeutic, or outcome claims about any product. Classification, claims, quality, and professional oversight are governed by law, not by disclaimers.

## 4. Relationship of the parties

Mitch is an independent contractor. Nothing in this Agreement creates a partnership, joint venture, agency, franchise, or employment relationship. Neither party may bind the other. Mitch has no authority to accept orders, set prices, grant refunds, or make product claims on Xenios's behalf.

## 5. Incorporated schedules

5.1 The following schedules are incorporated into this Agreement by reference, by document key. Each schedule, once executed or accepted in writing by both parties, forms part of this Agreement:

- XR-FUL-002 (Product Supply Schedule)
- XR-FUL-003 (Service Level Schedule)
- XR-FUL-004 (Quality Agreement)
- XR-FUL-005 through XR-FUL-014, as titled in the document register (00-register), covering the remaining fulfillment subjects of this program, including inventory data feed, packaging and cold chain, data protection, security, financial settlement, insurance and company documentation, recall support, and transition. Order integration mechanics live in section 7 of this Agreement, XR-FUL-005 (feed delivery), and XR-FUL-006 (order flow); there is no separate order integration schedule.

5.2 Order of precedence: (1) a signed amendment to this Agreement, (2) this Agreement body, (3) the Quality Agreement (XR-FUL-004) for quality and safety subjects, (4) the other schedules. [COUNSEL: confirm precedence order, especially whether the Quality Agreement should outrank the body for quality subjects.]

5.3 [COUNSEL: confirm the final list and titles of schedules XR-FUL-005 through XR-FUL-014 against the document register before execution, and remove any keys not used.]

## 6. Quantum restriction

6.1 Mitch may receive and hold Quantum inventory in storage under the conditions of the Product Supply Schedule and Quality Agreement.

6.2 Xenios will not issue, and Mitch must not accept or ship, any Fulfillment Order for a Quantum product until Xenios confirms in writing that the Quantum lane has been approved (classification, claims, administration, facility, state, quality, and transaction structure). The member-facing state of Quantum is Coming Soon, with no commerce and no checkout.

6.3 Any Quantum shipment made without that written confirmation is a material breach.

## 7. Order flow and API contract summary

7.1 Orders flow only from Xenios to Mitch. Mitch fulfills only Fulfillment Orders that Xenios transmits. Mitch never takes orders from members directly.

7.2 For each Fulfillment Order, Xenios sends: fulfillment order ID, customer shipping data, SKU and quantity, lot rule, shipping service, signature rule, temperature service, and special handling instructions.

7.3 For each Fulfillment Order, Mitch returns: accepted or rejected status, hold reason if held, lot assigned, tracking number, carrier, ship time, estimated delivery, any exception, and delivery confirmation.

7.4 An API integration is preferred. A secure CSV exchange is acceptable during the pilot period only, over an approved secure channel. Spreadsheets through personal email are prohibited. The full field-level contract, formats, and timing live in this section 7, the Inventory and Lot Reporting Schedule (XR-FUL-005) for feed delivery, and the Storage and Shipping Schedule (XR-FUL-006) for order flow. [COUNSEL: confirm whether a dedicated Order Integration Schedule should be drafted under a new XR-FUL key instead.]

7.5 Idempotency: a re-sent Fulfillment Order with the same fulfillment order ID must not produce a duplicate shipment. Mitch must treat the fulfillment order ID as the unique key.

7.6 No delivery promise may be displayed to a member until inventory is reserved, Mitch has accepted the Fulfillment Order, the service is selected, the cutoff is known, and a carrier commitment is available. Mitch's acceptance and ship-time data feed that promise, so accuracy of the returned fields is a contractual duty, not a courtesy.

## 8. Inventory feed

8.1 Mitch must provide an inventory feed at least daily, covering for each SKU: available, allocated, quarantined, damaged, expired, retest due, lot, expiry, and last-updated timestamp.

8.2 Xenios sells only against fed inventory. Errors in the feed that cause an oversell are Mitch's responsibility to remedy under the Service Level Schedule (XR-FUL-003) exception process.

8.3 Stock in any blocked condition (expired, retest overdue, quarantined, excursion pending, damaged, recalled, or documentation missing) must never be reported as available and must never be picked. Each blocked condition maps to an inventory state defined in the Quality Agreement (XR-FUL-004) Section 6.1.

## 9. Data protection

9.1 Mitch may receive only the minimum data needed to fulfill: member name, shipping address, phone number only when the carrier requires it, order items, order reference, and shipping service.

9.2 Mitch must not receive, request, or store: assessment data, Blueprint content, tracker data, private media, unrelated order history, referral data, or Samuel's notes. If any such data reaches Mitch in error, Mitch must report it to Xenios promptly and delete it on instruction.

9.3 Mitch may use member data only to perform this Agreement. No marketing use, no sale, no sharing, no enrichment, no retention beyond the agreed retention period. Deletion duties apply at termination under Section 17.

9.4 Data protection terms are designed to satisfy applicable state privacy laws' processor and service-provider contract requirements. [COUNSEL: confirm whether a separate data processing addendum is required and whether Mitch qualifies as a processor or service provider under applicable state privacy laws.]

## 10. Security

Mitch must maintain, at minimum: a named list of authorized users; multi-factor authentication for every account with access to Xenios data or systems; prompt access removal when a person leaves or changes role; secure transmission for all data exchange; no shared passwords; no order or member spreadsheets through personal email; prompt incident reporting to Xenios (target [CONFIG: incident reporting window, pending Mitch's written answers and counsel review]); and documented retention and deletion practices. A suspected or confirmed security incident touching Xenios data must be reported to samuel@xeniostechnology.com without unreasonable delay.

## 11. Quality, product concerns, and recall

11.1 The Quality Agreement (XR-FUL-004) governs COAs, sterility and related documents, FEFO, quarantine and release, excursion handling, destruction, complaint intake, and CAPA.

11.2 Mitch must notify Xenios promptly of any: potential adverse event, quality complaint, contamination, incorrect label, temperature failure, damaged stock, counterfeit concern, or recall. Mitch handles product and logistics facts; Xenios owns all member communication.

11.3 In a recall, Mitch must support: stop-shipment, lot identification, affected-order export, physical segregation of recalled stock, and documented reconciliation, per the recall provisions of the Quality Agreement and the recall support schedule in the XR-FUL series.

11.4 Lot traceability is mandatory in both directions: from any Fulfillment Order, Mitch must be able to identify the lot, quantity, packer, carrier, tracking, ship date, and destination; from any lot, Mitch must be able to identify every affected Fulfillment Order.

## 12. Shipping, packaging, and cold chain

12.1 Mitch ships only with the packaging bill of materials, protection, tamper evidence, and temperature-control method documented and accepted under the packaging and cold chain schedule in the XR-FUL series.

12.2 Mitch must not represent any shipment as temperature-controlled without validation data covering the packout (coolant, insulation, payload, transit time, and seasonal conditions). Unvalidated temperature claims are a material breach.

12.3 Each SKU ships only under its approved shipping profile (ambient, controlled, refrigerated, frozen, or other; permitted carriers; maximum transit; weekend permission; signature rules; monitoring; seasonal packout). Mitch must not infer a profile from a product name.

12.4 By default the member sees one shipping charge per order even when fulfillment is split between Mitch and Xenios; Xenios may display an additional clearly disclosed charge at checkout. Split-shipment cost allocation between the parties is handled in the financial settlement schedule.

## 13. Financial settlement

13.1 The financial settlement schedule in the XR-FUL series will define: wholesale cost per SKU, shipping cost treatment, packaging cost treatment, monthly invoicing, reconciliation, replacement responsibility, refund responsibility, chargeback allocation, damaged inventory allocation, and price-change notice. All amounts are [CONFIG: pending Mitch's written pricing response and negotiation].

13.2 Mitch must give written notice before any price change; changes apply prospectively only. [COUNSEL: confirm the required notice period.]

13.3 Xenios owns the member payment relationship. Mitch never collects payment from members.

## 14. Insurance and company documentation

Before the first Fulfillment Order, Mitch must deliver: legal entity details, address, responsible contacts, W-9, and current insurance certificates evidencing product liability, cargo and transit coverage, and recall coverage, at limits of [COUNSEL: confirm required limits and whether Xenios must be named as additional insured]. Mitch must keep this documentation current and notify Xenios of any lapse, cancellation, or material change.

## 15. Term

This Agreement starts on the date of last signature and continues until terminated under Section 16. The split-fulfillment service period within the term runs as described in Section 3.2. [COUNSEL: confirm whether a fixed outside date or renewal mechanics should be added.]

## 16. Termination

16.1 Either party may terminate for convenience on [COUNSEL: confirm notice period] written notice, subject to completion of the transition duties in Section 17.

16.2 Xenios may terminate immediately for material breach, including: an unvalidated temperature-control representation, shipment of blocked or Quantum stock, a data or security breach caused by failure to meet Section 9 or 10, failure to maintain insurance, or failure to support a recall.

16.3 Mitch may terminate for Xenios's material breach, including sustained non-payment of properly invoiced amounts, on [COUNSEL: confirm cure period] written notice with opportunity to cure.

16.4 Termination does not extinguish duties that by nature survive: transition, data deletion, records, traceability support, recall support for shipped lots, confidentiality, and settlement of accrued amounts.

## 17. Transition and exit

17.1 Before Xenios begins self-fulfillment, and in any event on termination, the parties will complete: a joint inventory count, lot reconciliation, transfer documentation, confirmation of Xenios storage readiness, validated packout at the receiving side, carrier account readiness, SOP training, test orders, a parallel operating week, and a final cutover.

17.2 On completion of transition, Mitch must return or destroy (at Xenios's written election, and with certification) all Xenios inventory, member data, and Xenios documentation, except records Mitch must keep by law, which remain subject to the confidentiality and use limits of this Agreement.

## 18. Liability allocation

18.1 [COUNSEL: draft the liability framework: caps, exclusions, and carve-outs. Suggested carve-outs from any cap: data and security breaches, unvalidated temperature claims, shipment of blocked or recalled stock, willful misconduct, and indemnity obligations.]

18.2 Intended allocation for counsel to formalize: Mitch bears loss caused by fulfillment failures within its control (wrong item, wrong lot, blocked stock shipped, packout failure, feed errors that cause oversell); Xenios bears loss caused by its own order data errors and by member-side disputes unrelated to fulfillment; carrier loss and damage follow the claims and replacement rules of the Service Level Schedule and the financial settlement schedule.

18.3 Nothing in this Agreement limits liability that cannot be limited under applicable law.

## 19. Indemnification

[COUNSEL: draft mutual indemnities. Intended scope: Mitch indemnifies Xenios for claims arising from Mitch's storage, handling, packing, shipping failures, and data or security breaches; Xenios indemnifies Mitch for claims arising from product classification, marketing, claims made to members, and the member relationship. Allocate defense control and cooperation duties.]

## 20. Confidentiality

Each party must protect the other's non-public information (member data, pricing, product master data, quality documents, and business terms) with at least reasonable care, use it only to perform this Agreement, and return or destroy it at termination per Section 17. Member data is additionally governed by Section 9, which controls over this Section for member data.

## 21. Compliance with law

Each party must perform its obligations in compliance with applicable law. Mitch is responsible for lawful operation of its facility, storage practices, and shipping practices. Xenios is responsible for the lawful classification, marketing, and sale of the products, which are under formal review. Neither party will make claims the other is prohibited from making. This Agreement does not promise legal certainty; the program's compliance posture is designed to satisfy applicable requirements and remains subject to counsel confirmation.

## 22. Notices

Operational notices route through the agreed integration and the responsible contacts listed under Section 14. Legal notices go in writing to the addresses on the signature page, with a copy to samuel@xeniostechnology.com for Xenios. Samuel Boadu is the named accountable human for escalations on the Xenios side.

## 23. General provisions

- Governing law and venue: [COUNSEL: select governing law and venue.]
- Assignment: neither party may assign without written consent, except to a successor in a merger or asset sale with notice. [COUNSEL: confirm.]
- Entire agreement: this Agreement and its incorporated schedules are the entire agreement on this subject and supersede prior discussions, including the pre-contract readiness questionnaire responses, except that Mitch's written readiness responses are incorporated as factual representations. [COUNSEL: confirm treatment of the readiness response.]
- Amendment: written and signed by both parties only.
- Severability, waiver, counterparts, and electronic signature: [COUNSEL: supply standard clauses.]

## Open items for counsel

- [ENTITY] for both parties: exact legal entity names and states of formation for Xenios and for Mitch.
- Confirm the final list and titles of incorporated schedules XR-FUL-005 through XR-FUL-014 against the document register (Section 5).
- Confirm the order of precedence among the Agreement body and schedules, especially the Quality Agreement's rank (Section 5.2).
- Confirm whether a separate data processing addendum is required and Mitch's processor or service-provider status under state privacy laws (Section 9.4).
- [CONFIG: incident reporting window] in Section 10, pending Mitch's written answers and counsel review.
- [CONFIG: all financial settlement amounts] pending Mitch's written pricing response (Section 13.1).
- Price-change notice period (Section 13.2).
- Required insurance limits and additional-insured status (Section 14).
- Term mechanics: fixed outside date or renewal (Section 15).
- Termination notice and cure periods (Sections 16.1, 16.3).
- Full liability framework: caps, exclusions, carve-outs (Section 18.1).
- Mutual indemnification drafting (Section 19).
- Governing law, venue, assignment, and standard boilerplate clauses (Section 23).
- Treatment of Mitch's readiness questionnaire responses as incorporated representations (Section 23).
- Retention period for the executed agreement and related records (metadata table).
- Earlier draft overlap: the worktree contains docs/risk/VENDOR_RISK_STANDARD.md from an earlier drafting pass. Counsel should reconcile that standard's vendor requirements with Sections 9, 10, and 14 of this Agreement and confirm which document controls for this partner.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |

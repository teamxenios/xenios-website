# Organization Partner Agreement

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-AFF-005 |
| Title | Organization Partner Agreement |
| Audience | organization_partner |
| Required member state | n/a (partner agreement; the partner need not be a member); approved organization applicant, before any campaign or rep activity under the organization |
| Trigger | organization partner application approval and negotiation of the economics schedule; executed before any link, campaign, cohort, event, or rep activity is enabled for the organization |
| Route | offline agreement (electronic signature); organization dashboard when built |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period, noting tax, contract, and commission-ledger records] |
| Acceptance event | wet/electronic signature by the organization's authorized signer and countersignature by Xenios, recorded with document version; the negotiated economics schedule is attached and versioned with the signature |
| Withdrawal supported | No. This is a contract; either party may terminate under section 12, and program access ends on termination. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-AFF-002, XR-AFF-003, XR-AFF-004, XR-AFF-006, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FTC Endorsement Guides; FTC Business Guidance Concerning Multi-Level Marketing |
| Review date | 2026-07-19 |

## 1. Parties and purpose

This agreement is between [ENTITY] ("Xenios") and the organization identified in the signature block (the "Organization"). It governs how a gym, team, club, company, or professional network introduces the Xenios Research Founding Membership to its own community, and how Xenios pays a negotiated revenue share on the sales that introduction directly generates.

The Organization Partner lane exists so a real community with a real leader can bring its people to Xenios in an orderly way. It is not a franchise, not a distributorship, not a wholesale arrangement, and not a recruiting scheme. Private communities (forums, online groups, and similar) use the Private Community Partner Agreement (XR-AFF-006), which builds on this agreement.

## 2. Definitions

- "Organization Owner" means the named individual who signs for the Organization and is accountable to Xenios for the Organization's conduct under this agreement.
- "Approved Rep" means an individual who has separately signed the Research Rep Agreement (XR-AFF-003), completed certification, and been assigned to the Organization by Xenios.
- "Contractual Group" means the Organization Owner and the Approved Reps assigned to the Organization under this agreement. It is a closed, contractual list maintained by Xenios. It is never an open-ended chain.
- "Tracked Campaign" means a campaign, link set, code set, or event that Xenios approves and attributes to the Organization in the server-side attribution system.
- "Eligible Direct Net Collected Revenue" has the meaning in XR-AFF-002 section 2: product revenue actually collected by Xenios from sales directly attributed to the Contractual Group's Tracked Campaigns, minus refunds, chargebacks, tax, shipping, store credit, discounts, and excluded products.
- "Attributed" means recorded by Xenios's server-side attribution system, which is the system of record.

## 3. Eligibility, application, and approval

3.1 The Organization applied with, at minimum: legal name and entity details; the Organization Owner's identity and contact; the community's nature, size, and channels; expected activity; prior regulated-product experience; conflicts; sanctions or discipline disclosures where relevant; a completed tax form; and a payment method for payouts.

3.2 Xenios verifies the business, the Organization Owner's identity and age, tax status, and sanctions where appropriate, and reviews the Organization's channels and prior claims history. Approval is at Xenios's discretion.

3.3 The Organization's program status is one of: Applicant, Approved, Certified, Active, Quality Review, Suspended, or Terminated. Activity is permitted only while Active.

3.4 The Organization must keep application information current and must promptly notify Xenios of material changes, including a change of Organization Owner, which requires Xenios's written approval.

## 4. Program structure

4.1 The structure is fixed and shallow:

```text
Organization
-> Organization Owner
-> Approved Reps (assigned by Xenios)
-> Tracked Campaigns
-> aggregate analytics
```

4.2 Every individual who promotes under the Organization must be an Approved Rep in their own right: separately applied, trained, certified, and bound by XR-AFF-003 and the Code of Conduct (XR-AFF-004). The Organization may propose candidates; only Xenios approves, certifies, and assigns them.

4.3 The Organization may not create sub-organizations, sub-tiers, or additional levels of any kind. There is exactly one level between the Organization Owner and a sale: the Approved Rep who directly generated it, or a Tracked Campaign the Organization runs directly.

4.4 Members introduced through the Organization go through the full standard path unchanged: application at the private entrance, Samuel's personal review, identity and age verification (21+ only), agreements accepted before payment, the $50 activation payment, the $25 recurring monthly membership authorization, password, and mandatory MFA. Introduction by the Organization creates no entitlement to approval, and the Organization must not state or imply otherwise.

## 5. Economics: negotiated direct-attribution revenue share

5.1 Xenios pays the Organization a negotiated revenue share of [CONFIG: organization revenue share percentage, negotiated per organization and recorded in the attached economics schedule] of Eligible Direct Net Collected Revenue from the Contractual Group's Tracked Campaigns.

5.2 The organization-level override. The Organization Owner may receive a disclosed organization-level override only on direct attributable eligible sales generated by the approved Contractual Group. The override:

- applies only to sales Attributed to the Contractual Group's Tracked Campaigns,
- is disclosed to Xenios in the economics schedule and disclosed publicly where the FTC Endorsement Guides require,
- never extends to sales generated outside the Contractual Group,
- never extends through recruiting chains, and
- ends for any rep who leaves the Contractual Group, prospectively from the departure date.

5.3 Anti-MLM rules (absolute). No one is paid merely for recruiting another rep, partner, or member. There are no downline levels beyond the single structure in section 4.1. No inventory purchase is ever required to qualify for compensation. Rank, tier, and status never depend primarily on recruitment. If any negotiated term in the economics schedule conflicts with this section, this section controls.

5.4 Other negotiated economics may include a sponsored Founding Membership cohort and education events. For private communities these are specified in XR-AFF-006. For other organizations they may be added to the economics schedule using the same rules stated there.

5.5 Rates and schedules are prospective. Changes to the economics schedule require a signed amendment and never apply retroactively to approved amounts.

## 6. Eligible revenue base and excluded lanes

6.1 The revenue share is computed on Eligible Direct Net Collected Revenue only:

```text
collected product revenue Attributed to the Contractual Group
minus refunds
minus chargebacks
minus tax
minus shipping
minus store credit
minus discounts
minus excluded products
```

6.2 Membership fee revenue ($50 activation, $25 recurring) is excluded unless Xenios separately approves it in writing. [COUNSEL: whether sharing membership fee revenue with an organization is permissible and how it must be disclosed]

6.3 Peptide and Quantum revenue is excluded until Xenios enables those lanes in writing. Peptide products are research products whose classification and permitted marketing lane are under formal review. Quantum is Coming Soon: no commerce, no checkout, no promotion. Nothing accrues on those SKUs in the meantime, even if a sale occurs.

6.4 Nothing accrues on revenue Xenios never collects.

## 7. Holds, reversals, fraud, and payment

7.1 Every payable amount passes through the states: pending, held, approved, paid, reversed, disputed. An eligible conversion enters a hold of [CONFIG: organization hold length; not shorter than the refund and chargeback window it protects] before approval.

7.2 Amounts are reversed, whether pending or paid, to the extent the underlying sale is refunded, charged back, cancelled, found fraudulent (including self-referrals, duplicate identities, circular orders, refunded conversion farming, code stuffing, misleading paid search, prohibited placements, fake leads, or rep-created accounts), or found to violate this agreement. Reversed amounts may be offset against future payouts.

7.3 Xenios may hold the Organization's payouts, in whole or in part, during a fraud or compliance investigation involving the Organization or any member of its Contractual Group.

7.4 Approved amounts are paid [CONFIG: payout schedule and minimum payout threshold] to the payment method on file, subject to a valid tax form. Xenios issues tax reporting forms as required by law.

## 8. Data: aggregate analytics only

8.1 The Organization and the Organization Owner see only aggregate analytics: aggregate leads, application status categories in aggregate, eligible conversions in aggregate, revenue-share amounts and states, and compliance tasks.

8.2 No member-level or applicant-level sensitive data is ever exposed to the Organization without the individual's own explicit consent recorded by Xenios. The Organization never sees: whether a specific person applied, application content, approval or rejection reasons, health data, assessment data, tracker data, identity documents, or payment details.

8.3 Where the community is small enough that an aggregate figure could identify an individual, Xenios may suppress or bucket the figure. [COUNSEL: confirm the minimum aggregation threshold and suppression rule for small-cohort analytics]

8.4 Any personal data the Organization handles in the course of its own operations stays outside Xenios systems, and any personal data flow between the parties beyond section 8.1 requires the data addendum referenced in the affiliate program documents. [COUNSEL: confirm whether the Affiliate Data Processing Addendum should be executed by organizations as a standard attachment]

## 9. Conduct, claims, and disclosure

9.1 The Organization and every member of its Contractual Group are bound by the claims rules in XR-AFF-002 section 6 and XR-AFF-003 sections 4 and 5, including: no diagnosis, no prescribing, no dosing, no guaranteed results, no "cure" or "treat", no "safe for everyone", no "FDA approved" or "clinically proven" when not, and no "research use only" language used as a loophole while promoting human outcomes.

9.2 The compensated relationship between the Organization and Xenios must be clearly and conspicuously disclosed in every campaign, event, and communication where the Organization promotes Xenios, consistent with the FTC Endorsement Guides, including disclosure of the Organization Owner's override where it exists. Xenios supplies disclosure templates; using them is the default.

9.3 The Organization uses only Approved Assets (XR-AFF-002 section 2), unmodified, and only in Tracked Campaigns. Unapproved ads, landing pages, or claims are prohibited.

9.4 Testimonials sourced from the Organization's community cannot make claims Xenios could not make directly.

9.5 Xenios may monitor the Organization's public content for compliance and may require correction or removal within [CONFIG: correction window, 48 hours suggested].

9.6 No claims or privacy violation can be offset by sales volume. Compliance failures move the Organization into Quality Review, suspension, or termination regardless of revenue.

## 10. Communications

Outreach by or for the Organization (email, calls, texts, messaging) must follow: prior consent where required, prompt opt-out handling, approved templates, quiet hours, Do Not Call rules where applicable, and recordkeeping. No purchased health-condition lists, ever. The Organization must not target audiences under 21. Telegram and other chats are never a place for passwords, identity documents, health information, or payment data.

## 11. Independent contractor

The Organization is an independent contractor. Nothing here creates employment, agency, partnership, joint venture, or franchise. Neither the Organization nor the Organization Owner may bind Xenios, accept payments for Xenios, or make commitments on Xenios's behalf. The Organization is responsible for its own taxes, insurance, and expenses. [COUNSEL: franchise law, business-opportunity law, and state sales-representative commission statute review for the organization revenue share and the disclosed override; confirm the structure does not require franchise or business-opportunity registration in any state]

## 12. Term, suspension, and termination

12.1 The term begins on countersignature and continues until terminated. Either party may terminate for convenience with [CONFIG: notice period, 30 days suggested] written notice. Xenios may suspend or terminate immediately for cause.

12.2 Immediate suspension applies for: a safety claim; dosing or prescribing conduct; a privacy breach; account sharing; fraudulent orders; identity misuse; unauthorized resale; or unapproved product representation, by the Organization or by any member of its Contractual Group acting in that capacity. Xenios may hold all payouts during the investigation.

12.3 The Organization may not buy inventory for resale under this agreement. Wholesale and sub-distribution are a future separate program with their own verification, insurance, quality, storage, chain-of-custody, and territory requirements.

12.4 On termination: program access ends, links and campaigns deactivate, the Organization stops representing any Xenios relationship and removes Xenios-branded content within [CONFIG: takedown window], and amounts in a clean approved state are paid in the ordinary cycle. Amounts pending, held, or connected to the conduct causing a for-cause termination may be voided. [COUNSEL: confirm the forfeiture scope against applicable commission statutes]

12.5 Termination of this agreement does not by itself terminate an Approved Rep's separate XR-AFF-003 agreement, but it ends the rep's assignment to the Organization and the Organization Owner's override prospectively.

12.6 Sections 5.3, 6, 7.2, 8, 9 (for published content), 11, 13, and 14 survive termination.

## 13. Indemnification and liability

[COUNSEL: draft indemnification and limitation-of-liability provisions for the organization relationship, coordinated with XR-AFF-002 sections 13 and 14. Intended posture: the Organization indemnifies Xenios for claims arising from the Organization's unapproved content, prohibited claims, communications-law violations, and breach; consider the interaction with the Approved Reps' separate agreements so liability is not double-allocated]

## 14. General

14.1 This agreement, the attached economics schedule, the Approved Assets terms, and the referenced program policies are the entire agreement about the organization partnership. Xenios may update program policies prospectively with notice; economics changes follow section 5.5.

14.2 The Organization may not assign this agreement without Xenios's written consent, including by change of control. Xenios may assign to a successor of the business.

14.3 This agreement does not waive rights that cannot be waived under applicable law, and it does not relieve Xenios of duties imposed by law. Cancellations, refunds, and consumer rights of members are always subject to applicable law.

14.4 Samuel Boadu (samuel@xeniostechnology.com), as founder and server-enforced super administrator, administers the program: approval, certification, rate setting within the signed schedule, organization assignment, attribution review, claims review, payout holds and releases, suspension, termination, and audit.

## Open items for counsel

- [COUNSEL: franchise law, business-opportunity law, and state sales-representative commission statute review for the organization revenue share and the disclosed Organization Owner override (sections 5, 11)]
- [COUNSEL: whether sharing membership fee revenue ($50 activation, $25 recurring) with an organization is permissible, and required disclosure if enabled (section 6.2)]
- [COUNSEL: draft indemnification and limitation-of-liability provisions, coordinated across XR-AFF-002, XR-AFF-003, and this agreement (section 13)]
- [COUNSEL: confirm the forfeiture scope for pending and held amounts on for-cause termination (section 12.4)]
- [COUNSEL: confirm the minimum aggregation threshold and suppression rule for small-cohort analytics (section 8.3)]
- [COUNSEL: confirm whether the Affiliate Data Processing Addendum should be a standard attachment for organizations (section 8.4)]
- [COUNSEL: confirm retention periods for organization agreements, economics schedules, tax forms, and payout ledgers under XR-POL-005]
- [CONFIG: organization revenue share percentage and override terms (economics schedule); hold length; payout schedule and minimum threshold; correction window; takedown window; convenience-termination notice period]
- [ENTITY: exact legal entity name and state of formation for the signature block]

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |

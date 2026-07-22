# Quantum Transaction Structure Memo

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-QTM-005 |
| Title | Quantum Transaction Structure Memo |
| Audience | counsel |
| Required member state | n/a (internal) |
| Trigger | Quantum transaction-structure review, after classification and facility drafts |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | n/a (internal working document) |
| Withdrawal supported | no (internal record) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-QTM-003, XR-QTM-004, XR-QTM-008 |
| Sources | See 00-register/SOURCE_REGISTRY.md |
| Review date | 2026-07-19 |

## 1. Purpose

This memo frames the open question of how a Quantum transaction would be structured, if
Quantum is ever cleared for commerce. It lists candidate structures neutrally so counsel
can evaluate them. It does not choose a structure. The decision is explicitly reserved for
counsel. No part of this memo authorizes any sale or activation. Quantum stays Coming Soon
until the Quantum Commerce Activation Checklist (XR-QTM-008) is complete.

## 2. The open question

For Quantum, the following are undecided and interdependent:

- Who sells Quantum, and what exactly is being sold (a product, a service, a
  professional's service with a product component, or something else).
- Who the buyer is, and in what capacity (a member as a consumer, a member as a patient of
  a licensed professional, or another arrangement).
- Whether a licensed professional must be involved, and if so, whether that professional
  is the seller, the administrator, the prescriber, or a supervising party.
- How payment flows (who charges the member, who receives funds, whether any professional
  fee is separate from any product charge, and who bears refund and chargeback exposure).

These cannot be answered until the classification questionnaire (XR-QTM-003) and the
facility and administration matrix (XR-QTM-004) are complete, because the lawful structure
depends on what Quantum is and how it is administered in each state.

## 3. Constraints that any structure must satisfy

Whatever structure counsel selects, it must satisfy the constraints already fixed by the
canon and by law:

- The member interface may be simple, but separate server-side lanes sit under it;
  Quantum's lane is distinct from supplements and research materials.
- The presentation and claims must match the approved classification lane. A research-use
  label does not control if the overall presentation conveys human use.
- No diagnosis, prescribing, dosing, or medication direction occurs anywhere in the
  Xenios member experience.
- Disclosure of any affiliate or professional relationship must be clear.
- Founder authority (samuel@xeniostechnology.com) is the named accountable human for
  escalations, and no commerce activates without Samuel's written approval.

## 4. Candidate structures (listed neutrally, not recommended)

Each option is stated as a possibility for counsel to weigh. Listing an option is not an
endorsement of it, and some options may be unlawful for Quantum depending on
classification.

- Option A: Xenios sells Quantum directly to the member as a product, with no professional
  involvement. Viable only if classification permits direct product sale without
  professional oversight.
- Option B: Xenios sells Quantum as a product, but a licensed professional must clear or
  supervise each order, with the professional relationship handled outside Xenios's own
  charge.
- Option C: A licensed professional or professional entity is the seller/provider; Xenios
  provides only the technology, catalog, or referral layer, and does not take title to the
  product or charge for it directly.
- Option D: A partner (for example the fulfillment partner) holds and ships Quantum
  inventory under its own authorizations, while the member-facing charge and
  responsibility sit with the properly authorized party.
- Option E: Quantum is not offered at all in the founding phase, and the Coming Soon state
  is maintained indefinitely.

For each option, counsel should record: legality under the classification conclusions,
which states it could work in (per XR-QTM-004), the payment flow, the party bearing
liability and refund/chargeback exposure, and the disclosures required.

## 5. Payment flow considerations

Payment structure is not settled and must follow, not lead, the classification and
professional-involvement decisions. Points counsel must resolve:

- Whether any product charge and any professional fee must be separated.
- Which entity is the merchant of record and whether the payment processor has approved
  the Quantum product category in writing.
- How refunds and replacements work for Quantum given the no-ordinary-returns posture and
  chain-of-custody constraints already set for research products.
- Whether large-order review and authorize-then-capture handling apply to Quantum.

## 6. Decision reservation

The transaction structure for Quantum is not decided in this memo. The decision is
reserved for counsel and cannot be inferred from the ordering or wording of the options
above. Until counsel selects and approves a structure, and every dependent gate in
XR-QTM-008 is complete, Quantum commerce stays disabled at the server level.

## Open items for counsel

- [COUNSEL: select and justify the Quantum transaction structure, or conclude none is viable in the founding phase.]
- [COUNSEL: for the selected structure, define the merchant of record, the fund flow, and the party bearing liability and chargeback exposure.]
- [COUNSEL: confirm whether a separate professional fee and product charge are required, and how each is disclosed to the member.]
- [COUNSEL: confirm processor written approval of the Quantum product category before any activation.]
- [COUNSEL: confirm the retention period for this memo and the decision record under XR-POL-005.]

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |

# 19 — Final owner approval record

| Field | Value |
| --- | --- |
| Owner | Samuel Boadu |
| Initials | SB |
| Date | September 26, 2026 |
| Approval statement | **APPROVE THE REVIEWED XENIOS CLARITY DECISION SET** |
| How given | Samuel pasted the statement and the owner instructions below into this Claude Code session (clarity-strategy lane, `claude-clarity-spec-20260926`). Claude then asked whether to record it as written, and Samuel answered **"Yes, record it as written."** |
| Revisions to the reviewed recommendation | **G-1:** conservative public wording; the stronger promise is held for counsel. **I-1:** general-interest application only; no named roles. **A-1** and **B-1:** expanded wording (below). All other items: reviewed defaults. |
| Recommendation it approves | `19_REVIEWED_DECISION_RECOMMENDATION.md` (strategy SHA `31ffe3e60f8cdb14059c05f0f02672fb2ea8b861`), as revised below |
| Recorded in | `17_OWNER_DECISION_PACKET.md` (Answer lines) |
| Not authorized by this approval | Deployment of anything; database, commerce, payment, credential or clinical changes; feature or flag activation; verification of any unverified claim; any partner agreement |

## Owner instructions as given (verbatim)

```text
APPROVE THE REVIEWED XENIOS CLARITY DECISION SET

Record the following as my final owner instructions:

A-1 — BRAND / ENTITY

Keep "Xenios" as the public-facing brand for this release.

Keep "Xenios Technologies, Inc." as the legal, contracting, policy, footer, receipt, and sender entity.

Infinity is the broader technology, AI, software, hardware, data, product, and infrastructure organization.

Eon Health is the working future name for the clinical, telehealth, Care, therapeutics, diagnostics, pharmacy-coordination, fulfillment, and customer-health business.

Do not publish Eon Health or Infinity as a completed public or legal rename until the legal entity, DBA or subsidiary structure, trademark, domain, policies, contracts, sender identities, and transition plan are approved.

Implement one centralized brand configuration so the later reviewed transition is controlled.

B-1 — ROOT HOMEPAGE AND PROTECTED CORE

Approved.

I amend the July 29 core-site protection directive solely for the Xenios clarity program.

Codex may modify the protected root homepage, shared header and footer, global navigation, App routing, and related protected files only to implement the owner-approved clarity information architecture and copy.

Every protected-file change must still pass the canonical protected-change review and independent review.

This approval does not authorize unrelated redesign, authority changes, production deployment, database changes, commerce activation, payment changes, credential changes, clinical changes, or feature activation.

B-2 — HERO

Approved with the reviewed revision.

H1:

Care and research products, clearly separated.

Supporting copy:

Start a Care request, or explore products for research use. Two different paths, with clear next steps.

Do not use "Clinician-guided Care" as the primary category claim until clinical leadership verifies the operating claim and the claim ledger is updated.

C-1 — INITIAL PUBLIC PRODUCT SCOPE

Approved with the reviewed revision.

The first clarity release will use pathway tiles only.

Do not publish:

- public product counts
- individual Care products
- unavailable products
- unapproved product copy
- a large public catalog
- a direct-buy experience

The initial public pathways are:

- Start Care
- Explore Research Products
- For Practices

Individual assisted-order products can be added later only after I approve the exact product, exact variant, public copy, public price state, availability, fulfillment authority, and documentation state.

C-2 — PUBLIC PRICES

Approve the recommended default.

Show a public price only when the exact SKU and variant have an explicitly approved public price.

Otherwise show:

Price confirmed in your quote.

Do not show candidate prices, pending prices, Care prices, $0 prices, introductory prices, or public volume tiers.

D-1 — CARE AVAILABILITY, COST, AND SPEED

Approve the recommended default.

Use:

Care availability depends on your state. We confirm it after your request.

Submitting a Care request is free.

Do not publish:

- response-time promises
- consultation-price promises
- the $30 plan
- unsupported state coverage

D-2 — CLINICIAN, PHARMACY, TESTING, AND SHIPPING CLAIMS

Approve the recommended default.

Remove clinician, pharmacy, testing, COA, and shipping-time claims until the responsible clinical, operations, pharmacy, or quality owner verifies them and the claim ledger is updated.

E-1 — PRACTICE ORDERING FOR CLIENTS

Approve the recommended default.

Practices may not place orders on behalf of clients at launch.

Clients create and own their accounts, submit their own orders, and personally accept the applicable Research-use terms.

E-2 — PRACTICE REPORTING VISIBILITY

Approve the recommended default.

Approved practices may see safe commercial information such as:

- referral counts
- attributed or credited orders
- commission entries
- payout information when the program is active

Client names or client-level status require a future explicit consent mechanism.

Care or clinical information is never shared without the patient's written authorization and the applicable clinical/legal authority.

F-1 — PARTNER AND PRACTICE COMMISSION

Approve the recommended default.

The governing internal and agreement structure is:

- 20% of the first eligible Research payment
- 7.5% of eligible repeat Research payments during months 2 through 12
- 21-day hold
- $50 minimum
- payouts every other Friday
- no Care or clinical revenue commission

Do not publish the numbers, hold, minimum, attribution window, or payout cadence on the public website.

Public wording should say:

Your practice earns commission on eligible research-product orders from clients you refer. Rates, holds, and payout timing are in your partner agreement. Care services never earn commission.

G-1 — CLIENT RELATIONSHIP

Approve the conservative version for the public release.

Use:

Clients create and own their own accounts. Your practice is recorded as the referring practice. If a client uses Care, the Care clinician makes the medical decisions, and the client decides what to share with the practice.

The stronger promise that "your client stays your client" and that Xenios will not market competing coaching or practice services may be included only after counsel approves the matching language in the partner agreement.

H-1 — WHOLESALE / IN-CLINIC INVENTORY

Approve the recommended default.

Wholesale and in-clinic inventory are not offered in this release.

The site may state only:

In-clinic inventory is under review. Mention it in your inquiry if you are interested.

Do not show wholesale prices, ordering controls, timelines, or availability promises.

I-1 — CAREERS

Use a general-interest application only for the first clarity release.

Do not list a named role merely because it exists in old source code or a prior draft.

Named roles may be added only after I separately confirm that the role is currently open, its title, scope, compensation presentation, application method, and owner.

All other decision items:

Approve the reviewed recommended defaults.

Record this approval under:

Samuel Boadu
Initials: SB
Date: September 26, 2026
```

## Decision tally

13 approved (A-1, B-1, B-2, C-1, C-2, D-1, D-2, E-1, E-2, F-1, G-1, H-1, I-1) · 0 pending · 0 deferred.

## Items the approval leaves open (not owner decisions; recorded so nobody treats them as done)

- **Counsel:**
  - G-1 stronger promise and matching partner-agreement language (C-028)
  - Q-01 to Q-07
  - Research Use Policy sentence (C-018)
  - partner disclosure (C-042)
- **Clinical:** C-004 (licensed clinician decides), C-043 (follow-up ownership). These keep "Clinician-guided Care" off the hero.
- **Operations:** pharmacy (C-005), testing/COA (C-008/C-009), shipping (C-010), account cost (C-021), product formats (C-017).
- **Engineering follow-ups outside this release:**
  - retire the superseded 20/15 draft commission schedule
  - Pack 02 table-name collision
  - Referral V1 / affiliate activation

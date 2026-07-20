---
title: Open Research Gaps
type: internal-documentation
status: draft
owner: Samuel Boadu
last_reviewed: 2026-07-19
---

# Open Research Gaps

This is the register of everything the content build could not verify. It is the honest ledger that
sits underneath `docs/research-content/CONTENT_STATUS_BOARD.md`.

A gap in this file is a statement that a fact is not known. It is not a placeholder to be filled in
by inference, by a competitor listing, or by what is typical for the category. Every gap closes the
same way: a named human obtains a written, dated, attributable source and records it here.

## 1. Standing rules for this register

1. No gap is closed by an AI. An AI may draft the entry and note where the answer would come from.
   Only a named human closes a gap, and the closure records who, when, and on what evidence.
2. Where a fact is unknown, the affected content record writes exactly
   `NOT CONFIRMED - see open supplier questions`. It does not write an estimate, a range, a typical
   value, or a value copied from another vendor.
3. A gap that blocks publication blocks it for real. There is no path where a record ships with an
   open S1 gap because the launch date is close.
4. Closing a gap requires the source document, not a verbal assurance. A supplier statement in a
   chat message is grade E evidence at best and is recorded as such.
5. Nothing in this register is a claim about a product. It is a list of questions.

## 2. Severity scale

| Severity | Meaning | Effect |
| --- | --- | --- |
| S1 | Blocks publication of the affected record on any member-facing surface. | The record cannot leave `draft`. No exceptions. |
| S2 | Blocks commerce enablement, or blocks a specific section of a record. | The record may progress through internal and founder review with the affected section held empty and explicitly marked. |
| S3 | Does not block draft or review. Blocks final polish, or creates risk that compounds if left open. | Track and resolve before the record reaches `published`. |

## 3. Resolver roles referenced below

| Role | Person or party | Scope |
| --- | --- | --- |
| Founder reviewer and publisher | Samuel Boadu | Final approval of every content record and every claim posture. Sole publisher. |
| Fulfillment owner, peptides and Quantum, first ~60 days | Mitch | Route for supplier-side questions on peptide products and Quantum during the initial period. |
| Fulfillment owner, supplements | xenios | Supplement handling and any future reseller relationship. |
| Supplier of record | NOT CONFIRMED - see open supplier questions | Composition, ratios, specifications, stability, COA, and quality system evidence. |
| Third-party laboratory | NOT CONFIRMED - see open supplier questions | Independent identity, purity, and sterility testing. |
| Outside counsel | Not yet engaged for this scope | Claim surface review, regulatory classification, per-state availability. |
| Prospective brands, no relationship established | Momentous, Pure Encapsulations | Reseller authorization, MAP policy, account terms. No authorization, account, or agreed terms exist with either. See GAP-012 and GAP-013. |

## 4. Gap register

### 4.1 Composition and identity

| Id | Description | Why it blocks publication | Who can resolve | Severity |
| --- | --- | --- | --- | --- |
| GAP-001 | Exact composition and component ratios are unknown for all six blend products (P001, P002, P003, P004, P005, P015). | A blend record cannot describe what it contains, and a blend Guide cannot discuss the combination, without the actual composition. Stating or implying a ratio that has not been confirmed is inventing a product fact. Component order in a product name is not evidence of ratio. | Supplier of record, requested through Mitch, confirmed in writing to Samuel Boadu. | S1 |
| GAP-002 | The component set behind the KLOW name is unknown. Whether KLOW denotes a fixed formulation, a supplier-specific formulation, or a category name is also unknown. | P003 and the KLOW blend Guide have no verified subject. Inferring components from the letters of the name would be fabrication. Every downstream statement, including which goal pages P003 appears on, depends on this. | Supplier of record, requested through Mitch, confirmed in writing to Samuel Boadu. | S1 |
| GAP-005 | Capsule composition for P013 (SLU-PP-332 Capsules) and P014 (Dihexa Capsules) is unknown, including active content per capsule, excipients, capsule shell material, and any allergen or animal-derived component. | An ingredient section cannot be written without it, and members with dietary or religious restrictions cannot be given accurate information. Capsule shell material in particular is a common source of unstated animal-derived content. | Supplier of record, requested through Mitch, confirmed in writing to Samuel Boadu. | S1 |
| GAP-019 | Quantum product identity is unresolved. What the Quantum offering physically is, what it consists of, and what a member would receive are all unknown. | No Quantum record can be written at all. There is no verified subject to describe. | Samuel Boadu with Mitch as fulfillment owner. | S1 |

### 4.2 Specifications

| Id | Description | Why it blocks publication | Who can resolve | Severity |
| --- | --- | --- | --- | --- |
| GAP-003 | Concentration per unit is unknown for every peptide product (P001 to P012, P015). | A product record cannot state a specification it does not have. This is recorded as a product specification only. It is never presented as a dosing instruction, and dosing information stays intentionally excluded from every surface regardless of how this gap closes. | Supplier of record, requested through Mitch. | S1 |
| GAP-004 | Fill volume, vial format, vial size, and unit count are unknown for every peptide product. | Members cannot be shown what a unit is. Shipping class, cold chain requirements, and quantity limits all depend on the physical format. | Supplier of record, requested through Mitch. | S1 |
| GAP-024 | Product imagery does not exist, and image rights and asset provenance are unestablished. | Using supplier or competitor photography without a written licence is a rights problem, and imagery that does not depict the actual unit shipped is a misrepresentation. | Samuel Boadu, with a written licence or original photography. | S2 |

### 4.3 Stability, storage, and handling

| Id | Description | Why it blocks publication | Who can resolve | Severity |
| --- | --- | --- | --- | --- |
| GAP-006 | Shelf life and expiry dating are unknown for every product, including whether dating is supplier-assigned, stability-tested, or absent. | A storage section cannot be written, and a member cannot be told how long a unit remains within specification. An undated product also cannot be inventory-managed responsibly. | Supplier of record with stability data, requested through Mitch. | S1 |
| GAP-007 | Storage conditions are unknown, both in transit and after receipt, including temperature range, light exposure, and any difference between an unopened and an opened unit. | Storage is one of the few operational facts a member-facing record must get exactly right. An incorrect storage statement can degrade a product and is a safety-adjacent error. | Supplier of record, requested through Mitch. | S1 |
| GAP-018 | Temperature-controlled shipping has not been validated. There is no packaging specification, no transit temperature data, no excursion threshold, and no defined response when a shipment arrives outside range. | Without validation, xenios cannot state that any product arrives within its storage specification, and cannot honestly answer a member who asks what happens if a package sits in a hot vehicle. Shipping cold-chain-dependent product without validation is an operational risk, not only a content gap. | Samuel Boadu with Mitch as fulfillment owner, with a carrier and packaging specification. | S1 for any claim about shipping conditions, S1 for commerce enablement |

### 4.4 Quality documentation

| Id | Description | Why it blocks publication | Who can resolve | Severity |
| --- | --- | --- | --- | --- |
| GAP-008 | COA status is unknown. Whether a certificate of analysis exists per lot, what it covers, whether it is lot-linked, and whether it can be shown to members are all unresolved. | The canonical UI direction makes lot-specific quality documentation a visible part of the product surface. A quality section cannot be written against documents that may not exist. The existence of a certificate is also never presented as evidence that a product is safe. | Supplier of record, requested through Mitch, with documents retained by Samuel Boadu. | S1 |
| GAP-009 | Third-party testing status is unknown, including the laboratory identity, the scope of testing (identity, purity, sterility, endotoxin), the methods, and whether testing is per lot or one time. | "Third-party tested" is a claim, and an unverified claim of independent testing is one of the more serious misrepresentations available in this category. It cannot appear anywhere until the laboratory and scope are documented. | Supplier of record and the testing laboratory, documents to Samuel Boadu. | S1 |
| GAP-010 | Supplier identity is unknown and unrecorded. | xenios cannot describe sourcing, cannot answer a member question about origin, and cannot perform any supplier diligence without knowing who the supplier is. Every other supplier-dependent gap is downstream of this one. | Mitch, disclosed to Samuel Boadu. | S1 |
| GAP-011 | Supplier quality systems are undocumented, including facility standards, manufacturing controls, any certifications held, and whether those certifications have been verified rather than asserted. | Quality cannot be presented as a generic page. A quality statement that rests on an unverified supplier assertion is grade E at best and must be labelled as such rather than presented as fact. | Samuel Boadu with the supplier of record, verification of any certificate directly with the issuing body. | S1 |

### 4.5 Commercial authorization

| Id | Description | Why it blocks publication | Who can resolve | Severity |
| --- | --- | --- | --- | --- |
| GAP-012 | Momentous reseller authorization is not established. There is no written authorization on file, no account, and no confirmed terms. | xenios may not state, imply, or display that it is authorized to resell, distribute, or sell Momentous product without written evidence. This blocks supplement commerce and blocks any brand mention that implies a relationship. | Samuel Boadu with Momentous. | S1 for any authorization statement, S1 for commerce enablement |
| GAP-013 | Pure Encapsulations reseller authorization is not established. There is no written authorization on file, no account, and no confirmed terms. | Same as GAP-012. Displaying a brand a business is not authorized to sell creates both a partner problem and a member trust problem. | Samuel Boadu with Pure Encapsulations. | S1 for any authorization statement, S1 for commerce enablement |
| GAP-014 | MAP (minimum advertised price) policy terms are unknown for both prospective brands, including the floor, what counts as advertising, member-only pricing treatment, and enforcement. | Displaying a price below a MAP floor can end a prospective relationship before it begins. Member-only pricing behind an access gate is often treated differently from public pricing, and that difference has to be confirmed rather than assumed. | Samuel Boadu with each brand. | S2, rising to S1 at the moment any price is displayed |
| GAP-021 | Fulfillment ownership is agreed in principle for roughly the first 60 days (Mitch for peptides and Quantum, xenios for supplements) but the operational record is incomplete. Who holds title, who holds inventory, who ships, who handles a return, and what happens at the end of the initial period are not documented. | Shipping estimates, return handling, and support routing all appear on member-facing surfaces and cannot be written against an undocumented arrangement. | Samuel Boadu with Mitch, in writing. | S2 |

### 4.6 Pricing and availability

| Id | Description | Why it blocks publication | Who can resolve | Severity |
| --- | --- | --- | --- | --- |
| GAP-015 | Final member pricing is not set for any record. Member price, any subscription price, and any compare-at price are all undetermined. | A price is a product fact and is never estimated. No price appears on any surface until it is set, and no record advances to a commerce-enabled state without one. | Samuel Boadu. | S2, S1 for commerce enablement |
| GAP-016 | Landed cost and margin are unknown, including product cost, shipping-in cost, cold chain cost, payment processing, and the cost of the return or replacement path. | Pricing set without a margin model is a business risk rather than a content risk, but it blocks the pricing decision that content depends on. It also determines whether cold chain shipping is economically viable at all. | Samuel Boadu with Mitch. | S3 for content, S1 for commerce enablement |
| GAP-017 | Per-state availability is unmapped. Which of these categories may be offered, to whom, and in which United States jurisdictions has not been analysed, and no jurisdictional restriction map exists. | Availability appears on the product surface, and an incorrect availability statement is a regulatory exposure rather than a content error. Any statement made here needs a date, a jurisdiction, and a source, which does not currently exist for any state. | Outside counsel, engaged by Samuel Boadu. | S1 for any availability statement, S1 for commerce enablement |

### 4.7 Regulatory and classification

| Id | Description | Why it blocks publication | Who can resolve | Severity |
| --- | --- | --- | --- | --- |
| GAP-020 | Quantum regulatory classification is unresolved. What Quantum is treated as, under which framework, in which jurisdiction, is unknown. | Classification determines what may be said, how it may be offered, and whether it may be offered at all. It also determines that Quantum stays outside ordinary shipped-product checkout, which is already the canonical direction. Nothing about Quantum can be published until this is answered with a date, a jurisdiction, and a source. | Outside counsel, engaged by Samuel Boadu. | S1 |
| GAP-023 | Regulatory statements across the catalog lack the required date, jurisdiction, and source URL. This applies with particular force to Tesamorelin, Gonadorelin, Semax, Selank, and anything touching endocrine or hormonal axis research, where status differs materially by jurisdiction and changes over time. | The house rule is absolute. A regulatory statement without a date, a jurisdiction, and a source URL is removed rather than published. Several records currently have no compliant regulatory line available to them. | Outside counsel for interpretation, with primary regulatory sources retrieved and recorded by a human reviewer. | S1 for any regulatory line |
| GAP-025 | The member-facing claim surface has not been reviewed by counsel. No review has covered the aggregate impression created by product records, Guides, and goal pages read together. | Individually compliant lines can still create a non-compliant overall impression, particularly where a goal page name sits next to a product record. Aggregate impression is how this category is actually assessed. | Outside counsel, engaged by Samuel Boadu. | S1 before first publication |

### 4.8 Evidence and content integrity

| Id | Description | Why it blocks publication | Who can resolve | Severity |
| --- | --- | --- | --- | --- |
| GAP-022 | No claim in any record has been verified against a retrieved primary source by a human. Every claim currently sits at default grade G or D, and no PMID, NCT number, DOI, or URL has been human-confirmed for this content set. | This is the core gap. Publishing an unverified claim in this category is the failure mode with the highest cost, and a fabricated or misremembered citation is worse than no citation. Until a human has retrieved and checked each source, every record stays at `incomplete pending human source verification`. | A human reviewer performing source retrieval, with Samuel Boadu signing off on the resulting grade for each claim. | S1 |
| GAP-026 | Goal-to-record assignment is unverified. Which products and Guides belong on which of the eleven goal pages has been drafted structurally, not confirmed against literature. | A goal page grouping is itself an implicit claim about what a compound has been studied for. Placing a record under a goal it has no research basis for would imply an outcome, which the canonical direction prohibits for nonclinical research materials. | A human reviewer alongside GAP-022, confirmed by Samuel Boadu. | S2 |
| GAP-027 | Adverse effect, contraindication, and interaction information has no verified source for any record. | A record that discusses what a compound has been studied for while staying silent on documented risks creates a one-sided impression. The remedy is a sourced risk section, not silence, and the sources do not yet exist in this build. Nothing here is written as safety reassurance, and "safe", "well tolerated", and "no side effects" are never stated as general facts. | A human reviewer performing source retrieval, with counsel review under GAP-025. | S1 |

## 5. Gap totals by severity

| Severity | Count | Gap ids |
| --- | --- | --- |
| S1 (blocks publication) | 21 | GAP-001, GAP-002, GAP-003, GAP-004, GAP-005, GAP-006, GAP-007, GAP-008, GAP-009, GAP-010, GAP-011, GAP-012, GAP-013, GAP-017, GAP-018, GAP-019, GAP-020, GAP-022, GAP-023, GAP-025, GAP-027 |
| S2 (blocks commerce or a section) | 5 | GAP-014, GAP-015, GAP-021, GAP-024, GAP-026 |
| S3 (track, does not block draft) | 1 | GAP-016 (content impact only, S1 for commerce) |

Total gaps recorded: 27.
Gaps closed as of 2026-07-19: 0.

## 6. What can proceed while these gaps are open

- Structure. Record skeletons, frontmatter, navigation, and internal cross-links can be built.
- Framing. The description of what a compound is and what area of research it sits in, written at
  grade G until sourced.
- Explicit absence. A record can state clearly which facts are not confirmed. That is the honest
  version of this catalog today, and it is a better member experience than confident invention.
- Review workflow. Everything in section 1 of the status board can be exercised on draft records.

## 7. What cannot proceed

- Any price, on any surface.
- Any statement of authorization to resell, distribute, or sell.
- Any dosing, protocol, regimen, timing, or administration content, at any workflow state, under
  any circumstance. This is not gated on a gap closing. It is permanently excluded.
- Any quality, testing, or certification claim.
- Any regulatory statement without a date, a jurisdiction, and a source URL.
- Any citation that was not actually retrieved and recorded.
- Any Quantum content.
- Publication of any record. Samuel Boadu is the sole publisher, and no automated process may
  publish on his behalf.

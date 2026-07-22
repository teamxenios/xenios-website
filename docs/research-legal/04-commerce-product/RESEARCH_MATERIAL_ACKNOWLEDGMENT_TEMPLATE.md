# Research Material Acknowledgment Template

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-COM-016 |
| Title | Research Material Acknowledgment Template |
| Audience | internal (the template); member (each instantiated, approved acknowledgment) |
| Required member state | n/a (internal template); instantiated acknowledgments are presented to active members |
| Trigger | internal: per-SKU instantiation when a research-product SKU is prepared for commerce; instantiated: first checkout attempt containing that SKU, before payment |
| Route | internal (template); instantiated acknowledgments render in the member checkout flow on /research member pages |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | template: n/a; instantiated: checkbox + timestamp + document version + SKU + member reference recorded server-side |
| Withdrawal supported | no (an acknowledgment of disclosures made at purchase; declining the purchase is always available) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-COM-014, XR-COM-017, XR-COM-019, XR-MEM-008, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FDA Gram Peptides warning letter (2026); FDA Wholesale Peptide warning letter (2026) |
| Review date | 2026-07-19 |

## 1. Purpose and status

This file is a fill-in template, not a member-facing document. Xenios instantiates it once per
research-product SKU (the current catalog records P001 through P015). An instantiated
acknowledgment becomes member-facing only after counsel approves it and the SKU's commerce
state is enabled. No research-product SKU is sold without an approved instantiation.

## 2. The honest framing this template enforces

Xenios describes these products truthfully or not at all:

1. They are research products whose classification and permitted marketing lane are under
   formal review. Each SKU receives a written classification memorandum, and the instantiated
   acknowledgment states the SKU's current lane status plainly, including "under formal
   review" when that is the truth.
2. Research-use language is not a loophole. FDA warning letters to peptide sellers show that a
   research-use disclaimer does not control when the overall presentation conveys human use.
   Classification, claims, quality, and professional oversight are governed by law, not by
   disclaimers. The instantiated acknowledgment must never be used to launder a human-use
   pitch through research vocabulary.
3. Nothing in the acknowledgment, the product page, the Guide, or any support answer may
   contain human-use directions, dosing, administration instructions, medication direction, or
   outcome promises for these products. This is a hard rule for every channel, including
   affiliates and Telegram.

## 3. Merge fields

| Field | Meaning | Rule |
| --- | --- | --- |
| {{product_name}} | The exact catalog display name (for example the P006 record's name) | Must match the product page |
| {{sku}} | The internal SKU code (P001 through P015 currently) | Must match the catalog record |
| {{lane}} | The lane status from the classification memorandum | Copied, never guessed; "under formal review" when true |
| {{specific_risks}} | Product-specific factual disclosures | No dosing, no human-use directions, no outcome language |
| {{restrictions}} | The restrictions that apply to this SKU (state restrictions, quantity limits, storage and handling facts) | Copied from the memorandum and server-side lane controls |
| {{acknowledgment_version}} | Version of the instantiated acknowledgment | Incremented on change; recorded with each acceptance |

## 4. Template text

```text
Research Material Acknowledgment: {{product_name}} ({{sku}})
Version {{acknowledgment_version}}

Before you buy {{product_name}}, please read and confirm the following.

1. Classification status. This product's classification and permitted marketing
   lane are: {{lane}}. Where review is still in progress, that is stated here
   honestly rather than resolved by a label.

2. No human-use directions. Xenios does not provide directions for human use of
   this product. There are no dosing instructions, no administration
   instructions, and no medication direction, from Xenios, its Guides, its
   support channels, or its affiliates. A "research use" label does not change
   what the law requires, and it is not presented here as doing so.

3. Restrictions that apply to this product:
{{restrictions}}

4. Product-specific points you should understand:
{{specific_risks}}

5. No claims. This product is not represented as FDA approved, clinically
   proven, or safe for everyone, and no outcome is promised.

6. Quality documents, including any certificate of analysis, are
   supplier-generated unless expressly stated otherwise. See the Quality
   Document and COA Disclaimer.

7. Problems and concerns. If something seems wrong with this product, follow
   the Product Concern and Adverse Event Instructions. In an emergency, call
   911 first.

8. This acknowledgment does not waive rights that cannot be waived under
   applicable law, and it does not relieve Xenios of duties imposed by law.

I have read this acknowledgment. I understand this product's lane and
restrictions, and I understand that Xenios provides no human-use directions
for it.
```

## 5. Instructions for use

1. Confirm the SKU's written classification memorandum exists and is current. No memorandum,
   no instantiation, no commerce.
2. Fill every merge field from the memorandum and the catalog record. {{lane}} and
   {{restrictions}} are copied, not drafted from memory.
3. Draft {{specific_risks}} as factual statements only. Strike anything that reads as a use
   instruction, a benefit claim, or an outcome suggestion.
4. Check the whole presentation, not just this text: the product page, images, Guide, and
   category placement must not convey human use that the acknowledgment then disclaims. If the
   presentation and the lane conflict, fix the presentation or keep commerce disabled.
5. Counsel reviews and approves each instantiation before the SKU's commerce state is enabled.
   Server-side lane controls remain the enforcement mechanism; this document is disclosure.
6. Record every acceptance server-side with checkbox, timestamp, document version, SKU, and
   member reference. Material changes require re-acceptance. [COUNSEL: define "material".]

## 6. What an instantiated acknowledgment does not do

It does not settle the product's classification, permit any claim, or substitute for quality
controls, lawful marketing, or professional oversight. It does not waive rights that cannot be
waived under applicable law, and it does not relieve Xenios of duties imposed by law.

## Open items for counsel

- Approve the fixed template language in section 4, including the "no human-use directions"
  and classification-status paragraphs, before any instantiation.
- Confirm, per SKU, the {{lane}} and {{restrictions}} content from each classification
  memorandum, and confirm which of P001 through P015 may be offered for sale at all.
- Confirm the state-by-state restriction matrix feeding {{restrictions}}.
- Define what counts as a "material" version change requiring member re-acceptance.
- Confirm the retention period for acceptance records under XR-POL-005: `[COUNSEL: confirm period]`.
- Reconcile retention references with docs/privacy/RETENTION_POLICY.md in this repository.
- Confirm the exact legal entity name to substitute for `[ENTITY]` where the instantiated
  acknowledgment names the seller.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |

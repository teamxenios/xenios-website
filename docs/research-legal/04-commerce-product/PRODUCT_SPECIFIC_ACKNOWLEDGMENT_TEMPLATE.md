# Product-Specific Acknowledgment Template

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-COM-014 |
| Title | Product-Specific Acknowledgment Template |
| Audience | internal (the template); member (each instantiated, approved acknowledgment) |
| Required member state | n/a (internal template); instantiated acknowledgments are presented to active members |
| Trigger | internal: per-SKU instantiation during product onboarding; instantiated: first checkout attempt containing that SKU, before payment |
| Route | internal (template); instantiated acknowledgments render in the member checkout flow on /research member pages |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period] |
| Acceptance event | template: n/a; instantiated: checkbox + timestamp + document version + SKU + member reference recorded server-side |
| Withdrawal supported | no (an acknowledgment of disclosures made at purchase; the member can always decline the purchase or stop using the product) |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-COM-015, XR-COM-016, XR-COM-017, XR-COM-019, XR-POL-005 |
| Sources | See 00-register/SOURCE_REGISTRY.md; FDA Health Products Compliance Guidance (FTC); FDA dietary supplement industry information |
| Review date | 2026-07-19 |

## 1. Purpose and status

This file is a fill-in template, not a member-facing document. Xenios instantiates it once per
SKU that needs its own acknowledgment. The template itself is never shown to a member. An
instantiated acknowledgment becomes member-facing only after it is completed, reviewed against
that SKU's written classification memorandum and the claims registry, and approved by counsel.

Every SKU in the catalog receives a written classification memorandum that assigns its lane
(for example dietary supplement or nonclinical research material). The instantiated
acknowledgment must match that lane exactly. The website, Guides, and support answers for the
SKU must say nothing the acknowledgment contradicts.

## 2. When a SKU needs its own acknowledgment

Instantiate this template for:

1. Every research-product SKU (the current P001 through P015 records). These also require the
   lane-level Research Material Acknowledgment framework (XR-COM-016).
2. Any conditional supplement, meaning one the catalog hides or flags for review: iron,
   high-dose vitamin D, melatonin, hormone-interest herbs (for example ashwagandha or tongkat
   ali), and any product with notable allergen or medication-interaction concerns.
3. Any SKU whose classification memorandum, insurer, processor, or counsel requires a
   product-specific disclosure.

Ordinary supplements without conditional flags may rely on the lane-level Supplement
Acknowledgment (XR-COM-015) alone. [COUNSEL: confirm which SKUs need a per-SKU acknowledgment
in addition to the lane acknowledgment.]

## 3. Merge fields

| Field | Meaning | Rule |
| --- | --- | --- |
| {{product_name}} | The exact catalog display name | Must match the product page |
| {{sku}} | The internal SKU code (for example P006) | Must match the catalog record |
| {{lane}} | The lane assigned by the classification memorandum | Never guessed; copied from the memorandum |
| {{specific_risks}} | Product-specific risk disclosures, as a plain-English list | Drafted per SKU; reviewed by counsel; no dosing, no human-use directions |
| {{acknowledgment_version}} | The version of the instantiated acknowledgment | Incremented on any change; recorded with each acceptance |

If {{lane}} is "under formal review", say so plainly. Never fill {{lane}} with a classification
that has not been assigned in writing.

## 4. Template text

The block below is the text to instantiate. Everything in double braces is replaced before
counsel review. Nothing else is edited without counsel approval.

```text
Product Acknowledgment: {{product_name}} ({{sku}})
Version {{acknowledgment_version}}

Before you buy {{product_name}}, please read and confirm the following.

1. Lane. This product is offered in the following lane: {{lane}}. The rules,
   restrictions, and documents that apply to this product follow from that lane,
   and Xenios's server-side controls enforce them.

2. Product-specific points you should understand:
{{specific_risks}}

3. This product is not represented as FDA approved, clinically proven, or safe
   for everyone. Xenios does not diagnose, prescribe, or provide dosing or
   medication direction. Questions that involve your medical conditions or
   medications belong with your own physician, pharmacist, or qualified
   professional.

4. Quality documents shown for this product, including any certificate of
   analysis, are supplier-generated unless expressly stated otherwise. See the
   Quality Document and COA Disclaimer.

5. If something seems wrong with this product, or you experience a possible
   adverse event, follow the Product Concern and Adverse Event Instructions.
   In an emergency, call 911 first.

6. This acknowledgment does not waive rights that cannot be waived under
   applicable law, and it does not relieve Xenios of duties imposed by law.

I have read this acknowledgment and I understand the lane and the points above.
```

## 5. Instructions for use

1. Confirm the SKU has a written classification memorandum. No memorandum, no instantiation.
2. Fill every merge field. Check {{product_name}} and {{sku}} against the live catalog record.
3. Draft {{specific_risks}} from the memorandum, the supplier's documentation, and the claims
   registry. Only allowed claims and factual risk statements. No dosing, no administration
   directions, no outcome language.
4. For a research-product SKU, attach the instantiated XR-COM-016 acknowledgment as well; the
   two are presented together. For a supplement, confirm XR-COM-015 has been accepted.
5. Send the instantiated draft to counsel. It is not published, and the SKU's commerce state is
   not enabled on the strength of it, until counsel approves.
6. On publication, record the version. Every acceptance is stored server-side with checkbox,
   timestamp, document version, SKU, and member reference. Re-acceptance is required when the
   version changes materially. [COUNSEL: define "material" for re-acceptance.]

## 6. What an instantiated acknowledgment does not do

An instantiated acknowledgment is a disclosure record, not a shield. It does not change the
product's lawful classification, does not authorize any claim, does not replace quality
controls or professional oversight, and does not waive rights that cannot be waived under
applicable law or relieve Xenios of duties imposed by law.

## Open items for counsel

- Confirm the retention period for acceptance records under XR-POL-005: `[COUNSEL: confirm period]`.
- Confirm which SKUs require a per-SKU acknowledgment in addition to the lane-level
  acknowledgment (XR-COM-015 or XR-COM-016), and whether all 15 research SKUs do.
- Define what counts as a "material" version change requiring member re-acceptance.
- Approve the fixed template language in section 4 so that per-SKU review can focus on the
  merge-field content.
- Reconcile retention references with docs/privacy/RETENTION_POLICY.md in this repository;
  counsel to decide which document controls or whether to merge with XR-POL-005.
- Confirm the exact legal entity name to substitute for `[ENTITY]` where the instantiated
  acknowledgment names the seller.

## Version history

| Version | Date | Note |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |

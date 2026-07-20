---
title: Product Content Schema
type: content-schema
status: canonical
owner: Samuel Boadu
last_reviewed: 2026-07-19
---

# Product Content Schema

This document defines the exact contract for a product content record inside Xenios Research.
Every file under `content/research-products/` conforms to this schema. A record that omits a
required section, or that carries a value outside the allowed set, is not publishable to any
member-facing surface.

This schema is internal. In internal prose the company name is written lowercase as xenios.
The member-facing brand form is Xenios Research.

## 1. Purpose and scope

A product content record is a catalog and documentation object. It is not a sales page, not a
protocol, and not a source of instructions.

The record exists to hold what xenios actually knows about an item, to make explicit what xenios
does not yet know, and to keep catalog presence strictly separate from commercial authorization.

Three separations are structural and may not be collapsed:

1. **Catalog state is separate from commerce state.** A record may exist, be reviewed, and be shown
   to approved members while commerce stays disabled. Existence in the catalog is never an offer.
2. **Guide state is separate from commerce state.** Guide completion is not a prerequisite for
   commerce, and commerce approval is not a prerequisite for a Guide.
3. **Evidence attaches to claims, not to products.** A product is never graded. See
   `CLAIM_EVIDENCE_SCHEMA.md`.

## 2. Absolute content rules for every product record

These rules override completeness. A record that is thinner because of them is correct.

### 2.1 No dosing, ever

A product content record contains no amounts, no mg, mcg, IU, mL, units, or concentrations, no
frequency, no timing, no cycle length, no titration, no loading, no stacking, no reconstitution, no
injection technique, and no route of administration.

If a supplier document, label, or study states a dose, it is not reproduced anywhere in the record.
Where a reader might expect that information, the record states exactly:

```
dosing information is intentionally excluded
```

This applies to the Guide, the FAQ, the allowed copy, and every field of this schema.

### 2.2 No directions or protocols

No treatment directions, protocols, regimens, schedules, or sequences. Nothing in a record may be
followed as a set of instructions. Descriptive content only.

### 2.3 No guaranteed outcomes

The words "will", "proven to", "restores", "cures", "eliminates", and "reverses" do not appear as
descriptions of an effect. Permitted framings are "has been studied for", "reported in", and
"investigated as".

### 2.4 No unsupported safety claims

"Safe", "well tolerated", and "no side effects" are never stated as general facts. Safety content is
limited to named categories of consideration and to the instruction that a member speak with a
qualified professional.

### 2.5 No preclinical to human leaps

If a finding comes from an animal model or from in vitro work, the species or model appears in the
same sentence as the finding. A preclinical result is never phrased so that it reads as a human
result.

### 2.6 The research use only framing is prohibited

The phrase "research use only" may not be used as a device to imply human benefit. If a legal or
supplier label uses that phrasing, the record does not repeat it as a benefit signal, and any
regulatory characterization goes through the dated, jurisdictional, sourced format in section 2.7.

### 2.7 Regulatory statements carry a date, a jurisdiction, and a source URL

Every regulatory statement in a record uses this shape:

```
As of <YYYY-MM-DD>, in <jurisdiction>, <statement>. Source: <exact retrieved URL>
```

If any of the three elements is missing, the statement is not written. It goes into
`Open supplier questions` or into the Guide packet's `REGULATORY_STATUS.md` as an open item.

### 2.8 No advice

No medical, legal, financial, or clinical advice. No diagnosis. No self-treatment framing. No
comparison of an item against a prescription therapy as an alternative to it.

### 2.9 Never invent a product fact

Composition, ingredient ratios, concentration, fill volume, vial size, shelf life, storage
temperature, sterility, purity, certificate of analysis content, supplier identity, price, margin,
and inventory are never inferred, estimated, or filled in from a similar item.

Where a fact is unknown the record writes exactly:

```
NOT CONFIRMED - see open supplier questions
```

That exact string is the only permitted placeholder for an unknown product fact. It is
machine-checkable and is the signal that an open question exists.

The record never states that xenios is authorized to resell, distribute, or sell anything unless a
written authorization document exists and is referenced by identifier in the record.

### 2.10 Original wording only

No competitor, retailer, manufacturer, or supplier marketing text is copied or lightly paraphrased.
Supplier documents may be cited and characterized. Their promotional language is not reused.

## 3. Required sections

Every product content record contains the following twenty-one sections, in this order, using these
exact headings. No section may be dropped. A section with nothing known still appears and carries
the appropriate unknown placeholder.

1. SKU
2. Canonical name
3. Composition status
4. Format and size status
5. Inventory placeholder
6. Fulfillment owner placeholder
7. Commercial lane
8. Commerce approval state
9. Guide state
10. Quality document state
11. Storage data state
12. Shipping profile state
13. Allowed copy state
14. Prohibited claims
15. Goal mappings
16. Related Guides
17. Related Systems
18. Product FAQ
19. Support path
20. Last reviewed
21. Open supplier questions

## 4. Field table

Type notes: `string` is a single line. `enum` is one value from the allowed set. `enum list` is one
or more values from the allowed set. `block` is short prose or a short list. `ref list` is a list of
record slugs inside this repository. `date` is `YYYY-MM-DD`.

| # | Field | Type | Required | Allowed values | Default when unknown |
|---|-------|------|----------|----------------|----------------------|
| 1 | SKU | string | Yes | Pattern `XR-<LANE>-<SLUG>-<NNN>`. `LANE` is one of `PEP`, `SUP`, `QTM`. `SLUG` is lowercase alphanumeric with hyphens. `NNN` is a zero padded integer. Unique across the catalog. | Not permitted to be unknown. A record without a SKU is not created. |
| 2 | Canonical name | string | Yes | The single internal name for the item. One name per SKU. Common alternate names go in the Guide terminology section, never here. | Not permitted to be unknown. |
| 3 | Composition status | enum plus block | Yes | Enum: `Composition Confirmed In Writing`, `Composition Supplier Reported`, `Composition Not Confirmed`. The block names constituents only if a written supplier document supports it. No ratios, no concentrations, no fill volumes. | `Composition Not Confirmed` and the block reads `NOT CONFIRMED - see open supplier questions` |
| 4 | Format and size status | enum plus block | Yes | Enum: `Format Confirmed In Writing`, `Format Supplier Reported`, `Format Not Confirmed`. The block may describe presentation category in general terms only (for example, capsule, powder, single-use vial) when a written document supports it. Never a numeric size, volume, or count. | `Format Not Confirmed` and the block reads `NOT CONFIRMED - see open supplier questions` |
| 5 | Inventory placeholder | enum | Yes | One product state from section 5. This field is a placeholder until an inventory system of record exists. It is never a promise of availability. | `Documentation Review` |
| 6 | Fulfillment owner placeholder | enum | Yes | `Mitch`, `Xenios`, `Not Assigned`. First sixty days from 2026-07-19: Mitch owns peptides and Quantum, Xenios owns supplements. This field records the current owner, not a permanent assignment. | `Not Assigned` |
| 7 | Commercial lane | enum | Yes | `Peptides`, `Supplements`, `Quantum`. One lane per record. | Not permitted to be unknown. Lane is required to create the SKU. |
| 8 | Commerce approval state | enum plus block | Yes | `Not Authorized`, `Pending Written Approval`, `Blocked Pending Counsel`. See section 6 for the hard rule. The block names the specific blocker and the evidence document that would clear it. | `Not Authorized` |
| 9 | Guide state | enum | Yes | One Guide state from section 5. | `Guide In Development` |
| 10 | Quality document state | enum plus block | Yes | Enum: `Documentation On File`, `Documentation Requested`, `Documentation Not Available`, `Documentation Under Review`. The block may reference a document by identifier and date. It never summarizes numeric results, purity figures, or assay values. | `Documentation Requested` and the block reads `NOT CONFIRMED - see open supplier questions` |
| 11 | Storage data state | enum plus block | Yes | Enum: `Storage Data Confirmed In Writing`, `Storage Data Supplier Reported`, `Storage Data Not Confirmed`. The block never states a temperature, a shelf life, or a stability window. It states only whether written guidance exists and who holds it. | `Storage Data Not Confirmed` and the block reads `NOT CONFIRMED - see open supplier questions` |
| 12 | Shipping profile state | enum plus block | Yes | Enum: `Shipping Profile Confirmed`, `Shipping Profile Pending`, `Shipping Profile Not Confirmed`. Handling category only (for example, temperature controlled handling required, standard handling). No carrier commitments, no transit times, no costs. | `Shipping Profile Not Confirmed` and the block reads `NOT CONFIRMED - see open supplier questions` |
| 13 | Allowed copy state | enum plus block | Yes | Enum: `Copy Approved`, `Copy In Review`, `Copy Draft`, `No Member-Facing Copy`. The block holds the exact approved member-facing sentences, or nothing. Only Samuel Boadu moves a record to `Copy Approved`. | `No Member-Facing Copy` and the block is empty |
| 14 | Prohibited claims | block, list | Yes | A list of claim texts that may not appear on any member-facing surface for this SKU, each with a one line reason. Grade `PROHIBITED` claims from the claim register are mirrored here. The list is never empty. | The standing baseline list in section 7 |
| 15 | Goal mappings | ref list | Yes | Slugs under `content/research-goals/`. A mapping expresses member interest area, never an expected result. A mapping is not a claim and never implies efficacy. | `[]` with the line `No goal mappings approved yet` |
| 16 | Related Guides | ref list | Yes | Slugs under `content/research-guides/individual/` or `content/research-guides/blends/`. | `[]` with the line `No Guide linked yet` |
| 17 | Related Systems | ref list | Yes | Slugs of member-facing Systems content. A System is an editorial grouping, never a protocol or a schedule. | `[]` with the line `No Systems linked yet` |
| 18 | Product FAQ | block, question and answer pairs | Yes | Questions members actually ask, answered within every rule in section 2. Dosing questions are answered with the exact excluded-dosing line and a referral to a qualified professional. | The standing baseline FAQ in section 8 |
| 19 | Support path | enum plus string | Yes | Enum: `Member Support`, `Founder Review`, `Fulfillment Owner`, `Qualified Professional Referral`. The string names the concrete route a member takes. Named human accountability, never "the system". | `Member Support` |
| 20 | Last reviewed | date | Yes | `YYYY-MM-DD`. The date a human reviewer last read the whole record. An AI edit does not advance this date. | Not permitted to be unknown. Set to the creation date and flag for review. |
| 21 | Open supplier questions | block, numbered list | Yes | Every unresolved factual question, each with the field it blocks, who it is addressed to, and the date it was raised. Every `NOT CONFIRMED - see open supplier questions` placeholder in the record has a matching entry here. | A record with no open questions writes `None open as of <date>`. This is rare and requires that every fact field is confirmed in writing. |

## 5. Allowed states

### 5.1 Product states

Exactly one of the following, in the `Inventory placeholder` field:

| State | Meaning |
|-------|---------|
| In Stock | Stock is confirmed on hand by the fulfillment owner. |
| Low Stock | Stock is confirmed on hand and the fulfillment owner has flagged it as limited. |
| Out of Stock | Stock is confirmed to be zero. |
| Waitlist | Members may register interest. Registering interest is not an order and creates no obligation. |
| Documentation Review | The record is held while quality, composition, or regulatory documentation is being reviewed. |
| Commerce Review | The record is held while commercial authorization is being reviewed. |
| Temporarily Unavailable | Availability is paused for an operational reason that is expected to resolve. |
| Coming Soon | The item is intended for the catalog and no availability has been established. |

No other value is valid. "Available", "Sold Out", "Backorder", and "Pre-order" are not part of this
set and are not to be introduced. `Waitlist` never implies a queue position, a date, or a price.

### 5.2 Guide states

Exactly one of the following, in the `Guide state` field:

| State | Meaning |
|-------|---------|
| Guide Published | A complete nine-file Guide packet exists and Samuel Boadu has published it. |
| Guide Updated | A published Guide has been revised and republished. The correction history in the Guide records what changed. |
| Guide In Review | A complete draft packet exists and is with the founder reviewer. |
| Guide In Development | Work has started. The packet is incomplete. |
| Guide Coming Soon | No Guide work has started and one is intended. |

Guide state never gates commerce, and commerce state never gates a Guide. Guides are member-only
content. An AI draft never publishes automatically. Samuel Boadu is the founder reviewer and
publisher.

## 6. The commerce hard rule

As of 2026-07-19 the following are true and are reflected in every record:

- Peptide commerce is not authorized.
- Quantum commerce is not authorized.
- Supplement reseller activity is not authorized.

Therefore every product content record carries a `Commerce approval state` of `Not Authorized`,
`Pending Written Approval`, or `Blocked Pending Counsel`. There is no `Approved` value in the
allowed set of this schema. Adding one is a schema change, and a schema change requires written
founder approval plus, where the lane needs it, counsel sign off.

A record may be created, reviewed, linked to Guides and goals, and shown to approved members while
commerce stays disabled. Catalog presence is documentation, not an offer, not a price, and not a
solicitation.

No record states or implies that xenios is authorized to resell, distribute, or sell an item without
a referenced written authorization document.

## 7. Standing baseline prohibited claims

Every record inherits this baseline in `Prohibited claims`, plus any SKU specific additions:

1. Any statement of a dose, amount, frequency, timing, cycle, or route. Reason: dosing is excluded
   from all member-facing surfaces.
2. Any statement that the item treats, cures, prevents, diagnoses, reverses, or eliminates a disease
   or condition. Reason: prohibited disease claim.
3. Any statement that the item is safe, well tolerated, or free of side effects. Reason: unsupported
   safety claim.
4. Any statement that the item is a substitute for, or is better than, a prescribed therapy. Reason:
   prohibited comparison and implied clinical advice.
5. Any guaranteed outcome, timeline, or magnitude of result. Reason: guaranteed outcome.
6. Any animal or in vitro finding presented without the species or model in the same sentence.
   Reason: preclinical to human leap.
7. Any use of "research use only" framing to imply human benefit. Reason: prohibited framing.
8. Any regulatory statement without a date, a jurisdiction, and a source URL. Reason: unsourced
   regulatory claim.
9. Any claim reproduced from competitor, retailer, or manufacturer marketing text. Reason: original
   wording only.

## 8. Standing baseline Product FAQ

Every record inherits these three question and answer pairs. Wording may be adapted to the item.
Meaning may not.

**How much should I take, and how often?**
Dosing information is intentionally excluded from Xenios Research content. Questions about amounts,
frequency, timing, or route belong with a qualified professional who knows your history.

**Is this safe for me?**
Xenios Research does not make general safety statements and cannot assess an individual situation.
The Guide lists categories of consideration that have been discussed in the literature so that you
can raise them with a qualified professional.

**What is the current legal or regulatory status?**
The Guide's regulatory section carries a dated, jurisdiction specific statement with a source link.
If that section is empty for this item, the status has not been established to the standard Xenios
Research requires and is listed as an open question.

## 9. File layout and frontmatter

Path: `content/research-products/<sku-slug>.md`

Frontmatter is required on every product record:

```yaml
---
title: <Canonical name>
type: research-product
status: <catalog status, for example draft, in-review, published>
owner: Samuel Boadu
last_reviewed: 2026-07-19
sku: <SKU>
lane: <Peptides | Supplements | Quantum>
commerce_approval_state: <Not Authorized | Pending Written Approval | Blocked Pending Counsel>
product_state: <one of the eight product states>
guide_state: <one of the five Guide states>
---
```

Body sections follow in the exact order given in section 3, each as a level two heading.

## 10. Validation checklist

A record is publishable to a member-facing surface only when every line below is true.

- [ ] All twenty-one sections are present, in order, with the exact headings.
- [ ] Frontmatter is present and complete, including `last_reviewed`.
- [ ] `Commerce approval state` is one of the three blocked or pending values.
- [ ] Every unknown fact uses the exact string `NOT CONFIRMED - see open supplier questions`.
- [ ] Every one of those placeholders has a matching numbered entry in `Open supplier questions`.
- [ ] No dose, amount, unit, frequency, timing, cycle, or route appears anywhere in the file.
- [ ] No treatment direction, protocol, or regimen appears anywhere in the file.
- [ ] No instance of "will", "proven to", "restores", "cures", "eliminates", or "reverses" is used to
      describe an effect.
- [ ] No general statement of "safe", "well tolerated", or "no side effects".
- [ ] Every preclinical finding names the species or model in the same sentence.
- [ ] No "research use only" framing is used to imply human benefit.
- [ ] Every regulatory statement carries a date, a jurisdiction, and a source URL.
- [ ] Every claim in the file is graded in the claim register and is marked member-facing allowed.
      Grades attach to claims, never to this product as a whole.
- [ ] For a combined formulation, the blend rule in `CLAIM_EVIDENCE_SCHEMA.md` has been applied.
- [ ] No competitor, retailer, or manufacturer marketing text is copied or lightly paraphrased.
- [ ] Zero em dashes in the file.
- [ ] `Prohibited claims` includes the full standing baseline.
- [ ] `Support path` names a concrete human route.
- [ ] `Last reviewed` was set by a human reviewer, not by an AI edit.
- [ ] Samuel Boadu has approved publication.

## 11. Worked example

The example below is a complete, valid record. It is deliberately thin, because almost nothing about
the item is confirmed in writing. That is the correct shape for a record at intake. Every unknown
carries the exact placeholder and a matching open question.

```markdown
---
title: Magnesium Glycinate
type: research-product
status: draft
owner: Samuel Boadu
last_reviewed: 2026-07-19
sku: XR-SUP-magnesium-glycinate-001
lane: Supplements
commerce_approval_state: Not Authorized
product_state: Documentation Review
guide_state: Guide In Development
---

## SKU

XR-SUP-magnesium-glycinate-001

## Canonical name

Magnesium Glycinate

Alternate and supplier names are recorded in the Guide terminology section, not here.

## Composition status

Composition Not Confirmed

NOT CONFIRMED - see open supplier questions

No constituent list, ratio, or concentration is recorded because no written supplier
specification is on file.

## Format and size status

Format Not Confirmed

NOT CONFIRMED - see open supplier questions

## Inventory placeholder

Documentation Review

This is a placeholder pending an inventory system of record. It is not a statement of
availability and creates no obligation.

## Fulfillment owner placeholder

Xenios

Xenios owns supplement fulfillment for the first sixty days from 2026-07-19. Peptides and
Quantum sit with Mitch over the same period. This assignment is reviewed at the end of that
period.

## Commercial lane

Supplements

## Commerce approval state

Not Authorized

Supplement reseller activity is not authorized. Clearing this requires written founder
approval and a written reseller or distribution authorization from the supplier. Neither
document exists. The catalog record may proceed. Commerce stays disabled.

## Guide state

Guide In Development

Guide packet path when created: content/research-guides/individual/magnesium-glycinate/

Guide completion is not a commerce prerequisite. Commerce authorization is not a Guide
prerequisite.

## Quality document state

Documentation Requested

NOT CONFIRMED - see open supplier questions

No certificate of analysis, specification sheet, or manufacturing document is on file. No
numeric result, purity figure, or assay value is recorded anywhere in this record.

## Storage data state

Storage Data Not Confirmed

NOT CONFIRMED - see open supplier questions

No temperature, shelf life, or stability window is recorded because no written guidance is on
file.

## Shipping profile state

Shipping Profile Not Confirmed

NOT CONFIRMED - see open supplier questions

## Allowed copy state

No Member-Facing Copy

No approved member-facing sentences exist for this SKU. Only Samuel Boadu moves this field to
Copy Approved.

## Prohibited claims

Standing baseline, all nine items, applies in full. See PRODUCT_CONTENT_SCHEMA.md section 7.

SKU specific additions:

1. Any statement that this item treats, prevents, or corrects a deficiency, a sleep disorder,
   an anxiety disorder, or a cardiac condition. Reason: prohibited disease claim.
2. Any statement comparing absorption or bioavailability against another magnesium form.
   Reason: no retrieved human comparative evidence is on file, and the claim would be
   unverified.
3. Any statement about onset, timing, or evening use. Reason: timing is dosing adjacent and is
   excluded.

## Goal mappings

[]

No goal mappings approved yet. A mapping expresses member interest area only and never implies
an expected result.

## Related Guides

[]

No Guide linked yet.

## Related Systems

[]

No Systems linked yet.

## Product FAQ

**How much should I take, and how often?**

Dosing information is intentionally excluded from Xenios Research content. Questions about
amounts, frequency, timing, or route belong with a qualified professional who knows your
history.

**Is this safe for me?**

Xenios Research does not make general safety statements and cannot assess an individual
situation. When the Guide is published it will list categories of consideration discussed in
the literature so that you can raise them with a qualified professional.

**What is the current legal or regulatory status?**

Not established to the standard Xenios Research requires. It is logged as open supplier
question 6 below. No regulatory statement is made here because no dated, jurisdiction
specific, sourced statement is on file.

**Can I order this today?**

No. Commerce is not enabled for this item. The record exists as documentation only.

## Support path

Member Support

Route: a member writes to Member Support, which routes documentation questions to the
fulfillment owner (Xenios) and commerce or publication questions to Samuel Boadu. Health
questions are referred to a qualified professional. No question is routed to "the system".

## Last reviewed

2026-07-19

Reviewed by Samuel Boadu. AI edits do not advance this date.

## Open supplier questions

1. Written product specification, including constituent list. Blocks: Composition status.
   Addressed to: supplier, via Xenios fulfillment. Raised: 2026-07-19.
2. Written format and presentation specification. Blocks: Format and size status. Addressed
   to: supplier. Raised: 2026-07-19.
3. Certificate of analysis and identity testing documentation. Blocks: Quality document state.
   Addressed to: supplier. Raised: 2026-07-19.
4. Written storage and stability guidance. Blocks: Storage data state. Addressed to: supplier.
   Raised: 2026-07-19.
5. Written handling and shipping requirements. Blocks: Shipping profile state. Addressed to:
   supplier and fulfillment owner. Raised: 2026-07-19.
6. Dated, jurisdiction specific regulatory status with a source URL. Blocks: any regulatory
   statement in this record and in the Guide. Addressed to: Samuel Boadu and counsel. Raised:
   2026-07-19.
7. Written reseller or distribution authorization. Blocks: Commerce approval state. Addressed
   to: supplier and counsel. Raised: 2026-07-19.
```

### 11.1 Reading the example

Note what the example does not do. It does not name a manufacturer. It does not state a form factor,
a count, a size, or a storage temperature. It does not describe what magnesium does in the body,
because any such statement is a claim and must first be graded in the claim register under
`CLAIM_EVIDENCE_SCHEMA.md`. It makes no regulatory statement at all, because no dated, sourced,
jurisdiction specific statement is on file.

A record that is honest about its gaps is complete. A record that fills gaps with inference is not.

## 12. Change control

This schema is canonical. Changing a required section, a state set, or a placeholder string is a
schema change and requires written approval from Samuel Boadu. Adding an `Approved` value to
`Commerce approval state` additionally requires counsel sign off for the affected lane.

AI agents may draft records against this schema. AI drafts never publish automatically.

## 13. Sources and verification

No external sources were retrieved while writing this document, and therefore none are cited. This
schema is a xenios internal contract, not a factual account of any external body of evidence.

Statements in this document about general regulatory or claim practice are structural requirements
set by xenios rather than restatements of any specific external authority.
[UNVERIFIED - background knowledge, requires human source check]

Any regulatory content that later enters a product record must be independently retrieved and must
carry a date, a jurisdiction, and an exact retrieved source URL, per section 2.7.

---
title: Supplier Fact Reconciliation, Final
lane: Supplier verification intake (Website / integration session)
status: FACTS AND PRICES RESOLVED BY SIGNED MASTER; COA-DEPENDENT FACTS STILL UNRESOLVED
supersedes: docs/research-commerce/SUPPLIER_FACT_RECONCILIATION.md (the pre-signature version)
signed_master_sha256: e8ed723f994138a33f9eb08018228fde773a40bc299b099f568bc4eea3031884
last_updated: 2026-07-21
---

# Supplier fact reconciliation, final

The earlier `SUPPLIER_FACT_RECONCILIATION.md` recorded that two sources (the
legacy `server/research/products-data.ts` and the PR #29 content review)
disagreed, that every legacy fact was held `unverified_legacy`, and that nothing
was purchasable. That was the correct, safe position while no supplier document
existed.

A signed supplier master now exists (SHA-256 above,
[intake record](SIGNED_SUPPLIER_MASTER_INTAKE.md)). It is a `supplier_document`
and it resolves the disputed and unconfirmed facts for the facts it states and
signs directly. It does not resolve COA-derived facts, because no COA was
delivered ([attachment report](SUPPLIER_ATTACHMENT_VERIFICATION_REPORT.md)).

This document is the reconciliation of record. It does not itself overwrite the
catalog. The change lands through the machine-readable import
(`docs/research-commerce/signed-supplier-master-facts.json`) so that every prior
value and conflict is preserved.

## Classification legend

- `confirmed_by_signed_supplier_master`: the signed value matches the legacy value (or the legacy value was absent and the signed value now supplies it).
- `corrected_by_supplier`: the signed value differs from the legacy value. The signed value is authoritative. The legacy value is preserved as prior value with a conflict note.
- `confirmed_by_attachment`: would require an actual delivered file. None today.
- `still_unresolved`: not established by the signed master and not by any attachment (all COA-derived facts).
- `conflict_inside_package`: the package contradicts itself. None found in the product facts. (One presentation contradiction exists at the package level: the page 3 STATUS NOTICE versus the page 3 COA rule and page 36 certification; resolved in favor of the COA rule and the filesystem.)

## Prices: all fifteen corrected by the signed master

Every legacy price was higher than the signed member-facing price, often by two
to four times. The signed value is authoritative. Prices are member-facing and
so are recorded here; the supplier's own cost or wholesale price is confidential
and is not recorded.

| SKU | Legacy price | Signed member-facing price | Class |
|---|---|---|---|
| P001 | $339.99 | $89.99 / vial | corrected_by_supplier |
| P002 | $349.99 | $129.99 / vial | corrected_by_supplier |
| P003 (KLOW) | $339.99 | $149.99 / vial | corrected_by_supplier |
| P004 | $389.99 | $159.99 / vial | corrected_by_supplier |
| P005 | $159.99 | $99.99 / vial | corrected_by_supplier |
| P006 | $119.99 | $79.99 / vial | corrected_by_supplier |
| P007 | $209.99 | $149.99 / vial | corrected_by_supplier |
| P008 | $129.99 | $69.99 / vial | corrected_by_supplier |
| P009 | $159.99 | $59.99 / vial | corrected_by_supplier |
| P010 | $139.99 | $119.99 / vial | corrected_by_supplier |
| P011 | $129.99 | $139.99 / vial | corrected_by_supplier |
| P012 | $229.99 | $169.99 / vial | corrected_by_supplier |
| P013 | $259.99 | $89.99 / bottle | corrected_by_supplier |
| P014 | $299.99 | $99.99 / bottle | corrected_by_supplier |
| P015 | $259.99 | $149.99 / vial | corrected_by_supplier |

## Compositions and strengths

| SKU | Product | Composition (class) | Signed strength | Legacy strength | Strength class |
|---|---|---|---|---|---|
| P001 | BPC-157 + TB-500 Research Blend | confirmed | 5 mg / 5 mg (10 mg total) | 15 mg / 15 mg | corrected_by_supplier |
| P002 | Glow Blend (BPC-157 / TB-500 / GHK-Cu) | confirmed | GHK-Cu 50 / BPC-157 10 / TB-500 10 (70 mg) | 10 / 10 / 50 | confirmed (same values) |
| P003 | KLOW Peptide Stack | confirmed | GHK-Cu 50 / BPC-157 10 / TB-500 10 / KPV 10 (80 mg) | 5 / 5 / 10 / 5 | corrected_by_supplier |
| P004 | Immune Support Blend (Tα1 / KPV / LL-37) | confirmed | Tα1 5 / KPV 5 / LL-37 5 (15 mg) | 5 / 5 / 5 | confirmed |
| P005 | CJC-1295 / IpaMorelin GH Blend | confirmed | CJC-1295 5 / IpaMorelin 5 (10 mg) | 5 / 5 | confirmed |
| P006 | PT-141 (Bremelanotide) | confirmed | 10 mg | 10 mg | confirmed |
| P007 | Tesamorelin | confirmed | 5 mg | 10 mg | corrected_by_supplier |
| P008 | Gonadorelin | confirmed | 2 mg | 5 mg | corrected_by_supplier |
| P009 | NAD+ | confirmed | 100 mg | 500 mg | corrected_by_supplier |
| P010 | MOTS-C | confirmed | 5 mg | 10 mg | corrected_by_supplier |
| P011 | Epithalon | confirmed | 5 mg | 10 mg | corrected_by_supplier |
| P012 | SS-31 (Elamipretide) | confirmed | 5 mg | 10 mg | corrected_by_supplier |
| P013 | SLU-PP-332 Capsules | confirmed | 1500 mcg/cap, 60 caps/bottle | 250 mcg x 100 | corrected_by_supplier |
| P014 | Dihexa Capsules | confirmed | 10 mg/cap, 30 caps/bottle | 10 mg x 60 | corrected_by_supplier (count) |
| P015 | Neuropeptide Cognition Blend (Semax / Selank / DSIP) | confirmed | Semax 5 / Selank 5 / DSIP 5 (15 mg) | 10 / 10 / 2 | corrected_by_supplier |

Format, size, storage, shelf life or retest, shipping profile, and fulfillment
owner are all now stated and signed on each product sheet and are recorded in the
machine-readable import as `confirmed_by_signed_supplier_master`. Fulfillment
owner is Apex Fulfillment, Austin, TX, with a one business day handling SLA.

## Still unresolved (COA-derived, no file delivered)

For all fifteen SKUs, the following remain `still_unresolved` because they require
the actual COA, which was not delivered: purity, sterility, endotoxin, microbial
results, assay method and result, laboratory accreditation, manufacturing date,
true expiry date (as distinct from the supplier's retest statement), and
independent-testing status. These must never be inferred from the signed master.

## KLOW (P003), resolved

- Prior disputed value (legacy): composition `TB-500, BPC-157, GHK-Cu, KPV`; strength `5 / 5 / 10 / 5`; price `$339.99`.
- Signed selected value: KLOW Peptide Stack, composition GHK-Cu + BPC-157 + TB-500 + KPV (confirmed, same four-component set), strength GHK-Cu 50 mg / BPC-157 10 mg / TB-500 10 mg / KPV 10 mg (80 mg total), member price $149.99 per vial.
- Supporting PDF page: Appendix A P003 (pages 8 and 9); signed master SHA-256 above.
- Attachment IDs referenced: SPEC-P003-v1, COA-P003-LOT-0824D, STORAGE-P003-v1, SHIP-P003-v1.
- Actual COA presence: none (COA-P003-LOT-0824D is `referenced_not_found`).
- Final eligibility result: composition and strength and price are resolved by the signed master, but KLOW remains purchase blocked exactly like every other SKU, on the COA, active-lot, payment provider, and admin-release requirements. There is no KLOW-specific bypass.

## Epithalon / Epitalon canonical spelling

- Canonical: **Epithalon**. The signed master titles the product "Epithalon (Epitalon)", establishing Epithalon as the primary and Epitalon as the parenthetical alternate.
- Alias retained: **Epitalon**, so existing links and searches (including the legacy slug `epitalon-10mg`) continue to resolve.
- Note the legacy slug also encodes the pre-correction strength (10 mg); see the slug caution below.

## Downstream caution: legacy slugs encode corrected strengths

Several legacy slugs bake a now-corrected strength into the URL:
`tesamorelin-10mg` (now 5 mg), `gonadorelin-5mg` (now 2 mg), `nad-plus-500mg`
(now 100 mg), `mots-c-10mg` (now 5 mg), `epitalon-10mg` (now 5 mg),
`ss-31-elamipretide` (now 5 mg), `slu-pp-332-capsules` (250 mcg x 100 now
1500 mcg x 60). Do not silently change the slugs (they may be linked). Keep the
slug as a stable identifier and correct the displayed strength from the signed
value, or mint a new slug with a redirect from the old one. This is a content and
catalog decision for the content lane (PR #29) and Samuel, not a silent rewrite.

## Rule preserved

The signed master supersedes the legacy catalog for the facts above, but only
through the versioned, append-only import that keeps every prior value and
conflict note. Nothing is silently overwritten.

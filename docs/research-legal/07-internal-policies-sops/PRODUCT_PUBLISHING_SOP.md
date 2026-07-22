# Product Publishing SOP

```text
DRAFT — NOT LEGAL ADVICE
COUNSEL REVIEW REQUIRED
```

| Field | Value |
| --- | --- |
| Document key | XR-POL-016 |
| Title | Product Publishing SOP |
| Audience | internal |
| Required member state | n/a (internal) |
| Trigger | Runs before any product becomes visible in the member catalog, again before commerce is enabled for it, and on any change to its classification, claims, quality documents, or state eligibility. |
| Route | internal |
| Version | 0.1.0-draft |
| Status | Draft |
| Counsel status | Not reviewed |
| Jurisdiction | United States, national scope; state-by-state review pending (see JURISDICTION_AND_APPLICABILITY_MATRIX) |
| Effective date | Not effective. Requires counsel approval and formal publication. |
| Retention | per Retention and Deletion Schedule (XR-POL-005); minimum [COUNSEL: confirm period for publishing decisions, gate evidence, and state-eligibility records] |
| Acceptance event | n/a (internal SOP; adoption recorded by founder approval with version and date) |
| Withdrawal supported | No. Internal versioned SOP; a later approved version supersedes this one. |
| Owner | Samuel Boadu, Founder |
| Dependencies | XR-POL-005, XR-POL-014, XR-POL-017, XR-MEM-010, XR-COM-012, XR-COM-013, XR-COM-017, XR-FUL-002 |
| Sources | See 00-register/SOURCE_REGISTRY.md |
| Review date | 2026-07-19 |

## 1. Purpose and scope

This SOP controls when a product may be seen and when a product may be sold. Those are two different decisions, made separately, with separate evidence. It applies to every SKU: the 15 current peptide/research SKU records (P001-P015), the supplement candidates (up to 50, Momentous and Pure Encapsulations), and Quantum.

The controlling rule, from the program's production gate: no production commerce for any SKU until every required row for that SKU is approved, has an owner assigned, has evidence attached, and has a current review date.

## 2. Catalog state and commerce state are separate

Every product carries two independent states:

1. Catalog state: whether and how the product appears to members. Values: Published, Updated, In Review, In Development, Coming Soon.
2. Commerce state: whether the product can be ordered. Values: enabled or disabled.

Rules:

1. Visibility never implies purchasability. A product page may exist with commerce disabled; members see its status honestly (XR-COM-013 governs availability language).
2. Commerce state is a server-enforced flag, changed only by the founder through the admin route, with the change recorded. A page template, cache, or front-end condition is never the enforcement point.
3. Out-of-stock products stay visible with a waitlist and notification preference (XR-COM-012): anonymous position or status only, never a promised restock date.
4. Quantum's member-facing state is Coming Soon. A product page and an interest list are allowed. No commerce, no checkout, no sales agreement until classification, claims, administration, facility, state, quality, and transaction structure are all approved. This SOP does not create a path around that hold.

## 3. Visibility gate (before any product page is visible)

Before a product appears in the member catalog in any state:

1. A draft classification memorandum exists or is formally in progress, and the page language matches the current honest status ("under formal review" for peptide products).
2. Every statement on the page has a claims registry entry allowed for the product-page channel (XR-POL-014). Pages with no approved claims show neutral, descriptive content only.
3. The page carries the correct member-facing acknowledgments and disclaimers for its category (XR-COM-016 research material template, XR-COM-015 supplement acknowledgment, XR-COM-017 quality document disclaimer).
4. Product access rules apply: the catalog sits behind active membership per the Product Access Policy (XR-MEM-010); nothing in the catalog is public.
5. Samuel approves the page going visible, recorded with date and version.

## 4. Commerce gate (before any product can be ordered)

Commerce for a SKU is enabled only when all of the following exist, each with evidence attached and an owner assigned:

| Requirement | Evidence |
| --- | --- |
| Classification memorandum | A written memo assigning the SKU's lane: dietary supplement, nonclinical research material, drug/biologic risk, tissue-derived or HCT/P analysis, future physician-led product, ordinary service, or digital health service. No SKU invents its own lane; peptide products remain "research products whose classification and permitted marketing lane are under formal review" until the memo says otherwise. [COUNSEL: classification memoranda per SKU.] |
| Claims review | Every claim on the page, in linked Guides used commercially, and in launch communications cleared under XR-POL-014 for this SKU and lane. |
| Quality documents | Per-lot COA on file; sterility, endotoxin, identity, and purity documents where applicable per the Product Master Data (XR-FUL-002); expiry or retest data present. Documentation-missing stock is blocked stock. |
| Supplier qualification | The supplier is on the approved supplier list under XR-POL-017, in scope for this SKU, with requalification current. |
| Reseller authorization (supplements) | Written reseller authorization from the brand (Momentous, Pure Encapsulations), plus confirmed content rights, MAP terms, margin, fulfillment path, returns handling, and claims. No supplement is sold until all are confirmed in writing. |
| Lane assignment consistency | Website, recommendations, testimonials, Guides, affiliate content, and Telegram templates for this SKU all match the assigned lane. One channel out of lane blocks enablement. |
| State eligibility | The state-by-state matrix row for this SKU is current; checkout blocks ineligible states server-side. [COUNSEL: state matrix per SKU category; ship-to state list per lane.] |
| Fulfillment readiness | The SKU is mapped to its fulfillment path under the split model (Mitch holds and fulfills peptide and Quantum inventory for approximately the first 60 days; Xenios fulfills supplements), with storage and shipping requirements in the Product Master Data. |
| Founder approval | Samuel approves enablement in writing, with date. This approval is the last step and presumes all rows above are green. |

No partial enablement: a SKU missing any row stays commerce-disabled regardless of how complete the rest is.

## 5. The publishing record

Each visibility and commerce decision produces a record: SKU, decision, date, approver (Samuel), the gate table with per-row status and evidence links, and the catalog and commerce state before and after. The record is retained per XR-POL-005 and must let Xenios show, for any past date, exactly which products were visible, which were orderable, and on what basis.

## 6. Changes after publication

1. Any change to a SKU's classification, claims, supplier, quality documents, formulation, or state eligibility re-opens the affected gate rows. If a required row goes red, commerce is disabled first and investigated second.
2. Catalog status moves honestly with reality: In Review while a re-review runs, Updated after material page changes, Coming Soon only for products that genuinely are not yet orderable.
3. A recall or product concern (XR-COM-018, XR-COM-019 flows) immediately disables commerce for affected SKUs and lots; re-enablement runs the full commerce gate again.
4. Unpublishing: the founder may remove a product from the catalog at any time. Existing orders, waitlist entries, and records survive per their own terms.

## 7. What this SOP never allows

1. No commerce for Quantum until its full approval list is closed (Section 2).
2. No supplement sales without written reseller authorization (Section 4).
3. No "soft launch", "test checkout", or manual order that bypasses the gate. A sale is a sale.
4. No claims on any product surface that lack a registry entry (XR-POL-014).
5. No representation that any product is "FDA approved", "clinically proven", or "safe for everyone", and no dosing instructions on any product surface.

## Open items for counsel

- Retention period for publishing decisions and gate evidence (metadata table).
- Classification memoranda per SKU: format, required analysis, and who signs (Section 4). [COUNSEL flagged there.]
- The state-by-state eligibility matrix per product category, and the enforcement rule for mixed-eligibility carts (Section 4).
- Confirm the visibility gate's neutral-content standard for pages whose lane is still under review (Section 3): what may a page say before classification.
- Whether enabling commerce for any peptide SKU requires counsel sign-off in addition to the founder's, given the lane-under-review posture (Sections 4 and 7).
- Reconcile with XR-MEM-010 (Product Access Policy) and XR-COM-013 (Inventory and Availability Disclaimer) so member-facing availability language matches the two-state model exactly.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 0.1.0-draft | 2026-07-19 | Initial draft for counsel review. |

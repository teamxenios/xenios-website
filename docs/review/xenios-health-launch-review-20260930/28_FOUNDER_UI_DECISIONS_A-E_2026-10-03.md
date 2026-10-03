# Founder UI decisions A–E: approved (record)

## The decision

Samuel stated it in the Claude review session on 2026-10-03. Quoted verbatim:

> A Xenios Health, B black CTA, C restrained purple-teal, D image-enabled, E 1:1 square. Approved.

## What was approved

Each option is quoted as it was represented in the reviewed private preview.

| Decision | Approved option | As represented in the preview (PROPOSED XENIOS HEALTH column) |
| --- | --- | --- |
| **A. Header brand** | **Xenios Health** | The Health-experience wordmark becomes the Core mark plus "Xenios Health", in place of the generic "Xenios". The preview applies Core's below-520 px rule, which visually hides the brand name, to both names. |
| **B. Primary action language** | **Black rectangular primary CTA** | Black rectangular primary actions (Core `.btn-primary`, 4 px) with restrained outlined or underlined secondary actions. The assisted-order green-pill language (`.xenios-order-button`) is removed from the Health experience. |
| **C. Accent** | **Restrained purple-to-teal** | A thin divider, focus or highlight, or small emphasis only. No gradient headlines and no image recolouring. In the preview it is a 4 px `--pulse` → `--teal` rule. |
| **D. Public product imagery** | **Image-enabled** | Public catalog cards and product detail may show an approved product image, with a truthful no-image fallback. This supersedes the public no-photography presentation policy recorded in `EarlyAccessProductCard.tsx:197-203`. |
| **E. Canonical media shape** | **1:1 square** | Canonical 1:1 square asset with `object-fit: contain`. The same source pixels appear on card, detail and QA, with no grading, vignette, tint or forced crop, and a safe fallback when no approved asset exists. |

## Evidence the decision was made from

- **Private preview:** source `e9ebc7b7df44a8921dd4b64100590da51310ba9a` (tree `e9a7a5c5`), handoff `b3a60d2`.
- **Claude verdict:** `316ca72` (`27d_CARE_CARD_RECHECK_e9ebc7b.md`).
  - UI fidelity final PASS.
  - A–E all faithfully represented.
  - Prototype suitable for founder decisions.
- **Earlier reviews in the chain:** 27a (`ae5c410`), 27b (`893e32c`), 27c (`22ed742`).

## What this decision does NOT authorize

Each of the following still needs its own explicit approval or gate:
- No Core edit, path lease, deployment, publication, managed SQL or production mutation.
- Batch 1 rendering is not authorized. It also remains NOT READY on report 27's corrections.
- Image publication or Product Control approval is not granted.
- **Protected files are not amended.** A, B and C touch hard-protected files:
  - `client/src/components/Navbar.tsx` (HARD);
  - `client/src/components/Footer.tsx` (HARD);
  - `client/src/index.css` (HARD), per `docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json` at Core tip `3eaa017`.

  Implementing them needs a separate exact protected-hash amendment approved by Samuel, which Claude does not
  perform.
- **Existing gates are unchanged:** the GATE-01 Access Hub decision, F1, REFUND-ABSENT, LENS-01 adoption and ADP-G1
  to G4.

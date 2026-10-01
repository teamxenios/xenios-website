# Xenios product imagery v3 lane

This directory holds the corrected, non-production imagery source lane. The reviewed catalog evidence contains 426 workbook rows reconciled to 424 canonical variants and 423 customer-exposed targets after excluding the shipping fee. This imagery branch still carries the older 420/419 catalog snapshot, while the observed core HL-11 candidate materializes 424/423 at source commit `4cba24af1d42ad59fe44856859cc1721846e6df5` (tree `6395273fc4370b7df713a2b72b019785f547d1fb`) with qualification records at `c73da35cc223a2253ce8074948ed9ff063012748`. That candidate is not deployed or independently accepted, and it does not confer image approval.

The exact founder v3 specification is checked in under `specs/` with SHA-256 `e37a13d7b99ac1f2416e00e29a92df3e7677ce7c92bce9dbf019de83d08b8b5c`. Renderer requests and fixture provenance are separate artifacts. The only active render packet is the 25-class Batch 0 packet; there is no named 423- or 419-row exact-product prompt queue.

Current safety state:

- all ten pre-v3 WebPs were removed from `client/public` and preserved as permanently nonapprovable evidence under `evidence/pre-v3-nonapprovable/`;
- all 25 Batch 0 originals are rendered, receipt-bound, output-SHA-addressed, and retained under non-public evidence with zero runtime/public authority;
- no image is approved or wired;
- imagery owns no price, action, workflow, Care, hold, availability, cart, or fulfillment state;
- Claude's exact-SHA review is recorded at reviewer tip `76607458e30a64746d227150ff1dbab3475dd64a`; it authorizes private-prototype use only where marked and grants zero public approvals;
- catalog accounting is reconciled to the frozen HL-11 candidate, but runtime integration remains blocked on independent acceptance of that core candidate, reviewer acceptance of the corrected prototype and calibration direction, acceptance of the separately leased commerce/media decoupling slice, and a coordinated shared UI lease;
- no production mutation or deployment is authorized by this lane.

Private founder review now also has a generated full-catalog visual prototype under `founder-preview/`, with responsive evidence under `evidence/founder-preview/`. It covers all 423 customer targets and uses only non-public Batch 0 studies. Reviewer-directed neutral substitutions cover 269 slots, and zero reviewed-rejected assets are selected. It grants no image, price, catalog, commerce, Care, runtime, or deployment approval. See `FOUNDER_VISUAL_PROTOTYPE_2026-10-01.md` for the exact source pins, counts, screenshots, local preview command, prepared-but-unauthorized calibration and Batch 1 candidates, and remaining gates.

Authoritative generated artifacts:

- `COVERAGE_SUMMARY.md` — corrected counts and the imagery-branch/core-candidate distinction;
- `manifests/product-image-coverage.json` — 424 identity/form presentation rows with no business-state fields;
- `manifests/product-image-identity-crosswalk.json` — canonical, Product Control, legacy Featured, and Hex/Oxy forward identities;
- `manifests/state-authority-audit.json` — explicit imagery-branch-baseline versus observed-core-candidate accounting without granting imagery authority;
- `manifests/renderer-packet-v3.json` — request-only sanitized renderer inputs;
- `manifests/batch-000-provenance.json` — fixture identities that must never be sent to the renderer;
- `manifests/batch-000-assets.json` — output hashes, renderer provenance, and approval state;
- `manifests/batch-000-c2pa-provenance.json` - structurally decoded embedded generator, instance, action-time, and RFC3161 evidence for all 25 PNGs; not cryptographic validation or approval.
- `manifests/fallback-assets.json` — the ten quarantined pre-v3 files;
- `manifests/render-queue.json` — the 25-item Batch 0 queue only.
- `evidence/batch0-render-receipts.json` — exact observed renderer and output bindings, not approval.
- `evidence/batch0-contact-sheet.json` — the hash-bound 5×5 review-sheet record; independent approval remains pending.
- `evidence/batch0-browser-review.json` — headless-browser evidence that all 25 exact originals decode at 1254×1254, plus a hash-bound full-page screenshot; this is QA evidence, not approval.
- `founder-preview/catalog-data.json` - generated 423-target private preview projection pinned to the frozen core candidate.
- `manifests/batch-001-prepared.json` - 25 exact-product candidates with render and publication authorization explicitly false.
- `manifests/global-art-direction-calibration-prepared.json` - five preparation-only calibration studies with render and publication authorization explicitly false.
- `evidence/founder-preview/founder-preview-browser-evidence.json` - 43 responsive and interaction captures covering 423 of 423 QA IDs with zero broken images or network-boundary violations.

Run `node scripts/product-imagery/build.mjs`, `node --test scripts/product-imagery/product-imagery.test.mjs`, and `node scripts/product-imagery/verify.mjs` after any source or evidence change.

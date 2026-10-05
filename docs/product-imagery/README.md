# Xenios product imagery v3 lane

## Current execution-sprint v2 preparation

The bounded correction result is in `EXECUTION_SPRINT_V2_IMAGERY_2026-10-05.md`
and `evidence/calibration-corrections-v2/`: nine private attempts, one numeric
framing pass (study 04 attempt 3), and two studies still needing correction.
The passing candidate is pending independent exact-asset review, not approved.
No corrected image is selected into the frozen founder preview.

The current planning manifest is `manifests/batch-001-prepared.json`: 24 coverage
identities, 0 authorized product renders. Candidate 25 is removed, candidate 24
uses diluent-vial presentation, and the 22 vial identities propose blank-label
class reuse. See `LABEL_POLICY_2026-10-03.md`,
`manifests/imagery-preparation-gates.json` and
`evidence/framing-preparation-2026-10-03.json` for the scale-aware gate and exact
review provenance. Run `node scripts/product-imagery/prepare-execution-sprint.mjs`
to rebuild only these preparation artifacts, not the frozen private preview.

A-E design approval and final preview fidelity PASS are now recorded on the
reviewer branch. They are not image or runtime approval. The original six-study
manifest and private preview remain frozen historical evidence pending accepted
Core A/B/C; their older embedded status fields are not the current preparation
ledger. `cd66f3c` separately authorizes private calibration corrections 03/04/05
only. No Batch 1 rendering, publication or Core wiring is authorized. The
following lane overview preserves the earlier checkpoint.

## Original lane checkpoint

This directory holds the corrected, non-production imagery source lane. The reviewed catalog evidence contains 426 workbook rows reconciled to 424 canonical variants and 423 customer-exposed targets after excluding the shipping fee. This imagery branch still carries the older 420/419 catalog snapshot, while the observed core HL-11 candidate materializes 424/423 at source commit `4cba24af1d42ad59fe44856859cc1721846e6df5` (tree `6395273fc4370b7df713a2b72b019785f547d1fb`) with qualification records at `c73da35cc223a2253ce8074948ed9ff063012748`. That candidate is not deployed or independently accepted, and it does not confer image approval.

The exact founder v3 specification is checked in under `specs/` with SHA-256 `e37a13d7b99ac1f2416e00e29a92df3e7677ce7c92bce9dbf019de83d08b8b5c`. Renderer requests and fixture provenance are separate artifacts. The only mass-render packet is the 25-class Batch 0 packet; the six-study calibration uses a separate frozen private prompt manifest, and there is no named 423- or 419-row exact-product prompt queue.

Current safety state:

- all ten pre-v3 WebPs were removed from `client/public` and preserved as permanently nonapprovable evidence under `evidence/pre-v3-nonapprovable/`;
- all 25 Batch 0 originals are rendered, receipt-bound, output-SHA-addressed, and retained under non-public evidence with zero runtime/public authority;
- the founder-authorized six-image global calibration is rendered privately from a frozen prompt manifest, receipt-bound, output-SHA-addressed, and awaiting Claude's named direction review;
- no image is approved or wired;
- imagery owns no price, action, workflow, Care, hold, availability, cart, or fulfillment state;
- Claude's exact-SHA review is recorded at reviewer tip `76607458e30a64746d227150ff1dbab3475dd64a`; it authorizes private-prototype use only where marked and grants zero public approvals;
- catalog accounting is reconciled to the frozen HL-11 candidate, but runtime integration remains blocked on independent acceptance of that core candidate, reviewer acceptance of the corrected prototype and calibration direction, acceptance of the separately leased commerce/media decoupling slice, and a coordinated shared UI lease;
- no production mutation or deployment is authorized by this lane.

Private founder review now also has a generated full-catalog visual prototype under `founder-preview/`, with responsive evidence under `evidence/founder-preview/`. It covers all 423 customer targets with private calibration-backed slots; the 25 Batch 0 originals remain preserved as evidence but are no longer selected into the prototype. Reviewer-directed truth-safe substitutions cover 269 slots, and zero reviewed-rejected assets are selected. It grants no image, price, catalog, commerce, Care, runtime, or deployment approval. See `FOUNDER_VISUAL_PROTOTYPE_2026-10-01.md` and `GLOBAL_ART_DIRECTION_CALIBRATION_2026-10-01.md` for the exact source pins, counts, screenshots, local preview command, calibration evidence, prepared-but-unauthorized Batch 1 candidates, and remaining gates.

Authoritative generated artifacts:

- `COVERAGE_SUMMARY.md` — corrected counts and the imagery-branch/core-candidate distinction;
- `manifests/product-image-coverage.json` — 424 identity/form presentation rows with no business-state fields;
- `manifests/product-image-identity-crosswalk.json` — canonical, Product Control, legacy Featured, and Hex/Oxy forward identities;
- `manifests/state-authority-audit.json` — explicit imagery-branch-baseline versus observed-core-candidate accounting without granting imagery authority;
- `manifests/renderer-packet-v3.json` — request-only sanitized renderer inputs;
- `manifests/batch-000-provenance.json` — fixture identities that must never be sent to the renderer;
- `manifests/batch-000-assets.json` — output hashes, renderer provenance, and approval state;
- `manifests/batch-000-c2pa-provenance.json` - structurally decoded embedded generator, instance, action-time, and RFC3161 evidence for all 25 PNGs; not cryptographic validation or approval.
- `prompts/global-art-direction-calibration-v1.json` - exact founder-authorized six-study prompt contract and shared visual lock.
- `manifests/global-art-direction-calibration.json` - six rendered private calibration assets with exact hashes and all approval/runtime flags false.
- `manifests/global-art-direction-calibration-c2pa-provenance.json` - structural C2PA evidence for all six calibration PNGs; not cryptographic validation or approval.
- `manifests/fallback-assets.json` — the ten quarantined pre-v3 files;
- `manifests/render-queue.json` — the 25-item Batch 0 queue only.
- `evidence/batch0-render-receipts.json` — exact observed renderer and output bindings, not approval.
- `evidence/batch0-contact-sheet.json` — the hash-bound 5×5 review-sheet record; independent approval remains pending.
- `evidence/batch0-browser-review.json` — headless-browser evidence that all 25 exact originals decode at 1254×1254, plus a hash-bound full-page screenshot; this is QA evidence, not approval.
- `evidence/calibration-render-receipts.json` - exact prompt, renderer, output, and repository-path bindings for the six private calibration studies.
- `evidence/calibration-contact-sheet.json` - hash-bound six-study calibration review sheet awaiting Claude's global direction decision.
- `founder-preview/catalog-data.json` - generated 423-target private preview projection pinned to the frozen core candidate.
- `manifests/batch-001-prepared.json` - 25 exact-product candidates with render and publication authorization explicitly false.
- `manifests/global-art-direction-calibration-prepared.json` - current six-study rendered-private-review-pending state; calibration approval, Batch 1 rendering, publication, and runtime authorization remain false.
- `evidence/founder-preview/founder-preview-browser-evidence.json` - 45 responsive and interaction captures covering 423 of 423 QA IDs with zero broken images or network-boundary violations.

Run `node scripts/product-imagery/build-calibration-evidence.mjs`, `node scripts/product-imagery/build-founder-preview.mjs`, `node --test scripts/product-imagery/founder-preview.test.mjs scripts/product-imagery/product-imagery.test.mjs`, and `node scripts/product-imagery/verify.mjs` after any calibration, prototype, or evidence change.

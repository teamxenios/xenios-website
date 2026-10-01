# Xenios product imagery v3 lane

This directory holds the corrected, non-production imagery source lane. The reviewed catalog evidence contains 426 workbook rows reconciled to 424 canonical variants and 423 customer-exposed targets after excluding the shipping fee. The mounted runtime remains the older 420/419 projection; the 424 target is not materialized and must not be reported as live.

The exact founder v3 specification is checked in under `specs/` with SHA-256 `e37a13d7b99ac1f2416e00e29a92df3e7677ce7c92bce9dbf019de83d08b8b5c`. Renderer requests and fixture provenance are separate artifacts. The only active render packet is the 25-class Batch 0 packet; there is no named 423- or 419-row exact-product prompt queue.

Current safety state:

- all ten pre-v3 WebPs were removed from `client/public` and preserved as permanently nonapprovable evidence under `evidence/pre-v3-nonapprovable/`;
- Batch 0 output stays under non-public evidence and has zero runtime/public authority;
- no image is approved or wired;
- imagery owns no price, action, workflow, Care, hold, availability, cart, or fulfillment state;
- runtime integration remains blocked on catalog/binding regeneration, independent named exact-SHA image approval, and the separately leased commerce/media decoupling work;
- no production mutation or deployment is authorized by this lane.

Authoritative generated artifacts:

- `COVERAGE_SUMMARY.md` — corrected counts and runtime gap;
- `manifests/product-image-coverage.json` — 424 identity/form presentation rows with no business-state fields;
- `manifests/product-image-identity-crosswalk.json` — canonical, Product Control, legacy Featured, and Hex/Oxy forward identities;
- `manifests/state-authority-audit.json` — explicit mounted-versus-target accounting without granting imagery authority;
- `manifests/renderer-packet-v3.json` — request-only sanitized renderer inputs;
- `manifests/batch-000-provenance.json` — fixture identities that must never be sent to the renderer;
- `manifests/batch-000-assets.json` — output hashes, renderer provenance, and approval state;
- `manifests/fallback-assets.json` — the ten quarantined pre-v3 files;
- `manifests/render-queue.json` — the 25-item Batch 0 queue only.

Run `node scripts/product-imagery/build.mjs`, `node --test scripts/product-imagery/product-imagery.test.mjs`, and `node scripts/product-imagery/verify.mjs` after any source or evidence change.

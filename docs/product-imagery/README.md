# Xenios product imagery v3 source lane

This is an isolated, source-only checkpoint based on primary commit `7600943f9ec7573f0a5cbfe7a7687ba851276a30`, tree `2fd41b918c8d77c5593319a6d921477f789b737e`.

It implements the data, evidence, asset, and validation portion of the image-layer acceptance bar at `f4f899a7:docs/review/xenios-health-launch-review-20260930/13_IMAGE_LAYER_ACCEPTANCE.md`. It does not edit shared catalog cards, detail pages, commerce, Product Control, payment, release, or deployment code.

The founder v3 prompt file has not been attached to this lane. The ten AI-generated files are therefore pre-v3 candidates under quarantine. They are unreviewed, have no named approval, are not wired to a customer surface, and may not be described as exact product photography, official packaging, supplier photography, approved Product Control media, or final Xenios imagery. No further pixel generation is authorized until the v3 prompt is attached and reconciled.

## Deployment block

This entire branch is non-deployable while the candidate bytes remain under `client/public/`. A web build would make those files directly addressable even though no component references them. Their original PNGs are hashed local artifacts but are not durable repository evidence, so these exact pre-v3 bytes are permanently ineligible for approval. Do not merge this commit into a deployable release branch and do not deploy it until the files are removed or replaced by v3 rerenders with durable evidence and every publication gate satisfied. This is a source-lane and release-process block, not runtime access control.

## Artifacts

- [PRODUCT_IMAGE_CONTRACT.md](PRODUCT_IMAGE_CONTRACT.md): v3 identity, provenance, approval, alt-text, URL, and authority rules.
- [V3_ACCEPTANCE_TRACE.md](V3_ACCEPTANCE_TRACE.md): requirement-by-requirement disposition against the independent acceptance bar.
- [COVERAGE_SUMMARY.md](COVERAGE_SUMMARY.md): deterministic 420-row source and 419-row customer projection counts.
- [PRODUCT_IMAGE_STYLE_GUIDE.md](PRODUCT_IMAGE_STYLE_GUIDE.md): visual restrictions for forms, pathways, holds, third-party marks, and unknown forms.
- [RENDER_PACKET.md](RENDER_PACKET.md): quarantined fallback batch and blocked 419-row exact-render draft queue.
- [BRANCH_RECONCILIATION.md](BRANCH_RECONCILIATION.md): disposition of the older Claude and Codex imagery branches.
- [INTEGRATION_HANDOFF.md](INTEGRATION_HANDOFF.md): no-gating prerequisite, resolver/component contract, surface leases, and browser acceptance.
- `manifests/fallback-assets.json`: exact prompts, generator attribution, source-PNG lineage, observational timestamps, byte facts, full hashes, content-addressed paths, rights state, separated eligibility axes, and explicit unreviewed records.
- `manifests/product-image-coverage.json`: all 420 canonical `mov_*` rows, including 419 exposed rows and the excluded shipping fee.
- `manifests/product-image-identity-crosswalk.json`: one canonical image key per `mov_*`, including the 22 Featured PEX/R360 aliases and their GEN-GRP bindings.
- `manifests/render-queue.json`: ten quarantined candidates plus 419 blocked exact-variant draft prompts.

Candidate bytes live under `client/public/research/products/fallbacks/`. Every filename contains the first 12 characters of its full SHA-256. The manifest permits no remote URL, signed URL, query, fragment, or dynamic product route. The files total 292,336 bytes; each is at most 120 KiB. The adjacent `.gitattributes` marks WebP files as binary.

## Rebuild and validate

```powershell
node scripts/product-imagery/build.mjs
node scripts/product-imagery/verify.mjs
node --test scripts/product-imagery/product-imagery.test.mjs
```

The validator fails on source drift, missing or duplicate `mov_*` keys, mixed-identity divergence, swapped manifest keys, presentation-parity drift, stale or encoded paths, unhashed filenames, checksum or byte drift, orphan files, size overruns, metadata, unsafe alt text, unknown-form container inference, missing review fields, runtime candidate references, or an exact render that is not blocked.

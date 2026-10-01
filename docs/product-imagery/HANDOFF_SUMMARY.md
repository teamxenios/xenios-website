# Product imagery v3 source-lane handoff

> Historical pre-v3 handoff for SHA `640513af`. Superseded by the corrected v3 manifests and `COVERAGE_SUMMARY.md`; its 420/419 queue and public-byte statements are not current completion claims.

Branch: `codex/xenios-product-imagery-20260930`

Pushed implementation SHA: `640513af54457a1362744626ce936bfe8f4779c0`

Implementation tree: `3328529e15e67e85ff4abb52c3cd1e16f3c15e2b`

Primary base SHA: `7600943f9ec7573f0a5cbfe7a7687ba851276a30`

Primary base tree: `2fd41b918c8d77c5593319a6d921477f789b737e`

This is a source-only imagery checkpoint. It adds no runtime image resolver, surface wiring, API field, commerce authority, Product Control mutation, migration apply, deployment, or other hosted change.

## Delivered

- v3 presentation-only image contract and acceptance trace
- deterministic coverage ledger for 420 canonical variants and 419 customer-exposed variants
- presentation-only identity crosswalk for 22 Featured PEX/R360 aliases and 22 canonical `mov_*` / GEN-GRP bindings
- 419-row exact-variant draft render queue, all blocked on the missing founder v3 prompt and evidence
- ten content-hashed 1024 by 1024 WebP fallback candidates totaling 292,336 bytes
- exact source-PNG hashes, observational timestamps, transformation recipes, and byte-identical PNG-to-WebP reproduction evidence
- deterministic build, byte/path/metadata validation, runtime-reference scan, fail-closed mixed-identity resolution, parity checks, and focused tests
- prior imagery branch reconciliation and a bounded future integration handoff

## Current safety disposition

The ten WebPs are quarantined pre-v3 review references. They are unreviewed, unwired, and carry no product, packaging, supplier, Product Control, or publication authority. Their original PNGs remain local rather than repository-durable, so these exact bytes are permanently non-approvable. They must be removed or replaced by v3 rerenders with durable evidence before any deployment. Because the files currently sit in the public build tree, this entire branch is non-deployable.

The founder v3 prompt file is absent. No further generation is authorized until it is attached, checksummed, and reconciled. A future asset needs durable provenance, rights evidence, exact identity scope, truthful alt and illustrative treatment, full checksum, and a named reviewer with UTC time.

Visual source safety is conservative: all 108 resolved lyophilized-vial rows use the form-neutral candidate because the pre-v3 vial image visibly contains clear liquid. Generic `Liquid` and `Solution` forms also stay neutral unless reviewed container evidence exists. Unknown form stays neutral except the two founder-reviewed kept-identity form decisions.

## Integration prerequisites

Before any imagery is wired, a separately leased TypeScript and persistent-cart SQL slice must remove approved-media readiness from commerce. Media absence, review state, approval, or load failure must never change catalog inclusion, price, action, workflow mode, availability, cart eligibility, or fulfillment. Any SQL apply or deployment requires Samuel's current explicit approval.

After that prerequisite, the shared owners may add one `mov_*`-keyed resolver and one resilient component. Featured and all-products projections must agree on asset ID, href, canonical-name alt text, width, height, and illustrative notice. Every supplied canonical, Product Control, legacy UUID, and PEX/R360 identity must converge or fail closed. The load chain is approved exact asset, approved fallback, then an intentional non-image panel; a broken image may never drop a row.

## Verification

- `node scripts/product-imagery/build.mjs`: pass
- `node scripts/product-imagery/verify.mjs`: pass
- `node --test scripts/product-imagery/product-imagery.test.mjs`: pass, 8 of 8
- `node scripts/agentic/xenios-os.mjs validate`: pass
- owned-path no-em-dash scan: pass, 29 files
- official repository no-em-dash script: not runnable in this checkout because the local `typescript` dependency is absent; it failed before scanning with `ERR_MODULE_NOT_FOUND`
- production and hosted state: untouched

The authoritative operating details are in `PRODUCT_IMAGE_CONTRACT.md`, `V3_ACCEPTANCE_TRACE.md`, `RENDER_PACKET.md`, `COVERAGE_SUMMARY.md`, and `INTEGRATION_HANDOFF.md`.

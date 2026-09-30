# Render packet v3 checkpoint

## Stop condition

The founder v3 prompt file is not attached. No further rendering, named approval, runtime manifest generation, or UI wiring is authorized. The material below preserves the work already produced and prepares a deterministic queue; it does not claim v3 visual approval.

## Batch 001: quarantined fallback candidates

`manifests/fallback-assets.json` records the exact prompt, generator attribution, source PNG reference and hash, observational source timestamps, exact WebP transformation, encoding time, full output checksum, content-addressed path, dimensions, byte size, rights state, illustrative notice, separated eligibility axes, and unreviewed record for every candidate. The pixel-generation event time is recorded as `unknown` because the local artifact filename and filesystem clock do not prove an ImageGen run event.

| Sequence | Asset | Purpose | State |
| ---: | --- | --- | --- |
| 1 | `xenios-fallback-form-vial-v1` | generic vial form | pre-v3, provisional, unreviewed |
| 2 | `xenios-fallback-form-bottle-v1` | generic bottle form | pre-v3, provisional, unreviewed |
| 3 | `xenios-fallback-form-spray-v1` | generic spray form | pre-v3, provisional, unreviewed |
| 4 | `xenios-fallback-form-accessory-v1` | generic accessory scene | pre-v3, provisional, unreviewed |
| 5 | `xenios-fallback-form-topical-v1` | generic topical pump | pre-v3, provisional, unreviewed |
| 6 | `xenios-fallback-form-liquid-v1` | generic liquid bottle | pre-v3, provisional, unreviewed |
| 7 | `xenios-fallback-form-pending-v1` | empty form-neutral state | pre-v3, provisional, unreviewed |
| 8 | `xenios-fallback-service-shipping-v1` | shipping service, not merchandise | pre-v3, provisional, unreviewed |
| 9 | `xenios-fallback-journey-care-v1` | Care pathway, no product | pre-v3, provisional, unreviewed |
| 10 | `xenios-fallback-journey-request-v1` | request or quote review, no product | pre-v3, provisional, unreviewed |

Generation used OpenAI ImageGen through the Codex imagegen tool, one call per asset. Source outputs were 1254 by 1254 PNG. Delivery copies were converted with FFmpeg 8.1.1 and `libwebp`, Lanczos-resized to 1024 by 1024, quality 82, compression level 6, and stripped of metadata. Replaying the recorded recipe from each hashed PNG reproduced all ten committed WebPs byte-for-byte. The WebP batch totals 292,336 bytes; individual files range from 10,154 to 114,964 bytes. The original PNGs remain local review artifacts outside the repository; their opaque `exec-*` names are not represented as ImageGen run IDs. Because that evidence is not repository-durable, these exact ten WebPs are permanently ineligible for approval and must be replaced by v3 rerenders before publication.

The prompts did not request labels, logos, dose, strength, price, availability, clinical outcomes, or purchase cues. The output files remain unreviewed because prompt intent is not visual review, provenance review, rights review, or v3 approval. Source-lane inspection found visible clear liquid in the vial candidate, so it is restricted away from every lyophilized row; this inspection is not publication approval.

## Exact-variant draft queue

The second batch accounts for all 419 exposed canonical offering variants. Each row contains:

- exact `mo_*` and `mov_*` identities
- nullable Product Control UUIDs and GEN-GRP SKU
- Featured legacy alias where one exists
- display name, variant label, source form, and resolved visual form
- visual restriction and journey class
- content-hashed target filename template
- complete pre-v3 draft prompt
- rerender rule
- blockers and `mayRenderNow=false`

All 419 rows have `promptStatus=draft_blocked_missing_founder_v3_prompt`. The prompt text is planning material, not a current render instruction.

## Priority order

1. P0: exact current-demand name matches.
2. P1: the default catalog first page, excluding P0 overlap.
3. P2: the first remaining representative of each selected fallback taxonomy.
4. P3: the remaining exposed catalog.

Current deterministic counts are P0 21, P1 23, P2 4, and P3 371. Priority never grants availability, price, action, purchase, Care, or release authority.

## Resume procedure after the founder v3 prompt arrives

1. Preserve the prompt file and checksum as repository evidence.
2. Reconcile it against the acceptance trace and current primary SHA.
3. Confirm the canonical `mov_*` row, Product Control binding, source form, and any kept-identity form evidence.
4. Confirm exact packaging or label evidence and rights position. Do not fabricate third-party packaging.
5. Render into `xenios-{offeringVariantId}-primary-v{n}-{sha12}.webp`. Never overwrite.
6. Record the exact prompt, generator, time, full SHA-256, dimensions, byte size, rights evidence, and identity scope.
7. Run claim, metadata, hash, path, alias, and size validation.
8. Obtain a named approval tied to the exact bytes.
9. Complete the no-image-gating prerequisite before any runtime wiring.
10. Integrate through the single resolver and resilient component described in the handoff.

## Reproduction commands

```powershell
node scripts/product-imagery/build.mjs
node scripts/product-imagery/verify.mjs
node --test scripts/product-imagery/product-imagery.test.mjs
```

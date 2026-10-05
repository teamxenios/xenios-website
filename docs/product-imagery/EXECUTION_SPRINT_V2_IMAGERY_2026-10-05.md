# Execution sprint v2: private imagery preparation and bounded calibration result

## Outcome

Preparation is complete. The optional private calibration scope was subsequently
authorized in registered Claude report 31 at
`cd66f3c411e6164981295d81c2116e50343edc86` (tree
`b9930fd1edb403020e97eb956f701729f5830ab5`). Nine raw imagegen attempts were
made: three each for studies 03, 04 and 05. Only study 04 attempt 3 passes the
unchanged numeric framing gate. Studies 03 and 05 remain rejected by that gate.
No more renders are part of this bounded slice.

This is a partial calibration correction, not a claim that all three studies are
ready. Numeric PASS is not independent visual acceptance, image approval, Core
acceptance, Product Control approval, runtime integration or publication.

## Exact bases and scope

- Prior imagery handoff: `b3a60d2906c5e44eacd7f2150ec2c3c95dacc380`.
- Frozen preview source: `e9ebc7b7df44a8921dd4b64100590da51310ba9a`, tree
  `e9a7a5c5697bc9cdf85a69dd5b6fdb0f483f8fca`.
- Preparation source: `eee7abe7c68f2aa382f8a49118f5239b671cdc2c`, tree
  `a723f5ff3e65d176e648cf958308e5112a2eea00`.
- Original six-study source: `aa4f31f9b650e68a7c7c2c749f00417d20607665`, tree
  `354ddc3aff94de3307dfd09df03dde87066799ea`.
- Framing method and prior per-study review: `96e06765dbec9063a7311f128d0ab8accf8588b5`.
- This correction source/tree and pushed handoff are pinned by the next exact-SHA
  record under `.xenios/handoffs/`; this source document does not self-pin.

The founder's exact authorization covers private calibration studies 03/04/05
only. The 25 Batch 0 originals and six original calibration PNGs are unchanged.
Studies 01, 02 and 06 were not rerendered. Study 06's historical ACCEPTABLE visual
decision remains separate from its prospective numeric framing failure.

## Final-attempt measurements

For square side S: subject height 61-75%, top margin 16.3-17.9%, horizon
52.1-57.5%, centered and without edge contact. All spatial measurement parameters
scale with S. The 5% horizontal-center tolerance is explicitly a provisional
engineering check, not a new founder decision.

| Study | Height | Top margin | Horizon | Result |
| --- | ---: | ---: | ---: | --- |
| 03 topical, attempt 3 | 70.57% | 11.80% | 54.47% | FAIL: top margin too small |
| 04 Care state, attempt 3 | 66.91% | 16.83% | 53.59% | Numeric PASS; selected for independent review only |
| 05 held/quote-only state, attempt 3 | 76.32% | 9.89% | 56.94% | FAIL: too tall and top margin too small |

All are 1254 x 1254; all are centered and have no detected edge contact.

Final-attempt raw SHA-256:

- 03: `b30331adf582823a8e66f289cdc7014e87679a74d477b6724aa6ceb7bcde5a7c`
- 04: `543ff8e6dbcaad9497e7f512c320207b003855eb8de4bc91b844f4563fe4a8fc`
- 05: `46cc336909f38be87c0ce47508cf82991c99098809f718a27c7684791d8636cd`

All nine attempts, exact prompts, reference-image hashes, generation-output
paths, tool request times, dimensions and measurements are in
`evidence/calibration-corrections-v2/attempts.json` and `manifest.json`.
The three prompt sets are under `prompts/calibration-corrections-v2*.json`.
Follow-ups change framing only. Imagegen was used for every raster edit; outputs
were copied byte-for-byte without cropping, tinting, compositing or pixel repair.
The original generated files were retained at their tool-returned paths.

Structural C2PA metadata was extracted for all nine outputs. No official C2PA
validator was run; cryptographic signatures and trust chains were not validated.
Tool request time is recorded separately from embedded generation timestamps.
No provenance field grants approval.

## Contact sheet and browser proof

Open `evidence/calibration-corrections-v2/review.html` through the existing
loopback-only imagery server. It compares all three frozen originals with the
selected study 04 or final failed attempt, labels failures explicitly, and links
every retained attempt. All illustrative/pending labels are outside source pixels.

Screenshots: `review-1440.png`, `review-768.png`, `review-390.png` and
`review-320.png` in that directory. `browser-evidence.json` records no overflow,
no broken images, six decoded contain-only images per width, no filters or blend
effects, byte-identical served source assets and no external network requests.
Desktop and narrow-mobile screenshots were visually inspected. This separate
evidence page does not mutate or recapture the frozen founder preview.

Reproduce with:

```powershell
node scripts/product-imagery/build-calibration-corrections-v2.mjs
node scripts/product-imagery/capture-calibration-corrections-v2.mjs
node --test --test-concurrency=1 scripts/product-imagery/*.test.mjs
node scripts/product-imagery/verify.mjs
node scripts/agentic/xenios-os.mjs validate
```

## Candidate-list and label policy

`manifests/batch-001-prepared.json` contains 24 coverage identities, not an
authorized product render queue. Former #25 GRP-0366 Annatto is removed from the
preparation list, not the catalog. #24 GRP-0362 uses sealed diluent-vial
presentation without asserting sterility or showing a dropper/tincture bottle.
GHK-Cu #6/#7 remain opaque, with contents hidden and no invented powder, liquid,
fill-level or color claim. The 22 vial identities propose reuse of a reviewed
blank-label class visual rather than redundant named-product renders.

`LABEL_POLICY_2026-10-03.md` records blank labels as the class-render default;
exact package text requires authoritative verified text. Illustrative visuals
are not exact packaging evidence. Care, held, quote-only and packaging-unverified
identities retain their catalog/pathway state. Imagery carries no commerce state.

The historic private preview still has its older embedded 25-candidate list.
It is intentionally frozen; the new 24-identity planning manifest is separate.

## Verification and boundaries

Focused correction tests pass 5/5, including failed/forged selection, unauthorized
study, duplicate selection, attempt limit, wrong parent reference and byte-drift
rejection. Preparation had a fresh 49/49 pass. The earlier Oct 3 run crossed a
host sleep and had one Python ETIMEDOUT; the clean Oct 5 rerun passed without
relaxing tests or timeouts. The final serial combined suite passes 54/54 with
zero failures/skips (106.599 seconds on the shared host after final guard hardening).

Imagery verifier PASS: 426 reviewed source rows, 424 canonical variants,
423 customer targets, 25 preserved Batch 0 renders, zero public assets.
Continuity validation and diff whitespace check pass.

Diff against the prior handoff is empty for `client/`, `server/`, `shared/`,
the founder preview, original Batch 0 candidates and original calibration PNGs.
No Core/public code, canonical founder decisions, catalog, pricing, commerce,
Product Control or managed SQL was edited. No Batch 1 product image was rendered.
No asset was published, deployed or used in production. No Claude request was sent.

## Parallel sprint lanes and next gates

Core A/B/C was dispatched to the existing Core chat. MC-01 and Finance were
created as separate local isolated-worktree chats from the current Core base,
not as cloud compute. Finance was instructed to keep loaded-host race results
separate from idle-host/cloud qualification. Independent acceptance is still
owned by the registered Claude reviewer, not these Codex builders.

At final origin inspection Claude remains `cd66f3c`; MC-01 source is
`ed9bb9b456bb78994f4fcfedac6ac2112142a5b6`; Finance source is
`d2e12dcd5cd55e0fce84a41ff49635f85cafaf52`. These are observed in-progress
lane tips, not independent acceptance. Core then reported its completed source
`70cd421a6ab79513744f531d921b3ece61044874`, tree
`37ea984993cc78ee61d0e9ca944fca0213e73ba8`, test commit
`1a409e2f7e1fcdeffc78d24428eeb626d7888e9c` and records/handoff
`7d665730b6db11d64f4a9910af99fde420ded53b`. Its focused tests and clean typecheck/
build pass, but protection still fails and browser/native-200%/ten-width proof
is incomplete. It is explicitly NOT premium accepted or Claude reviewed. Those
are the Core owner's reported results, not independently rerun here. No Core
successor has been imported into this imagery checkout.

Claude coordinator and separate Claude premium QA must be launched in Claude
using v2 prompts 06 and 07, if Samuel has not already done so. Codex does not spawn
Claude sessions. No duplicate review dispatch is made here.

Next imagery work is explicit correction of 03/05 and exact-SHA independent
review of 04. The source and evidence preserve all failures for that decision.
Batch 1 remains unauthorized. D/E runtime waits for independent MC-01 acceptance.
Private preview refresh waits for accepted Core A/B/C. Public imagery, hosted
writes, managed SQL and production remain separately gated.

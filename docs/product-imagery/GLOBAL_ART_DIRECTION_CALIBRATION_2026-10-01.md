# Xenios global art-direction calibration

Date: 2026-10-01

Status: six private internal studies rendered and evidence-bound; awaiting named Claude global art-direction review. No study is publication-approved, runtime-authorized, Product Control-approved, or an exact product asset. Batch 1 remains blocked.

## Authorization and boundary

Samuel explicitly authorized one private internal five-to-six-image calibration set before Batch 1. The authorization permits rendering, local evidence capture, and private founder-prototype use only. It does not authorize publication, public-tree copying, runtime wiring, catalog or price mutation, Product Control approval, deployment, hosted writes, managed SQL, Supabase writes, Render writes, or production mutation.

The source authorization attachment has SHA-256 `e2326d80b0d9abd1d431818672bb1cec749b7ca6ba399444745b8cdff6c2dd12`. The frozen exact renderer prompts and shared direction are in `prompts/global-art-direction-calibration-v1.json`, whose generated manifest SHA-256 is `fdadd0f28e491b9bf00b60127b4231799d39332c4707af2d377b4e0f21ded216`.

## Shared visual lock

- square 1:1 canvas;
- fixed 20-degree elevated three-quarter view with an 85 mm product-photography perspective;
- centered full-object crop with the subject at approximately 68 percent of canvas height;
- deep-taupe to near-black cyclorama and low matte warm-graphite plinth;
- broad warm upper-left key, restrained cool right fill, soft down-right shadow, and subtle purple-to-teal edge reflection;
- blank matte-ivory label plane when a label surface exists;
- near-black, taupe, graphite, brushed metal, and ivory palette;
- no botanicals, spa or wellness cues, liquid splashes, clinic or laboratory rooms, people, hands, crosses, logos, brand names, legible text, certifications, watermarks, price, availability, or clinical claims.

## Exact rendered set

| Study | Archetype | Output SHA-256 |
| --- | --- | --- |
| `calibration-01-vial` | lyophilized vial form | `e04c2e5981eccdd5753ebfbdd8927e6e04ae804d2e0537eb9eceb5c7e9d3f6fe` |
| `calibration-02-bottle` | capsule/tablet bottle form | `e3681f630199c0b5743a589ab29b04ebaf246cece82658fb1b811b79ecaeef7f` |
| `calibration-03-topical` | topical form | `dd8510c7ce07525fe9dc1195cb6dc0bf12964167a0a4ebd9923648151a6a4173` |
| `calibration-04-care-state` | Care pathway state | `76c10c66c93fd3365bd40eefa450ffa01ddb13351dce6ae9aecacefb8abf9750` |
| `calibration-05-restrictive-state` | held or quote-only state | `36bc99f4833d83923cb837664f89e07258ad94fbd04a5ddb7b27ca77ccf655f2` |
| `calibration-06-unverified-identity` | unknown/unverified packaging state | `77069db7b8324baf4780b37c585926a92b432e2fef24cbcdf019d38782cd7d8b` |

All six are 1254 by 1254 PNGs stored only under `docs/product-imagery/evidence/calibration-render-candidates/`. The built-in image generator was called separately for every asset. Exact observed renderer receipts are in `evidence/calibration-render-receipts.json`.

## Review and prototype evidence

The immutable desktop contact sheet is `evidence/calibration-contact-sheet-sha256-017cffad1438.png`, SHA-256 `017cffad14383a88e3d9b24dcae110ca0456d97511b19546f93a867e48bf4957`, 1440 by 1451. The local responsive page is `founder-preview/calibration.html`.

The private founder projection uses calibration assets for all 423 provisional visual slots. The 25 Batch 0 originals remain preserved as review evidence, but no Batch 0 asset is selected into the current prototype. It still records zero exact product assets, 423 exact renders missing, 269 reviewer-directed truth-safe substitutions, and zero reviewed-rejected Batch 0 assets selected. Calibration use in the prototype is a private presentation aid only and does not make one generic study exact for any product.

The browser run produced 45 captures, including dedicated 1440px and 390px calibration sheets, and covered all 423 QA canonical IDs. It found zero broken images, horizontal overflow, severe console messages, or external-network boundary violations.

## Provenance limits

`manifests/global-art-direction-calibration-c2pa-provenance.json` structurally decodes one embedded `caBX` manifest from every PNG, confirms six receipt-to-repository SHA matches and six unique instance IDs, and records embedded `ChatGPT` / `gpt-image`, `OpenAI Media Service API`, action-time, and RFC3161 claims.

The repository decoder is not an official C2PA validator. It does not cryptographically validate COSE or RFC3161 signatures, certificate chains, revocation, assertion hashes, or asset binding. The C2PA record is provenance evidence only and grants no approval.

## Verification

- `node scripts/product-imagery/build-calibration-evidence.mjs`: 6 renders, 6 embedded `caBX` manifests, 0 publication approvals.
- `node scripts/product-imagery/build-founder-preview.mjs`: 423 targets, 6 calibration renders, 25 Batch 1 candidates with render authorization false.
- `node --test scripts/product-imagery/founder-preview.test.mjs scripts/product-imagery/product-imagery.test.mjs`: 24 of 24 pass.
- `node scripts/product-imagery/verify.mjs`: 426 reviewed rows to 424 canonical variants to 423 customer targets; 25 Batch 0 rendered; 0 public assets.
- responsive browser evidence: 45 captures, 423 of 423 QA IDs, 0 broken images.
- `.xenios` validation and `git diff --check`: pass.

## Required next decision

The registered Claude reviewer must assess the exact pushed source SHA and all six exact asset hashes, return an acceptable / needs-change / reject decision per study, and state whether the shared global direction is acceptable for a narrowly scoped Batch 1 proposal. That review cannot publish assets or grant runtime authority. Core HL-11 independent acceptance, media-commerce integration acceptance, and an exact shared-UI ownership lease remain separate gates.

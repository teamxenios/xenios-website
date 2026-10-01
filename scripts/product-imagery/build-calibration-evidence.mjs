import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  deltaMilliseconds,
  extractC2paStructural,
} from "./extract-c2pa-provenance.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const PROMPTS_PATH = join(
  REPO_ROOT,
  "docs/product-imagery/prompts/global-art-direction-calibration-v1.json",
);
const CANDIDATE_ROOT = join(
  REPO_ROOT,
  "docs/product-imagery/evidence/calibration-render-candidates",
);
const RECEIPTS_PATH = join(
  REPO_ROOT,
  "docs/product-imagery/evidence/calibration-render-receipts.json",
);
const MANIFEST_PATH = join(
  REPO_ROOT,
  "docs/product-imagery/manifests/global-art-direction-calibration.json",
);
const C2PA_PATH = join(
  REPO_ROOT,
  "docs/product-imagery/manifests/global-art-direction-calibration-c2pa-provenance.json",
);
const CALIBRATION_PAGE_PATH = join(
  REPO_ROOT,
  "docs/product-imagery/founder-preview/calibration.html",
);
const CALIBRATION_CSS_PATH = join(
  REPO_ROOT,
  "docs/product-imagery/founder-preview/calibration.css",
);
const CALIBRATION_JS_PATH = join(
  REPO_ROOT,
  "docs/product-imagery/founder-preview/calibration.js",
);
const CONTACT_SHEET_SOURCE_PATH = join(
  REPO_ROOT,
  "docs/product-imagery/evidence/founder-preview/calibration-contact-sheet-desktop-1440.png",
);
const CONTACT_SHEET_RECORD_PATH = join(
  REPO_ROOT,
  "docs/product-imagery/evidence/calibration-contact-sheet.json",
);
const GENERATED_AT = "2026-10-01T16:12:00.000Z";
const EXPECTED_DIMENSION = 1254;

const SOURCE_OBSERVATIONS = new Map([
  [
    "calibration-01-vial",
    {
      sourceImageId: "exec-79554a6d-b0ac-4590-868e-c11f77577a61.png",
      generatedAtObserved: "2026-10-01T16:08:11.8321876Z",
    },
  ],
  [
    "calibration-02-bottle",
    {
      sourceImageId: "exec-07a39e7e-94e5-4361-acc2-ffb17c226fb9.png",
      generatedAtObserved: "2026-10-01T16:09:14.3482234Z",
    },
  ],
  [
    "calibration-03-topical",
    {
      sourceImageId: "exec-abdebbdf-67ce-44a7-8ee9-a16949defb8e.png",
      generatedAtObserved: "2026-10-01T16:09:39.5158697Z",
    },
  ],
  [
    "calibration-04-care-state",
    {
      sourceImageId: "exec-4d1ce096-1891-40cf-a779-acb41056935c.png",
      generatedAtObserved: "2026-10-01T16:10:01.8689052Z",
    },
  ],
  [
    "calibration-05-restrictive-state",
    {
      sourceImageId: "exec-64499470-4d12-465a-8029-5c89b518d0c2.png",
      generatedAtObserved: "2026-10-01T16:10:26.1145985Z",
    },
  ],
  [
    "calibration-06-unverified-identity",
    {
      sourceImageId: "exec-ef6e9383-857f-4cbb-8cb3-2b85eb6facb5.png",
      generatedAtObserved: "2026-10-01T16:10:51.3263698Z",
    },
  ],
]);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const repoPath = (path) => relative(REPO_ROOT, path).replaceAll("\\", "/");

function pngDimensions(bytes, label) {
  assert.deepEqual(
    [...bytes.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
    `${label} must be a PNG`,
  );
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  assert.equal(width, EXPECTED_DIMENSION, `${label} width drifted`);
  assert.equal(height, EXPECTED_DIMENSION, `${label} height drifted`);
  return { width, height };
}

function candidateFor(job) {
  const matches = readdirSync(CANDIDATE_ROOT).filter(
    (name) => name.startsWith(`${job.id}-sha256-`) && name.endsWith(".png"),
  );
  assert.equal(matches.length, 1, `${job.id} must have exactly one candidate PNG`);
  const absolutePath = join(CANDIDATE_ROOT, matches[0]);
  const bytes = readFileSync(absolutePath);
  const outputSha256 = sha256(bytes);
  assert.equal(
    matches[0],
    `${job.id}-sha256-${outputSha256.slice(0, 12)}.png`,
    `${job.id} filename must bind to its output hash`,
  );
  return {
    absolutePath,
    bytes,
    outputSha256,
    ...pngDimensions(bytes, matches[0]),
  };
}

function calibrationPage(manifest) {
  const cards = manifest.assets
    .map(
      (asset) => `
        <article class="calibration-card">
          <img src="/${asset.repositoryPath.replace(/^docs\/product-imagery\//, "")}" alt="${asset.archetype.replaceAll("_", " ")}" />
          <div class="calibration-card__copy">
            <p>${asset.id}</p>
            <h2>${asset.archetype.replaceAll("_", " ")}</h2>
            <small>Private calibration · SHA ${asset.outputSha256.slice(0, 12)} · not publication approved</small>
          </div>
        </article>`,
    )
    .join("");
  return `<!doctype html>
<html lang="en" data-preview-ready="false">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, noarchive" />
  <title>Xenios private calibration set</title>
  <link rel="stylesheet" href="./preview.css" />
  <link rel="stylesheet" href="./calibration.css" />
</head>
<body>
  <main class="calibration-shell">
    <header class="calibration-header">
      <span class="calibration-kicker">Private internal art-direction gate</span>
      <h1>One system. Six truth-safe studies.</h1>
      <p>Fixed camera, scale, crop, background, lighting and label treatment. These studies calibrate visual direction only; they are not exact product assets, Product Control approval, publication approval or runtime authority.</p>
    </header>
    <section class="calibration-grid" aria-label="Six calibration studies">${cards}
    </section>
    <p class="calibration-boundary">No botanicals, spa cues, invented contents, clinic or laboratory setting, third-party branding, price, availability or clinical claim. Batch 1 remains blocked pending named global art-direction review.</p>
  </main>
  <script src="./calibration.js"></script>
</body>
</html>
`;
}

function calibrationCss() {
  return `body { margin: 0; background: #100f0f; color: #f5f0e8; }
.calibration-shell { max-width: 1320px; margin: 0 auto; padding: 42px 32px 64px; }
.calibration-kicker { color: #b8aaa0; letter-spacing: .18em; text-transform: uppercase; font-size: 12px; }
.calibration-header { display: grid; gap: 12px; margin-bottom: 30px; }
.calibration-header h1 { margin: 0; font-size: clamp(34px, 5vw, 64px); line-height: .98; }
.calibration-header p { margin: 0; color: #cfc3b8; max-width: 840px; }
.calibration-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
.calibration-card { overflow: hidden; border: 1px solid #3a3431; border-radius: 24px; background: #191716; box-shadow: 0 28px 80px rgba(0,0,0,.3); }
.calibration-card img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; }
.calibration-card__copy { display: grid; gap: 6px; padding: 18px 20px 22px; }
.calibration-card p, .calibration-card h2, .calibration-card small { margin: 0; }
.calibration-card p { color: #aa9d94; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; }
.calibration-card h2 { font-size: 18px; text-transform: capitalize; }
.calibration-card small { color: #9d9189; line-height: 1.35; }
.calibration-boundary { margin-top: 22px; padding: 18px 20px; border-radius: 18px; background: #211d1b; color: #cfc3b8; }
@media (max-width: 900px) { .calibration-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .calibration-shell { padding: 24px 16px 40px; } .calibration-grid { grid-template-columns: 1fr; } }
`;
}

function calibrationJs() {
  return `window.__XENIOS_PREVIEW_READY__ = { view: "calibration", customerTargets: 423 };
document.documentElement.dataset.previewReady = "true";
`;
}

function calibrationContactSheet() {
  if (!existsSync(CONTACT_SHEET_SOURCE_PATH)) return null;
  const bytes = readFileSync(CONTACT_SHEET_SOURCE_PATH);
  const outputSha256 = sha256(bytes);
  const dimensions = pngDimensionsAny(bytes, "calibration contact sheet");
  const immutablePath = join(
    REPO_ROOT,
    `docs/product-imagery/evidence/calibration-contact-sheet-sha256-${outputSha256.slice(0, 12)}.png`,
  );
  if (existsSync(immutablePath)) {
    assert.equal(sha256(readFileSync(immutablePath)), outputSha256);
  } else {
    copyFileSync(CONTACT_SHEET_SOURCE_PATH, immutablePath);
  }
  const record = {
    schemaVersion: 1,
    kind: "private_internal_calibration_contact_sheet",
    generatedAt: GENERATED_AT,
    sourceCapture: repoPath(CONTACT_SHEET_SOURCE_PATH),
    repositoryPath: repoPath(immutablePath),
    outputSha256,
    byteSize: bytes.length,
    width: dimensions.width,
    height: dimensions.height,
    studies: 6,
    publicationAuthorization: false,
    runtimeIntegrationAuthorization: false,
    reviewStatus: "awaiting_claude_global_art_direction_review",
  };
  writeFileSync(CONTACT_SHEET_RECORD_PATH, `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

function pngDimensionsAny(bytes, label) {
  assert.deepEqual(
    [...bytes.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
    `${label} must be a PNG`,
  );
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  assert.ok(width > 0 && height > 0, `${label} must have positive dimensions`);
  return { width, height };
}

export function buildCalibrationEvidence() {
  const promptBytes = readFileSync(PROMPTS_PATH);
  const promptSpec = JSON.parse(promptBytes);
  assert.equal(promptSpec.jobs.length, 6);
  assert.equal(promptSpec.authorization.publicationAuthorized, false);
  assert.equal(promptSpec.authorization.runtimeIntegrationAuthorized, false);
  assert.equal(promptSpec.authorization.batch1MassRenderingAuthorized, false);
  assert.equal(SOURCE_OBSERVATIONS.size, promptSpec.jobs.length);

  const observations = promptSpec.jobs.map((job) => {
    const candidate = candidateFor(job);
    const source = SOURCE_OBSERVATIONS.get(job.id);
    assert.ok(source, `Missing source observation for ${job.id}`);
    return {
      jobId: job.id,
      sequence: job.sequence,
      archetype: job.archetype,
      repositoryPath: repoPath(candidate.absolutePath),
      provider: "OpenAI",
      interface: "built_in_imagegen",
      model: "not_exposed_by_tool",
      requestId: "not_exposed_by_tool",
      sourceImageId: source.sourceImageId,
      generatedAtObserved: source.generatedAtObserved,
      promptManifestSha256: sha256(promptBytes),
      rendererPromptSha256: sha256(job.prompt),
      rendererPayloadSha256: sha256(
        JSON.stringify({ prompt: job.prompt, transparent_background: false }),
      ),
      renderContractSha256: sha256(JSON.stringify(promptSpec.sharedLock)),
      outputSha256: candidate.outputSha256,
      byteSize: candidate.bytes.length,
      width: candidate.width,
      height: candidate.height,
      visibility: "private_internal_calibration_only",
      reviewStatus: "awaiting_named_global_art_direction_review",
      publicationStatus: "not_authorized",
      runtimeIntegrationStatus: "not_authorized",
      productControlApproval: false,
    };
  });

  const receipts = {
    schemaVersion: 1,
    kind: "private_internal_calibration_imagegen_observations",
    generatedAt: GENERATED_AT,
    authority: "renderer_provenance_only_not_approval",
    sourcePrompts: repoPath(PROMPTS_PATH),
    policy: {
      privateInternalRenderAuthorized: true,
      publicRuntimeAuthority: false,
      publicationStatus: "not_authorized_pending_named_global_art_direction_review",
      productControlApproval: false,
    },
    observations,
  };

  const assets = observations.map((observation) => {
    const extracted = extractC2paStructural(join(REPO_ROOT, observation.repositoryPath));
    assert.equal(extracted.sha256, observation.outputSha256);
    const created = extracted.c2pa.actionTimes["c2pa.created"];
    const embeddedRfc3161 = extracted.c2pa.embeddedRfc3161Timestamp.iso;
    return {
      jobId: observation.jobId,
      repositoryPath: observation.repositoryPath,
      outputSha256: extracted.sha256,
      ...extracted.c2pa,
      receiptObservation: {
        generatedAtObserved: observation.generatedAtObserved,
        receiptMinusCreatedMs: deltaMilliseconds(observation.generatedAtObserved, created),
        receiptMinusEmbeddedRfc3161Ms: deltaMilliseconds(
          observation.generatedAtObserved,
          embeddedRfc3161,
        ),
        embeddedRfc3161MinusCreatedMs: deltaMilliseconds(embeddedRfc3161, created),
        authority: "observational_only_not_signed_receipt_time",
      },
    };
  });
  assert.equal(new Set(assets.map((asset) => asset.instanceId)).size, assets.length);
  assert.ok(
    assets.every(
      (asset) =>
        asset.generator.name === "ChatGPT" &&
        asset.generator.model === "gpt-image" &&
        asset.generator.digitalSourceType ===
          "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia" &&
        asset.claimGenerator.name === "OpenAI Media Service API" &&
        asset.actions.includes("c2pa.created"),
    ),
    "All calibration assets must retain the observed generator identity",
  );
  const c2pa = {
    schemaVersion: 1,
    kind: "private_internal_calibration_c2pa_structural_provenance",
    generatedAt: GENERATED_AT,
    sourceReceipts: repoPath(RECEIPTS_PATH),
    extraction: {
      method: "offline_structural_png_cabx_jumbf_cbor_decode",
      decoder: "repository_self_contained_fail_closed_cbor_subset",
      decoderSource: "scripts/product-imagery/extract-c2pa-provenance.mjs",
      officialC2paValidatorUsed: false,
      authority: "structural_evidence_not_cryptographic_validation_or_approval",
      limitations: [
        "PNG CRC values were not revalidated by this extractor.",
        "COSE and RFC3161 signatures, certificate chains, revocation, assertion hashes, and asset binding were not cryptographically validated.",
        "A pinned official c2patool remains required for authoritative C2PA validation.",
      ],
    },
    summary: {
      assets: assets.length,
      caBxPresent: assets.length,
      sha256MatchesReceipts: assets.length,
      uniqueInstanceIds: new Set(assets.map((asset) => asset.instanceId)).size,
      generatorName: "ChatGPT",
      generatorModel: "gpt-image",
      claimGenerator: "OpenAI Media Service API",
      digitalSourceType:
        "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia",
      publicOrPublicationApproval: false,
    },
    assets,
  };

  const contactSheet = calibrationContactSheet();
  const manifest = {
    schemaVersion: 1,
    kind: "private_internal_global_art_direction_calibration_rendered",
    generatedAt: GENERATED_AT,
    sourcePrompts: repoPath(PROMPTS_PATH),
    sourcePromptSha256: sha256(promptBytes),
    requiredBeforeBatch1: true,
    privateInternalRenderAuthorized: true,
    calibrationRendered: true,
    calibrationApproved: false,
    publicationAuthorization: false,
    runtimeIntegrationAuthorization: false,
    batch1MassRenderingAuthorization: false,
    reviewStatus: "awaiting_claude_global_art_direction_review",
    sharedDirection: promptSpec.sharedLock,
    count: observations.length,
    assets: observations.map((observation) => ({
      id: observation.jobId,
      sequence: observation.sequence,
      archetype: observation.archetype,
      repositoryPath: observation.repositoryPath,
      src: `/${observation.repositoryPath.replace(/^docs\/product-imagery\//, "")}`,
      outputSha256: observation.outputSha256,
      byteSize: observation.byteSize,
      width: observation.width,
      height: observation.height,
      rendererPromptSha256: observation.rendererPromptSha256,
      visibility: observation.visibility,
      reviewStatus: observation.reviewStatus,
      useInPrivatePrototypeAuthorized: true,
      publicationAuthorization: false,
      runtimeIntegrationAuthorization: false,
      productControlApproval: false,
    })),
    c2paStructuralProvenance: repoPath(C2PA_PATH),
    contactSheetPage: repoPath(CALIBRATION_PAGE_PATH),
    contactSheet,
  };

  mkdirSync(dirname(RECEIPTS_PATH), { recursive: true });
  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  writeFileSync(RECEIPTS_PATH, `${JSON.stringify(receipts, null, 2)}\n`);
  writeFileSync(C2PA_PATH, `${JSON.stringify(c2pa, null, 2)}\n`);
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(CALIBRATION_PAGE_PATH, calibrationPage(manifest));
  writeFileSync(CALIBRATION_CSS_PATH, calibrationCss());
  writeFileSync(CALIBRATION_JS_PATH, calibrationJs());
  assert.ok(existsSync(CALIBRATION_PAGE_PATH));
  return { receipts, c2pa, manifest };
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const result = buildCalibrationEvidence();
  console.log(
    `Calibration evidence: ${result.manifest.count} private renders, ` +
      `${result.c2pa.summary.caBxPresent} caBX manifests, 0 publication approvals.`,
  );
}

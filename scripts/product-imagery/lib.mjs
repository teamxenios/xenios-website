import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

import {
  ARTIFACT_GENERATED_AT,
  ASSET_BYTE_BUDGET,
  ASSET_PIXEL_BUDGET,
  ASSET_TOTAL_BYTE_BUDGET,
  BATCH0_ASSET_MANIFEST_PATH,
  BATCH0_BROWSER_REVIEW_SCREENSHOT_PATH,
  BATCH0_CONTACT_SHEET_PATH,
  BINDING_SOURCE_PATH,
  BATCH0_RENDER_RECEIPTS_PATH,
  CATALOG_RECONCILIATION_SOURCE_PATH,
  CATALOG_SOURCE_PATH,
  CONTRACT_SCHEMA_VERSION,
  COVERAGE_LEDGER_PATH,
  CUSTOMER_EXPOSURE_SOURCE_PATH,
  DOSAGE_FORM_TO_IMAGE_CLASS,
  FALLBACK_ASSETS,
  FALLBACK_ASSET_PROVENANCE,
  FEATURED_IDENTITY_SOURCE_PATH,
  FOUNDER_V3_SPEC_PATH,
  FOUNDER_V3_SPEC_SHA256,
  PNG_DECODED_PIXEL_BUDGET,
  SOURCE_BASE_COMMIT,
  SOURCE_BASE_TREE,
  V3_ACCEPTANCE,
} from "./config.mjs";
import {
  BATCH0_JOBS,
  compileRendererPrompt,
  validateRendererJob,
} from "./batch0-config.mjs";
import {
  buildReviewedCatalogProjection,
  gitBlobOid,
  gitTextBlobOid,
} from "./catalog-v3.mjs";

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const SHIPPING_GROUP_ID = "GRP-0364";
const SYRINGE_GROUP_ID = "GRP-0365";
const PRICE_REQUEST_GROUP_ID = "GRP-0244";
const FORMULATION_HOLD_GROUP_ID = "GRP-0422";
const SUPERSEDED_FORWARD_GROUPS = Object.freeze({
  "GRP-0425": "GRP-0407",
  "GRP-0426": "GRP-0402",
});
const EXTERNALLY_SUPPLIED_STATE_TO_IMAGE_CLASS = Object.freeze({
  care_pathway: "care_pathway_neutral",
  held: "held_neutral",
  quote_only: "quote_only_neutral",
  coming_soon: "coming_soon_offering",
});
const REVIEWED_PRESENTATION_CLASS_OVERRIDES = Object.freeze({
  "GRP-0073": "packaging_unverified",
});
const STATE_FIXTURE_WITNESSES = Object.freeze({
  care_pathway_neutral: "GRP-0002",
  held_neutral: "GRP-0422",
  quote_only_neutral: "GRP-0244",
  coming_soon_offering: null,
});
const FORBIDDEN_APPROVED_ALT =
  /\b(?:certificate\s+of\s+analysis|coa|purity|pharmaceutical[-\s]?grade|clinically?|clinical\s+result|proven|cures?|treats?|diagnoses?|guaranteed|sterile|fda|usp|gmp|lot|expir(?:y|ation)|certif(?:ied|ication)|u\.?s\.?[-\s]?sourc(?:ed|ing)|pharmacy|before\s*(?:and|&|\/)\s*after)\b/i;
const VERIFIED_APPROVED_ASSET_REGISTRIES = new WeakMap();

const PNG_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[value] = crc >>> 0;
  }
  return table;
})();

function readBytes(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath));
}

function readText(relativePath) {
  return readBytes(relativePath).toString("utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

export function sha256Bytes(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function sha256Text(text) {
  return sha256Bytes(Buffer.from(text, "utf8"));
}

export function sha256File(relativePath) {
  return sha256Bytes(readBytes(relativePath));
}

export function sourceDescriptor(relativePath) {
  const bytes = readBytes(relativePath);
  const normalized = Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
  return {
    path: relativePath.replaceAll("\\", "/"),
    sha256: sha256Bytes(normalized),
    sha256Semantics: "lf_normalized_repository_text_bytes",
    gitBlobOid: gitTextBlobOid(normalized),
    gitBlobOidSemantics: "lf_normalized_repository_text_blob",
    byteSize: normalized.length,
  };
}

function countBy(values, keyFor) {
  const counts = {};
  for (const value of values) {
    const key = keyFor(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function extractRuntimeExcludedOfferingIds(source) {
  const ids = Array.from(
    source.matchAll(
      /const\s+SHIPPING_CHARGE_OFFERING_ID_[A-Z0-9_]+\s*=\s*"(mo_[a-f0-9]+)"/g,
    ),
    (match) => match[1],
  );
  if (ids.length !== 1) {
    throw new Error(`Expected one runtime shipping-charge exclusion, found ${ids.length}`);
  }
  return new Set(ids);
}

function pngCrc32(bytes) {
  let crc = 0xffffffff;
  for (const value of bytes) crc = PNG_CRC_TABLE[(crc ^ value) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function inspectPngBytes(bytes, label = "PNG evidence") {
  const content = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const signature = content.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a" || content.length < 45) {
    throw new Error(`${label} is not a valid PNG evidence file`);
  }
  let offset = 8;
  let width = null;
  let height = null;
  let bitDepth = null;
  let colorType = null;
  let chunkIndex = 0;
  let sawIhdr = false;
  let sawPlte = false;
  let sawIdat = false;
  let sawIend = false;
  let idatRunEnded = false;
  const idatChunks = [];
  while (offset < content.length) {
    if (offset + 12 > content.length) throw new Error(`${label} has a truncated PNG chunk`);
    const length = content.readUInt32BE(offset);
    const type = content.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (chunkEnd > content.length) throw new Error(`${label} has a truncated ${type} chunk`);
    const expectedCrc = content.readUInt32BE(dataEnd);
    const actualCrc = pngCrc32(content.subarray(offset + 4, dataEnd));
    if (actualCrc !== expectedCrc) throw new Error(`${label} has an invalid ${type} CRC`);
    if (chunkIndex === 0) {
      if (type !== "IHDR" || length !== 13) throw new Error(`${label} lacks a valid first IHDR`);
      sawIhdr = true;
      width = content.readUInt32BE(dataStart);
      height = content.readUInt32BE(dataStart + 4);
      if (width === 0 || height === 0) throw new Error(`${label} has invalid dimensions`);
      if (width * height > PNG_DECODED_PIXEL_BUDGET) {
        throw new Error(`${label} exceeds the decoded pixel budget`);
      }
      bitDepth = content[dataStart + 8];
      colorType = content[dataStart + 9];
      const compressionMethod = content[dataStart + 10];
      const filterMethod = content[dataStart + 11];
      const interlaceMethod = content[dataStart + 12];
      const allowedBitDepths = {
        0: new Set([1, 2, 4, 8, 16]),
        2: new Set([8, 16]),
        4: new Set([8, 16]),
        6: new Set([8, 16]),
      };
      if (!allowedBitDepths[colorType]?.has(bitDepth)) {
        throw new Error(`${label} has an unsupported PNG color type or bit depth`);
      }
      if (compressionMethod !== 0 || filterMethod !== 0 || interlaceMethod !== 0) {
        throw new Error(`${label} uses unsupported PNG encoding methods`);
      }
    }
    if (type === "IHDR" && (chunkIndex !== 0 || sawIhdr !== true)) {
      throw new Error(`${label} contains a duplicate or misplaced IHDR`);
    }
    if (/^[A-Z]/.test(type) && !["IHDR", "PLTE", "IDAT", "IEND"].includes(type)) {
      throw new Error(`${label} contains unsupported critical PNG chunk ${type}`);
    }
    if (type === "PLTE" && sawIdat) {
      throw new Error(`${label} has a PLTE chunk after image data`);
    }
    if (type === "PLTE") {
      if (sawPlte) throw new Error(`${label} contains duplicate PLTE chunks`);
      if (length === 0 || length > 768 || length % 3 !== 0 || [0, 4].includes(colorType)) {
        throw new Error(`${label} contains an invalid PLTE chunk`);
      }
      sawPlte = true;
    }
    if (type === "IDAT") {
      if (idatRunEnded) throw new Error(`${label} has non-consecutive IDAT chunks`);
      sawIdat = true;
      idatChunks.push(content.subarray(dataStart, dataEnd));
    } else if (sawIdat && type !== "IEND") {
      idatRunEnded = true;
    }
    if (type === "IEND") {
      if (length !== 0) throw new Error(`${label} has an invalid IEND`);
      sawIend = true;
      offset = chunkEnd;
      break;
    }
    offset = chunkEnd;
    chunkIndex += 1;
  }
  if (!sawIdat || !sawIend || offset !== content.length) {
    throw new Error(`${label} is missing IDAT/IEND or has trailing bytes`);
  }
  const channelCount = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  const scanlineByteSize = Math.ceil((width * channelCount * bitDepth) / 8);
  const expectedInflatedSize = height * (scanlineByteSize + 1);
  let inflated;
  try {
    inflated = zlib.inflateSync(Buffer.concat(idatChunks), {
      maxOutputLength: expectedInflatedSize + 1,
    });
  } catch {
    throw new Error(`${label} has an invalid PNG compressed image stream`);
  }
  if (inflated.length !== expectedInflatedSize) {
    throw new Error(`${label} has an invalid PNG decompressed image size`);
  }
  for (let row = 0; row < height; row += 1) {
    const filterType = inflated[row * (scanlineByteSize + 1)];
    if (filterType > 4) throw new Error(`${label} has an invalid PNG scanline filter`);
  }
  return {
    format: "PNG",
    width,
    height,
    bitDepth,
    colorType,
    byteSize: content.length,
    sha256: sha256Bytes(content),
    gitBlobOid: gitBlobOid(content),
  };
}

function inspectPng(relativePath) {
  return inspectPngBytes(readBytes(relativePath), relativePath);
}

function buildQuarantineManifest() {
  const assets = FALLBACK_ASSETS.map((asset) => {
    const absolute = path.join(REPO_ROOT, asset.filePath);
    if (!fs.existsSync(absolute)) throw new Error(`Missing quarantined asset ${asset.filePath}`);
    const bytes = fs.readFileSync(absolute);
    const actualSha256 = sha256Bytes(bytes);
    if (actualSha256 !== asset.sha256 || bytes.length !== asset.byteSize) {
      throw new Error(`Quarantined asset bytes drifted for ${asset.assetId}`);
    }
    return {
      assetId: asset.assetId,
      disposition: "permanently_nonapprovable_pre_v3_evidence",
      reviewStatus: "rejected_requires_v3_rerender",
      runtimeWiringEligibility: "blocked",
      deploymentEligibility: "blocked",
      publicPath: null,
      removedPublicPath: `/research/products/fallbacks/${path.basename(asset.filePath)}`,
      repositoryPath: asset.filePath,
      sha256: actualSha256,
      gitBlobOid: gitBlobOid(bytes),
      byteSize: bytes.length,
      width: asset.width,
      height: asset.height,
      legacyTaxonomyKey: asset.taxonomyKey,
      legacyPromptSha256: sha256Text(asset.prompt),
      sourceArtifact: FALLBACK_ASSET_PROVENANCE[asset.assetId].sourceArtifact,
    };
  });
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    generatedAt: ARTIFACT_GENERATED_AT,
    kind: "pre_v3_nonapprovable_quarantine_manifest",
    publicRuntimeAuthority: false,
    counts: {
      quarantined: assets.length,
      public: assets.filter((asset) => asset.publicPath !== null).length,
      approvable: assets.filter((asset) => asset.deploymentEligibility !== "blocked").length,
    },
    priorPublicDirectory: "client/public/research/products/fallbacks",
    quarantineDirectory: "docs/product-imagery/evidence/pre-v3-nonapprovable",
    assets,
  };
}

function buildBatch0AssetManifest() {
  const receiptsAbsolute = path.join(REPO_ROOT, BATCH0_RENDER_RECEIPTS_PATH);
  const hasReceiptSource = fs.existsSync(receiptsAbsolute);
  const receiptSource = hasReceiptSource
    ? JSON.parse(fs.readFileSync(receiptsAbsolute, "utf8"))
    : { observations: [] };
  if (
    hasReceiptSource &&
    (receiptSource.schemaVersion !== 1 ||
      receiptSource.kind !== "batch0_imagegen_observations" ||
      receiptSource.authority !== "renderer_provenance_only_not_approval" ||
      receiptSource.policy?.immutableOutputAddressing !== "sha256" ||
      receiptSource.policy?.publicRuntimeAuthority !== false ||
      receiptSource.policy?.publicationStatus !==
        "not_authorized_pending_independent_review" ||
      typeof receiptSource.generatedAt !== "string" ||
      Number.isNaN(Date.parse(receiptSource.generatedAt)))
  ) {
    throw new Error("Renderer receipt source header is invalid");
  }
  if (!Array.isArray(receiptSource.observations)) {
    throw new Error("Renderer receipt source must contain an observations array");
  }
  const knownJobIds = new Set(BATCH0_JOBS.map((job) => job.jobId));
  const receiptByJob = new Map();
  for (const observation of receiptSource.observations) {
    if (!knownJobIds.has(observation.jobId)) {
      throw new Error(`Unknown renderer receipt job ${observation.jobId}`);
    }
    if (receiptByJob.has(observation.jobId)) {
      throw new Error(`Duplicate renderer receipt job ${observation.jobId}`);
    }
    receiptByJob.set(observation.jobId, observation);
  }
  if (hasReceiptSource) {
    const missingReceiptJobs = BATCH0_JOBS.filter((job) => !receiptByJob.has(job.jobId));
    if (missingReceiptJobs.length > 0) {
      throw new Error(
        `Renderer receipt source is missing jobs: ${missingReceiptJobs.map((job) => job.jobId).join(", ")}`,
      );
    }
  }
  const assets = BATCH0_JOBS.map((job) => {
    validateRendererJob(job);
    const prompt = compileRendererPrompt(job);
    const promptSha256 = sha256Text(prompt);
    const rendererPayloadSha256 = sha256Text(JSON.stringify(job.rendererPayload));
    const renderContractSha256 = sha256Text(
      [FOUNDER_V3_SPEC_SHA256, promptSha256, rendererPayloadSha256].join("\u0000"),
    );
    const observation = receiptByJob.get(job.jobId) ?? null;
    let repositoryPath = job.evidenceTarget.repositoryPath;
    if (observation) {
      const immutablePath =
        `docs/product-imagery/evidence/batch0-render-candidates/${job.jobId}` +
        `-sha256-${observation.outputSha256?.slice(0, 12)}.png`;
      if (
        observation.repositoryPath !== immutablePath ||
        observation.provider !== "OpenAI" ||
        observation.interface !== "built_in_imagegen" ||
        observation.model !== "not_exposed_by_tool" ||
        observation.requestId !== "not_exposed_by_tool" ||
        typeof observation.sourceImageId !== "string" ||
        !/^exec-[a-f0-9-]+\.png$/.test(observation.sourceImageId) ||
        typeof observation.generatedAtObserved !== "string" ||
        Number.isNaN(Date.parse(observation.generatedAtObserved)) ||
        observation.founderSpecSha256 !== FOUNDER_V3_SPEC_SHA256 ||
        observation.rendererPromptSha256 !== promptSha256 ||
        observation.rendererPayloadSha256 !== rendererPayloadSha256 ||
        observation.renderContractSha256 !== renderContractSha256 ||
        typeof observation.outputSha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(observation.outputSha256) ||
        !Number.isInteger(observation.byteSize) ||
        observation.byteSize <= 0 ||
        observation.illustrativeOnly !== true ||
        observation.publicationStatus !== "not_authorized_pending_independent_review"
      ) {
        throw new Error(`Invalid renderer receipt observation for ${job.jobId}`);
      }
      repositoryPath = observation.repositoryPath;
    }
    const exists = fs.existsSync(path.join(REPO_ROOT, repositoryPath));
    const source = exists ? inspectPng(repositoryPath) : null;
    if (observation) {
      if (!source) throw new Error(`Renderer receipt output is missing for ${job.jobId}`);
      if (
        source.sha256 !== observation.outputSha256 ||
        source.byteSize !== observation.byteSize
      ) {
        throw new Error(`Renderer receipt output bytes drifted for ${job.jobId}`);
      }
    }
    const receiptRecord = source && observation
      ? {
          jobId: job.jobId,
          repositoryPath,
          provider: observation.provider,
          interface: observation.interface,
          model: observation.model,
          requestId: observation.requestId,
          sourceImageId: observation.sourceImageId,
          generatedAtObserved: observation.generatedAtObserved,
          founderSpecSha256: observation.founderSpecSha256,
          rendererPromptSha256: observation.rendererPromptSha256,
          rendererPayloadSha256: observation.rendererPayloadSha256,
          renderContractSha256: observation.renderContractSha256,
          outputSha256: observation.outputSha256,
          byteSize: observation.byteSize,
          illustrativeOnly: observation.illustrativeOnly,
          publicationStatus: observation.publicationStatus,
        }
      : null;
    return {
      jobId: job.jobId,
      imageClass: job.imageClass,
      visibility: "non_public_review_evidence",
      reviewStatus: source
        ? receiptRecord
          ? "awaiting_independent_named_approval"
          : "rendered_missing_renderer_receipt_nonapprovable"
        : "render_pending",
      publicPath: null,
      repositoryPath,
      stagingRepositoryPath: job.evidenceTarget.repositoryPath,
      renderer: receiptRecord
        ? {
            provider: receiptRecord.provider,
            interface: receiptRecord.interface,
            model: receiptRecord.model,
            requestId: receiptRecord.requestId,
            sourceImageId: receiptRecord.sourceImageId,
            generatedAtObserved: receiptRecord.generatedAtObserved,
          }
        : null,
      promptSha256,
      rendererPayloadSha256,
      renderContractSha256,
      receipt: receiptRecord,
      receiptSha256: receiptRecord ? sha256Text(JSON.stringify(receiptRecord)) : null,
      source,
      approval: {
        namedApprover: null,
        approvedAt: null,
        approvalRecord: null,
      },
    };
  });
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    generatedAt: ARTIFACT_GENERATED_AT,
    kind: "batch_000_v3_non_public_asset_manifest",
    publicRuntimeAuthority: false,
    promotionRule:
      "A derivative may enter client/public only after an independent named reviewer approves the exact source SHA-256 and the derivative is separately hashed.",
    receiptSource: hasReceiptSource ? sourceDescriptor(BATCH0_RENDER_RECEIPTS_PATH) : null,
    counts: {
      jobs: assets.length,
      rendered: assets.filter((asset) => asset.source !== null).length,
      attributed: assets.filter((asset) => asset.receipt !== null).length,
      renderedMissingReceipt: assets.filter(
        (asset) => asset.source !== null && asset.receipt === null,
      ).length,
      pending: assets.filter((asset) => asset.source === null).length,
      approved: assets.filter((asset) => asset.approval.namedApprover !== null).length,
      public: assets.filter((asset) => asset.publicPath !== null).length,
    },
    assets,
  };
}

export function validateBatch0FixtureJoin(reviewedProjection, jobs = BATCH0_JOBS) {
  const rowByGroupId = new Map(reviewedProjection.rows.map((row) => [row.groupId, row]));
  const stateOnlyClasses = new Set([
    "care_pathway_neutral",
    "held_neutral",
    "quote_only_neutral",
    "coming_soon_offering",
  ]);
  const identityTerms = sortedUnique(
    reviewedProjection.rows.flatMap((row) => [row.product, row.specification]),
  ).filter((term) => term.length >= 5);

  for (const job of jobs) {
    const fixture = job.fixture;
    if (Object.hasOwn(STATE_FIXTURE_WITNESSES, job.imageClass)) {
      const expectedGroupId = STATE_FIXTURE_WITNESSES[job.imageClass];
      if (fixture.groupId !== expectedGroupId) {
        throw new Error(
          `${job.jobId} must use state witness ${expectedGroupId ?? "class-only"}`,
        );
      }
    }
    if (new Set(fixture.qaGroupIds).size !== fixture.qaGroupIds.length) {
      throw new Error(`${job.jobId} repeats a QA group ID`);
    }
    for (const qaGroupId of fixture.qaGroupIds) {
      if (!rowByGroupId.has(qaGroupId)) {
        throw new Error(`${job.jobId} names absent QA group ${qaGroupId}`);
      }
    }
    const rendererText = JSON.stringify({
      payload: job.rendererPayload,
      prompt: compileRendererPrompt(job),
    }).toLowerCase();
    for (const identityTerm of identityTerms) {
      if (rendererText.includes(identityTerm.toLowerCase())) {
        throw new Error(`${job.jobId} renderer input leaked catalog identity ${identityTerm}`);
      }
    }
    if (fixture.groupId === null) continue;
    const row = rowByGroupId.get(fixture.groupId);
    if (!row) throw new Error(`${job.jobId} names absent fixture group ${fixture.groupId}`);
    if (row.offeringVariantId !== fixture.movId) {
      throw new Error(
        `${job.jobId} fixture identity mismatch: ${fixture.groupId}/${fixture.movId}`,
      );
    }
    if (!stateOnlyClasses.has(job.imageClass)) {
      const expectedClass =
        REVIEWED_PRESENTATION_CLASS_OVERRIDES[row.groupId] ??
        DOSAGE_FORM_TO_IMAGE_CLASS.get(row.dosageForm);
      if (expectedClass !== job.imageClass) {
        throw new Error(
          `${job.jobId} fixture class mismatch: ${fixture.groupId} maps to ${expectedClass}`,
        );
      }
    }
  }
  return true;
}

function buildRendererPacket() {
  const rendererJobs = [];
  const provenanceRecords = [];
  for (const job of BATCH0_JOBS) {
    validateRendererJob(job);
    const rendererPrompt = compileRendererPrompt(job);
    const rendererPromptSha256 = sha256Text(rendererPrompt);
    const rendererPayloadSha256 = sha256Text(JSON.stringify(job.rendererPayload));
    const renderContractSha256 = sha256Text(
      [FOUNDER_V3_SPEC_SHA256, rendererPromptSha256, rendererPayloadSha256].join("\u0000"),
    );
    rendererJobs.push({
      jobId: job.jobId,
      batch: job.batch,
      imageClass: job.imageClass,
      evidenceTarget: job.evidenceTarget,
      rendererPayload: job.rendererPayload,
      rendererPrompt,
      rendererPromptSha256,
      rendererPayloadSha256,
      renderContractSha256,
    });
    provenanceRecords.push({
      jobId: job.jobId,
      fixture: job.fixture,
      boundary: "excluded_from_renderer_payload_and_compiled_prompt",
      rendererPromptSha256,
      rendererPayloadSha256,
      renderContractSha256,
    });
  }
  const rendererJobSetSha256 = sha256Text(
    JSON.stringify(
      rendererJobs.map((job) => ({
        jobId: job.jobId,
        rendererPromptSha256: job.rendererPromptSha256,
        rendererPayloadSha256: job.rendererPayloadSha256,
        renderContractSha256: job.renderContractSha256,
      })),
    ),
  );
  const rendererPacket = {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    generatedAt: ARTIFACT_GENERATED_AT,
    kind: "v3_batch_000_request_only_renderer_packet",
    founderSpec: sourceDescriptor(FOUNDER_V3_SPEC_PATH),
    rendererJobSetSha256,
    policy: {
      rendererPayloadContainsCanonicalIdentity: false,
      visibleText: "none",
      labels: "none",
      trademarks: "none",
      claims: "none",
      use: "non_public_review_evidence_only",
    },
    counts: {
      rendererJobs: rendererJobs.length,
      namedProductPrompts: 0,
    },
    rendererJobs,
  };
  return {
    rendererPacket,
    batch0Provenance: {
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      generatedAt: ARTIFACT_GENERATED_AT,
      kind: "v3_batch_000_fixture_provenance_not_renderer_input",
      rendererPacketPath: "docs/product-imagery/manifests/renderer-packet-v3.json",
      rendererPacketSemanticSha256: sha256Text(JSON.stringify(rendererPacket)),
      rendererJobSetSha256,
      warning: "Do not send this provenance artifact to the renderer.",
      counts: { provenanceRecords: provenanceRecords.length },
      provenanceRecords,
    },
  };
}

function buildRenderQueue(batch0AssetManifest) {
  const assetByJob = new Map(batch0AssetManifest.assets.map((asset) => [asset.jobId, asset]));
  const items = BATCH0_JOBS.map((job, index) => {
    const asset = assetByJob.get(job.jobId);
    return {
      sequence: index + 1,
      jobId: job.jobId,
      imageClass: job.imageClass,
      stagingTarget: job.evidenceTarget.repositoryPath,
      evidenceRepositoryPath: asset.repositoryPath,
      queueStatus: asset.source ? "rendered_awaiting_review" : "ready_to_render",
      mayPublish: false,
    };
  });
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    generatedAt: ARTIFACT_GENERATED_AT,
    kind: "v3_sanitized_render_queue",
    exactNamedVariantQueueRemoved: true,
    counts: {
      batches: 1,
      items: items.length,
      readyToRender: items.filter((item) => item.queueStatus === "ready_to_render").length,
      renderedAwaitingReview: items.filter(
        (item) => item.queueStatus === "rendered_awaiting_review",
      ).length,
      publishable: 0,
    },
    batches: [
      {
        batchId: "batch-000-v3-class-taxonomy",
        purpose: "prove the renderer-neutral visual grammar before exact-product expansion",
        items,
      },
    ],
  };
}

function buildCoverageLedger(reviewedProjection, batch0AssetManifest) {
  const candidateByClass = new Map(
    batch0AssetManifest.assets.map((asset) => [asset.imageClass, asset]),
  );
  const rows = reviewedProjection.rows.map((row) => {
    const imageClass =
      REVIEWED_PRESENTATION_CLASS_OVERRIDES[row.groupId] ??
      DOSAGE_FORM_TO_IMAGE_CLASS.get(row.dosageForm);
    if (!imageClass) throw new Error(`No presentation image class for ${row.dosageForm}`);
    const candidate = candidateByClass.get(imageClass);
    if (!candidate) throw new Error(`No Batch 0 candidate for image class ${imageClass}`);
    return {
      manifestKey: row.offeringVariantId,
      groupId: row.groupId,
      offeringId: row.offeringId,
      offeringVariantId: row.offeringVariantId,
      family: row.family,
      category: row.category,
      product: row.product,
      specification: row.specification,
      dosageForm: row.dosageForm,
      sourceGroupIds: row.sourceGroupIds,
      imageClass,
      exactAsset: null,
      classCandidate: {
        jobId: candidate.jobId,
        repositoryPath: candidate.repositoryPath,
        reviewStatus: candidate.reviewStatus,
        publicPath: null,
      },
      coverageStatus: candidate.source
        ? "non_public_class_candidate_rendered"
        : "non_public_class_candidate_pending",
    };
  });
  const rowKeys = new Set(rows.map((row) => row.manifestKey));
  if (rowKeys.size !== rows.length) throw new Error("Coverage manifest keys are not unique");
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    generatedAt: ARTIFACT_GENERATED_AT,
    kind: "v3_reviewed_catalog_image_coverage",
    runtimeCatalogAuthority: false,
    businessStateAuthority: false,
    forbiddenOwnedFields: [
      "displayState",
      "workflowMode",
      "action",
      "price",
      "priceCents",
      "cartEligible",
      "sellable",
      "inventory",
      "formulationHold",
    ],
    sources: reviewedProjection.sources,
    invariants: {
      reviewedSourceRows: reviewedProjection.sourceRowCount,
      canonicalRows: rows.length,
      supersededSourceRows: reviewedProjection.sourceRowCount - rows.length,
      exactAssetsApproved: 0,
      publicAssetsWired: 0,
      rowsWithBusinessStateFields: 0,
      rowsWithPriceFields: 0,
    },
    byImageClass: countBy(rows, (row) => row.imageClass),
    rows,
  };
}

function buildIdentityCrosswalk(reviewedProjection, coverageLedger) {
  const bindingSource = readJson(BINDING_SOURCE_PATH);
  const featuredSource = readJson(FEATURED_IDENTITY_SOURCE_PATH);
  const directByVariant = new Map(
    bindingSource.bindings.map((binding) => [binding.offeringVariantId, binding]),
  );
  const bindingBySku = new Map(
    bindingSource.bindings.map((binding) => [binding.productControlSku, binding]),
  );
  const aliasesByCanonicalVariant = new Map();
  for (const alias of featuredSource.aliases) {
    const values = aliasesByCanonicalVariant.get(alias.canonicalVariantId) ?? [];
    values.push(alias);
    aliasesByCanonicalVariant.set(alias.canonicalVariantId, values);
  }
  const coverageByKey = new Map(coverageLedger.rows.map((row) => [row.manifestKey, row]));

  const entries = reviewedProjection.rows.map((row) => {
    const direct = directByVariant.get(row.offeringVariantId) ?? null;
    const supersededGroupIds = row.sourceGroupIds.filter(
      (sourceGroupId) => sourceGroupId !== row.groupId,
    );
    const featuredAliases = (aliasesByCanonicalVariant.get(row.offeringVariantId) ?? []).map(
      (alias) => ({
        productId: alias.liveProductId,
        variantId: alias.liveVariantId,
        productSku: alias.liveProductSku,
        variantSku: alias.liveVariantSku,
        evidenceAction: alias.action,
      }),
    );
    const historicalForwardAliases = supersededGroupIds.map((sourceGroupId) => {
      const forwardBinding = bindingBySku.get(`GEN-${sourceGroupId}`) ?? null;
      if (!forwardBinding) {
        throw new Error(`Missing historical Product Control binding for ${sourceGroupId}`);
      }
      return {
        sourceGroupId,
        offeringId: forwardBinding.offeringId,
        offeringVariantId: forwardBinding.offeringVariantId,
        productControlSku: forwardBinding.productControlSku,
        productControlProductId: forwardBinding.productId,
        productControlVariantId: forwardBinding.variantId,
        disposition: "forward_only_to_reviewed_kept_identity",
      };
    });
    return {
      manifestKey: row.offeringVariantId,
      canonical: {
        groupId: row.groupId,
        offeringId: row.offeringId,
        offeringVariantId: row.offeringVariantId,
        targetProductControlSku: `GEN-${row.groupId}`,
        sourceGroupIds: row.sourceGroupIds,
      },
      currentProductControlBinding: direct
        ? {
            status: "exact_current_binding",
            productControlSku: direct.productControlSku,
            productId: direct.productId,
            variantId: direct.variantId,
          }
        : {
            status: "target_binding_not_materialized",
            productControlSku: `GEN-${row.groupId}`,
            productId: null,
            variantId: null,
          },
      aliases: {
        historicalForwardAliases,
        legacyFeaturedAliases: featuredAliases,
      },
      resolvedCandidate: coverageByKey.get(row.offeringVariantId).classCandidate,
    };
  });

  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    generatedAt: ARTIFACT_GENERATED_AT,
    kind: "v3_product_image_identity_crosswalk",
    runtimeCatalogAuthority: false,
    sources: {
      bindings: sourceDescriptor(BINDING_SOURCE_PATH),
      legacyFeaturedIdentityClosure: sourceDescriptor(FEATURED_IDENTITY_SOURCE_PATH),
    },
    invariants: {
      canonicalEntries: entries.length,
      exactCurrentBindings: entries.filter(
        (entry) => entry.currentProductControlBinding.status === "exact_current_binding",
      ).length,
      targetBindingsNotMaterialized: entries.filter(
        (entry) => entry.currentProductControlBinding.status === "target_binding_not_materialized",
      ).length,
      historicalForwardAliases: entries.reduce(
        (sum, entry) => sum + entry.aliases.historicalForwardAliases.length,
        0,
      ),
      legacyFeaturedAliases: entries.reduce(
        (sum, entry) => sum + entry.aliases.legacyFeaturedAliases.length,
        0,
      ),
      supersededManifestOwners: entries.filter((entry) =>
        ["GRP-0402", "GRP-0407"].includes(entry.canonical.groupId),
      ).length,
    },
    entries,
  };
}

function buildStateAuthorityAudit(reviewedProjection) {
  const currentCatalog = readJson(CATALOG_SOURCE_PATH);
  const currentBindings = readJson(BINDING_SOURCE_PATH);
  const reconciliation = readJson(CATALOG_RECONCILIATION_SOURCE_PATH);
  const serviceSource = readText(CUSTOMER_EXPOSURE_SOURCE_PATH);
  const excludedOfferingIds = extractRuntimeExcludedOfferingIds(serviceSource);
  const currentRows = currentCatalog.products.flatMap((product) =>
    product.variants.map((variant) => ({ ...variant, product })),
  );
  const currentExposed = currentRows.filter(
    (row) => !excludedOfferingIds.has(row.product.id),
  );
  const reviewedTargetExposed = reviewedProjection.rows.filter(
    (row) => row.groupId !== SHIPPING_GROUP_ID,
  );
  const targetChannelCounts = countBy(reviewedProjection.rows, (row) => row.channel);
  const currentDisplayStateCounts = countBy(currentRows, (row) => row.product.displayState);
  const structuredHoldGroups = reconciliation.commerceHolds.map((hold) => hold.sourceRow);
  const currentVariantIds = new Set(currentRows.map((row) => row.id));
  const exactCurrentIdentityRows = reviewedProjection.rows.filter((row) =>
    currentVariantIds.has(row.offeringVariantId),
  );
  const reviewedReplacementRows = reviewedProjection.rows.filter((row) =>
    Object.hasOwn(SUPERSEDED_FORWARD_GROUPS, row.groupId),
  );
  const genuineNewRows = reviewedProjection.rows.filter(
    (row) =>
      !currentVariantIds.has(row.offeringVariantId) &&
      !Object.hasOwn(SUPERSEDED_FORWARD_GROUPS, row.groupId),
  );

  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    generatedAt: ARTIFACT_GENERATED_AT,
    kind: "catalog_state_observation_not_image_authority",
    authority: {
      imageSystemOwnsBusinessState: false,
      imageSystemOwnsPrice: false,
      imageSystemOwnsWorkflowOrAction: false,
      rule:
        "Runtime commerce and Product Control supply state. Imagery may select a presentation for an externally supplied state but may not derive, persist, or override that state.",
    },
    sources: {
      currentlyMountedCatalog: sourceDescriptor(CATALOG_SOURCE_PATH),
      currentlyMountedBindings: sourceDescriptor(BINDING_SOURCE_PATH),
      currentExposureCode: sourceDescriptor(CUSTOMER_EXPOSURE_SOURCE_PATH),
      reviewedCatalog: reviewedProjection.sources.catalogCsv,
      reviewedReconciliation: sourceDescriptor(CATALOG_RECONCILIATION_SOURCE_PATH),
    },
    currentlyMounted: {
      status: "materialized_runtime_truth",
      canonicalRows: currentRows.length,
      exposedRows: currentExposed.length,
      bindingRows: currentBindings.bindings.length,
      unboundRows: currentBindings.unboundCount,
      displayStateCounts: currentDisplayStateCounts,
      commerceWorkflowCounts: {
        provider_request: 242,
        direct_order_request: 131,
        request_activation: 44,
        availability_review: 1,
        request_pricing: 1,
      },
      careRows: 242,
      structuredFormulationHoldRowsRepresented: 0,
      priceOnRequestRows: 2,
      catalogComingSoonRows: 0,
      excludedShippingGroupIds: [SHIPPING_GROUP_ID],
    },
    reviewedTarget: {
      status: "reviewed_source_truth_not_yet_materialized",
      canonicalRows: reviewedProjection.canonicalRowCount,
      exposedRows: reviewedTargetExposed.length,
      exactCurrentIdentityRows: exactCurrentIdentityRows.length,
      reviewedIdentityReplacementRows: reviewedReplacementRows.length,
      reviewedIdentityReplacementGroupIds: reviewedReplacementRows.map((row) => row.groupId),
      genuineNewIdentityRows: genuineNewRows.length,
      genuineNewIdentityGroupIds: genuineNewRows.map((row) => row.groupId),
      currentProductControlResolvableAfterForwardAliases: 417,
      currentExposedUnboundAfterForwardAliases: 6,
      expectedBindingRowsAfterRegeneration: 421,
      expectedUnboundRowsAfterRegeneration: 3,
      sourceChannelCounts: targetChannelCounts,
      commerceWorkflowCountsAfterRegenerationAndPriceBinding: {
        provider_request: 242,
        direct_order_request: 136,
        request_activation: 42,
        availability_review: 2,
        request_pricing: 1,
      },
      careRows: 242,
      structuredFormulationHoldRows: structuredHoldGroups.length,
      structuredFormulationHoldGroupIds: structuredHoldGroups,
      priceOnRequestRows: 2,
      priceOnRequestGroupIds: [PRICE_REQUEST_GROUP_ID, SYRINGE_GROUP_ID],
      catalogComingSoonRows: 0,
      separateComingSoonOffersIntended: 2,
      separateComingSoonOfferNames: ["Superpower", "Mito Health"],
      excludedShippingGroupIds: [SHIPPING_GROUP_ID],
    },
    materializationGap: {
      catalogRows: reviewedProjection.canonicalRowCount - currentRows.length,
      exposedRows: reviewedTargetExposed.length - currentExposed.length,
      targetMaterialized: false,
      blocksRuntimeImageWiring: true,
    },
  };
}

function indexAdd(index, key, manifestKey) {
  if (key === null || key === undefined || key === "") return;
  const normalized = String(key);
  const values = index.get(normalized) ?? new Set();
  values.add(manifestKey);
  index.set(normalized, values);
}

function buildIdentityIndexes(identityCrosswalk) {
  const indexes = {
    groupId: new Map(),
    offeringId: new Map(),
    offeringVariantId: new Map(),
    productControlSku: new Map(),
    productControlProductId: new Map(),
    productControlVariantId: new Map(),
    legacyProductId: new Map(),
    legacyVariantId: new Map(),
    legacyProductSku: new Map(),
    legacyVariantSku: new Map(),
  };
  for (const entry of identityCrosswalk.entries) {
    const key = entry.manifestKey;
    indexAdd(indexes.groupId, entry.canonical.groupId, key);
    indexAdd(indexes.offeringId, entry.canonical.offeringId, key);
    indexAdd(indexes.offeringVariantId, entry.canonical.offeringVariantId, key);
    indexAdd(indexes.productControlSku, entry.canonical.targetProductControlSku, key);
    const binding = entry.currentProductControlBinding;
    indexAdd(indexes.productControlSku, binding.productControlSku, key);
    indexAdd(indexes.productControlProductId, binding.productId, key);
    indexAdd(indexes.productControlVariantId, binding.variantId, key);
    for (const alias of entry.aliases.historicalForwardAliases) {
      indexAdd(indexes.groupId, alias.sourceGroupId, key);
      indexAdd(indexes.offeringId, alias.offeringId, key);
      indexAdd(indexes.offeringVariantId, alias.offeringVariantId, key);
      indexAdd(indexes.productControlSku, alias.productControlSku, key);
      indexAdd(indexes.productControlProductId, alias.productControlProductId, key);
      indexAdd(indexes.productControlVariantId, alias.productControlVariantId, key);
    }
    for (const alias of entry.aliases.legacyFeaturedAliases) {
      indexAdd(indexes.legacyProductId, alias.productId, key);
      indexAdd(indexes.legacyVariantId, alias.variantId, key);
      indexAdd(indexes.legacyProductSku, alias.productSku, key);
      indexAdd(indexes.legacyVariantSku, alias.variantSku, key);
    }
  }
  return indexes;
}

export function resolveCrosswalkManifestKey(identityCrosswalk, identity = {}) {
  const indexes = buildIdentityIndexes(identityCrosswalk);
  const signals = [];
  for (const [field, index] of Object.entries(indexes)) {
    const value = identity[field];
    if (value === null || value === undefined || value === "") continue;
    const matches = index.get(String(value));
    if (!matches || matches.size === 0) return null;
    signals.push(matches);
  }
  if (signals.length === 0) return null;
  let candidates = new Set(signals[0]);
  for (const signal of signals.slice(1)) {
    candidates = new Set([...candidates].filter((value) => signal.has(value)));
  }
  return candidates.size === 1 ? [...candidates][0] : null;
}

export function assertIdentityCrosswalkConsistency(identityCrosswalk, coverageLedger) {
  const coverageByKey = new Map(coverageLedger.rows.map((row) => [row.manifestKey, row]));
  const coverageKeys = new Set(coverageByKey.keys());
  if (identityCrosswalk.entries.length !== coverageKeys.size) {
    throw new Error("Identity crosswalk and coverage cardinalities differ");
  }
  const entryKeys = new Set(identityCrosswalk.entries.map((entry) => entry.manifestKey));
  if (entryKeys.size !== identityCrosswalk.entries.length) {
    throw new Error("Identity crosswalk manifest keys are not unique");
  }
  const assertSignalsResolve = (entry, label, signals, uniqueFields = Object.keys(signals)) => {
    const populatedSignals = Object.entries(signals).filter(
      ([, value]) => value !== null && value !== undefined && value !== "",
    );
    if (populatedSignals.length === 0) return;
    for (const [field, value] of populatedSignals.filter(([field]) => uniqueFields.includes(field))) {
      if (resolveCrosswalkManifestKey(identityCrosswalk, { [field]: value }) !== entry.manifestKey) {
        throw new Error(`${label} ${field} does not resolve uniquely to ${entry.manifestKey}`);
      }
    }
    if (
      resolveCrosswalkManifestKey(identityCrosswalk, Object.fromEntries(populatedSignals)) !==
      entry.manifestKey
    ) {
      throw new Error(`${label} tuple does not converge for ${entry.manifestKey}`);
    }
  };
  for (const entry of identityCrosswalk.entries) {
    const coverage = coverageByKey.get(entry.manifestKey);
    if (!coverage) {
      throw new Error(`Crosswalk entry ${entry.manifestKey} has no coverage row`);
    }
    if (
      entry.manifestKey !== entry.canonical.offeringVariantId ||
      entry.canonical.groupId !== coverage.groupId ||
      entry.canonical.offeringId !== coverage.offeringId ||
      entry.canonical.offeringVariantId !== coverage.offeringVariantId ||
      entry.canonical.targetProductControlSku !== `GEN-${coverage.groupId}` ||
      JSON.stringify(entry.canonical.sourceGroupIds) !== JSON.stringify(coverage.sourceGroupIds)
    ) {
      throw new Error(`Canonical identity drifted from coverage for ${entry.manifestKey}`);
    }
    if (JSON.stringify(entry.resolvedCandidate) !== JSON.stringify(coverage.classCandidate)) {
      throw new Error(`Resolved candidate drifted from coverage for ${entry.manifestKey}`);
    }
    const uniqueSourceGroupIds = new Set(entry.canonical.sourceGroupIds);
    if (
      uniqueSourceGroupIds.size !== entry.canonical.sourceGroupIds.length ||
      !uniqueSourceGroupIds.has(entry.canonical.groupId)
    ) {
      throw new Error(`Canonical source groups are invalid for ${entry.manifestKey}`);
    }
    assertSignalsResolve(entry, "Canonical identity", {
      groupId: entry.canonical.groupId,
      offeringId: entry.canonical.offeringId,
      offeringVariantId: entry.canonical.offeringVariantId,
    });
    assertSignalsResolve(entry, "Product Control identity", {
      productControlSku: entry.currentProductControlBinding.productControlSku,
      productControlProductId: entry.currentProductControlBinding.productId,
      productControlVariantId: entry.currentProductControlBinding.variantId,
    }, ["productControlSku", "productControlVariantId"]);
    const historicalSourceGroups = entry.canonical.sourceGroupIds.filter(
      (sourceGroupId) => sourceGroupId !== entry.canonical.groupId,
    );
    if (
      entry.aliases.historicalForwardAliases.length !== historicalSourceGroups.length ||
      entry.aliases.historicalForwardAliases.some(
        (alias) =>
          !historicalSourceGroups.includes(alias.sourceGroupId) ||
          alias.disposition !== "forward_only_to_reviewed_kept_identity",
      )
    ) {
      throw new Error(`Historical alias ownership drifted for ${entry.manifestKey}`);
    }
    for (const alias of entry.aliases.historicalForwardAliases) {
      assertSignalsResolve(entry, `Historical alias ${alias.sourceGroupId}`, {
        groupId: alias.sourceGroupId,
        offeringId: alias.offeringId,
        offeringVariantId: alias.offeringVariantId,
        productControlSku: alias.productControlSku,
        productControlProductId: alias.productControlProductId,
        productControlVariantId: alias.productControlVariantId,
      }, [
        "groupId",
        "offeringId",
        "offeringVariantId",
        "productControlSku",
        "productControlVariantId",
      ]);
    }
    for (const alias of entry.aliases.legacyFeaturedAliases) {
      assertSignalsResolve(entry, "Legacy featured alias", {
        legacyProductId: alias.productId,
        legacyVariantId: alias.variantId,
        legacyProductSku: alias.productSku,
        legacyVariantSku: alias.variantSku,
      }, ["legacyVariantId", "legacyVariantSku"]);
    }
  }
  return true;
}

function isApprovedPublicAsset(asset) {
  if (!asset || asset.reviewStatus !== "approved") return false;
  if (typeof asset.assetId !== "string" || !asset.assetId) return false;
  if (typeof asset.alt !== "string" || !asset.alt.trim()) return false;
  if (asset.alt.includes("\u2014") || FORBIDDEN_APPROVED_ALT.test(asset.alt)) return false;
  if (!Number.isSafeInteger(asset.width) || asset.width <= 0) return false;
  if (!Number.isSafeInteger(asset.height) || asset.height <= 0) return false;
  if (asset.width * asset.height > ASSET_PIXEL_BUDGET) return false;
  if (
    !Number.isSafeInteger(asset.byteSize) ||
    asset.byteSize <= 0 ||
    asset.byteSize > ASSET_BYTE_BUDGET
  ) {
    return false;
  }
  if (typeof asset.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(asset.sha256)) return false;
  if (!asset.illustrativeOnly) return false;
  if (!/^[a-f0-9]{64}$/.test(asset.sourceReceiptSha256 ?? "")) return false;
  if (!/^[a-f0-9]{64}$/.test(asset.sourceOutputSha256 ?? "")) return false;
  if (
    asset.rights?.ownershipStatus !== "xenios_generated_asset" ||
    asset.rights?.thirdPartyMarksReviewed !== true ||
    asset.rights?.publicationRightsApproved !== true
  ) {
    return false;
  }
  if (!["exact", "class_generic", "state_generic"].includes(asset.scope)) return false;
  if (asset.scope === "exact" && typeof asset.manifestKey !== "string") return false;
  if (asset.scope !== "exact" && asset.manifestKey !== undefined) return false;
  if (asset.scope !== "exact" && typeof asset.imageClass !== "string") return false;
  if (
    typeof asset.publicPath !== "string" ||
    !/^\/research\/products\/[a-z0-9/_-]+-[a-f0-9]{12}\.png$/.test(
      asset.publicPath,
    ) ||
    !path.basename(asset.publicPath).includes(asset.sha256.slice(0, 12))
  ) {
    return false;
  }
  const approval = asset.approval;
  if (!approval || typeof approval !== "object") return false;
  if (typeof approval.namedApprover !== "string" || !approval.namedApprover.trim()) return false;
  if (typeof approval.approvalRecord !== "string" || !approval.approvalRecord.trim()) return false;
  if (!/^[a-f0-9]{64}$/.test(approval.approvalRecordSha256 ?? "")) return false;
  if (approval.exactSha256 !== asset.sha256) return false;
  const approvedTimestamp = Date.parse(approval.approvedAt);
  if (
    typeof approval.approvedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(approval.approvedAt) ||
    Number.isNaN(approvedTimestamp) ||
    new Date(approvedTimestamp).toISOString() !== approval.approvedAt
  ) {
    return false;
  }
  return true;
}

function validatedApprovedAssets(assets) {
  const registryDigest = VERIFIED_APPROVED_ASSET_REGISTRIES.get(assets);
  if (!registryDigest || registryDigest !== sha256Text(JSON.stringify(assets))) return [];
  const approved = assets.filter(isApprovedPublicAsset);
  if (approved.length !== assets.length) return [];
  const assetIds = new Set();
  const publicPaths = new Set();
  const activeScopes = new Set();
  let totalBytes = 0;
  for (const asset of approved) {
    const activeScope = `${asset.scope}:${asset.manifestKey ?? asset.imageClass ?? ""}`;
    if (
      assetIds.has(asset.assetId) ||
      publicPaths.has(asset.publicPath) ||
      activeScopes.has(activeScope)
    ) {
      return [];
    }
    assetIds.add(asset.assetId);
    publicPaths.add(asset.publicPath);
    activeScopes.add(activeScope);
    totalBytes += asset.byteSize;
  }
  if (totalBytes > ASSET_TOTAL_BYTE_BUDGET) return [];
  return approved;
}

/**
 * Establishes the filesystem trust boundary before the pure resolver runs.
 * Metadata-only objects cannot be used directly with `resolveProductImage`.
 */
export function verifyApprovedPublicAssetRegistry(assets) {
  if (!Array.isArray(assets)) throw new Error("Approved asset registry must be an array");
  const candidateRegistry = structuredClone(assets);
  VERIFIED_APPROVED_ASSET_REGISTRIES.set(
    candidateRegistry,
    sha256Text(JSON.stringify(candidateRegistry)),
  );
  const approved = validatedApprovedAssets(candidateRegistry);
  if (approved.length !== candidateRegistry.length) {
    VERIFIED_APPROVED_ASSET_REGISTRIES.delete(candidateRegistry);
    throw new Error("Approved asset registry metadata is invalid or exceeds byte budgets");
  }
  const sourceManifest = readJson(BATCH0_ASSET_MANIFEST_PATH);
  const coverageManifest = readJson(COVERAGE_LEDGER_PATH);
  const coverageByKey = new Map(
    coverageManifest.rows.map((row) => [row.manifestKey, row]),
  );
  const coverageClasses = new Set(coverageManifest.rows.map((row) => row.imageClass));
  const stateClasses = new Set(Object.values(EXTERNALLY_SUPPLIED_STATE_TO_IMAGE_CLASS));
  for (const asset of approved) {
    let expectedImageClass;
    if (asset.scope === "exact") {
      const coverage = coverageByKey.get(asset.manifestKey);
      if (!coverage || (asset.imageClass && asset.imageClass !== coverage.imageClass)) {
        throw new Error(`Approved exact scope is not in coverage for ${asset.assetId}`);
      }
      expectedImageClass = coverage.imageClass;
    } else if (
      (asset.scope === "class_generic" && !coverageClasses.has(asset.imageClass)) ||
      (asset.scope === "state_generic" && !stateClasses.has(asset.imageClass))
    ) {
      throw new Error(`Approved generic scope is not allowed for ${asset.assetId}`);
    } else {
      expectedImageClass = asset.imageClass;
    }
    const sourceAsset = sourceManifest.assets?.find(
      (candidate) =>
        candidate.receiptSha256 === asset.sourceReceiptSha256 &&
        candidate.source?.sha256 === asset.sourceOutputSha256 &&
        candidate.receipt?.outputSha256 === asset.sourceOutputSha256 &&
        candidate.imageClass === expectedImageClass,
    );
    if (!sourceAsset) {
      throw new Error(`Approved asset provenance is not bound for ${asset.assetId}`);
    }
    const relativeAssetPath = `client/public${asset.publicPath}`;
    const assetAbsolute = path.resolve(REPO_ROOT, relativeAssetPath);
    const publicRoot = `${path.resolve(REPO_ROOT, "client/public")}${path.sep}`;
    if (!assetAbsolute.startsWith(publicRoot) || !fs.existsSync(assetAbsolute)) {
      throw new Error(`Approved asset file is missing for ${asset.assetId}`);
    }
    const bytes = fs.readFileSync(assetAbsolute);
    if (sha256Bytes(bytes) !== asset.sha256 || bytes.length !== asset.byteSize) {
      throw new Error(`Approved asset bytes drifted for ${asset.assetId}`);
    }
    const decoded = inspectPngBytes(bytes, relativeAssetPath);
    if (decoded.width !== asset.width || decoded.height !== asset.height) {
      throw new Error(`Approved asset dimensions drifted for ${asset.assetId}`);
    }
    const approvalAbsolute = path.resolve(REPO_ROOT, asset.approval.approvalRecord);
    const docsRoot = `${path.resolve(REPO_ROOT, "docs")}${path.sep}`;
    if (!approvalAbsolute.startsWith(docsRoot) || !fs.existsSync(approvalAbsolute)) {
      throw new Error(`Approval record is missing for ${asset.assetId}`);
    }
    if (path.extname(approvalAbsolute).toLowerCase() !== ".json") {
      throw new Error(`Approval record must be structured JSON for ${asset.assetId}`);
    }
    const approvalBytes = fs.readFileSync(approvalAbsolute);
    if (sha256Bytes(approvalBytes) !== asset.approval.approvalRecordSha256) {
      throw new Error(`Approval record bytes drifted for ${asset.assetId}`);
    }
    let approvalRecord;
    try {
      approvalRecord = JSON.parse(approvalBytes.toString("utf8"));
    } catch {
      throw new Error(`Approval record is invalid JSON for ${asset.assetId}`);
    }
    const expectedManifestKey = asset.scope === "exact" ? asset.manifestKey : null;
    if (
      approvalRecord?.schemaVersion !== 1 ||
      approvalRecord.kind !== "product_image_exact_sha_approval" ||
      approvalRecord.decision !== "approved_for_publication" ||
      approvalRecord.assetId !== asset.assetId ||
      approvalRecord.namedApprover !== asset.approval.namedApprover ||
      approvalRecord.approvedAt !== asset.approval.approvedAt ||
      approvalRecord.exactSha256 !== asset.sha256 ||
      approvalRecord.scope !== asset.scope ||
      approvalRecord.manifestKey !== expectedManifestKey ||
      approvalRecord.imageClass !== expectedImageClass ||
      approvalRecord.sourceReceiptSha256 !== asset.sourceReceiptSha256 ||
      approvalRecord.sourceOutputSha256 !== asset.sourceOutputSha256
    ) {
      throw new Error(`Approval record is not exactly bound for ${asset.assetId}`);
    }
  }
  return candidateRegistry;
}

/**
 * Pure presentation resolver. `runtimePresentationState` is supplied by the
 * caller's business authority; this function never derives or changes it.
 */
export function resolveProductImage({
  identityCrosswalk,
  coverageLedger,
  approvedAssets = [],
  identity,
  runtimePresentationState,
}) {
  const manifestKey = resolveCrosswalkManifestKey(identityCrosswalk, identity);
  if (!manifestKey) return { status: "identity_not_resolved", image: null };
  const coverage = coverageLedger.rows.find((row) => row.manifestKey === manifestKey);
  if (!coverage) return { status: "coverage_not_found", image: null };
  const knownPresentationStates = new Set([
    "normal",
    ...Object.keys(EXTERNALLY_SUPPLIED_STATE_TO_IMAGE_CLASS),
  ]);
  if (!knownPresentationStates.has(runtimePresentationState)) {
    return {
      status: "invalid_external_presentation_state",
      manifestKey,
      image: null,
    };
  }
  const approved = validatedApprovedAssets(approvedAssets);
  const stateClass = EXTERNALLY_SUPPLIED_STATE_TO_IMAGE_CLASS[runtimePresentationState] ?? null;
  const candidates = stateClass
    ? [
        approved.find(
          (asset) => asset.scope === "state_generic" && asset.imageClass === stateClass,
        ),
      ].filter(Boolean)
    : [
        approved.find(
          (asset) => asset.scope === "exact" && asset.manifestKey === manifestKey,
        ),
        approved.find(
          (asset) =>
            asset.scope === "class_generic" && asset.imageClass === coverage.imageClass,
        ),
      ].filter(Boolean);
  if (candidates.length === 0) {
    return {
      status: "intentional_no_image_until_named_approval",
      manifestKey,
      image: null,
    };
  }
  const asset = candidates[0];
  return {
    status: "approved_image",
    manifestKey,
    image: {
      src: asset.publicPath,
      alt: asset.alt,
      width: asset.width,
      height: asset.height,
      assetId: asset.assetId,
      illustrativeOnly: true,
      notice: "Illustrative imagery; actual presentation may vary.",
    },
  };
}

export function buildArtifacts() {
  const founderSpec = sourceDescriptor(FOUNDER_V3_SPEC_PATH);
  if (founderSpec.sha256 !== FOUNDER_V3_SPEC_SHA256) {
    throw new Error(`Founder v3 spec checksum mismatch: ${founderSpec.sha256}`);
  }
  const reviewedProjection = buildReviewedCatalogProjection();
  validateBatch0FixtureJoin(reviewedProjection);
  const assetManifest = buildQuarantineManifest();
  const batch0AssetManifest = buildBatch0AssetManifest();
  const { rendererPacket, batch0Provenance } = buildRendererPacket();
  const renderQueue = buildRenderQueue(batch0AssetManifest);
  const coverageLedger = buildCoverageLedger(reviewedProjection, batch0AssetManifest);
  const identityCrosswalk = buildIdentityCrosswalk(reviewedProjection, coverageLedger);
  const stateAuthorityAudit = buildStateAuthorityAudit(reviewedProjection);
  assertIdentityCrosswalkConsistency(identityCrosswalk, coverageLedger);

  return {
    metadata: {
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      generatedAt: ARTIFACT_GENERATED_AT,
      sourceBaseCommit: SOURCE_BASE_COMMIT,
      sourceBaseTree: SOURCE_BASE_TREE,
      founderSpec,
      acceptance: V3_ACCEPTANCE,
    },
    reviewedProjection,
    assetManifest,
    batch0AssetManifest,
    rendererPacket,
    batch0Provenance,
    renderQueue,
    coverageLedger,
    identityCrosswalk,
    stateAuthorityAudit,
  };
}

function markdownCounts(record) {
  return Object.entries(record)
    .map(([key, value]) => `| ${key} | ${value} |`)
    .join("\n");
}

export function renderCoverageSummary({
  metadata,
  coverageLedger,
  identityCrosswalk,
  stateAuthorityAudit,
  batch0AssetManifest,
  renderQueue,
  assetManifest,
}) {
  return `# Xenios product imagery v3 correction status

Generated from primary base \`${metadata.sourceBaseCommit}\` (tree \`${metadata.sourceBaseTree}\`). This is evidence and source-only imagery work; it is not a production deployment or a commerce-state authority.

## Corrected catalog accounting

| Measure | Count |
| --- | ---: |
| Reviewed workbook rows | ${coverageLedger.invariants.reviewedSourceRows} |
| Canonical variants after reviewed merges | ${coverageLedger.invariants.canonicalRows} |
| Customer-exposed target after shipping exclusion | ${stateAuthorityAudit.reviewedTarget.exposedRows} |
| Currently mounted canonical / exposed | ${stateAuthorityAudit.currentlyMounted.canonicalRows} / ${stateAuthorityAudit.currentlyMounted.exposedRows} |
| Care rows | ${stateAuthorityAudit.reviewedTarget.careRows} |
| Structured formulation holds | ${stateAuthorityAudit.reviewedTarget.structuredFormulationHoldRows} |
| Price-on-request rows | ${stateAuthorityAudit.reviewedTarget.priceOnRequestRows} |
| Catalog coming-soon rows | ${stateAuthorityAudit.reviewedTarget.catalogComingSoonRows} |
| Separate coming-soon offers intended | ${stateAuthorityAudit.reviewedTarget.separateComingSoonOffersIntended} |

The reviewed 424-row target is **not materialized** in the runtime catalog yet. Runtime image wiring remains blocked until catalog/binding regeneration and independent image approval.

## Identity correction

- GRP-0425 / \`mov_c26ef47dfbbe46f7e090\` is the reviewed Oxytocin owner. GRP-0407 and its current Product Control identity are forward aliases only.
- GRP-0426 / \`mov_3c8ca424d78153fd931a\` is the reviewed Hexarelin owner. GRP-0402 and its current Product Control identity are forward aliases only.
- Superseded manifest owners: ${identityCrosswalk.invariants.supersededManifestOwners}.
- Exact current Product Control bindings on reviewed identities: ${identityCrosswalk.invariants.exactCurrentBindings}; target bindings not yet materialized: ${identityCrosswalk.invariants.targetBindingsNotMaterialized}.

## Batch 0

| Measure | Count |
| --- | ---: |
| Sanitized class jobs | ${batch0AssetManifest.counts.jobs} |
| Rendered, non-public | ${batch0AssetManifest.counts.rendered} |
| Pending renders | ${batch0AssetManifest.counts.pending} |
| Independently approved | ${batch0AssetManifest.counts.approved} |
| Public | ${batch0AssetManifest.counts.public} |

Renderer payloads contain no canonical product name, mark, strength, quantity, price, label, claim, or visible text. Fixture identity is stored in a physically separate provenance section. The old 423/419-style named prompt queue has been removed; the only queue is the ${renderQueue.counts.items}-item Batch 0 class packet.

## Image classes represented by the 424 reviewed variants

| Class | Rows |
| --- | ---: |
${markdownCounts(coverageLedger.byImageClass)}

## Quarantine and public status

All ${assetManifest.counts.quarantined} pre-v3 WebPs were removed from \`client/public\` and retained under non-public evidence paths. They remain permanently nonapprovable. No Batch 0 candidate is publishable without exact-hash, named independent approval.

## Runtime integration status

The pure resolver accepts exact canonical, Product Control, forward, and legacy Featured identities, then chooses only among separately supplied approved public assets. Business state is an external input; the resolver does not derive price, action, workflow, availability, Care, hold, or purchase eligibility. With zero approved public assets, its expected result is intentional no-image.
`;
}

export function supersededForwardGroups() {
  return { ...SUPERSEDED_FORWARD_GROUPS };
}

export function externallySuppliedStateImageClasses() {
  return { ...EXTERNALLY_SUPPLIED_STATE_TO_IMAGE_CLASS };
}

export function reviewedSpecialGroupIds() {
  return {
    shipping: SHIPPING_GROUP_ID,
    syringe: SYRINGE_GROUP_ID,
    priceRequest: PRICE_REQUEST_GROUP_ID,
    formulationHold: FORMULATION_HOLD_GROUP_ID,
  };
}

export function listPublicFallbackWebps() {
  const directory = path.join(REPO_ROOT, "client/public/research/products/fallbacks");
  if (!fs.existsSync(directory)) return [];
  const files = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".webp")) {
        files.push(path.relative(directory, absolute).replaceAll("\\", "/"));
      }
    }
  };
  walk(directory);
  return files.sort((a, b) => a.localeCompare(b));
}

export function listPublicProductImages() {
  const directory = path.join(REPO_ROOT, "client/public/research/products");
  if (!fs.existsSync(directory)) return [];
  const images = [];
  const extensions = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
        images.push(path.relative(directory, absolute).replaceAll("\\", "/"));
      }
    }
  };
  walk(directory);
  return images.sort((a, b) => a.localeCompare(b));
}

export function listRuntimeEvidenceReferences() {
  const roots = ["client/src", "client/index.html", "server", "shared", "config"];
  const extensions = new Set([
    ".cjs",
    ".css",
    ".html",
    ".js",
    ".json",
    ".mjs",
    ".toml",
    ".ts",
    ".tsx",
    ".yaml",
    ".yml",
  ]);
  const receiptSource = fs.existsSync(path.join(REPO_ROOT, BATCH0_RENDER_RECEIPTS_PATH))
    ? readJson(BATCH0_RENDER_RECEIPTS_PATH)
    : { observations: [] };
  const forbidden = sortedUnique([
    "/research/products/fallbacks/",
    "batch0-render-candidates",
    "pre-v3-nonapprovable",
    ...FALLBACK_ASSETS.map((asset) => path.basename(asset.filePath)),
    ...receiptSource.observations.map((observation) => path.basename(observation.repositoryPath)),
  ]);
  const matches = [];
  const inspectFile = (absolute) => {
    if (!extensions.has(path.extname(absolute).toLowerCase())) return;
    const content = fs.readFileSync(absolute, "utf8");
    const hit = forbidden.find((value) => content.includes(value));
    if (hit) {
      matches.push({
        path: path.relative(REPO_ROOT, absolute).replaceAll("\\", "/"),
        reference: hit,
      });
    }
  };
  const walk = (absoluteRoot) => {
    for (const entry of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
      const absolute = path.join(absoluteRoot, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) inspectFile(absolute);
    }
  };
  for (const root of roots) {
    const absoluteRoot = path.join(REPO_ROOT, root);
    if (!fs.existsSync(absoluteRoot)) continue;
    if (fs.statSync(absoluteRoot).isDirectory()) walk(absoluteRoot);
    else inspectFile(absoluteRoot);
  }
  return matches.sort((a, b) => a.path.localeCompare(b.path));
}

export function listForbiddenEvidenceCopiesInPublic() {
  const publicRoot = path.join(REPO_ROOT, "client/public");
  if (!fs.existsSync(publicRoot)) return [];
  const receiptSource = fs.existsSync(path.join(REPO_ROOT, BATCH0_RENDER_RECEIPTS_PATH))
    ? readJson(BATCH0_RENDER_RECEIPTS_PATH)
    : { observations: [] };
  const forbiddenHashes = new Set([
    ...FALLBACK_ASSETS.map((asset) => asset.sha256),
    ...Object.values(FALLBACK_ASSET_PROVENANCE).map(
      (provenance) => provenance.sourceArtifact.sha256,
    ),
    ...receiptSource.observations.map((observation) => observation.outputSha256),
    ...[BATCH0_CONTACT_SHEET_PATH, BATCH0_BROWSER_REVIEW_SCREENSHOT_PATH]
      .filter((relativePath) => fs.existsSync(path.join(REPO_ROOT, relativePath)))
      .map((relativePath) => sha256File(relativePath)),
  ]);
  const imageExtensions = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"]);
  const matches = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase())) {
        const digest = sha256Bytes(fs.readFileSync(absolute));
        if (forbiddenHashes.has(digest)) {
          matches.push({
            path: path.relative(REPO_ROOT, absolute).replaceAll("\\", "/"),
            sha256: digest,
          });
        }
      }
    }
  };
  walk(publicRoot);
  return matches.sort((a, b) => a.path.localeCompare(b.path));
}

export function knownQuarantinedPaths() {
  return sortedUnique(FALLBACK_ASSETS.map((asset) => asset.filePath));
}

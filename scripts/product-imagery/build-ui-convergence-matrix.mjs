// Materialize Claude's exact 207-row UI review as an explicit A/B/C matrix.
//
// A = actual frozen Core behavior
// B = current / old founder-preview behavior reviewed by Claude
// C = proposed Xenios Health delta or explicit no-silent-resolution rule
//
// The output is a decision aid, not approval or runtime authority.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");

export const REVIEW_SHA = "ae5c410ab6e5c27df94c5bdc5b6533ab821b6d4c";
export const CORE_SHA = "c0e25c73a0d789829ea213e2ee040c68e06f0a75";
export const OLD_PREVIEW_SHA = "8b06da560978c8c4b1ce325da8813373bffbc845";
export const CORRECTED_PREVIEW_BASE_SHA = "516328cfbe8f76c23f115744161be7ec150e6334";
export const BASELINE_PATH =
  "docs/review/xenios-health-launch-review-20260930/imagery/27a_ui_drift_matrix.json";
export const OUTPUT_PATH =
  "docs/product-imagery/UI_CONVERGENCE_THREE_WAY_MATRIX_2026-10-01.json";

const EXPECTED_COUNTS = Object.freeze({
  total: 207,
  "material-drift": 111,
  "minor-drift": 38,
  "allowed-exploration": 25,
  "core-internal-inconsistency": 33,
});

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function proposedDelta(row) {
  if (row.classification === "core-internal-inconsistency") {
    return "Do not invent an independent Xenios Health resolution. Mirror the dominant Core behavior only where the baseline is unambiguous, preserve the inconsistency as an explicit Core-lane decision, and apply this review direction: " + row.correction;
  }
  if (row.classification === "allowed-exploration") {
    return "Keep this as a clearly labeled private Xenios Health proposal pending the named decision. Review direction: " + row.correction;
  }
  return "Treat the old-preview difference as candidate drift, not a new design decision. The proposed Xenios Health surface should converge on Core and apply this review direction: " + row.correction;
}

function differenceKind(classification) {
  if (classification === "allowed-exploration") return "intentional_private_exploration";
  if (classification === "core-internal-inconsistency") return "existing_core_inconsistency_not_silent_preview_intent";
  return "accidental_preview_drift";
}

function successorDisposition(classification) {
  if (classification === "allowed-exploration") return "founder_decision_required";
  if (classification === "core-internal-inconsistency") return "document_and_route_to_core_no_unilateral_fix";
  return "candidate_correction_requires_exact_successor_review";
}

export function buildThreeWayMatrix() {
  const baselineText = execFileSync(
    "git",
    ["show", `${REVIEW_SHA}:${BASELINE_PATH}`],
    { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  const baseline = JSON.parse(baselineText);
  assert.equal(baseline.coreRuntime, CORE_SHA);
  assert.equal(baseline.preview, OLD_PREVIEW_SHA);

  const sourceRows = [
    ...baseline.result.lenses.flatMap((lens) =>
      lens.rows.map((row) => ({ lens: lens.lens, sourceGroup: "review_lens", ...row })),
    ),
    ...baseline.result.critic.addedRows.map((row) => ({
      lens: "completeness-critic",
      sourceGroup: "critic_added_row",
      ...row,
    })),
  ];
  const rows = sourceRows.map((row) => ({
    rowKey: `${row.lens}:${row.id}`,
    sourceReview: {
      commit: REVIEW_SHA,
      path: BASELINE_PATH,
      lens: row.lens,
      group: row.sourceGroup,
      id: row.id,
    },
    surface: row.area,
    actualCoreBehavior: row.core,
    currentOldPreviewBehavior: row.preview,
    observedDifference: row.drift,
    baselineClassification: row.classification,
    accidentalOrIntentional: differenceKind(row.classification),
    proposedXeniosHealthDelta: proposedDelta(row),
    actionRequired: row.correction,
    successorDisposition: successorDisposition(row.classification),
    exactSuccessorVerificationRequired: true,
    approved: false,
  }));

  const byClassification = Object.fromEntries(
    [...new Set(rows.map((row) => row.baselineClassification))]
      .sort()
      .map((classification) => [
        classification,
        rows.filter((row) => row.baselineClassification === classification).length,
      ]),
  );
  assert.equal(rows.length, EXPECTED_COUNTS.total);
  for (const [classification, expected] of Object.entries(EXPECTED_COUNTS)) {
    if (classification === "total") continue;
    assert.equal(byClassification[classification], expected, classification);
  }
  assert.equal(new Set(rows.map((row) => row.rowKey)).size, rows.length, "row keys must be unique");
  assert.ok(rows.every((row) =>
    row.surface &&
    row.actualCoreBehavior &&
    row.currentOldPreviewBehavior &&
    row.proposedXeniosHealthDelta &&
    row.actionRequired &&
    row.approved === false
  ));

  return {
    schemaVersion: 1,
    kind: "xenios-ui-convergence-three-way-matrix",
    purpose: "complete decision accounting for actual Core, old preview, and proposed Xenios Health delta",
    provenance: {
      reviewCommit: REVIEW_SHA,
      reviewPath: BASELINE_PATH,
      reviewBlobSha256: sha256(baselineText),
      frozenCoreCommit: CORE_SHA,
      oldPreviewCommit: OLD_PREVIEW_SHA,
      correctedPreviewBaseCommit: CORRECTED_PREVIEW_BASE_SHA,
    },
    columns: {
      A: "actualCoreBehavior",
      B: "currentOldPreviewBehavior",
      C: "proposedXeniosHealthDelta",
      differenceType: "accidentalOrIntentional",
      requiredFollowUp: "actionRequired",
    },
    counts: {
      rows: rows.length,
      materialMismatches: byClassification["material-drift"],
      byClassification,
    },
    authority: {
      claudeSuccessorAccepted: false,
      founderDecisionsAccepted: false,
      coreChangeAuthorized: false,
      imageApproval: false,
      batch1RenderAuthorization: false,
      publicationAuthorization: false,
      runtimeIntegrationAuthorization: false,
      deploymentAuthorization: false,
      productionMutationAuthorization: false,
    },
    evidence: {
      actualCore: "docs/product-imagery/evidence/ui-convergence/core-reference/",
      exactCoreSyntheticCatalogDetail: "docs/product-imagery/evidence/ui-convergence/core-synthetic-c0e25c73/",
      exactCoreSyntheticAccountOrders: "docs/product-imagery/evidence/ui-convergence/core-account-synthetic-c0e25c73/",
      oldPreview: "docs/product-imagery/evidence/founder-preview/",
      correctedPreview: "docs/product-imagery/evidence/ui-convergence/corrected-preview/",
    },
    rows,
  };
}

export function writeThreeWayMatrix() {
  const document = buildThreeWayMatrix();
  const output = resolve(REPO_ROOT, OUTPUT_PATH);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  return { output, document };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { output, document } = writeThreeWayMatrix();
  process.stdout.write(
    `three-way matrix: ${document.counts.rows} rows, ${document.counts.materialMismatches} material -> ${output}\n`,
  );
}

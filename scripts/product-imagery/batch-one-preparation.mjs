import assert from "node:assert/strict";

import { OBSERVED_CORE_HL11 } from "./config.mjs";

const FEATURED_OWNER_COUNT = 22;
const COVERAGE_CANDIDATE_COUNT = 24;
const DIVERSITY_CANONICAL_IDS = Object.freeze(["GRP-0243", "GRP-0362"]);
const DILUENT_CANONICAL_ID = "GRP-0362";
const GHK_CU_CANONICAL_IDS = new Set(["GRP-0287", "GRP-0288"]);
const GHK_CU_FORBIDDEN_CONTENTS_CUES = Object.freeze([
  "visible_cake",
  "white_powder",
  "liquid",
  "fill_level",
  "contents_color",
]);

const FOUNDER_APPROVAL_COMMIT = "a4e647eb69959eb91fc05dde8f211342d692b04c";
const FIDELITY_VERDICT_COMMIT = "316ca72c95262675dffef6aa4d858ae9c533605e";
const CALIBRATION_REVIEW_REPORT_27_COMMIT =
  "96e06765dbec9063a7311f128d0ab8accf8588b5";

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export const LABEL_POLICY = deepFreeze({
  mode: "blank_class_label",
  text: null,
  illustrative: true,
  exactPackagingClaim: false,
  exactPackageTextStatus: "unavailable_by_default",
  independentlyVerifiedAuthoritativeSupplierPackageTextRequired: true,
  authoritativeSupplierPackageTextReference: null,
  authoritativeSupplierPackageTextSha256: null,
  inferFromCatalogNameOrSpecification: false,
});

export const FRAMING_POLICY = deepFreeze({
  aspectRatio: "1:1",
  mediaFit: "contain",
  subjectHeightRatio: {
    minimum: 0.61,
    target: 0.68,
    maximum: 0.75,
  },
  horizonRatio: {
    minimum: 0.521,
    maximum: 0.575,
  },
  topMarginRatio: {
    minimum: 0.163,
    maximum: 0.179,
  },
  centered: true,
  edgeContactAllowed: false,
  canvasRelativeScalingRequired: true,
  rasterEditingAuthorization: false,
});

const NO_AUTHORITY = deepFreeze({
  renderAuthorization: false,
  publicationAuthorization: false,
  runtimeIntegrationAuthorization: false,
  productControlAuthorization: false,
  commerceAuthorization: false,
});

const SOURCE_PROVENANCE = deepFreeze({
  frozenHl11: {
    status: OBSERVED_CORE_HL11.status,
    sourceCommit: OBSERVED_CORE_HL11.sourceCommit,
    sourceTree: OBSERVED_CORE_HL11.sourceTree,
    testCommit: OBSERVED_CORE_HL11.testCommit,
    testTree: OBSERVED_CORE_HL11.testTree,
    recordsCommit: OBSERVED_CORE_HL11.recordsCommit,
    handoffPath: OBSERVED_CORE_HL11.handoffPath,
    qualificationPath: OBSERVED_CORE_HL11.qualificationPath,
  },
  observedFounderApproval: {
    commit: FOUNDER_APPROVAL_COMMIT,
    treatment: "observed_only_no_canonical_decision_rewrite",
  },
  fidelityVerdict: {
    commit: FIDELITY_VERDICT_COMMIT,
  },
  calibrationReviewReport27: {
    commit: CALIBRATION_REVIEW_REPORT_27_COMMIT,
  },
});

function pathwayKey(row) {
  const key = typeof row.pathway === "string" ? row.pathway : row.pathway?.key;
  assert.equal(typeof key, "string", `Batch 1 pathway missing for ${row.canonicalId}`);
  assert.ok(key.length > 0, `Batch 1 pathway empty for ${row.canonicalId}`);
  return key;
}

function presentationPolicy(row, index) {
  if (row.canonicalId === DILUENT_CANONICAL_ID) {
    return {
      imageClass: "sealed_diluent_vial",
      renderArchetype: "sealed_diluent_vial",
      presentationStrategy: "future_diluent_form_study_or_current_neutral_reference",
      proposedReferenceAssetId: "calibration-06-unverified-identity",
      futureReferenceStudyArchetype: "sealed_diluent_vial_form_study",
      containerClosure: "sealed",
      containerOpacity: null,
      contentsVisibility: null,
      sterilityClaim: null,
      forbiddenPresentationCues: ["dropper", "tincture", "oral_bottle"],
      forbiddenContentsCues: [],
    };
  }

  if (index === FEATURED_OWNER_COUNT) {
    assert.equal(
      row.imageClass,
      "capsule_bottle",
      "Batch 1 candidate 23 must remain the reviewed bottle-form diversity candidate",
    );
    return {
      imageClass: row.imageClass,
      renderArchetype: row.imageClass,
      presentationStrategy: "reuse_existing_blank_class_visual",
      proposedReferenceAssetId: "calibration-02-bottle",
      futureReferenceStudyArchetype: null,
      containerClosure: null,
      containerOpacity: null,
      contentsVisibility: null,
      sterilityClaim: null,
      forbiddenPresentationCues: [],
      forbiddenContentsCues: [],
    };
  }

  assert.equal(
    row.imageClass,
    "peptide_lyophilized_vial",
    `Featured owner ${row.canonicalId} must remain in the reviewed vial class`,
  );
  const ghkCu = GHK_CU_CANONICAL_IDS.has(row.canonicalId);
  return {
    imageClass: row.imageClass,
    renderArchetype: row.imageClass,
    presentationStrategy: "reuse_existing_blank_class_visual",
    proposedReferenceAssetId: "calibration-01-vial",
    futureReferenceStudyArchetype: null,
    containerClosure: null,
    containerOpacity: ghkCu ? "opaque" : null,
    contentsVisibility: ghkCu ? "hidden" : null,
    sterilityClaim: null,
    forbiddenPresentationCues: [],
    forbiddenContentsCues: ghkCu ? [...GHK_CU_FORBIDDEN_CONTENTS_CUES] : [],
  };
}

export function buildBatchOneCandidates(rows, crosswalk) {
  assert.ok(Array.isArray(rows), "Batch 1 rows must be an array");
  assert.ok(Array.isArray(crosswalk?.entries), "Batch 1 crosswalk entries must be an array");

  const rowsByManifestKey = new Map(rows.map((row) => [row.manifestKey, row]));
  const selected = crosswalk.entries
    .filter((entry) => entry.aliases?.legacyFeaturedAliases?.length > 0)
    .map((entry) => rowsByManifestKey.get(entry.manifestKey));

  assert.equal(
    selected.length,
    FEATURED_OWNER_COUNT,
    "Batch 1 expects exactly 22 canonical legacy Featured identities",
  );
  assert.ok(selected.every(Boolean), "A canonical legacy Featured identity is missing from rows");

  const selectedManifestKeys = new Set(selected.map((row) => row.manifestKey));
  for (const canonicalId of DIVERSITY_CANONICAL_IDS) {
    const row = rows.find((candidate) => candidate.canonicalId === canonicalId);
    assert.ok(row, `Batch 1 diversity fill missing ${canonicalId}`);
    if (!selectedManifestKeys.has(row.manifestKey)) {
      selected.push(row);
      selectedManifestKeys.add(row.manifestKey);
    }
  }

  assert.equal(selected.length, COVERAGE_CANDIDATE_COUNT);
  assert.ok(
    !selected.some((row) => row.canonicalId === "GRP-0366"),
    "GRP-0366 must not be a Batch 1 coverage candidate",
  );

  return selected.map((row, index) => {
    const presentation = presentationPolicy(row, index);
    return {
      sequence: index + 1,
      jobId: `batch1-${String(index + 1).padStart(2, "0")}-${row.canonicalId.toLowerCase()}`,
      canonicalId: row.canonicalId,
      manifestKey: row.manifestKey,
      offeringId: row.offeringId,
      offeringVariantId: row.offeringVariantId,
      productName: row.name,
      authorizedSpecification: row.specification,
      sourceImageClass: row.imageClass,
      imageClass: presentation.imageClass,
      renderArchetype: presentation.renderArchetype,
      pathway: pathwayKey(row),
      priorityReason:
        index < FEATURED_OWNER_COUNT
          ? "canonical owner of a current legacy Featured identity"
          : "first-page catalog and image-class diversity candidate",
      coverageCandidate: true,
      renderQueueStatus: "not_queued_no_render_authorization",
      productSpecificRenderRequired: false,
      presentationStrategy: presentation.presentationStrategy,
      proposedReferenceAssetId: presentation.proposedReferenceAssetId,
      futureReferenceStudyArchetype: presentation.futureReferenceStudyArchetype,
      containerClosure: presentation.containerClosure,
      containerOpacity: presentation.containerOpacity,
      contentsVisibility: presentation.contentsVisibility,
      sterilityClaim: presentation.sterilityClaim,
      forbiddenPresentationCues: presentation.forbiddenPresentationCues,
      forbiddenContentsCues: presentation.forbiddenContentsCues,
      labelPolicy: LABEL_POLICY,
      labelText: null,
      exactPackagingClaim: false,
      illustrative: true,
      authoritativeSupplierPackageTextReference: null,
      authoritativeSupplierPackageTextSha256: null,
      inferLabelTextFromCatalogIdentity: false,
      status: "prepared_not_authorized_to_render",
      promptStatus: "deferred_pending_render_gate",
      ...NO_AUTHORITY,
    };
  });
}

export function buildBatchOneManifest(jobs) {
  assert.ok(Array.isArray(jobs), "Batch 1 jobs must be an array");
  assert.equal(jobs.length, COVERAGE_CANDIDATE_COUNT, "Batch 1 requires 24 coverage jobs");
  assert.equal(new Set(jobs.map((job) => job.jobId)).size, COVERAGE_CANDIDATE_COUNT);
  assert.equal(new Set(jobs.map((job) => job.canonicalId)).size, COVERAGE_CANDIDATE_COUNT);
  assert.equal(new Set(jobs.map((job) => job.manifestKey)).size, COVERAGE_CANDIDATE_COUNT);
  assert.equal(new Set(jobs.map((job) => job.offeringId)).size, COVERAGE_CANDIDATE_COUNT);
  assert.equal(new Set(jobs.map((job) => job.offeringVariantId)).size, COVERAGE_CANDIDATE_COUNT);
  assert.ok(!jobs.some((job) => job.canonicalId === "GRP-0366"));
  assert.ok(
    jobs.every(
      (job, index) =>
        job.sequence === index + 1 &&
        job.jobId ===
          `batch1-${String(index + 1).padStart(2, "0")}-${job.canonicalId.toLowerCase()}` &&
        job.coverageCandidate === true &&
        job.pathway === "research" &&
        job.status === "prepared_not_authorized_to_render" &&
        job.renderQueueStatus === "not_queued_no_render_authorization" &&
        job.productSpecificRenderRequired === false &&
        job.renderAuthorization === false &&
        job.publicationAuthorization === false &&
        job.runtimeIntegrationAuthorization === false &&
        job.productControlAuthorization === false &&
        job.commerceAuthorization === false,
    ),
    "Batch 1 coverage jobs must remain ordered and non-authoritative",
  );
  assert.ok(
    jobs.every(
      (job) =>
        job.labelText === null &&
        job.exactPackagingClaim === false &&
        job.illustrative === true &&
        job.authoritativeSupplierPackageTextReference === null &&
        job.authoritativeSupplierPackageTextSha256 === null &&
        job.inferLabelTextFromCatalogIdentity === false,
    ),
    "Batch 1 class visuals must retain blank labels without invented packaging text",
  );
  for (const job of jobs) {
    assert.deepEqual(
      job.labelPolicy,
      LABEL_POLICY,
      `Batch 1 label policy changed for ${job.canonicalId}`,
    );
  }

  const ghkCuJobs = jobs.filter((job) => GHK_CU_CANONICAL_IDS.has(job.canonicalId));
  assert.deepEqual(
    ghkCuJobs.map((job) => job.sequence),
    [6, 7],
    "The two frozen GHK-Cu identities must remain jobs 6 and 7",
  );
  assert.ok(
    ghkCuJobs.every(
      (job) =>
        job.sourceImageClass === "peptide_lyophilized_vial" &&
        job.imageClass === "peptide_lyophilized_vial" &&
        job.renderArchetype === "peptide_lyophilized_vial" &&
        job.containerOpacity === "opaque" &&
        job.contentsVisibility === "hidden" &&
        GHK_CU_FORBIDDEN_CONTENTS_CUES.every((cue) =>
          job.forbiddenContentsCues.includes(cue),
        ),
    ),
    "GHK-Cu must remain opaque and must not imply visible contents",
  );

  const diluent = jobs[23];
  assert.equal(diluent.canonicalId, DILUENT_CANONICAL_ID);
  assert.equal(diluent.sourceImageClass, "oral_liquid_neutral");
  assert.equal(diluent.imageClass, "sealed_diluent_vial");
  assert.equal(diluent.renderArchetype, "sealed_diluent_vial");
  assert.equal(diluent.containerClosure, "sealed");
  assert.equal(diluent.sterilityClaim, null);
  assert.deepEqual(diluent.forbiddenPresentationCues, [
    "dropper",
    "tincture",
    "oral_bottle",
  ]);
  assert.equal(diluent.proposedReferenceAssetId, "calibration-06-unverified-identity");
  assert.equal(diluent.futureReferenceStudyArchetype, "sealed_diluent_vial_form_study");
  assert.doesNotMatch(JSON.stringify(diluent), /sterile/i);

  return {
    schemaVersion: 2,
    kind: "batch_001_coverage_preparation_not_render_queue",
    status: "prepared_not_authorized_to_render",
    sources: SOURCE_PROVENANCE,
    canonicalFounderDecisionsRewritten: false,
    count: jobs.length,
    coverageCandidateCount: jobs.length,
    authorizedProductRenderCount: 0,
    authorizedProductRenderQueue: [],
    labelPolicy: LABEL_POLICY,
    framingPolicy: FRAMING_POLICY,
    ...NO_AUTHORITY,
    jobs: jobs.map((job) => ({ ...job })),
  };
}

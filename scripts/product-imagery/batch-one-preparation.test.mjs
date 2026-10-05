import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  FRAMING_POLICY,
  LABEL_POLICY,
  buildBatchOneCandidates,
  buildBatchOneManifest,
} from "./batch-one-preparation.mjs";

const REPO_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const readJson = (relativePath) =>
  JSON.parse(readFileSync(join(REPO_ROOT, relativePath), "utf8"));

const catalog = readJson("docs/product-imagery/founder-preview/catalog-data.json");
const crosswalk = readJson(
  "docs/product-imagery/manifests/product-image-identity-crosswalk.json",
);
const calibration = readJson(
  "docs/product-imagery/manifests/global-art-direction-calibration.json",
);

const EXPECTED_CANONICAL_IDS = [
  "GRP-0261",
  "GRP-0262",
  "GRP-0264",
  "GRP-0274",
  "GRP-0278",
  "GRP-0287",
  "GRP-0288",
  "GRP-0296",
  "GRP-0300",
  "GRP-0302",
  "GRP-0306",
  "GRP-0308",
  "GRP-0313",
  "GRP-0317",
  "GRP-0318",
  "GRP-0320",
  "GRP-0321",
  "GRP-0331",
  "GRP-0338",
  "GRP-0341",
  "GRP-0347",
  "GRP-0350",
  "GRP-0243",
  "GRP-0362",
];

function buildJobs() {
  return buildBatchOneCandidates(catalog.rows, crosswalk);
}

test("prepares the stable 22 Featured owners plus two reviewed diversity candidates", () => {
  const jobs = buildJobs();

  assert.equal(jobs.length, 24);
  assert.deepEqual(
    jobs.map((job) => job.canonicalId),
    EXPECTED_CANONICAL_IDS,
  );
  assert.deepEqual(
    jobs.map((job) => job.sequence),
    Array.from({ length: 24 }, (_, index) => index + 1),
  );
  assert.deepEqual(
    jobs.map((job) => job.jobId),
    EXPECTED_CANONICAL_IDS.map(
      (canonicalId, index) =>
        `batch1-${String(index + 1).padStart(2, "0")}-${canonicalId.toLowerCase()}`,
    ),
  );
  assert.equal(new Set(jobs.map((job) => job.manifestKey)).size, 24);
  assert.ok(!jobs.some((job) => job.canonicalId === "GRP-0366"));
  assert.ok(jobs.slice(0, 22).every((job) => /Featured/.test(job.priorityReason)));
  assert.deepEqual(
    jobs.slice(22).map((job) => job.canonicalId),
    ["GRP-0243", "GRP-0362"],
  );
});

test("keeps raw catalog identity while correcting only the diluent presentation", () => {
  const jobs = buildJobs();
  const rowsByCanonicalId = new Map(catalog.rows.map((row) => [row.canonicalId, row]));

  for (const job of jobs) {
    const row = rowsByCanonicalId.get(job.canonicalId);
    assert.ok(row);
    assert.equal(job.sourceImageClass, row.imageClass);
    assert.equal(job.productName, row.name);
    assert.equal(job.authorizedSpecification, row.specification);
    assert.equal(job.pathway, row.pathway.key);
  }

  const diluent = jobs[23];
  assert.equal(diluent.canonicalId, "GRP-0362");
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
  assert.doesNotMatch(JSON.stringify(diluent), /sterile/i);
});

test("keeps both GHK-Cu coverage identities opaque with contents hidden", () => {
  const jobs = buildJobs();
  const ghkCu = jobs.filter((job) => ["GRP-0287", "GRP-0288"].includes(job.canonicalId));

  assert.deepEqual(
    ghkCu.map((job) => job.sequence),
    [6, 7],
  );
  assert.ok(ghkCu.every((job) => job.containerOpacity === "opaque"));
  assert.ok(ghkCu.every((job) => job.contentsVisibility === "hidden"));
  assert.ok(
    ghkCu.every(
      (job) =>
        job.forbiddenContentsCues.includes("visible_cake") &&
        job.forbiddenContentsCues.includes("white_powder") &&
        job.forbiddenContentsCues.includes("liquid") &&
        job.forbiddenContentsCues.includes("fill_level") &&
        job.forbiddenContentsCues.includes("contents_color"),
    ),
  );
});

test("reuses reviewed blank class visuals without authorizing product renders", () => {
  const jobs = buildJobs();
  const knownCalibrationIds = new Set(calibration.assets.map((asset) => asset.id));

  assert.ok(
    jobs
      .slice(0, 22)
      .every(
        (job) =>
          job.presentationStrategy === "reuse_existing_blank_class_visual" &&
          job.proposedReferenceAssetId === "calibration-01-vial",
      ),
  );
  assert.equal(jobs[22].sourceImageClass, "capsule_bottle");
  assert.equal(jobs[22].proposedReferenceAssetId, "calibration-02-bottle");
  assert.equal(
    jobs[23].presentationStrategy,
    "future_diluent_form_study_or_current_neutral_reference",
  );
  assert.equal(jobs[23].proposedReferenceAssetId, "calibration-06-unverified-identity");
  assert.equal(jobs[23].futureReferenceStudyArchetype, "sealed_diluent_vial_form_study");
  assert.ok(jobs.every((job) => knownCalibrationIds.has(job.proposedReferenceAssetId)));
  assert.ok(jobs.every((job) => job.productSpecificRenderRequired === false));
  assert.ok(jobs.every((job) => !("proposedReferenceAssetSha256" in job)));
});

test("defaults every class visual to an illustrative blank label without packaging claims", () => {
  const jobs = buildJobs();

  assert.equal(LABEL_POLICY.text, null);
  assert.equal(LABEL_POLICY.exactPackagingClaim, false);
  assert.equal(LABEL_POLICY.illustrative, true);
  assert.equal(LABEL_POLICY.exactPackageTextStatus, "unavailable_by_default");
  assert.equal(
    LABEL_POLICY.independentlyVerifiedAuthoritativeSupplierPackageTextRequired,
    true,
  );
  assert.equal(LABEL_POLICY.inferFromCatalogNameOrSpecification, false);
  assert.ok(
    jobs.every(
      (job) =>
        job.labelPolicy === LABEL_POLICY &&
        job.labelText === null &&
        job.exactPackagingClaim === false &&
        job.illustrative === true &&
        job.authoritativeSupplierPackageTextReference === null &&
        job.authoritativeSupplierPackageTextSha256 === null &&
        job.inferLabelTextFromCatalogIdentity === false,
    ),
  );
});

test("keeps coverage preparation separate from an authorized render queue", () => {
  const jobs = buildJobs();
  const manifest = buildBatchOneManifest(jobs);

  assert.equal(manifest.count, 24);
  assert.equal(manifest.coverageCandidateCount, 24);
  assert.equal(manifest.authorizedProductRenderCount, 0);
  assert.deepEqual(manifest.authorizedProductRenderQueue, []);
  assert.equal(manifest.status, "prepared_not_authorized_to_render");
  assert.ok(jobs.every((job) => job.coverageCandidate === true));
  assert.ok(jobs.every((job) => job.renderQueueStatus === "not_queued_no_render_authorization"));
  for (const subject of [manifest, ...jobs]) {
    assert.equal(subject.renderAuthorization, false);
    assert.equal(subject.publicationAuthorization, false);
    assert.equal(subject.runtimeIntegrationAuthorization, false);
    assert.equal(subject.productControlAuthorization, false);
    assert.equal(subject.commerceAuthorization, false);
  }
});

test("records normalized framing and pinned review provenance without rewriting decisions", () => {
  const manifest = buildBatchOneManifest(buildJobs());

  assert.deepEqual(FRAMING_POLICY.subjectHeightRatio, {
    minimum: 0.61,
    target: 0.68,
    maximum: 0.75,
  });
  assert.deepEqual(FRAMING_POLICY.horizonRatio, { minimum: 0.521, maximum: 0.575 });
  assert.deepEqual(FRAMING_POLICY.topMarginRatio, { minimum: 0.163, maximum: 0.179 });
  assert.equal(FRAMING_POLICY.aspectRatio, "1:1");
  assert.equal(FRAMING_POLICY.mediaFit, "contain");
  assert.equal(FRAMING_POLICY.rasterEditingAuthorization, false);
  assert.equal(manifest.framingPolicy, FRAMING_POLICY);
  assert.equal(manifest.canonicalFounderDecisionsRewritten, false);
  assert.equal(
    manifest.sources.frozenHl11.sourceCommit,
    "4cba24af1d42ad59fe44856859cc1721846e6df5",
  );
  assert.equal(
    manifest.sources.observedFounderApproval.commit,
    "a4e647eb69959eb91fc05dde8f211342d692b04c",
  );
  assert.equal(
    manifest.sources.fidelityVerdict.commit,
    "316ca72c95262675dffef6aa4d858ae9c533605e",
  );
  assert.equal(
    manifest.sources.calibrationReviewReport27.commit,
    "96e06765dbec9063a7311f128d0ab8accf8588b5",
  );
});

test("rejects mutated identity, label, pathway, presentation, and authority input", () => {
  const mutationCases = [
    {
      name: "duplicate canonical identity",
      mutate: (jobs) => {
        jobs[1].canonicalId = jobs[0].canonicalId;
        jobs[1].jobId = `batch1-02-${jobs[0].canonicalId.toLowerCase()}`;
      },
    },
    {
      name: "invented label text",
      mutate: (jobs) => {
        jobs[0].labelText = jobs[0].productName;
      },
    },
    {
      name: "changed blank-label policy",
      mutate: (jobs) => {
        jobs[0].labelPolicy.text = "invented package";
      },
    },
    {
      name: "exact packaging claim",
      mutate: (jobs) => {
        jobs[0].exactPackagingClaim = true;
      },
    },
    {
      name: "non-illustrative class visual",
      mutate: (jobs) => {
        jobs[0].illustrative = false;
      },
    },
    {
      name: "changed pathway",
      mutate: (jobs) => {
        jobs[0].pathway = "care";
      },
    },
    {
      name: "render authority",
      mutate: (jobs) => {
        jobs[0].renderAuthorization = true;
      },
    },
    {
      name: "visible GHK-Cu contents",
      mutate: (jobs) => {
        jobs[5].contentsVisibility = "visible";
      },
    },
    {
      name: "missing GHK-Cu cue prohibition",
      mutate: (jobs) => {
        jobs[6].forbiddenContentsCues = jobs[6].forbiddenContentsCues.filter(
          (cue) => cue !== "white_powder",
        );
      },
    },
    {
      name: "oral-bottle diluent regression",
      mutate: (jobs) => {
        jobs[23].imageClass = "oral_liquid_neutral";
      },
    },
    {
      name: "invented diluent sterility claim",
      mutate: (jobs) => {
        jobs[23].sterilityClaim = "sterile";
      },
    },
  ];

  for (const { name, mutate } of mutationCases) {
    const jobs = structuredClone(buildJobs());
    mutate(jobs);
    assert.throws(() => buildBatchOneManifest(jobs), undefined, name);
  }
});

test("does not mutate the frozen catalog rows or identity crosswalk", () => {
  const rowsBefore = structuredClone(catalog.rows);
  const crosswalkBefore = structuredClone(crosswalk);

  buildBatchOneManifest(buildBatchOneCandidates(catalog.rows, crosswalk));

  assert.deepEqual(catalog.rows, rowsBefore);
  assert.deepEqual(crosswalk, crosswalkBefore);
});

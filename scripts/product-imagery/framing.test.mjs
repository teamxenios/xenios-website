import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const SCRIPT = join(HERE, "measure-framing.py");
const PYTHON = process.env.XENIOS_IMAGERY_PYTHON || "python";
const CANDIDATE_ROOT = join(
  REPO_ROOT,
  "docs/product-imagery/evidence/calibration-render-candidates",
);

const FROZEN = [
  {
    id: "calibration-01-vial",
    file: "calibration-01-vial-sha256-e04c2e5981ec.png",
    sha256: "e04c2e5981eccdd5753ebfbdd8927e6e04ae804d2e0537eb9eceb5c7e9d3f6fe",
    bbox: [407, 204, 827, 1019],
    horizon: 653,
    passed: true,
    failureCodes: [],
  },
  {
    id: "calibration-02-bottle",
    file: "calibration-02-bottle-sha256-e3681f630199.png",
    sha256: "e3681f630199c0b5743a589ab29b04ebaf246cece82658fb1b811b79ecaeef7f",
    bbox: [348, 224, 895, 1077],
    horizon: 721,
    passed: true,
    failureCodes: [],
  },
  {
    id: "calibration-03-topical",
    file: "calibration-03-topical-sha256-dd8510c7ce07.png",
    sha256: "dd8510c7ce07525fe9dc1195cb6dc0bf12964167a0a4ebd9923648151a6a4173",
    bbox: [398, 124, 829, 1097],
    horizon: 807,
    passed: false,
    failureCodes: [
      "SUBJECT_HEIGHT_ABOVE_MAX",
      "TOP_MARGIN_BELOW_MIN",
      "HORIZON_ABOVE_MAX",
    ],
  },
  {
    id: "calibration-04-care-state",
    file: "calibration-04-care-state-sha256-76c10c66c93f.png",
    sha256: "76c10c66c93fd3365bd40eefa450ffa01ddb13351dce6ae9aecacefb8abf9750",
    bbox: [103, 113, 1098, 955],
    horizon: 480,
    passed: false,
    failureCodes: ["TOP_MARGIN_BELOW_MIN", "HORIZON_BELOW_MIN"],
  },
  {
    id: "calibration-05-restrictive-state",
    file: "calibration-05-restrictive-state-sha256-36bc99f4833d.png",
    sha256: "36bc99f4833d83923cb837664f89e07258ad94fbd04a5ddb7b27ca77ccf655f2",
    bbox: [185, 106, 1039, 1166],
    horizon: 724,
    passed: false,
    failureCodes: [
      "SUBJECT_HEIGHT_ABOVE_MAX",
      "TOP_MARGIN_BELOW_MIN",
      "HORIZON_ABOVE_MAX",
    ],
  },
  {
    id: "calibration-06-unverified-identity",
    file: "calibration-06-unverified-identity-sha256-77069db7b832.png",
    sha256: "77069db7b8324baf4780b37c585926a92b432e2fef24cbcdf019d38782cd7d8b",
    bbox: [248, 122, 1030, 1056],
    horizon: 859,
    passed: false,
    failureCodes: ["TOP_MARGIN_BELOW_MIN", "HORIZON_ABOVE_MAX"],
  },
];

function spawnPython(args, options = {}) {
  return spawnSync(PYTHON, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: 180_000,
    ...options,
  });
}

function parseJsonOutput(result, label, expectedStatus = 0) {
  assert.equal(
    result.error,
    undefined,
    `${label} could not start ${PYTHON}: ${result.error?.message ?? "unknown error"}`,
  );
  assert.equal(
    result.status,
    expectedStatus,
    `${label} exited ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  assert.ok(result.stdout.trim(), `${label} emitted no JSON`);
  return JSON.parse(result.stdout);
}

function assertNoAuthority(result) {
  assert.deepEqual(result.authority, {
    commerceAuthority: false,
    independentAcceptance: false,
    measurementOnly: true,
    publicationAuthorization: false,
    renderAuthorization: false,
  });
}

test("framing verifier has an available Python and Pillow runtime", () => {
  const version = spawnPython([
    "-c",
    "import json, platform, PIL; print(json.dumps({'python': platform.python_version(), 'pillow': PIL.__version__}))",
  ]);
  const runtime = parseJsonOutput(version, "Python/Pillow runtime probe");
  assert.match(runtime.python, /^3\./);
  assert.match(runtime.pillow, /^\d+\.\d+/);
});

test("self-test scales every spatial parameter and covers every gate boundary", () => {
  const result = parseJsonOutput(
    spawnPython([SCRIPT, "--self-test"]),
    "framing self-test",
  );

  assert.equal(result.schemaVersion, "xenios_imagery_framing_v1");
  assert.equal(result.kind, "image_framing_measurement_self_test");
  assert.equal(result.passed, true);
  assertNoAuthority(result);
  assert.deepEqual(
    result.scales.map((entry) => entry.sidePx),
    [320, 768, 1254, 2048],
  );

  for (const entry of result.scales) {
    const { sidePx, parameters } = entry;
    const scaled = parameters.scaledPx;
    assert.ok(Math.abs(scaled.blurRadiusPx / sidePx - 30 / 1254) < 1e-8);
    assert.equal(scaled.morphologyKernelPx % 2, 1);
    assert.ok(Math.abs(scaled.horizonInsetPx - (40 * sidePx) / 1254) <= 0.5);
    assert.ok(
      Math.abs(scaled.horizonGradientHalfWindowPx - (20 * sidePx) / 1254) <= 0.5,
    );
    assert.ok(Math.abs(scaled.horizonScanTopPx - (200 * sidePx) / 1254) <= 0.5);
    assert.ok(
      Math.abs(scaled.horizonScanBottomExclusionPx - (100 * sidePx) / 1254) <= 0.5,
    );
  }
  const reference = result.scales.find((entry) => entry.sidePx === 1254).parameters;
  assert.deepEqual(reference.scaledPx, {
    blurRadiusPx: 30,
    horizonGradientHalfWindowPx: 20,
    horizonInsetPx: 40,
    horizonScanBottomExclusionPx: 100,
    horizonScanTopPx: 200,
    morphologyKernelPx: 5,
  });

  const cases = new Map(result.cases.map((entry) => [entry.name, entry]));
  for (const name of [
    "nominal_pass",
    "inclusive_minimums_pass",
    "inclusive_maximums_pass",
    "not_square",
    "subject_not_detected",
    "subject_height_below",
    "subject_height_above",
    "top_margin_below",
    "top_margin_above",
    "horizon_below",
    "horizon_above",
    "horizontal_center_outside",
    "edge_contact",
  ]) {
    assert.equal(cases.get(name)?.passed, true, `${name} self-test did not pass`);
  }
  assert.equal(cases.get("inclusive_minimums_pass").gatePassed, true);
  assert.equal(cases.get("inclusive_maximums_pass").gatePassed, true);
  assert.deepEqual(cases.get("not_square").failureCodes, ["NOT_SQUARE"]);
  assert.deepEqual(cases.get("edge_contact").failureCodes, ["EDGE_CONTACT"]);

  assert.deepEqual(
    result.syntheticMeasurements.map((entry) => entry.sidePx),
    [320, 768, 1254, 2048],
  );
  assert.ok(result.syntheticMeasurements.every((entry) => entry.gatePassed));
});

test("frozen calibration images retain exact hashes and report-27 measurements", () => {
  const paths = FROZEN.map((entry) => join(CANDIDATE_ROOT, entry.file));
  const helper = [
    "import json, runpy, sys",
    "from pathlib import Path",
    "module = runpy.run_path(sys.argv[1], run_name='xenios_measure_framing_module')",
    "results = [module['measure_png'](Path(value)) for value in sys.argv[2:]]",
    "print(json.dumps(results, sort_keys=True))",
  ].join("; ");
  const measured = parseJsonOutput(
    spawnPython(["-c", helper, SCRIPT, ...paths]),
    "frozen calibration measurement",
  );
  assert.equal(measured.length, FROZEN.length);

  for (const [index, expected] of FROZEN.entries()) {
    const actual = measured[index];
    assert.equal(actual.schemaVersion, "xenios_imagery_framing_v1", expected.id);
    assert.equal(actual.input.contentSha256, expected.sha256, expected.id);
    assert.deepEqual(
      actual.dimensions,
      { width: 1254, height: 1254, square: true, sidePx: 1254 },
      expected.id,
    );
    assertNoAuthority(actual);
    assert.deepEqual(
      [
        actual.measurements.bbox.pixels.x0,
        actual.measurements.bbox.pixels.y0,
        actual.measurements.bbox.pixels.x1Exclusive,
        actual.measurements.bbox.pixels.y1Exclusive,
      ],
      expected.bbox,
      expected.id,
    );
    assert.equal(actual.measurements.horizon.pixels, expected.horizon, expected.id);
    assert.equal(actual.gate.passed, expected.passed, expected.id);
    assert.deepEqual(actual.gate.failureCodes, expected.failureCodes, expected.id);
    assert.equal(
      actual.gate.criteria.horizontalCenter
        .provisionalEngineeringToleranceNotFounderAuthorized,
      true,
      expected.id,
    );
  }
});

test("failed measurements are observational by default and enforceable on demand", () => {
  const failingPath = join(CANDIDATE_ROOT, FROZEN[2].file);
  const observed = parseJsonOutput(
    spawnPython([SCRIPT, "--input", failingPath]),
    "observational failed measurement",
  );
  assert.equal(observed.gate.passed, false);
  assert.deepEqual(observed.gate.failureCodes, FROZEN[2].failureCodes);

  const enforced = parseJsonOutput(
    spawnPython([SCRIPT, "--input", failingPath, "--enforce"]),
    "enforced failed measurement",
    3,
  );
  assert.equal(enforced.input.contentSha256, FROZEN[2].sha256);
  assert.equal(enforced.gate.passed, false);
  assert.deepEqual(enforced.gate.failureCodes, FROZEN[2].failureCodes);
  assertNoAuthority(enforced);
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const MEASUREMENT_SCRIPT = "scripts/product-imagery/measure-framing.py";
export const hashBytes = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Measurement success is necessary for a future receipt, never asset approval.
export function assertProspectiveFraming(receipt, expected) {
  assert.equal(receipt?.schemaVersion, "xenios_imagery_framing_v1");
  assert.match(expected.contentSha256, /^[a-f0-9]{64}$/);
  assert.equal(receipt.input?.contentSha256, expected.contentSha256, "framing source hash mismatch");
  const { width, height } = receipt.dimensions ?? {};
  assert.ok(Number.isSafeInteger(width) && width > 0 && width === height, "square source required");
  assert.equal(width, expected.width);
  assert.equal(height, expected.height);
  const m = receipt.measurements;
  assert.ok(m, "framing measurements required");
  const bbox = m.bbox?.pixels;
  assert.ok(bbox, "subject bounding box required");
  for (const value of Object.values(bbox)) assert.ok(Number.isFinite(value));
  assert.ok(bbox.x0 > 0 && bbox.y0 > 0 && bbox.x1Exclusive < width && bbox.y1Exclusive < height,
    "subject must not contact an edge");
  assert.ok(bbox.x1Exclusive > bbox.x0 && bbox.y1Exclusive > bbox.y0);
  const inBand = (value, min, max) => Number.isFinite(value) &&
    value >= Math.round(min * width) && value <= Math.round(max * width);
  assert.ok(inBand(bbox.y1Exclusive - bbox.y0, 0.61, 0.75), "subject height outside framing band");
  assert.ok(inBand(bbox.y0, 0.163, 0.179), "top margin outside framing band");
  assert.ok(inBand(m.horizon?.pixels, 0.521, 0.575), "horizon outside framing band");
  // Explicit provisional engineering tolerance, not a new founder decision.
  assert.ok(Math.abs((bbox.x0 + bbox.x1Exclusive) / (2 * width) - 0.5) <= 0.05,
    "subject is not horizontally centered within provisional tolerance");
  assert.equal(receipt.gate?.passed, true, "failed measurement cannot enter a future render receipt");
  assert.deepEqual(receipt.gate.failureCodes, []);
  assert.deepEqual(receipt.authority, {
    measurementOnly: true, renderAuthorization: false, publicationAuthorization: false,
    commerceAuthority: false, independentAcceptance: false,
  }, "measurement authority must match the exact closed schema");
  return true;
}

export function measureImage(repositoryPath, { enforce = false } = {}) {
  const path = resolve(ROOT, repositoryPath);
  const bytes = readFileSync(path);
  const python = process.env.XENIOS_IMAGERY_PYTHON || "python";
  const receipt = JSON.parse(execFileSync(python, [resolve(ROOT, MEASUREMENT_SCRIPT), "--input", path], {
    cwd: ROOT, encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
  }));
  assert.equal(receipt.input.contentSha256, hashBytes(bytes));
  if (enforce) assertProspectiveFraming(receipt, {
    contentSha256: hashBytes(bytes), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20),
  });
  return receipt;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3, "Usage: node framing-receipt.mjs <PNG path>; failure exits nonzero");
  console.log(JSON.stringify(measureImage(process.argv[2], { enforce: true }), null, 2));
}

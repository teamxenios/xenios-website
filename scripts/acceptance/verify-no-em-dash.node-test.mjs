import assert from "node:assert/strict";
import test from "node:test";

import {
  forbiddenMatchesInText,
  isExcludedSourcePath,
  scanBuildText,
  scanRuntimeConfigText,
  scanSourceText,
} from "./verify-no-em-dash.mjs";

test("literal U+2014 fails", () => {
  assert.equal(forbiddenMatchesInText("before — after").length, 1);
});

test("&mdash; fails", () => {
  assert.equal(forbiddenMatchesInText("before &mdash; after").length, 1);
});

test("&#8212; fails", () => {
  assert.equal(forbiddenMatchesInText("before &#8212; after").length, 1);
});

test("&#x2014; fails", () => {
  assert.equal(forbiddenMatchesInText("before &#x2014; after").length, 1);
});

test("escaped unicode in customer-facing source fails", () => {
  const findings = scanSourceText("client/src/copy.ts", String.raw`export const copy = "before \u2014 after";`);
  assert.equal(findings.length, 1);
});

test("approved punctuation passes", () => {
  assert.deepEqual(forbiddenMatchesInText("Before: after. Another sentence; still clear."), []);
});

test("comments and excluded historical evidence do not create false failures", () => {
  assert.equal(scanSourceText("client/src/copy.ts", "// historical note — not rendered\nexport const copy = 'Approved: clear.';").length, 0);
  assert.equal(isExcludedSourcePath("server/historical/immutable-record.ts"), true);
  assert.equal(scanSourceText("server/historical/immutable-record.ts", "export const record = 'old — record';").length, 0);
});

test("build scan ignores comments, regex syntax, and the exact reviewed vendor diagnostic only", () => {
  const generated = [
    "// internal note — not rendered",
    "const normalizer = /[–—]/g;",
    "const vendor = 'proactive refresh failed, access token still valid — preserving session';",
  ].join("\n");
  assert.deepEqual(scanBuildText("dist/public/assets/index.js", generated), []);
  assert.equal(scanBuildText("dist/public/assets/index.js", "const authored = 'Visible — copy';").length, 1);
});

test("runtime-fed reconciliation copy is checked after its exact presentation projection", () => {
  const file = "config/research/revenue-launch/seth-source-reconciliation-20260905.json";
  const safe = JSON.stringify({
    phaseA: [],
    phaseB: [{
      sourceProduct: "Example",
      sourceConfiguration: "Capsule — 100 mg",
      evidenceOnlyNote: "Historical — evidence is not rendered",
    }],
  });
  assert.deepEqual(scanRuntimeConfigText(file, safe), []);

  const unsafe = JSON.stringify({
    phaseA: [],
    phaseB: [{ sourceProduct: "Example", sourceConfiguration: "Capsule &mdash; 100 mg" }],
  });
  assert.equal(scanRuntimeConfigText(file, unsafe).length, 1);
  assert.deepEqual(scanRuntimeConfigText("config/research/historical-record.json", unsafe), []);
});

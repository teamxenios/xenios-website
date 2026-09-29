import assert from "node:assert/strict";
import test from "node:test";

import {
  forbiddenMatchesInText,
  isExcludedSourcePath,
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

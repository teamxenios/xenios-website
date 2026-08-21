#!/usr/bin/env node
// Proof for xenios-os overlaps(): the conflicts that MUST still be reported,
// and the ones that were never real.
//
// Run: node scripts/agentic/xenios-os-overlap-check.mjs
//
// This lives beside the tool rather than under a vitest root because
// vitest.config.ts only includes server/**, shared/** and client/src/**.
// Wiring scripts/**/*.test.ts into that include is a one-line change to a
// shared config file and belongs to the lead, not to a worker; until then this
// runs standalone and exits non-zero on any regression.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(HERE, "xenios-os.mjs");

// The tool is a CLI that runs a command on import, so lift the three pure
// functions out of it rather than importing and triggering a run.
const source = readFileSync(SOURCE, "utf8");
const start = source.indexOf("function patternIsLiteral");
const end = source.indexOf("function activeSessions");
if (start === -1 || end === -1 || end <= start) {
  console.error("FAIL: could not locate the overlap helpers in xenios-os.mjs");
  process.exit(1);
}
const overlaps = new Function(
  `${source.slice(start, end)}\nreturn overlaps;`,
)();

const cases = [
  // --- MUST STILL CONFLICT. Relaxing any of these puts two writers on one
  // --- file, which is worse than the bug this change fixes.
  {
    expect: true,
    why: "a /** lease really can contain a file matching a mid-** pattern",
    a: "server/research/**request**",
    b: "server/research/master-offerings/**",
  },
  {
    expect: true,
    why: "identical globs",
    a: "client/src/research/assisted-order/**",
    b: "client/src/research/assisted-order/**",
  },
  {
    expect: true,
    why: "a glob covering a concrete file inside it",
    a: "client/src/research/assisted-order/**",
    b: "client/src/research/assisted-order/api.ts",
  },
  {
    expect: true,
    why: "identical concrete files",
    a: "shared/research/affiliate-system.ts",
    b: "shared/research/affiliate-system.ts",
  },
  {
    expect: true,
    why: "a concrete directory contains the other pattern",
    a: "server/research",
    b: "server/research/partners/**",
  },
  {
    expect: true,
    why: "mid-** pattern genuinely matches this concrete file",
    a: "server/research/**request**",
    b: "server/research/commerce/request-store.ts",
  },

  // --- MUST NOT CONFLICT. Each of these blocked real unowned work.
  {
    expect: false,
    why: "the concrete lease file contains no 'request' and never will",
    a: "server/research/**request**",
    b: "server/research/pricing/catalog-price-projection.ts",
  },
  {
    expect: false,
    why: "the concrete lease file contains no 'analytics'",
    a: "server/research/**analytics**",
    b: "shared/research/account-identity.ts",
  },
  {
    expect: false,
    why: "unrelated concrete files",
    a: "server/index.ts",
    b: "server/research/index.ts",
  },
  {
    expect: false,
    why: "sibling globs",
    a: "client/src/research/assisted-order/**",
    b: "client/src/research/pages/partners/**",
  },
  {
    expect: false,
    why: "a single * does not cross a directory separator",
    a: "server/research/*.ts",
    b: "server/research/partners/attribution.ts",
  },
];

let failed = 0;
for (const testCase of cases) {
  const forward = overlaps(testCase.a, testCase.b);
  const backward = overlaps(testCase.b, testCase.a);
  const symmetric = forward === backward;
  const correct = forward === testCase.expect && symmetric;
  if (!correct) {
    failed += 1;
    console.error(
      `FAIL  expected ${testCase.expect}, got ${forward}` +
        (symmetric ? "" : ` (ASYMMETRIC: reversed gives ${backward})`) +
        `\n      ${testCase.a}\n      ${testCase.b}\n      ${testCase.why}`,
    );
  }
}

if (failed > 0) {
  console.error(`\n${failed} of ${cases.length} overlap cases FAILED`);
  process.exit(1);
}
console.log(`overlaps(): ${cases.length} cases pass, all symmetric`);

/**
 * Verify the authoritative member-safe catalog counts.
 *
 * Usage:
 *   npx tsx scripts/research/verify-master-offerings-dataset.ts \
 *     .local/research/master-offerings/generated/member-safe-master-offerings.generated.json \
 *     [expectedOfferings] [expectedVariants]
 *
 * It loads the generated dataset through the same reader the server uses, so a
 * dataset that passes here is one the catalog can actually serve, and a dataset
 * the catalog would refuse fails here first, on a terminal, instead of at
 * runtime in front of a member.
 *
 * It counts the offerings and variants itself rather than trusting the file's
 * own header, and it reports a disagreement loudly, because a header that says
 * 1,121 over a body of 900 is exactly the kind of quiet wrong number a launch
 * gets planned around.
 *
 * This script reads. It mounts no route, writes no database, changes no flag,
 * creates no Product Control binding, and mutates nothing.
 */

import {
  GeneratedMasterOfferingCatalogReader,
  MasterOfferingDatasetUnavailable,
} from "../../server/research/master-offerings/dataset-reader";

/** The independently verified foundation result, for reference in the output. */
const FOUNDATION_OFFERINGS = 420;
const FOUNDATION_VARIANTS = 420;

function fail(message: string): never {
  process.stderr.write(`FAIL: ${message}\n`);
  process.exit(1);
}

const [, , filePath, expectedOfferingsRaw, expectedVariantsRaw] = process.argv;
if (!filePath) {
  fail(
    "pass the generated member-safe dataset path, for example .local/research/master-offerings/generated/member-safe-master-offerings.generated.json",
  );
}

const expectedOfferings = expectedOfferingsRaw
  ? Number(expectedOfferingsRaw)
  : FOUNDATION_OFFERINGS;
const expectedVariants = expectedVariantsRaw
  ? Number(expectedVariantsRaw)
  : FOUNDATION_VARIANTS;

let summary;
try {
  summary = new GeneratedMasterOfferingCatalogReader(filePath).summary();
} catch (error) {
  if (error instanceof MasterOfferingDatasetUnavailable) {
    fail(
      `${error.reason}. The catalog would answer 503 rather than serve this file.`,
    );
  }
  throw error;
}

const lines = [
  `dataset            ${filePath}`,
  `generatedAt        ${summary.generatedAt || "(absent)"}`,
  `workbook sha256    ${summary.sourceWorkbookSha256 || "(absent)"}`,
  "",
  `member-safe offerings  counted ${summary.offerings}  declared ${summary.declaredOfferings}  expected ${expectedOfferings}`,
  `member-safe variants   counted ${summary.variants}  declared ${summary.declaredVariants}  expected ${expectedVariants}`,
  "",
  "by family:",
  ...Object.entries(summary.families)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([family, count]) => `  ${family.padEnd(28)} ${count}`),
  "",
  "by availability:",
  ...Object.entries(summary.displayStates)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([state, count]) => `  ${state.padEnd(28)} ${count}`),
];
process.stdout.write(`${lines.join("\n")}\n\n`);

const problems: string[] = [];
if (!summary.countsAgree) {
  problems.push(
    "the file's own header disagrees with its contents, so one of the two numbers is wrong",
  );
}
if (summary.offerings !== expectedOfferings) {
  problems.push(
    `expected ${expectedOfferings} member-safe offerings, counted ${summary.offerings}`,
  );
}
if (summary.variants !== expectedVariants) {
  problems.push(
    `expected ${expectedVariants} member-safe variants, counted ${summary.variants}`,
  );
}

if (problems.length > 0) {
  for (const problem of problems) process.stderr.write(`FAIL: ${problem}\n`);
  process.exit(1);
}

process.stdout.write(
  `PASS: ${summary.offerings} member-safe offerings and ${summary.variants} member-safe variants, loadable by the catalog service.\n`,
);

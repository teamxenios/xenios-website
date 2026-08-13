/**
 * MASTER CATALOG RECONCILIATION.
 *
 * Take a new master workbook (or an already exported intake), compare it with
 * the catalog that is live today, and answer the only question that matters
 * when a spreadsheet is swapped: which of these offerings are the same
 * offerings, and which ids just moved underneath them.
 *
 * Why the question is hard. An offering id is "mo_" + sha256(canonicalKey) and
 * a variant id is "mov_" + sha256(canonicalKey + "|" + normalizedLabel). Rename
 * a product and every id under it changes with no warning and no trace. The
 * generated member-safe dataset cannot help: the canonical key is on the
 * reader's banned-key list and the reader hardcodes it to the empty string, and
 * no source ID survives into the file either. So identity work has to happen
 * offline, on normalize.ts output, which is what this command does.
 *
 * Usage:
 *   npx tsx scripts/research/reconcile-master-catalog.ts \
 *     --candidate-workbook <new-workbook.xlsx> \
 *     --current-intake .local/research/master-offerings/private-intake.json
 *
 *   Candidate (pick one, required):
 *     --candidate-workbook <path.xlsx>   run the existing python exporter first
 *     --candidate-intake <path.json>     use an already exported private intake
 *
 *   Current (pick one; defaults to the standard local intake, then dataset):
 *     --current-intake <path.json>       full fidelity, enables certain renames
 *     --current-dataset <path.json>      a generated member-safe artifact only
 *
 *   Options:
 *     --out <dir>            report directory (must stay under .local)
 *     --bindings <path.json> Product Control identity bindings to check
 *     --pin-ids              write certain previous ids back into the artifact
 *     --retain-retired       carry retired offerings in as unavailable
 *     --skip-tests           do not run the focused catalog tests
 *     --apply                promote the final artifact (requires --dataset-out)
 *     --dataset-out <path>   where --apply writes; never inferred from the env
 *     --acknowledge-review   allow --apply while review items exist
 *     --python <exe>         python interpreter for the exporter
 *
 * DRY RUN BY DEFAULT. Without --apply this command writes only inside its own
 * output directory under .local. It never touches production, never writes to a
 * database, and never creates a Product Control binding.
 *
 * THE REPORT IS PRIVATE. It carries workbook source IDs and sheet rows on
 * purpose, because those are the evidence. It is an operator document and it is
 * not member-safe. It stays under .local for that reason.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  catalogRevisionFromGeneratedArtifact,
  catalogRevisionFromNormalized,
  CatalogRevisionUnreadable,
  countVariants,
  type CatalogRevision,
} from "../../server/research/master-offerings/catalog-revision";
import {
  buildCatalogRevisionDiff,
  idContinuityMap,
} from "../../server/research/master-offerings/catalog-revision-diff";
import { renderCatalogRevisionMarkdown } from "../../server/research/master-offerings/catalog-revision-report";
import {
  ArtifactRefused,
  assertGeneratedArtifactSafe,
  confidentialTermsFromMasterRows,
  pinPreservedIds,
  retainRetiredOfferings,
  withRecountedHeader,
  type GeneratedArtifact,
  type PinResult,
  type RetainResult,
} from "../../server/research/master-offerings/catalog-revision-artifact";
import { normalizeMasterOfferings } from "../../server/research/master-offerings/normalize";
import type {
  MasterOfferingCommerceIdentityBinding,
  RawEarlyAccessRow,
  RawMasterOfferingRow,
} from "../../server/research/master-offerings/model";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const DEFAULT_OUTPUT = path.join(
  REPO_ROOT,
  ".local",
  "research",
  "master-offerings",
  "reconcile",
);

function isLocal(directory: string): boolean {
  const relative = path.relative(REPO_ROOT, directory).replace(/\\/g, "/");
  return relative === ".local" || relative.startsWith(".local/");
}

/**
 * Where the private working files go: the exported intake, the builder output,
 * and the final artifact. It sits beside the report when the report is already
 * under .local, so two runs with different report directories never overwrite
 * each other's artifact. It falls back to the default when an operator has
 * exported the report outside .local, because private material never follows a
 * report out of the private tree.
 */
function workingDirectoryFor(out: string): string {
  return isLocal(out) ? path.join(out, "work") : DEFAULT_OUTPUT;
}

class Refused extends Error {
  constructor(message: string) {
    super(`Master catalog reconciliation refused: ${message}`);
  }
}

interface Options {
  candidateWorkbook: string | null;
  candidateIntake: string | null;
  currentIntake: string | null;
  currentDataset: string | null;
  out: string;
  bindings: string | null;
  pinIds: boolean;
  retainRetired: boolean;
  skipTests: boolean;
  apply: boolean;
  datasetOut: string | null;
  acknowledgeReview: boolean;
  python: string | null;
}

function parseOptions(argv: readonly string[]): Options {
  const options: Options = {
    candidateWorkbook: null,
    candidateIntake: null,
    currentIntake: null,
    currentDataset: null,
    out: DEFAULT_OUTPUT,
    bindings: null,
    pinIds: false,
    retainRetired: false,
    skipTests: false,
    apply: false,
    datasetOut: null,
    acknowledgeReview: false,
    python: null,
  };
  const value = (index: number, flag: string): string => {
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new Refused(`${flag} needs a value`);
    }
    return next;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    switch (flag) {
      case "--candidate-workbook":
        options.candidateWorkbook = value(index, flag);
        index += 1;
        break;
      case "--candidate-intake":
        options.candidateIntake = value(index, flag);
        index += 1;
        break;
      case "--current-intake":
        options.currentIntake = value(index, flag);
        index += 1;
        break;
      case "--current-dataset":
        options.currentDataset = value(index, flag);
        index += 1;
        break;
      case "--out":
        options.out = path.resolve(value(index, flag));
        index += 1;
        break;
      case "--bindings":
        options.bindings = value(index, flag);
        index += 1;
        break;
      case "--dataset-out":
        options.datasetOut = path.resolve(value(index, flag));
        index += 1;
        break;
      case "--python":
        options.python = value(index, flag);
        index += 1;
        break;
      case "--pin-ids":
        options.pinIds = true;
        break;
      case "--retain-retired":
        options.retainRetired = true;
        break;
      case "--skip-tests":
        options.skipTests = true;
        break;
      case "--apply":
        options.apply = true;
        break;
      case "--acknowledge-review":
        options.acknowledgeReview = true;
        break;
      default:
        throw new Refused(`unknown argument ${JSON.stringify(flag)}`);
    }
  }
  if (options.candidateWorkbook === null && options.candidateIntake === null) {
    throw new Refused(
      "a candidate is required: pass --candidate-workbook or --candidate-intake",
    );
  }
  if (options.candidateWorkbook !== null && options.candidateIntake !== null) {
    throw new Refused(
      "pass either --candidate-workbook or --candidate-intake, not both",
    );
  }
  if (options.currentIntake !== null && options.currentDataset !== null) {
    throw new Refused(
      "pass either --current-intake or --current-dataset, not both",
    );
  }
  if (options.apply && options.datasetOut === null) {
    throw new Refused(
      "--apply needs an explicit --dataset-out. The destination is never taken from the environment.",
    );
  }
  return options;
}

/** Private output stays under .local, the same rule the existing tools use. */
function assertLocalOutput(directory: string, what: string): void {
  if (
    !isLocal(directory) &&
    process.env.XENIOS_ALLOW_REVIEWED_CATALOG_OUTPUT !== "true"
  ) {
    throw new Refused(
      `${what} must stay under .local unless XENIOS_ALLOW_REVIEWED_CATALOG_OUTPUT=true is set for an explicit reviewed export`,
    );
  }
}

function run(
  command: string,
  args: readonly string[],
  label: string,
): { ok: boolean; stdout: string; stderr: string } {
  const windows = process.platform === "win32";
  const result = spawnSync(
    windows ? `"${command}"` : command,
    windows ? args.map((argument) => `"${argument}"`) : args,
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      shell: windows,
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.error) {
    return { ok: false, stdout: "", stderr: `${label}: ${result.error.message}` };
  }
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function binary(name: string): string {
  return path.join(
    REPO_ROOT,
    "node_modules",
    ".bin",
    process.platform === "win32" ? `${name}.cmd` : name,
  );
}

function pythonCandidates(explicit: string | null): readonly string[] {
  const configured = explicit ?? process.env.XENIOS_PYTHON ?? null;
  if (configured !== null) return [configured];
  return process.platform === "win32"
    ? ["python", "python3", "py"]
    : ["python3", "python"];
}

/** Step 1: ingest through the existing exporter. No second parser. */
function exportWorkbook(
  workbook: string,
  options: Options,
  workingDirectory: string,
): string {
  const target = path.join(workingDirectory, "candidate-intake.json");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const script = path.join(REPO_ROOT, "scripts", "research", "export-master-offerings.py");
  const failures: string[] = [];
  for (const python of pythonCandidates(options.python)) {
    const result = run(python, [script, workbook, "--output", target], python);
    if (result.ok) {
      process.stdout.write(`ingest      ${result.stdout.trim()}\n`);
      return target;
    }
    failures.push(`${python}: ${(result.stderr || result.stdout).trim()}`);
  }
  throw new Refused(
    `the workbook could not be exported. Tried:\n  ${failures.join("\n  ")}`,
  );
}

interface Intake {
  sourceWorkbook: { sha256: string; filename: string };
  masterRows: RawMasterOfferingRow[];
  earlyAccessRows: RawEarlyAccessRow[];
}

function readIntake(filePath: string, what: string): Intake {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (cause) {
    throw new Refused(`${what} could not be read: ${String(cause)}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Refused(`${what} is not an object`);
  }
  const root = parsed as Record<string, unknown>;
  if (root.schemaVersion !== 1 || root.privateIntake !== true) {
    throw new Refused(`${what} schema or private marker is invalid`);
  }
  if (root.productionMutated !== false || root.databaseMutated !== false) {
    throw new Refused(`${what} mutation markers are invalid`);
  }
  if (!Array.isArray(root.masterRows) || !Array.isArray(root.earlyAccessRows)) {
    throw new Refused(`${what} row arrays are missing`);
  }
  const workbook = root.sourceWorkbook;
  if (
    typeof workbook !== "object" ||
    workbook === null ||
    typeof (workbook as Record<string, unknown>).sha256 !== "string"
  ) {
    throw new Refused(`${what} sourceWorkbook is invalid`);
  }
  return parsed as unknown as Intake;
}

function readJson(filePath: string, what: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (cause) {
    throw new Refused(`${what} could not be read: ${String(cause)}`);
  }
}

/** Step 2: normalize with the existing normalizer. No fork. */
function revisionFromIntake(
  label: string,
  intake: Intake,
): CatalogRevision {
  return catalogRevisionFromNormalized({
    label,
    sourceWorkbookSha256: intake.sourceWorkbook.sha256,
    catalog: normalizeMasterOfferings(intake.masterRows, intake.earlyAccessRows),
  });
}

function resolveCurrentRevision(options: Options): {
  revision: CatalogRevision;
  artifact: GeneratedArtifact | null;
  source: string;
} {
  const defaultIntake = path.join(
    REPO_ROOT,
    ".local/research/master-offerings/private-intake.json",
  );
  const defaultDataset = path.join(
    REPO_ROOT,
    ".local/research/master-offerings/generated/member-safe-master-offerings.generated.json",
  );

  const intakePath =
    options.currentIntake !== null
      ? path.resolve(options.currentIntake)
      : options.currentDataset === null && fs.existsSync(defaultIntake)
        ? defaultIntake
        : null;
  const datasetPath =
    options.currentDataset !== null
      ? path.resolve(options.currentDataset)
      : intakePath === null && fs.existsSync(defaultDataset)
        ? defaultDataset
        : null;

  const artifact =
    fs.existsSync(defaultDataset) && intakePath !== null
      ? (readJson(defaultDataset, "the current generated dataset") as GeneratedArtifact)
      : null;

  if (intakePath !== null) {
    return {
      revision: revisionFromIntake(
        "current",
        readIntake(intakePath, "the current private intake"),
      ),
      artifact,
      source: intakePath,
    };
  }
  if (datasetPath !== null) {
    const parsed = readJson(datasetPath, "the current generated dataset");
    try {
      return {
        revision: catalogRevisionFromGeneratedArtifact({
          label: "current",
          parsed,
        }),
        artifact: parsed as GeneratedArtifact,
        source: datasetPath,
      };
    } catch (error) {
      if (error instanceof CatalogRevisionUnreadable) {
        throw new Refused(
          `the current generated dataset is one the catalog would refuse to serve: ${error.reason}`,
        );
      }
      throw error;
    }
  }
  throw new Refused(
    "no current catalog was found. Pass --current-intake (preferred) or --current-dataset.",
  );
}

function readBindings(
  filePath: string | null,
): readonly MasterOfferingCommerceIdentityBinding[] {
  if (filePath === null) return [];
  const parsed = readJson(path.resolve(filePath), "the binding inventory");
  if (!Array.isArray(parsed)) {
    throw new Refused("the binding inventory must be a JSON array");
  }
  return parsed.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Refused(`binding ${index} is not an object`);
    }
    const record = entry as Record<string, unknown>;
    for (const key of ["offeringVariantId", "productId", "variantId"] as const) {
      if (typeof record[key] !== "string" || record[key] === "") {
        throw new Refused(`binding ${index} is missing ${key}`);
      }
    }
    return {
      offeringVariantId: String(record.offeringVariantId),
      productId: String(record.productId),
      variantId: String(record.variantId),
    };
  });
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function main(): number {
  const options = parseOptions(process.argv.slice(2));
  assertLocalOutput(options.out, "the report directory");
  const workingDirectory = workingDirectoryFor(options.out);
  fs.mkdirSync(workingDirectory, { recursive: true });
  fs.mkdirSync(options.out, { recursive: true });

  const commandLine = `npx tsx scripts/research/reconcile-master-catalog.ts ${process.argv.slice(2).join(" ")}`;

  // 1 and 2. Ingest and normalize, through the existing exporter and normalizer.
  const candidateIntakePath =
    options.candidateWorkbook !== null
      ? exportWorkbook(
          path.resolve(options.candidateWorkbook),
          options,
          workingDirectory,
        )
      : path.resolve(options.candidateIntake as string);
  const candidateIntake = readIntake(
    candidateIntakePath,
    "the candidate private intake",
  );
  const candidateRevision = revisionFromIntake("candidate", candidateIntake);
  const current = resolveCurrentRevision(options);

  process.stdout.write(
    `normalize   current ${current.revision.offerings.length} offerings / ${countVariants(current.revision)} variants (${current.revision.fidelity}), candidate ${candidateRevision.offerings.length} / ${countVariants(candidateRevision)}\n`,
  );

  // 3 to 9. Deduplicate, compare, preserve, add, retire, and report.
  const diff = buildCatalogRevisionDiff(current.revision, candidateRevision, {
    bindings: readBindings(options.bindings),
  });
  const continuity = idContinuityMap(diff);

  // 10. Regenerate deterministically with the existing builder, unchanged.
  const generatedDirectory = path.join(workingDirectory, "generated");
  const build = run(
    binary("tsx"),
    [
      path.join(REPO_ROOT, "scripts", "research", "build-master-offerings.ts"),
      candidateIntakePath,
      generatedDirectory,
    ],
    "build-master-offerings",
  );
  if (!build.ok) {
    throw new Refused(
      `the member-safe build failed:\n${(build.stderr || build.stdout).trim()}`,
    );
  }
  process.stdout.write(`regenerate  ${build.stdout.trim().split("\n").pop()}\n`);

  const generatedPath = path.join(
    generatedDirectory,
    "member-safe-master-offerings.generated.json",
  );
  let artifact = readJson(generatedPath, "the regenerated dataset") as GeneratedArtifact;

  // 11. Privacy scan. Banned keys and the required-false invariants come from
  // the production reader; the confidential-term sweep is derived from the
  // candidate intake, so a name that just became confidential is caught.
  const confidentialTerms = confidentialTermsFromMasterRows(
    candidateIntake.masterRows,
  );
  const checks: { name: string; passed: boolean; detail: string }[] = [];
  const scan = (label: string, value: GeneratedArtifact): void => {
    try {
      const result = assertGeneratedArtifactSafe(value, confidentialTerms);
      checks.push({
        name: `privacy scan, ${label}`,
        passed: true,
        detail: `${result.offerings} offerings and ${result.variants} variants load through the production reader with no banned key, no confidential identity, and every invariant false`,
      });
    } catch (error) {
      if (error instanceof ArtifactRefused) {
        checks.push({
          name: `privacy scan, ${label}`,
          passed: false,
          detail: error.reason,
        });
        return;
      }
      throw error;
    }
  };
  scan("regenerated artifact", artifact);

  let pin: PinResult | null = null;
  let retain: RetainResult | null = null;

  if (options.pinIds) {
    pin = pinPreservedIds(artifact, continuity);
    artifact = withRecountedHeader(pin.artifact);
    scan("id-pinned artifact", artifact);
    process.stdout.write(
      `pin-ids     ${pin.pinned.length} pinned, ${pin.conflicts.length} refused\n`,
    );
  }
  if (options.retainRetired) {
    if (current.artifact === null) {
      throw new Refused(
        "--retain-retired needs the previous generated artifact, and none was found beside the current intake",
      );
    }
    retain = retainRetiredOfferings(
      artifact,
      current.artifact,
      diff.retired.map((offering) => offering.id),
    );
    artifact = withRecountedHeader(retain.artifact);
    scan("retired-retained artifact", artifact);
    process.stdout.write(
      `retain      ${retain.retained.length} retained as unavailable, ${retain.skipped.length} skipped\n`,
    );
  }

  const finalPath = path.join(
    workingDirectory,
    "member-safe-master-offerings.final.json",
  );
  writeJson(finalPath, artifact);

  // Verify the final artifact through the existing verifier, with the counts
  // this run actually produced rather than a remembered snapshot.
  const expectedOfferings = Array.isArray(artifact.products)
    ? artifact.products.length
    : 0;
  const expectedVariants = Array.isArray(artifact.products)
    ? (artifact.products as Record<string, unknown>[]).reduce(
        (sum, product) =>
          sum + (Array.isArray(product.variants) ? product.variants.length : 0),
        0,
      )
    : 0;
  const verify = run(
    binary("tsx"),
    [
      path.join(REPO_ROOT, "scripts", "research", "verify-master-offerings-dataset.ts"),
      finalPath,
      String(expectedOfferings),
      String(expectedVariants),
    ],
    "verify-master-offerings-dataset",
  );
  checks.push({
    name: "verify-master-offerings-dataset",
    passed: verify.ok,
    detail: verify.ok
      ? `${expectedOfferings} offerings and ${expectedVariants} variants are loadable by the catalog service`
      : (verify.stderr || verify.stdout).trim().split("\n").slice(-3).join(" "),
  });

  // 12. The focused catalog tests.
  if (!options.skipTests) {
    const tests = run(
      binary("vitest"),
      ["run", "server/research/master-offerings"],
      "vitest",
    );
    const output = `${tests.stdout}\n${tests.stderr}`;
    const summary =
      output.match(/Tests\s+.*$/m)?.[0]?.trim() ??
      (tests.ok ? "passed" : "failed");
    checks.push({
      name: "vitest run server/research/master-offerings",
      passed: tests.ok,
      detail: summary,
    });
    process.stdout.write(`tests       ${summary}\n`);
  }

  const reportContext = {
    commandLine,
    mode: (options.apply ? "apply" : "dry run") as "apply" | "dry run",
    outputDirectory: options.out,
    pin,
    retain,
    checks,
  };
  const markdownPath = path.join(
    options.out,
    "MASTER_CATALOG_RECONCILIATION_REPORT.md",
  );
  fs.writeFileSync(
    markdownPath,
    renderCatalogRevisionMarkdown(diff, reportContext),
    "utf8",
  );
  const jsonPath = path.join(options.out, "master-catalog-reconciliation.json");
  writeJson(jsonPath, {
    ...diff,
    command: commandLine,
    mode: reportContext.mode,
    privateReport: true,
    productionMutated: false,
    databaseMutated: false,
    productControlBindingCreated: false,
    pin,
    retain,
    checks,
  });
  const continuityPath = path.join(
    options.out,
    "master-catalog-id-continuity.json",
  );
  writeJson(continuityPath, {
    schemaVersion: 1,
    generatedAt: diff.generatedAt,
    confidenceCeiling: diff.confidenceCeiling,
    appliedRule:
      "Only certain continuity appears in `applied`. Everything else is in `review` and needs a human.",
    applied: continuity,
    entries: diff.idContinuity,
    review: diff.review,
  });

  const failedChecks = checks.filter((check) => !check.passed);
  const blockers: string[] = failedChecks.map((check) => check.name);
  if (options.apply) {
    if (blockers.length > 0) {
      throw new Refused(
        `--apply is blocked by failing checks: ${blockers.join(", ")}`,
      );
    }
    if (
      (diff.review.length > 0 || diff.summary.bindingsAtRisk > 0) &&
      !options.acknowledgeReview
    ) {
      throw new Refused(
        `--apply is blocked: ${diff.review.length} identity proposals and ${diff.summary.bindingsAtRisk} binding risks are unresolved. Read the report, then pass --acknowledge-review to proceed anyway.`,
      );
    }
    const target = options.datasetOut as string;
    if (fs.existsSync(target)) {
      fs.copyFileSync(target, `${target}.backup`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    fs.renameSync(temporary, target);
    process.stdout.write(`apply       wrote ${target}\n`);
  }

  process.stdout.write(
    `${JSON.stringify({
      ok: failedChecks.length === 0,
      mode: reportContext.mode,
      currentOfferings: diff.current.offerings,
      candidateOfferings: diff.candidate.offerings,
      added: diff.summary.offeringsAdded,
      retired: diff.summary.offeringsRetired,
      renamedIdsPreserved: diff.summary.offeringIdsPreserved,
      variantIdsPreserved: diff.summary.variantIdsPreserved,
      variantsGained: diff.summary.variantsGained,
      variantsLost: diff.summary.variantsLost,
      displayStateTransitions: diff.summary.displayStateTransitions,
      reviewItems: diff.summary.reviewItems,
      bindingsAtRisk: diff.summary.bindingsAtRisk,
      failedChecks: blockers,
      report: markdownPath,
      json: jsonPath,
      continuity: continuityPath,
      finalArtifact: finalPath,
      productionMutated: false,
      databaseMutated: false,
      productControlBindingCreated: false,
    })}\n`,
  );

  return failedChecks.length === 0 ? 0 : 1;
}

try {
  process.exit(main());
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
}

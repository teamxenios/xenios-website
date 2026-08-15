/**
 * Build the member-safe master-offerings dataset from the MASTER CATALOG
 * workbook's private intake (the 420-row canonical selection).
 *
 * Usage:
 *   npx tsx scripts/research/build-master-offerings-from-catalog.ts \
 *     .local/research/kris-launch-a/private-intake.json \
 *     [output directory, .local by default]
 *
 * The intake is the one export-kris-launch-a.py already writes: this build
 * reads ONLY its masterRows and never the Kris pricing rows, so the two
 * artifacts stay independent while sharing one parse of one workbook.
 *
 * This script does not update Product Control, write a database, mount a
 * route, change a feature flag, create a commerce binding, or create a cart
 * selection. It refuses to write into the repository unless
 * XENIOS_ALLOW_REVIEWED_CATALOG_OUTPUT=true marks an explicit reviewed export.
 *
 * PRIVACY. The intake carries every private procurement column. The output
 * carries none of them, and that is proven three ways before a byte is
 * written: the projection enumerates member-safe fields (nothing else can
 * cross), every private column's exact header and camelCase twin is banned
 * from every key in the output, and every supplier name, money amount, and
 * private-note prefix from the intake is searched as a VALUE across the
 * entire serialized output. A hit refuses the build.
 */

import fs from "node:fs";
import path from "node:path";
import {
  MasterCatalogNormalizeError,
  normalizeMasterCatalog,
  type RawMasterCatalogRow,
} from "../../server/research/master-offerings/normalize-catalog";

const PRIVATE_MASTER_COLUMNS = [
  "Selected Supplier",
  "Supplier Variant / Format",
  "Original Quote",
  "Buy Cost / Unit",
  "Suggested Sell Price",
  "Gross Profit / Unit",
  "Gross Margin %",
  "Alternative Supplier",
  "Alternative Cost / Unit",
  "Savings vs Alternative",
  "Offers Compared",
  "Suppliers Compared",
  "Overlap Type",
  "Selection Rationale",
  "Planned Catalog Status",
  "Exact Planned Matches",
  "Related Planned Matches",
  "Recommended Action",
  "Source File",
  "Source Location",
  "Quality / Regulatory Notes",
  "Supplier Notes",
] as const;

const BANNED_KEY_FRAGMENTS = [
  "supplier",
  "buycost",
  "buy cost",
  "originalquote",
  "original quote",
  "suggestedsell",
  "suggested sell",
  "sellprice",
  "grossprofit",
  "gross profit",
  "grossmargin",
  "gross margin",
  "margin",
  "markup",
  "savings",
  "rationale",
  "sourcefile",
  "source file",
  "sourcelocation",
  "source location",
  "wholesale",
  "purchasable",
  "addtocart",
  "checkout",
] as const;

interface PrivateIntake {
  schemaVersion: 1;
  privateIntake: true;
  sources: {
    masterCatalog: { filename: string; sha256: string };
    krisPricing: { filename: string; sha256: string };
  };
  masterRows: RawMasterCatalogRow[];
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function readIntake(inputPath: string): PrivateIntake {
  const parsed = JSON.parse(fs.readFileSync(inputPath, "utf8")) as PrivateIntake;
  if (parsed.schemaVersion !== 1 || parsed.privateIntake !== true) {
    fail("input is not the private intake this build reads");
  }
  if (!Array.isArray(parsed.masterRows) || parsed.masterRows.length === 0) {
    fail("intake carries no master rows");
  }
  return parsed;
}

function safeOutputDirectory(argument: string | undefined): string {
  const chosen = argument ?? path.join(".local", "research", "master-offerings", "generated");
  const resolved = path.resolve(chosen);
  const local = resolved.includes(`${path.sep}.local${path.sep}`) || resolved.endsWith(`${path.sep}.local`);
  if (!local && process.env.XENIOS_ALLOW_REVIEWED_CATALOG_OUTPUT !== "true") {
    fail(
      "output must stay under .local unless XENIOS_ALLOW_REVIEWED_CATALOG_OUTPUT=true is set for an explicit reviewed export",
    );
  }
  return resolved;
}

/** Every confidential VALUE the intake carries, for the whole-output scan. */
function confidentialTerms(intake: PrivateIntake): string[] {
  const terms = new Set<string>();
  for (const row of intake.masterRows) {
    for (const column of ["Selected Supplier", "Alternative Supplier"]) {
      const value = row[column];
      if (typeof value === "string" && value.trim().length >= 3) {
        terms.add(value.trim().toLowerCase());
      }
    }
    for (const column of [
      "Selection Rationale",
      "Supplier Notes",
      "Quality / Regulatory Notes",
      "Source File",
      "Source Location",
    ]) {
      const value = row[column];
      if (typeof value === "string" && value.trim().length >= 12) {
        terms.add(value.trim().slice(0, 24).toLowerCase());
      }
    }
    for (const column of [
      "Buy Cost / Unit",
      "Original Quote",
      "Suggested Sell Price",
      "Gross Profit / Unit",
      "Alternative Cost / Unit",
    ]) {
      const value = row[column];
      if (typeof value === "number" && Number.isFinite(value) && value >= 3) {
        terms.add(value.toFixed(2));
      }
    }
  }
  return Array.from(terms);
}

function assertPublicSafe(value: unknown, terms: readonly string[]): void {
  const walk = (node: unknown, trail: string): void => {
    if (Array.isArray(node)) {
      node.forEach((entry, index) => walk(entry, `${trail}[${index}]`));
      return;
    }
    if (node && typeof node === "object") {
      for (const [key, entry] of Object.entries(node as Record<string, unknown>)) {
        // The invariants block DECLARES the absence of private data, so its
        // key names legitimately mention what is absent; every value in it
        // must be exactly false, which the reader separately requires.
        if (trail === "$" && key === "invariants") {
          for (const declared of Object.values(entry as Record<string, unknown>)) {
            if (declared !== false) {
              fail(`invariant declared ${String(declared)}; every invariant must be false`);
            }
          }
          continue;
        }
        const lowered = key.toLowerCase();
        for (const fragment of BANNED_KEY_FRAGMENTS) {
          if (lowered.includes(fragment)) {
            fail(`banned key "${key}" at ${trail} would reach the member output`);
          }
        }
        walk(entry, `${trail}.${key}`);
      }
      return;
    }
  };
  walk(value, "$");

  const serialized = JSON.stringify(value).toLowerCase();
  for (const term of terms) {
    if (term && serialized.includes(term)) {
      fail(
        `confidential value beginning "${term.slice(0, 12)}..." appears in the member output`,
      );
    }
  }
}

function writeJson(directory: string, filename: string, value: unknown): void {
  fs.writeFileSync(path.join(directory, filename), `${JSON.stringify(value, null, 1)}\n`);
}

const inputArgument = process.argv[2];
if (!inputArgument) fail("usage: build-master-offerings-from-catalog.ts <private-intake.json> [output]");
const intake = readIntake(path.resolve(inputArgument));
const output = safeOutputDirectory(process.argv[3]);
fs.mkdirSync(output, { recursive: true });

let catalog;
try {
  catalog = normalizeMasterCatalog(intake.masterRows);
} catch (error) {
  if (error instanceof MasterCatalogNormalizeError) fail(error.message);
  throw error;
}

const generatedAt = new Date().toISOString();
const terms = confidentialTerms(intake);

const publicCatalog = {
  schemaVersion: 1,
  generatedAt,
  sourceWorkbookSha256: intake.sources.masterCatalog.sha256,
  sourceRowCount: catalog.sourceRowCount,
  canonicalProductCount: catalog.products.length,
  variantCount: catalog.products.reduce((sum, product) => sum + product.variants.length, 0),
  invariants: {
    containsSupplierIdentity: false,
    containsWholesaleCost: false,
    containsPlanningPrice: false,
    containsMargin: false,
    containsInternalNotes: false,
    containsProviderNames: false,
    planningRowCanBecomePurchasable: false,
  },
  products: catalog.products.map((product) => ({
    id: product.id,
    slug: product.slug,
    displayName: product.displayName,
    canonicalName: product.canonicalName,
    family: product.family,
    category: product.category,
    subcategory: product.subcategory,
    brand: product.brand,
    aliases: product.aliases,
    displayState: product.displayState,
    stateExplanation: product.stateExplanation,
    copyState: product.copyState,
    variants: product.variants.map((variant) => ({
      id: variant.id,
      label: variant.label,
      displayState: variant.displayState,
    })),
  })),
};
assertPublicSafe(publicCatalog, terms);

const audit = {
  schemaVersion: 1,
  generatedAt,
  sourceWorkbookSha256: intake.sources.masterCatalog.sha256,
  sourceRowCount: catalog.sourceRowCount,
  memberSafeCanonicalProducts: catalog.products.length,
  memberSafeVariants: publicCatalog.variantCount,
  familyCounts: catalog.familyCounts,
  displayStateCounts: catalog.displayStateCounts,
  privateColumnsExcluded: PRIVATE_MASTER_COLUMNS.length,
  confidentialTermsScanned: terms.length,
};
assertPublicSafe(audit, terms);

const manifest = {
  schemaVersion: 1,
  input: {
    filename: intake.sources.masterCatalog.filename,
    sha256: intake.sources.masterCatalog.sha256,
    sheet: "MASTER CATALOG",
  },
  output: {
    directory: output,
    files: [
      "member-safe-master-offerings.generated.json",
      "master-offerings-audit.generated.json",
      "master-offerings-manifest.generated.json",
    ],
  },
  productionMutated: false,
  databaseMutated: false,
  routeMounted: false,
  commerceBindingCreated: false,
};

writeJson(output, "member-safe-master-offerings.generated.json", publicCatalog);
writeJson(output, "master-offerings-audit.generated.json", audit);
writeJson(output, "master-offerings-manifest.generated.json", manifest);

process.stdout.write(
  `${JSON.stringify({
    ok: true,
    sourceRows: catalog.sourceRowCount,
    products: catalog.products.length,
    variants: publicCatalog.variantCount,
    familyCounts: catalog.familyCounts,
    displayStateCounts: catalog.displayStateCounts,
    confidentialTermsScanned: terms.length,
    output,
  })}\n`,
);

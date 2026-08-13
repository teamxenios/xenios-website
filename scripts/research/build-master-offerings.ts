/**
 * Build and audit a member-safe Xenios master-offerings planning catalog from the
 * private JSON intake produced by export-master-offerings.py.
 *
 * Usage:
 *   npx tsx scripts/research/build-master-offerings.ts \
 *     .local/research/master-offerings/private-intake.json \
 *     [.local/research/master-offerings/generated]
 *
 * This script does not update Product Control, write a database, mount a route,
 * change a feature flag, create a commerce binding, or create a cart selection.
 */

import fs from "node:fs";
import path from "node:path";
import { normalizeMasterOfferings } from "../../server/research/master-offerings/normalize";
import type {
  RawEarlyAccessRow,
  RawMasterOfferingRow,
} from "../../server/research/master-offerings/model";

interface PrivateMasterOfferingsIntake {
  schemaVersion: 1;
  generatedAt: string;
  sourceWorkbook: {
    filename: string;
    sha256: string;
    masterSheet: string;
    earlyAccessSheet: string;
  };
  masterRows: RawMasterOfferingRow[];
  earlyAccessRows: RawEarlyAccessRow[];
  privateIntake: true;
  productionMutated: false;
  databaseMutated: false;
}

const BANNED_PUBLIC_KEYS = new Set([
  "supplierOrOwner",
  "supplier",
  "supplierSku",
  "sourceSku",
  "originalWholesaleCost",
  "updatedWholesaleCost",
  "wholesaleStatus",
  "originalSellPrice",
  "updatedSellPrice",
  "targetSellAtUpdatedCost",
  "recommendedLaunchSellPrice",
  "updatedMarkupMultiple",
  "updatedGrossProfit",
  "updatedGrossMargin",
  "activationRequirement",
  "sourceNotes",
  "sourceReferences",
  "canonicalKey",
  "planningPricePresent",
  "updatedWholesaleCostPresent",
]);


function fail(message: string): never {
  throw new Error(`Master offerings build refused: ${message}`);
}

function object(value: unknown, what: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${what} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nonBlank(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${what} must be a non-blank string`);
  }
  return value;
}

function readIntake(filename: string): PrivateMasterOfferingsIntake {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch (cause) {
    fail(`private intake could not be read: ${String(cause)}`);
  }
  const root = object(parsed, "private intake");
  if (root.schemaVersion !== 1 || root.privateIntake !== true) {
    fail("private intake schema or private marker is invalid");
  }
  if (root.productionMutated !== false || root.databaseMutated !== false) {
    fail("private intake mutation markers are invalid");
  }
  if (!Array.isArray(root.masterRows) || !Array.isArray(root.earlyAccessRows)) {
    fail("private intake row arrays are missing");
  }
  const sourceWorkbook = object(root.sourceWorkbook, "sourceWorkbook");
  const sha256 = nonBlank(sourceWorkbook.sha256, "sourceWorkbook.sha256");
  if (!/^[a-f0-9]{64}$/i.test(sha256)) {
    fail("sourceWorkbook.sha256 must be a 64-character SHA-256 digest");
  }
  for (const [index, row] of root.masterRows.entries()) {
    const candidate = object(row, `masterRows[${index}]`);
    if (!Number.isSafeInteger(candidate.sheetRow) || Number(candidate.sheetRow) < 1) {
      fail(`masterRows[${index}].sheetRow is invalid`);
    }
    for (const key of ["sourceGroup", "category", "productName"] as const) {
      if (typeof candidate[key] !== "string") {
        fail(`masterRows[${index}].${key} must be a string`);
      }
    }
  }
  for (const [index, row] of root.earlyAccessRows.entries()) {
    const candidate = object(row, `earlyAccessRows[${index}]`);
    if (candidate.status !== "Available" && candidate.status !== "Held") {
      fail(`earlyAccessRows[${index}].status is invalid`);
    }
  }
  return parsed as PrivateMasterOfferingsIntake;
}

function everyKey(value: unknown, output: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) everyKey(entry, output);
    return output;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      output.push(key);
      everyKey(child, output);
    }
  }
  return output;
}

function confidentialTermsFromIntake(
  intake: PrivateMasterOfferingsIntake,
): readonly string[] {
  const terms = new Set<string>();
  for (const row of intake.masterRows) {
    if (row.category !== "Provider & Performance Network") continue;
    const full = row.productName.trim().toLowerCase();
    if (full.length >= 4) terms.add(full);
    const withoutCredentials = full
      .replace(/,?\s+(md|do|np|pa|rn|phd)\.?$/i, "")
      .trim();
    if (withoutCredentials.length >= 4) terms.add(withoutCredentials);
  }
  const configured = process.env.XENIOS_CONFIDENTIAL_CATALOG_TERMS;
  if (configured) {
    for (const value of configured.split(",")) {
      const term = value.trim().toLowerCase();
      if (term.length >= 4) terms.add(term);
    }
  }
  return Array.from(terms);
}

function assertPublicSafe(
  value: unknown,
  confidentialTerms: readonly string[],
): void {
  const keys = everyKey(value);
  const leaked = Array.from(new Set(keys.filter((key) => BANNED_PUBLIC_KEYS.has(key))));
  if (leaked.length > 0) fail(`public payload contains private keys: ${leaked.join(", ")}`);
  const serialized = JSON.stringify(value).toLowerCase();
  for (const forbidden of confidentialTerms) {
    if (serialized.includes(forbidden)) {
      fail("public payload contains a confidential provider or team identity");
    }
  }
}

function safeOutputDirectory(raw: string | undefined): string {
  const output = path.resolve(
    raw ?? path.join(process.cwd(), ".local/research/master-offerings/generated"),
  );
  const relative = path.relative(process.cwd(), output).replace(/\\/g, "/");
  const local = relative === ".local" || relative.startsWith(".local/");
  if (!local && process.env.XENIOS_ALLOW_REVIEWED_CATALOG_OUTPUT !== "true") {
    fail(
      "output must stay under .local unless XENIOS_ALLOW_REVIEWED_CATALOG_OUTPUT=true is set for an explicit reviewed export",
    );
  }
  return output;
}

function writeJson(output: string, filename: string, value: unknown): void {
  fs.writeFileSync(path.join(output, filename), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const inputArgument = process.argv[2];
if (!inputArgument) fail("a private intake JSON path is required");
const inputPath = path.resolve(inputArgument);
if (!fs.existsSync(inputPath)) fail(`private intake not found at ${inputPath}`);
const output = safeOutputDirectory(process.argv[3]);
fs.mkdirSync(output, { recursive: true });

const intake = readIntake(inputPath);
const confidentialTerms = confidentialTermsFromIntake(intake);
const catalog = normalizeMasterOfferings(intake.masterRows, intake.earlyAccessRows);
const generatedAt = new Date().toISOString();

const publicCatalog = {
  schemaVersion: 1,
  generatedAt,
  sourceWorkbookSha256: intake.sourceWorkbook.sha256,
  sourceRowCount: catalog.sourceRowCount,
  canonicalProductCount: catalog.products.length,
  variantCount: catalog.products.reduce(
    (sum, product) => sum + product.variants.length,
    0,
  ),
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
assertPublicSafe(publicCatalog, confidentialTerms);

const audit = {
  schemaVersion: 1,
  generatedAt,
  sourceWorkbookSha256: intake.sourceWorkbook.sha256,
  sourceRowCount: intake.masterRows.length,
  earlyAccessRowCount: intake.earlyAccessRows.length,
  memberSafeCanonicalProducts: catalog.products.length,
  memberSafeVariants: publicCatalog.variantCount,
  adminOnlyHolds: catalog.holds,
  issueCounts: catalog.issues.reduce<Record<string, number>>((counts, issue) => {
    counts[issue.code] = (counts[issue.code] ?? 0) + 1;
    return counts;
  }, {}),
  issues: catalog.issues,
};
assertPublicSafe(audit, confidentialTerms);

const manifest = {
  schemaVersion: 1,
  input: {
    filename: intake.sourceWorkbook.filename,
    sha256: intake.sourceWorkbook.sha256,
    masterSheet: intake.sourceWorkbook.masterSheet,
    earlyAccessSheet: intake.sourceWorkbook.earlyAccessSheet,
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
    sourceRows: intake.masterRows.length,
    earlyAccessRows: intake.earlyAccessRows.length,
    canonicalProducts: catalog.products.length,
    variants: publicCatalog.variantCount,
    holds: catalog.holds.length,
    output,
  })}\n`,
);

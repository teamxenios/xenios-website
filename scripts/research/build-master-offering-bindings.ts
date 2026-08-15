/**
 * Build the reviewed commerce binding artifact for the master offerings
 * catalog: the exact join from each member-visible planning variant to the one
 * Product Control product and variant that carries its approved base price.
 *
 * Usage:
 *   npx tsx scripts/research/build-master-offering-bindings.ts \
 *     .local/research/kris-launch-a/private-intake.json \
 *     .local/research/gpc-identity-map.json \
 *     [output directory, .local by default]
 *
 * WHAT A BINDING IS AND IS NOT. A binding is identity only: it says which
 * Product Control unit corresponds to one offering variant. It carries no
 * amount, no audience, no availability, and no purchase authority. The price a
 * member sees still resolves through the existing authoritative price
 * resolver against an approved, in-window Product Control price row; the
 * binding merely names which row to ask about.
 *
 * WHY THIS IS A BUILD AND NOT RUNTIME INFERENCE. The production reader must
 * hold REVIEWED binding state (see production-bindings.ts). Deriving the join
 * at runtime by sku convention would make the joined state implicit and
 * unreviewable. This build makes it explicit: the artifact is committed, the
 * diff is reviewable, and the closed accounting below refuses to emit unless
 * every one of the 420 catalog rows is accounted for exactly once.
 *
 * THE JOIN, PROVEN THREE WAYS.
 *   1. The committed member-safe dataset and the private intake are produced
 *      from the SAME workbook parse in the SAME row order, and this build
 *      cross-checks that alignment per row (family, specification, product
 *      name) plus the workbook sha before trusting an index.
 *   2. The workbook Group ID is the variant sku in Product Control
 *      (GEN-GRP-NNNN), written that way by the initializer on purpose so this
 *      join needs no guessing.
 *   3. The identity map is a read-back of production Product Control after
 *      the initialization was count-verified (217 products, 417 variants,
 *      417 approved member prices).
 *
 * CLOSED ACCOUNTING. bound + unbound must equal the row count, the unbound
 * set must be EXACTLY the known exclusions (the shipping service row and the
 * two price-pending rows), and every identity-map entry must be consumed
 * exactly once. Any deviation refuses the build; updating the expectation is
 * a reviewed code change, never a silent drift.
 *
 * PRIVACY. The output carries only opaque ids and skus. The same key scan and
 * whole-output confidential-value scan as the dataset build run before a byte
 * is written, and the artifact refuses to land in the repository unless
 * XENIOS_ALLOW_REVIEWED_CATALOG_OUTPUT=true marks an explicit reviewed
 * export.
 */

import fs from "node:fs";
import path from "node:path";
import type { RawMasterCatalogRow } from "../../server/research/master-offerings/normalize-catalog";

const COMMITTED_DATASET_PATH = path.posix.join(
  "server",
  "research",
  "master-offerings",
  "data",
  "member-safe-master-offerings.generated.json",
);

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
] as const;

/**
 * Today's truth, pinned. GRP-0244 is the shipping service row, modeled as a
 * fulfillment fee rather than a purchasable product, so the initializer
 * created no Product Control unit for it. GRP-0364 and GRP-0365 carry no
 * usable base price yet, so no unit and no price row exist and their catalog
 * rows truthfully render "Price on request". When either fact changes, the
 * initializer runs first, this map shrinks in the same reviewed change, and
 * the build refuses to emit until both agree.
 */
const EXPECTED_UNBOUND: Record<string, string> = {
  "GRP-0244": "shipping service row: modeled as a fulfillment fee, not a purchasable product, so no Product Control unit exists",
  "GRP-0364": "price pending: no approved base price exists yet, so no Product Control unit was initialized",
  "GRP-0365": "price pending: no approved base price exists yet, so no Product Control unit was initialized",
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface PrivateIntake {
  schemaVersion: 1;
  privateIntake: true;
  sources: {
    masterCatalog: { filename: string; sha256: string };
    krisPricing: { filename: string; sha256: string };
  };
  masterRows: RawMasterCatalogRow[];
}

interface IdentityMap {
  schemaVersion: 1;
  readBackAt: string;
  source: string;
  entries: Array<[string, string, string]>;
}

interface DatasetProduct {
  id: string;
  category: string;
  aliases: string[];
  variants: Array<{ id: string; label: string }>;
}

interface CommittedDataset {
  schemaVersion: 1;
  sourceWorkbookSha256: string;
  sourceRowCount: number;
  products: DatasetProduct[];
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function readJson<T>(filePath: string, label: string): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch (error) {
    return fail(`${label} is not readable JSON at ${filePath}: ${String(error)}`);
  }
}

function safeOutputDirectory(argument: string | undefined): string {
  const chosen =
    argument ?? path.join(".local", "research", "master-offerings", "generated");
  const resolved = path.resolve(chosen);
  const local =
    resolved.includes(`${path.sep}.local${path.sep}`) ||
    resolved.endsWith(`${path.sep}.local`);
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
        // must be exactly false.
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
            fail(`banned key "${key}" at ${trail} would reach the committed output`);
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
        `confidential value beginning "${term.slice(0, 12)}..." appears in the binding output`,
      );
    }
  }
}

function requiredRowText(row: RawMasterCatalogRow, column: string, sheetRow: unknown): string {
  const value = row[column];
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return fail(`intake row ${String(sheetRow)}: column "${column}" is blank`);
  return text;
}

const [, , intakeArgument, identityArgument, outputArgument] = process.argv;
if (!intakeArgument || !identityArgument) {
  fail(
    "usage: build-master-offering-bindings.ts <private-intake.json> <identity-map.json> [output-dir]",
  );
}

const intake = readJson<PrivateIntake>(path.resolve(intakeArgument), "private intake");
if (intake.schemaVersion !== 1 || intake.privateIntake !== true) {
  fail("input is not the private intake this build reads");
}
if (!Array.isArray(intake.masterRows) || intake.masterRows.length === 0) {
  fail("intake carries no master rows");
}

const identity = readJson<IdentityMap>(path.resolve(identityArgument), "identity map");
if (identity.schemaVersion !== 1 || !Array.isArray(identity.entries)) {
  fail("identity map is not the production read-back this build expects");
}

const dataset = readJson<CommittedDataset>(
  path.resolve(COMMITTED_DATASET_PATH),
  "committed member-safe dataset",
);
if (!Array.isArray(dataset.products)) fail("committed dataset carries no products");

// The dataset and the intake must describe the same workbook edition, or an
// index alignment between them proves nothing.
if (dataset.sourceWorkbookSha256 !== intake.sources.masterCatalog.sha256) {
  fail(
    "committed dataset and private intake come from different workbook editions; regenerate the dataset first",
  );
}
if (dataset.products.length !== intake.masterRows.length) {
  fail(
    `row count mismatch: dataset ${dataset.products.length} vs intake ${intake.masterRows.length}`,
  );
}

// Index the production read-back by the Group ID digits, refusing duplicates
// and malformed identities up front.
const byGroupDigits = new Map<string, { productId: string; variantId: string }>();
const seenVariantIds = new Set<string>();
for (const entry of identity.entries) {
  if (!Array.isArray(entry) || entry.length !== 3) fail("identity map entry is malformed");
  const [digits, productId, variantId] = entry;
  if (!/^\d{4}$/.test(digits)) fail(`identity map key "${digits}" is not four digits`);
  if (!UUID_PATTERN.test(productId) || !UUID_PATTERN.test(variantId)) {
    fail(`identity map entry ${digits} carries a malformed uuid`);
  }
  if (byGroupDigits.has(digits)) fail(`identity map key ${digits} appears twice`);
  if (seenVariantIds.has(variantId)) fail(`variant uuid ${variantId} appears twice`);
  seenVariantIds.add(variantId);
  byGroupDigits.set(digits, { productId, variantId });
}

interface BindingRecord {
  offeringId: string;
  offeringVariantId: string;
  productControlSku: string;
  productId: string;
  variantId: string;
}

interface UnboundRecord {
  offeringId: string;
  offeringVariantId: string;
  reason: string;
}

const bindings: BindingRecord[] = [];
const unbound: UnboundRecord[] = [];
const consumedDigits = new Set<string>();
const seenOfferingVariantIds = new Set<string>();

for (let index = 0; index < intake.masterRows.length; index += 1) {
  const row = intake.masterRows[index];
  const offering = dataset.products[index];
  const sheetRow = row.sheetRow;

  const family = requiredRowText(row, "Family", sheetRow);
  const product = requiredRowText(row, "Product", sheetRow);
  const specification = requiredRowText(row, "Normalized Specification", sheetRow);
  const groupId = requiredRowText(row, "Group ID", sheetRow);
  if (!/^GRP-\d{4}$/.test(groupId)) {
    fail(`intake row ${String(sheetRow)}: Group ID "${groupId}" is not GRP-NNNN`);
  }

  // The alignment proof: the offering at this index must describe this exact
  // row, or the whole join is untrustworthy and the build stops.
  if (
    offering.category !== family ||
    offering.variants.length !== 1 ||
    offering.variants[0].label !== specification ||
    !offering.aliases.includes(product)
  ) {
    fail(
      `index ${index} misaligned: dataset offering ${offering.id} does not match intake row ${String(sheetRow)} (${product} | ${specification})`,
    );
  }

  const offeringVariantId = offering.variants[0].id;
  if (seenOfferingVariantIds.has(offeringVariantId)) {
    fail(`offering variant ${offeringVariantId} appears twice in the dataset`);
  }
  seenOfferingVariantIds.add(offeringVariantId);

  const digits = groupId.slice(-4);
  const mapped = byGroupDigits.get(digits);
  if (mapped) {
    consumedDigits.add(digits);
    bindings.push({
      offeringId: offering.id,
      offeringVariantId,
      productControlSku: `GEN-${groupId}`,
      productId: mapped.productId,
      variantId: mapped.variantId,
    });
    continue;
  }

  const expectedReason = EXPECTED_UNBOUND[groupId];
  if (!expectedReason) {
    fail(
      `row ${String(sheetRow)} (${groupId}) has no Product Control identity and is not a known exclusion; run the initializer or review the exclusion list`,
    );
  }
  unbound.push({ offeringId: offering.id, offeringVariantId, reason: expectedReason });
}

// Closed accounting, both directions.
if (bindings.length + unbound.length !== intake.masterRows.length) {
  fail(
    `accounting broke: ${bindings.length} bound + ${unbound.length} unbound != ${intake.masterRows.length} rows`,
  );
}
if (consumedDigits.size !== byGroupDigits.size) {
  const orphans = Array.from(byGroupDigits.keys()).filter((key) => !consumedDigits.has(key));
  fail(
    `production carries Product Control units no catalog row claims: ${orphans.join(", ")}`,
  );
}
if (unbound.length !== Object.keys(EXPECTED_UNBOUND).length) {
  fail(
    `expected exactly ${Object.keys(EXPECTED_UNBOUND).length} unbound rows, found ${unbound.length}`,
  );
}

const artifact = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceWorkbookSha256: intake.sources.masterCatalog.sha256,
  productionReadBack: {
    at: identity.readBackAt,
    source: identity.source,
  },
  boundCount: bindings.length,
  unboundCount: unbound.length,
  invariants: {
    containsSupplierIdentity: false,
    containsWholesaleCost: false,
    containsPlanningPrice: false,
    containsMargin: false,
    containsInternalNotes: false,
    bindingAuthorizesPurchase: false,
    bindingCarriesPrice: false,
  },
  bindings,
  unbound,
};

assertPublicSafe(artifact, confidentialTerms(intake));

const outputDirectory = safeOutputDirectory(outputArgument);
fs.mkdirSync(outputDirectory, { recursive: true });
const outputPath = path.join(outputDirectory, "master-offering-bindings.generated.json");
fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 1)}\n`, "utf8");

process.stdout.write(
  `wrote ${outputPath}: ${bindings.length} bindings, ${unbound.length} unbound (known exclusions), workbook ${intake.sources.masterCatalog.sha256.slice(0, 12)}\n`,
);

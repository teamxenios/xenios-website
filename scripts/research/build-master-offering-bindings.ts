/**
 * Build the reviewed commerce binding artifact for the master offerings
 * catalog: the exact join from each member-visible planning variant to the one
 * Product Control product and variant that carries its approved base price.
 *
 * Usage:
 *   Successor retention (no new Product Control identities or live reads):
 *   npx tsx scripts/research/build-master-offering-bindings.ts --retain-reviewed \
 *     --intake <private-intake.json> --candidate-dataset <candidate.json> \
 *     --predecessor-dataset <predecessor.json> --reviewed-bindings <reviewed.json> \
 *     --predecessor-source-sha <full-40-char-sha> --output <local-output-dir>
 *
 *   Original initialization (legacy path, unchanged requirements):
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
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { normalizeMasterCatalog } from "../../server/research/master-offerings/normalize-catalog";
import { applyCatalogReconciliation, type CatalogReconciliation } from "../../server/research/master-offerings/catalog-reconciliation";
import { assertDatasetReconciliationAuthority, parsePinnedReconciliationAuthority, PINNED_RECONCILIATION_FILE } from "../../server/research/master-offerings/reconciliation-authority";
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
 * Today's truth, pinned against the 426-row retail source. GRP-0364 (FedEx
 * Standard Overnight) is the shipping service row, modeled as a fulfillment fee
 * rather than a purchasable product, so the initializer created no Product
 * Control unit for it. GRP-0244 (BAM15) and GRP-0365 (Syringes & Alcohol Swabs)
 * carry no usable base price yet, so no unit and no price row exist and their
 * catalog rows truthfully render "Price on request". An earlier revision had the
 * shipping and price-pending explanations attached to the wrong identities;
 * the reasons below are keyed to the row kinds the source actually records.
 * When either fact changes, the initializer runs first, this map shrinks in the
 * same reviewed change, and the build refuses to emit until both agree.
 */
const EXPECTED_UNBOUND: Record<string, string> = {
  "GRP-0244": "price pending: no approved base price exists yet, so no Product Control unit was initialized",
  "GRP-0364": "shipping service row: modeled as a fulfillment fee, not a purchasable product, so no Product Control unit exists",
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
  throw new Error(`Master offering bindings refused: ${message}`);
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
        "confidential value appears in the binding output; private content omitted",
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

// Legacy initialization remains available, but successor reconciliation must
// use the explicit retained-review mode below. No new production identities
// can be introduced through that mode.
function legacyMain(argv: string[]): void {
const [intakeArgument, identityArgument, outputArgument] = argv;
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
}

const APPROVED_WORKBOOK = "6478ad0d3f710b75c6bf0c5f5e56ff1189ab2a2a4439cab23c2a28498134ea6f";
const HISTORICAL_PAIRS_MD5 = "062a30f0d3d0a0571e78837b5b92d4f6";
const RETAINED_PAIRS_MD5 = "86fdd019d3153e75920090136579b184";
const BINDINGS_PATH = "server/research/master-offerings/data/master-offering-bindings.generated.json";
const RECONCILIATION_PATH = "config/research/master-catalog-reconciliation-20260821.json";
const NEW_GROUPS = ["GRP-0421", "GRP-0422", "GRP-0423", "GRP-0424", "GRP-0425", "GRP-0426"] as const;
const SUPERSESSIONS = new Map([["GRP-0402", "GRP-0426"], ["GRP-0407", "GRP-0425"]]);

export interface ReviewedBinding {
  offeringId: string;
  offeringVariantId: string;
  productControlSku: string;
  productId: string;
  variantId: string;
}
const REVIEWED_BINDING_KEYS = ["offeringId", "offeringVariantId", "productControlSku", "productId", "variantId"] as const;
function copyIdentityBinding(binding: ReviewedBinding): ReviewedBinding {
  return {
    offeringId: binding.offeringId,
    offeringVariantId: binding.offeringVariantId,
    productControlSku: binding.productControlSku,
    productId: binding.productId,
    variantId: binding.variantId,
  };
}
interface ReviewedArtifact {
  schemaVersion: number;
  sourceWorkbookSha256: string;
  productionReadBack: { at: string; source: string };
  boundCount: number;
  unboundCount: number;
  bindings: ReviewedBinding[];
  unbound: Array<{ offeringId: string; offeringVariantId: string; reason: string }>;
}
interface RetainedBuildInput {
  intake: PrivateIntake;
  candidate: CommittedDataset;
  predecessorDataset: CommittedDataset;
  reviewed: ReviewedArtifact;
  predecessorSourceSha: string;
  // These are canonical Git blob bytes, not platform-normalized file bytes.
  predecessorBindingsBytes: Buffer;
  predecessorDatasetBytes: Buffer;
  reconciliationBytes: Buffer;
  /** Current candidate authority; never substitutes for the historical blob. */
  candidateReconciliationBytes: Buffer;
  generatedAt?: string;
}
const stable = (value: unknown): string => Array.isArray(value)
  ? `[${value.map(stable).join(",")}]`
  : value !== null && typeof value === "object"
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(",")}}`
    : JSON.stringify(value);
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const identityKey = (offeringId: string, offeringVariantId: string) => `${offeringId}|${offeringVariantId}`;
const pairMd5 = (bindings: readonly ReviewedBinding[]) => createHash("md5")
  .update(bindings.map((binding) => `${binding.productId}|${binding.variantId}`).sort().join("\n")).digest("hex");
// Presentation-only punctuation policy. Never feed this into identity hashing.
const publicText = (value: string) => value.replace(/\s*\u2014\s*/g, ": ");

/** Pure retained-authority generation. CLI additionally verifies Git ancestry
 * and obtains all three canonical blobs itself. Tests use synthetic rows. */
export function generateRetainedBindings(input: RetainedBuildInput) {
  const { intake, candidate, predecessorDataset, reviewed } = input;
  const candidateAuthority = parsePinnedReconciliationAuthority(input.candidateReconciliationBytes.toString("utf8"));
  const reconciliation = candidateAuthority.reconciliation;
  assertDatasetReconciliationAuthority(candidate as unknown as Record<string, unknown>, candidateAuthority);
  const historicalReconciliation = JSON.parse(input.reconciliationBytes.toString("utf8")) as CatalogReconciliation;
  if (!/^[0-9a-f]{40}$/.test(input.predecessorSourceSha)) fail("full predecessor source SHA required");
  for (const [bytes, artifact, label] of [
    [input.predecessorBindingsBytes, reviewed, "bindings"],
    [input.predecessorDatasetBytes, predecessorDataset, "dataset"],
  ] as const) {
    if (stable(JSON.parse(bytes.toString("utf8"))) !== stable(artifact)) fail(`supplied predecessor ${label} differs from its canonical blob`);
  }
  if (intake.schemaVersion !== 1 || intake.privateIntake !== true || !Array.isArray(intake.masterRows)
    || intake.masterRows.length !== 426 || intake.sources.masterCatalog.sha256 !== APPROVED_WORKBOOK
    || candidate.schemaVersion !== 1 || candidate.sourceWorkbookSha256 !== APPROVED_WORKBOOK
    || reconciliation.sourceWorkbook.sha256 !== APPROVED_WORKBOOK || reconciliation.sourceWorkbook.sourceRows !== 426
    || historicalReconciliation.sourceWorkbook.sha256 !== APPROVED_WORKBOOK || historicalReconciliation.sourceWorkbook.sourceRows !== 426) {
    fail("candidate/intake/pinned reconciliation workbook authority mismatch");
  }
  if (reviewed.schemaVersion !== 1 || reviewed.boundCount !== 417 || reviewed.unboundCount !== 3
    || !Array.isArray(reviewed.bindings) || reviewed.bindings.length !== 417 || !Array.isArray(reviewed.unbound)
    || reviewed.unbound.length !== 3 || reviewed.sourceWorkbookSha256 !== predecessorDataset.sourceWorkbookSha256
    || typeof reviewed.productionReadBack?.at !== "string" || !reviewed.productionReadBack.at
    || typeof reviewed.productionReadBack?.source !== "string" || !reviewed.productionReadBack.source) {
    fail("reviewed predecessor binding authority is incomplete");
  }
  const merges = reconciliation.merges.map((merge) => [merge.keeps, ...merge.supersedes].sort().join("|")).sort();
  if (stable(merges) !== stable(["GRP-0402|GRP-0426", "GRP-0407|GRP-0425"])
    || stable(reconciliation.commerceHolds.map((hold) => hold.sourceRow).sort()) !== stable(["GRP-0422"])) {
    fail("pinned reconciliation decisions changed");
  }
  const rawByIdentity = new Map<string, { groupId: string; normalized: ReturnType<typeof normalizeMasterCatalog>["products"][number] }>();
  const rawByGroup = new Map<string, ReturnType<typeof normalizeMasterCatalog>["products"][number]>();
  for (const row of intake.masterRows) {
    const groupId = requiredRowText(row, "Group ID", row.sheetRow);
    if (!/^GRP-\d{4}$/.test(groupId) || rawByGroup.has(groupId)) fail("duplicate/malformed source group identity");
    // Normalize raw source BEFORE public punctuation cleanup. Per-row avoids
    // treating intentional superseded source rows as duplicate public slugs.
    const normalized = normalizeMasterCatalog([row]).products[0];
    const key = identityKey(normalized.id, normalized.variants[0].id);
    if (rawByIdentity.has(key)) fail("duplicate normalized source identity");
    rawByIdentity.set(key, { groupId, normalized });
    rawByGroup.set(groupId, normalized);
  }
  const canonicalRows = applyCatalogReconciliation(intake.masterRows, reconciliation);
  const expectedGroups = new Set(canonicalRows.rows.map((row) => requiredRowText(row, "Group ID", row.sheetRow)));
  if (expectedGroups.size !== 424) fail("reconciled source count is not 424");
  function indexDataset(dataset: CommittedDataset, expectedCount: number, label: string) {
    if (!Array.isArray(dataset.products) || dataset.products.length !== expectedCount) fail(`${label} count mismatch`);
    const index = new Map<string, { groupId: string; offering: DatasetProduct }>();
    const groups = new Set<string>();
    for (const offering of dataset.products) {
      if (!Array.isArray(offering.variants) || offering.variants.length !== 1 || !Array.isArray(offering.aliases)) fail(`${label} variant shape invalid`);
      const variant = offering.variants[0], key = identityKey(offering.id, variant.id), raw = rawByIdentity.get(key);
      if (!raw || index.has(key) || groups.has(raw.groupId)) fail(`${label} duplicate/orphan stable identity`);
      const hold = label === "candidate" ? reconciliation.commerceHolds.find((entry) => entry.sourceRow === raw.groupId) : undefined;
      if (hold && (hold.catalogIdentity.offeringId !== raw.normalized.id || hold.catalogIdentity.offeringVariantId !== raw.normalized.variants[0].id)) {
        fail("reviewed held pair does not match raw source identity");
      }
      // The source identity remains hashed from its original '(split pending)'
      // text. Only candidate presentation takes the reviewed exact spec.
      const expectedLabel = hold?.specification ?? raw.normalized.variants[0].label;
      if (offering.category !== raw.normalized.category
        || publicText(variant.label) !== publicText(expectedLabel)
        || !offering.aliases.map(publicText).includes(publicText(raw.normalized.displayName))) fail(`${label} public identity fields mismatch`);
      index.set(key, { groupId: raw.groupId, offering });groups.add(raw.groupId);
    }
    return { index, groups };
  }
  const prior = indexDataset(predecessorDataset, 420, "predecessor"), next = indexDataset(candidate, 424, "candidate");
  if (stable([...next.groups].sort()) !== stable([...expectedGroups].sort())) fail("candidate is not the reconciled complete catalog");
  const retained = [...prior.index.keys()].filter((key) => next.index.has(key));
  const added = [...next.index.entries()].filter(([key]) => !prior.index.has(key)).map(([, row]) => row.groupId).sort();
  const removed = [...prior.index.entries()].filter(([key]) => !next.index.has(key)).map(([, row]) => row.groupId).sort();
  if (retained.length !== 418 || stable(added) !== stable([...NEW_GROUPS]) || stable(removed) !== stable([...SUPERSESSIONS.keys()])) fail("reviewed 418/2/6 identity delta mismatch");
  const seenBindings = new Set<string>(), seenUuids = new Set<string>(), seenSkus = new Set<string>();
  const bindingIndex = new Map<string, ReviewedBinding>();
  for (const binding of reviewed.bindings) {
    if (binding === null || typeof binding !== "object" || Array.isArray(binding)
      || Object.keys(binding).length !== REVIEWED_BINDING_KEYS.length
      || REVIEWED_BINDING_KEYS.some((key) => !Object.hasOwn(binding, key) || typeof binding[key] !== "string")) {
      fail("reviewed artifact requires exact identity-only binding keys");
    }
    const key = identityKey(binding.offeringId, binding.offeringVariantId), priorRow = prior.index.get(key);
    if (!priorRow || seenBindings.has(key) || seenUuids.has(binding.variantId) || seenSkus.has(binding.productControlSku)
      || !UUID_PATTERN.test(binding.productId) || !UUID_PATTERN.test(binding.variantId)
      || binding.productControlSku !== `GEN-${priorRow.groupId}`) fail("reviewed binding duplicate/orphan/mismatched authority");
    seenBindings.add(key);seenUuids.add(binding.variantId);seenSkus.add(binding.productControlSku);bindingIndex.set(key, binding);
  }
  const oldUnboundGroups = new Set<string>();
  for (const unbound of reviewed.unbound) {
    const key = identityKey(unbound.offeringId, unbound.offeringVariantId), row = prior.index.get(key);
    if (!row || seenBindings.has(key) || oldUnboundGroups.has(row.groupId) || !EXPECTED_UNBOUND[row.groupId]) fail("reviewed unbound identity mismatch");
    oldUnboundGroups.add(row.groupId);
  }
  if (stable([...oldUnboundGroups].sort()) !== stable(Object.keys(EXPECTED_UNBOUND).sort())
    || pairMd5(reviewed.bindings) !== HISTORICAL_PAIRS_MD5) fail("historical authority fingerprint changed; no new measurement is inferred");
  const bindings: ReviewedBinding[] = [], unbound: Array<{ offeringId: string; offeringVariantId: string; sourceGroupId: string; reason: string; reasonCode: string }> = [];
  for (const [key, row] of [...next.index.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const binding = bindingIndex.get(key);
    if (binding) { bindings.push(copyIdentityBinding(binding));continue; }
    const newIdentity = NEW_GROUPS.includes(row.groupId as typeof NEW_GROUPS[number]);
    const reason = EXPECTED_UNBOUND[row.groupId] ?? (newIdentity
      ? "new canonical identity: no reviewed Product Control binding exists; purchase remains held" : null);
    if (!reason) fail("unreviewed unbound candidate identity");
    unbound.push({ offeringId: row.offering.id, offeringVariantId: row.offering.variants[0].id, sourceGroupId: row.groupId,
      reason, reasonCode: newIdentity ? "binding_pending" : row.groupId === "GRP-0364" ? "shipping_service" : "quote_only" });
  }
  // Preserve the exact reviewed predecessor order for retained identities. A
  // canonical reconciliation should not bury two removals in a whole-artifact
  // reorder; source/candidate row order still cannot change this result.
  const historicalOrder = new Map(reviewed.bindings.map((binding, index) => [binding.offeringVariantId, index]));
  bindings.sort((left, right) => historicalOrder.get(left.offeringVariantId)! - historicalOrder.get(right.offeringVariantId)!);
  const supersededBindings = reviewed.bindings.filter((binding) => !next.index.has(identityKey(binding.offeringId, binding.offeringVariantId))).map((binding) => {
    const sourceGroupId = prior.index.get(identityKey(binding.offeringId, binding.offeringVariantId))!.groupId;
    const supersededBySourceGroupId = SUPERSESSIONS.get(sourceGroupId);
    if (!supersededBySourceGroupId) fail("unexplained orphan binding cannot be discarded");
    const successor = rawByGroup.get(supersededBySourceGroupId)!;
    return { binding: copyIdentityBinding(binding), sourceGroupId, supersededBySourceGroupId,
      successorOfferingId: successor.id, successorOfferingVariantId: successor.variants[0].id,
      disposition: "archived_not_transferred", sourceRows: [supersededBySourceGroupId, sourceGroupId] };
  });
  if (bindings.length !== 415 || unbound.length !== 9 || supersededBindings.length !== 2 || pairMd5(bindings) !== RETAINED_PAIRS_MD5) fail("retained binding accounting/fingerprint mismatch");
  const artifact = {
    schemaVersion: 1, generatedAt: input.generatedAt ?? new Date().toISOString(), sourceWorkbookSha256: APPROVED_WORKBOOK,
    productionReadBack: { ...reviewed.productionReadBack }, boundCount: bindings.length, unboundCount: unbound.length,
    retainedAuthority: {
      mode: "reviewed_predecessor_subset", predecessorSourceSha: input.predecessorSourceSha,
      predecessorBindingsCanonicalSha256: sha256(input.predecessorBindingsBytes), predecessorDatasetCanonicalSha256: sha256(input.predecessorDatasetBytes),
      predecessorReconciliationCanonicalSha256: sha256(input.reconciliationBytes), predecessorWorkbookSha256: reviewed.sourceWorkbookSha256,
      candidateReconciliationFile: candidateAuthority.file, candidateReconciliationSha256: candidateAuthority.sha256,
      candidateReconciliationHashPolicy: "utf8_crlf_to_lf_source_text",
      historicalPairCount: 417, historicalPairMd5: HISTORICAL_PAIRS_MD5, retainedPairCount: 415, retainedPairMd5: RETAINED_PAIRS_MD5,
      productionReadBackRefreshed: false, sourceRows: 426, canonicalVariants: 424, retainedIdentities: 418, newIdentities: 6,
    },
    reconciliation: { file: candidateAuthority.file, sha256: candidateAuthority.sha256,
      provenance: Object.fromEntries(canonicalRows.provenance.sourceRowsByCanonical), commerceHeldRows: [...canonicalRows.provenance.commerceHeldRows].sort() },
    invariants: { containsSupplierIdentity: false, containsWholesaleCost: false, containsPlanningPrice: false, containsMargin: false,
      containsInternalNotes: false, bindingAuthorizesPurchase: false, bindingCarriesPrice: false },
    bindings, unbound, supersededBindings,
  };
  assertPublicSafe(artifact, confidentialTerms(intake));
  return artifact;
}

function retainedMain(argv: string[]): void {
  const options = new Map<string, string>();
  const allowed = new Set(["--intake", "--candidate-dataset", "--predecessor-dataset", "--reviewed-bindings", "--predecessor-source-sha", "--output"]);
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i], value = argv[i + 1];
    if (!allowed.has(key) || !value || value.startsWith("--") || options.has(key)) fail("invalid/duplicate retained-review argument");
    options.set(key, value);
  }
  if (options.size !== allowed.size) fail("retained-review requires intake, candidate/predecessor datasets, reviewed bindings, full predecessor SHA and output");
  const sourceSha = options.get("--predecessor-source-sha")!;
  if (!/^[0-9a-f]{40}$/.test(sourceSha)) fail("full predecessor source SHA required");
  execFileSync("git", ["merge-base", "--is-ancestor", sourceSha, "HEAD"], { stdio: "pipe" });
  const blob = (relative: string) => execFileSync("git", ["show", `${sourceSha}:${relative}`]);
  const reconciliationBytes = blob(RECONCILIATION_PATH);
  const artifact = generateRetainedBindings({
    intake: readJson(options.get("--intake")!, "private intake"), candidate: readJson(options.get("--candidate-dataset")!, "candidate dataset"),
    predecessorDataset: readJson(options.get("--predecessor-dataset")!, "predecessor dataset"), reviewed: readJson(options.get("--reviewed-bindings")!, "reviewed binding artifact"),
    predecessorSourceSha: sourceSha,
    predecessorBindingsBytes: blob(BINDINGS_PATH), predecessorDatasetBytes: blob(COMMITTED_DATASET_PATH), reconciliationBytes,
    candidateReconciliationBytes: fs.readFileSync(path.resolve("config", "research", PINNED_RECONCILIATION_FILE)),
  });
  const output = safeOutputDirectory(options.get("--output"));fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, "master-offering-bindings.generated.json"), `${JSON.stringify(artifact, null, 1)}\n`, "utf8");
  process.stdout.write(`wrote retained reviewed binding artifact: 415 active, 9 unbound, 2 archived; no live measurement or database changes\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const argv = process.argv.slice(2);
    if (argv[0] === "--retain-reviewed") retainedMain(argv.slice(1));else legacyMain(argv);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "binding build refused"}\n`);process.exitCode = 1;
  }
}

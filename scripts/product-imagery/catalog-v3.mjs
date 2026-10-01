/**
 * Deterministic, price-free product-imagery projection of the founder-reviewed
 * 426-row catalog evidence.
 *
 * This module is deliberately not a runtime catalog authority. It reads the
 * reviewed source files, applies their two declared identity merges, and emits
 * only the identity, form, and catalog-presentation facts needed by the v3
 * imagery lane.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CATALOG_V3_SOURCE_PATH =
  "docs/research-launch/XENIOS_RETAIL_ONLY_MASTER_CATALOG_426_VARIANTS.csv";
export const CATALOG_V3_RECONCILIATION_PATH =
  "config/research/master-catalog-reconciliation-20260821.json";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const EXPECTED_SOURCE_ROWS = 426;
const EXPECTED_CANONICAL_ROWS = 424;
const REQUIRED_HOLD_GROUP_ID = "GRP-0422";

const CATALOG_COLUMNS = Object.freeze([
  "Group ID",
  "Family",
  "Channel",
  "Product",
  "Normalized Specification",
  "Dosage Form",
  "Current Retail Price",
  "Price Display",
  "Planned Catalog Status",
]);

export const FAMILY_BY_CATALOG_CATEGORY = Object.freeze({
  "503A Clinical Formulations": "clinical_formulations_503a",
  "Research Capsules": "research_capsules",
  "Research Peptides & Materials": "research_peptides_materials",
  "Research Supplies": "research_supplies",
  "Shipping & Fulfillment": "shipping_and_fulfillment",
  Supplements: "supplements",
  "Topicals & Regenerative": "topicals_regenerative",
});

/**
 * Pinned compatibility witnesses from the current normalize-catalog SHA-256
 * identity formulas. They make any accidental delimiter, case, or field-order
 * drift fail at projection time.
 */
export const EXPECTED_NEW_ROW_IDENTITIES = Object.freeze({
  "GRP-0421": Object.freeze({
    offeringId: "mo_c4698a34aaaf7aec47b2",
    offeringVariantId: "mov_14b4034bef7ef37d9fc8",
  }),
  "GRP-0422": Object.freeze({
    offeringId: "mo_2babbadce5172426bde2",
    offeringVariantId: "mov_f61758881da2b7bfa539",
  }),
  "GRP-0423": Object.freeze({
    offeringId: "mo_f40119d9a74b2af15be6",
    offeringVariantId: "mov_cb3642e564392fa86dda",
  }),
  "GRP-0424": Object.freeze({
    offeringId: "mo_c77c4659a519b58ac795",
    offeringVariantId: "mov_be54afb7419ed7240752",
  }),
  "GRP-0425": Object.freeze({
    offeringId: "mo_3eec45f31e19795343f1",
    offeringVariantId: "mov_c26ef47dfbbe46f7e090",
  }),
  "GRP-0426": Object.freeze({
    offeringId: "mo_a535d8a2951bc7c6c0a3",
    offeringVariantId: "mov_3c8ca424d78153fd931a",
  }),
});

const OUTPUT_ROW_KEYS = Object.freeze([
  "groupId",
  "family",
  "category",
  "slug",
  "channel",
  "product",
  "specification",
  "dosageForm",
  "offeringId",
  "offeringVariantId",
  "sourceGroupIds",
]);

export class ReviewedCatalogProjectionError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReviewedCatalogProjectionError";
  }
}

function fail(message) {
  throw new ReviewedCatalogProjectionError(message);
}

/**
 * Parse RFC 4180 records without a dependency or delimiter-splitting shortcut.
 * Quoted commas, CR/LF within quoted fields, and doubled quotes are preserved.
 * The return value is a matrix whose first row is the header record.
 */
export function parseCsv(input) {
  let text;
  if (typeof input === "string") {
    text = input;
  } else if (Buffer.isBuffer(input) || ArrayBuffer.isView(input)) {
    text = Buffer.from(
      input.buffer ?? input,
      input.byteOffset ?? 0,
      input.byteLength ?? input.length,
    ).toString("utf8");
  } else {
    throw new TypeError("parseCsv expects a string, Buffer, or typed array");
  }

  if (text.startsWith("\uFEFF")) text = text.slice(1);
  if (text.includes("\u0000")) fail("CSV contains a NUL byte and is not valid text evidence");
  if (text.length === 0) return [];

  const records = [];
  let record = [];
  let field = "";
  let inQuotes = false;
  let closedQuote = false;

  const finishField = () => {
    record.push(field);
    field = "";
    closedQuote = false;
  };
  const finishRecord = () => {
    finishField();
    records.push(record);
    record = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character !== '"') {
        field += character;
        continue;
      }
      if (text[index + 1] === '"') {
        field += '"';
        index += 1;
        continue;
      }
      inQuotes = false;
      closedQuote = true;
      continue;
    }

    if (closedQuote) {
      if (character === ",") {
        finishField();
        continue;
      }
      if (character === "\r" || character === "\n") {
        if (character === "\r" && text[index + 1] === "\n") index += 1;
        finishRecord();
        continue;
      }
      fail(
        `CSV character ${JSON.stringify(character)} follows a closing quote at offset ${index}`,
      );
    }

    if (character === '"') {
      if (field.length !== 0) {
        fail(`CSV quote appears inside an unquoted field at offset ${index}`);
      }
      inQuotes = true;
      continue;
    }
    if (character === ",") {
      finishField();
      continue;
    }
    if (character === "\r" || character === "\n") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      finishRecord();
      continue;
    }
    field += character;
  }

  if (inQuotes) fail("CSV ends inside a quoted field");
  if (closedQuote || field.length > 0 || record.length > 0) finishRecord();
  return records;
}

function catalogRecords(csvBytes) {
  const matrix = parseCsv(csvBytes);
  if (matrix.length < 2) fail("catalog CSV has no data rows");

  const [headers, ...dataRows] = matrix;
  if (
    headers.length !== CATALOG_COLUMNS.length ||
    headers.some((header, index) => header !== CATALOG_COLUMNS[index])
  ) {
    fail(
      `catalog CSV headers changed; expected ${JSON.stringify(CATALOG_COLUMNS)}, got ${JSON.stringify(headers)}`,
    );
  }

  return dataRows.map((cells, rowIndex) => {
    const csvLine = rowIndex + 2;
    if (cells.length !== headers.length) {
      fail(
        `catalog CSV row ${csvLine} has ${cells.length} fields; expected ${headers.length}`,
      );
    }
    return Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
  });
}

function requiredText(row, column, context) {
  const value = row[column];
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) fail(`${context}: required column ${JSON.stringify(column)} is blank`);
  return text;
}

function optionalText(row, column) {
  const value = row[column];
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function requiredObject(value, context) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${context} must be an object`);
  }
  return value;
}

function requiredArray(value, context) {
  if (!Array.isArray(value)) fail(`${context} must be an array`);
  return value;
}

function requiredString(value, context) {
  if (typeof value !== "string" || !value.trim()) {
    fail(`${context} must be a non-empty string`);
  }
  return value.trim();
}

function requiredInteger(value, context) {
  if (!Number.isInteger(value) || value < 0) {
    fail(`${context} must be a non-negative integer`);
  }
  return value;
}

function hashId(prefix, value) {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 20)}`;
}

export function deriveOfferingId({
  groupId,
  family,
  product,
  specification,
}) {
  return hashId(
    "mo",
    `${groupId}\u0000${family}\u0000${product}\u0000${specification}`,
  );
}

export function deriveOfferingVariantId(offeringId, specification) {
  return hashId("mov", `${offeringId}\u0000${specification}`);
}

/** Exact slug rule exported by the current normalize-catalog implementation. */
export function slugifyCatalogOffering(value) {
  const slug = value
    .normalize("NFKD")
    .replace(/\+/g, " plus ")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return slug || "offering";
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

/** Compute the Git object id for exact blob bytes. */
export function gitBlobOid(bytes) {
  const content = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return crypto
    .createHash("sha1")
    .update(`blob ${content.length}\u0000`)
    .update(content)
    .digest("hex");
}

export function gitTextBlobOid(bytes) {
  // This repository checks text out with CRLF on Windows. Git stores these
  // sources with LF, so compute the stable repository blob identity from the
  // clean-text representation while the SHA-256 above records exact read bytes.
  const normalized = Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
  return gitBlobOid(normalized);
}

function sourceDescriptor(repoRoot, absolutePath, bytes) {
  const normalized = Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
  return {
    path: path.relative(repoRoot, absolutePath).split(path.sep).join("/"),
    byteSize: normalized.length,
    sha256: sha256(normalized),
    sha256Semantics: "lf_normalized_repository_text_bytes",
    gitBlobOid: gitBlobOid(normalized),
  };
}

function validateUniqueSourceRows(records) {
  const byGroupId = new Map();
  records.forEach((row, index) => {
    const groupId = requiredText(row, "Group ID", `catalog row ${index + 2}`);
    if (byGroupId.has(groupId)) {
      fail(`catalog carries duplicate Group ID ${groupId}`);
    }
    byGroupId.set(groupId, row);
  });
  return byGroupId;
}

function mappedFamily(row, groupId) {
  const category = requiredText(row, "Family", groupId);
  const family = FAMILY_BY_CATALOG_CATEGORY[category];
  if (!family) {
    fail(`${groupId}: unknown catalog family ${JSON.stringify(category)}`);
  }
  return { family, category };
}

function reconcile(records, reconciliation) {
  const sourceWorkbook = requiredObject(
    reconciliation.sourceWorkbook,
    "reconciliation.sourceWorkbook",
  );
  const expected = requiredObject(reconciliation.expected, "reconciliation.expected");
  const sourceRowCount = requiredInteger(
    sourceWorkbook.sourceRows,
    "reconciliation.sourceWorkbook.sourceRows",
  );
  const expectedSourceRows = requiredInteger(
    expected.sourceRows,
    "reconciliation.expected.sourceRows",
  );
  const expectedCanonicalRows = requiredInteger(
    expected.canonicalVariants,
    "reconciliation.expected.canonicalVariants",
  );

  if (
    sourceRowCount !== EXPECTED_SOURCE_ROWS ||
    expectedSourceRows !== EXPECTED_SOURCE_ROWS ||
    records.length !== EXPECTED_SOURCE_ROWS
  ) {
    fail(
      `reviewed source accounting must remain ${EXPECTED_SOURCE_ROWS}; config=${sourceRowCount}/${expectedSourceRows}, CSV=${records.length}`,
    );
  }
  if (expectedCanonicalRows !== EXPECTED_CANONICAL_ROWS) {
    fail(
      `reviewed canonical accounting must remain ${EXPECTED_CANONICAL_ROWS}; got ${expectedCanonicalRows}`,
    );
  }

  const byGroupId = validateUniqueSourceRows(records);
  const superseded = new Set();
  const provenanceByKeptGroupId = new Map();
  const decisionGroupIds = new Set();
  const mergeIds = new Set();

  for (const [mergeIndex, rawMerge] of requiredArray(
    reconciliation.merges,
    "reconciliation.merges",
  ).entries()) {
    const merge = requiredObject(rawMerge, `reconciliation.merges[${mergeIndex}]`);
    const mergeId = requiredString(merge.id, `reconciliation.merges[${mergeIndex}].id`);
    const keeps = requiredString(merge.keeps, `merge ${mergeId}.keeps`);
    const supersedes = requiredArray(
      merge.supersedes,
      `merge ${mergeId}.supersedes`,
    ).map((groupId, index) =>
      requiredString(groupId, `merge ${mergeId}.supersedes[${index}]`),
    );
    if (mergeIds.has(mergeId)) fail(`duplicate reconciliation merge id ${mergeId}`);
    if (supersedes.length === 0) fail(`merge ${mergeId} supersedes no source row`);
    mergeIds.add(mergeId);

    const keptRow = byGroupId.get(keeps);
    if (!keptRow) fail(`merge ${mergeId} keeps absent source row ${keeps}`);
    if (decisionGroupIds.has(keeps)) {
      fail(`source row ${keeps} participates in more than one reviewed merge`);
    }
    decisionGroupIds.add(keeps);

    for (const groupId of supersedes) {
      if (!byGroupId.has(groupId)) {
        fail(`merge ${mergeId} supersedes absent source row ${groupId}`);
      }
      if (groupId === keeps) fail(`merge ${mergeId} supersedes its kept row ${keeps}`);
      if (decisionGroupIds.has(groupId)) {
        fail(`source row ${groupId} participates in more than one reviewed merge`);
      }
      decisionGroupIds.add(groupId);
      superseded.add(groupId);
    }

    const canonical = requiredObject(merge.canonical, `merge ${mergeId}.canonical`);
    const keptFamily = mappedFamily(keptRow, keeps).family;
    const keptChannel = requiredText(keptRow, "Channel", keeps);
    const canonicalChecks = [
      ["product", requiredText(keptRow, "Product", keeps)],
      ["specification", requiredText(keptRow, "Normalized Specification", keeps)],
      ["family", keptFamily],
      ["channel", keptChannel],
    ];
    for (const [field, actual] of canonicalChecks) {
      const reviewed = requiredString(canonical[field], `merge ${mergeId}.canonical.${field}`);
      if (reviewed !== actual) {
        fail(
          `merge ${mergeId} canonical ${field} does not match kept row ${keeps}: ${JSON.stringify(reviewed)} != ${JSON.stringify(actual)}`,
        );
      }
    }

    provenanceByKeptGroupId.set(keeps, [keeps, ...supersedes]);
  }

  const canonicalRecords = records.filter(
    (row) => !superseded.has(requiredText(row, "Group ID", "catalog row")),
  );
  if (canonicalRecords.length !== expectedCanonicalRows) {
    fail(
      `reviewed reconciliation produced ${canonicalRecords.length} rows; expected ${expectedCanonicalRows}`,
    );
  }

  const heldGroupIds = new Set();
  for (const [holdIndex, rawHold] of requiredArray(
    reconciliation.commerceHolds,
    "reconciliation.commerceHolds",
  ).entries()) {
    const hold = requiredObject(rawHold, `reconciliation.commerceHolds[${holdIndex}]`);
    const holdId = requiredString(hold.id, `reconciliation.commerceHolds[${holdIndex}].id`);
    const sourceRow = requiredString(hold.sourceRow, `hold ${holdId}.sourceRow`);
    const source = byGroupId.get(sourceRow);
    if (!source) fail(`commerce hold ${holdId} names absent source row ${sourceRow}`);
    if (superseded.has(sourceRow)) {
      fail(`commerce hold ${holdId} names superseded source row ${sourceRow}`);
    }
    if (heldGroupIds.has(sourceRow)) fail(`duplicate commerce hold for ${sourceRow}`);
    const reviewedProduct = requiredString(hold.product, `hold ${holdId}.product`);
    const sourceProduct = requiredText(source, "Product", sourceRow);
    if (reviewedProduct !== sourceProduct) {
      fail(`commerce hold ${holdId} product does not match ${sourceRow}`);
    }
    // The reviewed specification may intentionally omit an internal source
    // note such as "(split pending)". Presence, not display copy matching, is
    // the structured hold authority.
    requiredString(hold.specification, `hold ${holdId}.specification`);
    heldGroupIds.add(sourceRow);
  }

  const expectedHeld = requiredInteger(
    expected.peptideFormulationBlocked,
    "reconciliation.expected.peptideFormulationBlocked",
  );
  if (heldGroupIds.size !== expectedHeld || !heldGroupIds.has(REQUIRED_HOLD_GROUP_ID)) {
    fail(
      `reviewed formulation hold must include ${REQUIRED_HOLD_GROUP_ID} and total ${expectedHeld}; got ${JSON.stringify([...heldGroupIds])}`,
    );
  }

  const peptideSource = records.filter(
    (row) => row["Family"] === "Research Peptides & Materials",
  );
  const peptideCanonical = canonicalRecords.filter(
    (row) => row["Family"] === "Research Peptides & Materials",
  );
  const peptideRuo = peptideCanonical.filter((row) => row.Channel === "RUO Research");
  const actualAccounting = {
    sourceRows: records.length,
    canonicalVariants: canonicalRecords.length,
    peptideSourceRows: peptideSource.length,
    peptideCanonicalVariants: peptideCanonical.length,
    peptideDirect:
      peptideRuo.length -
      peptideRuo.filter((row) => heldGroupIds.has(row["Group ID"].trim())).length,
    peptideFormulationBlocked: heldGroupIds.size,
    peptidePendingUnique: peptideCanonical.length - peptideRuo.length,
  };
  for (const [key, actual] of Object.entries(actualAccounting)) {
    const reviewed = requiredInteger(expected[key], `reconciliation.expected.${key}`);
    if (actual !== reviewed) {
      fail(`reviewed accounting drift for ${key}: expected ${reviewed}, got ${actual}`);
    }
  }

  return {
    canonicalRecords,
    heldGroupIds,
    provenanceByKeptGroupId,
  };
}

function projectRow(row, context) {
  const groupId = requiredText(
    row,
    "Group ID",
    `canonical catalog row ${context.rowNumber}`,
  );
  const { family, category } = mappedFamily(row, groupId);
  const channel = requiredText(row, "Channel", groupId);
  const product = requiredText(row, "Product", groupId);
  const specification = requiredText(row, "Normalized Specification", groupId);
  const dosageForm = optionalText(row, "Dosage Form");
  const offeringId = deriveOfferingId({
    groupId,
    family,
    product,
    specification,
  });
  const offeringVariantId = deriveOfferingVariantId(offeringId, specification);

  return {
    groupId,
    family,
    category,
    slug: slugifyCatalogOffering(`${family} ${product} ${specification}`),
    channel,
    product,
    specification,
    dosageForm,
    offeringId,
    offeringVariantId,
    sourceGroupIds: context.provenanceByKeptGroupId.get(groupId) ?? [groupId],
  };
}

function validateProjectionRows(rows) {
  const offeringIds = new Set();
  const variantIds = new Set();
  const slugs = new Set();
  const byGroupId = new Map();

  for (const row of rows) {
    const keys = Object.keys(row);
    if (
      keys.length !== OUTPUT_ROW_KEYS.length ||
      keys.some((key, index) => key !== OUTPUT_ROW_KEYS[index])
    ) {
      fail(`projection row ${row.groupId ?? "<unknown>"} contains an unreviewed field`);
    }
    if (offeringIds.has(row.offeringId)) fail(`duplicate offering id ${row.offeringId}`);
    if (variantIds.has(row.offeringVariantId)) {
      fail(`duplicate offering variant id ${row.offeringVariantId}`);
    }
    if (slugs.has(row.slug)) fail(`duplicate offering slug ${row.slug}`);
    offeringIds.add(row.offeringId);
    variantIds.add(row.offeringVariantId);
    slugs.add(row.slug);
    byGroupId.set(row.groupId, row);
  }

  for (const [groupId, expected] of Object.entries(EXPECTED_NEW_ROW_IDENTITIES)) {
    const row = byGroupId.get(groupId);
    if (!row) fail(`deterministic identity witness ${groupId} is absent`);
    if (
      row.offeringId !== expected.offeringId ||
      row.offeringVariantId !== expected.offeringVariantId
    ) {
      fail(
        `${groupId} identity drift: expected ${expected.offeringId}/${expected.offeringVariantId}, got ${row.offeringId}/${row.offeringVariantId}`,
      );
    }
  }

}

/**
 * Build the reviewed 424-row imagery evidence projection.
 *
 * Options exist for isolated tests, but the no-argument call always reads the
 * repository's governing CSV and reviewed reconciliation artifact.
 */
export function buildReviewedCatalogProjection({
  repoRoot = REPO_ROOT,
  catalogPath = CATALOG_V3_SOURCE_PATH,
  reconciliationPath = CATALOG_V3_RECONCILIATION_PATH,
} = {}) {
  const resolvedRoot = path.resolve(repoRoot);
  const absoluteCatalogPath = path.resolve(resolvedRoot, catalogPath);
  const absoluteReconciliationPath = path.resolve(resolvedRoot, reconciliationPath);
  const catalogBytes = fs.readFileSync(absoluteCatalogPath);
  const reconciliationBytes = fs.readFileSync(absoluteReconciliationPath);

  let reconciliation;
  try {
    reconciliation = JSON.parse(reconciliationBytes.toString("utf8"));
  } catch (error) {
    fail(`reviewed reconciliation is not valid JSON: ${error.message}`);
  }
  requiredObject(reconciliation, "reconciliation");
  if (reconciliation.schemaVersion !== 1) {
    fail(`unsupported reconciliation schemaVersion ${JSON.stringify(reconciliation.schemaVersion)}`);
  }

  const records = catalogRecords(catalogBytes);
  const reconciled = reconcile(records, reconciliation);
  const context = {
    provenanceByKeptGroupId: reconciled.provenanceByKeptGroupId,
  };
  const rows = reconciled.canonicalRecords.map((row, index) =>
    projectRow(row, { ...context, rowNumber: index + 1 }),
  );
  validateProjectionRows(rows);

  return {
    schemaVersion: 1,
    projectionKind: "product_imagery_reviewed_catalog_evidence",
    runtimeCatalogAuthority: false,
    sources: {
      catalogCsv: sourceDescriptor(resolvedRoot, absoluteCatalogPath, catalogBytes),
      reviewedReconciliation: sourceDescriptor(
        resolvedRoot,
        absoluteReconciliationPath,
        reconciliationBytes,
      ),
    },
    sourceRowCount: records.length,
    canonicalRowCount: rows.length,
    rows,
  };
}

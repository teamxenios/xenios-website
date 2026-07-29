/**
 * Founder price-decision import: validation and dry-run planning ONLY.
 *
 * This module turns Samuel's founder price-decision artifact (a JSON list of
 * decision rows) into a typed, per-row validation result and a dry-run import
 * plan. It never touches a database and it deliberately exports NO mutation
 * path: there is no execute, apply, write, or commit function anywhere in
 * this file, and a test pins that invariant.
 *
 * Production mutation happens only through the release manager's protected
 * approval flow, using the SECURITY DEFINER RPCs
 * research_admin_create_product_price and
 * research_admin_approve_product_price (supabase migration
 * 20260726143000_research_product_control_center.sql). This module's job is
 * to say, precisely and safely, what that flow WOULD do.
 *
 * Boundary rules:
 * - Audiences are the customer price audiences only. compare_at is an
 *   admin display concept, never an importable decision audience.
 * - Currency is allowlisted (USD only today), reusing the frozen
 *   normalizePriceCurrency from shared/research/pricing.ts.
 * - Amounts are positive safe integer cents, reusing the frozen
 *   isCustomerSafeAmountCents guard.
 * - Identity is exact ids only. A decision without an exact product_id and
 *   variant_id is BLOCKED_UNRESOLVED_IDENTITY: not an error, never
 *   activatable, and name matching is never used as a substitute.
 * - No supplier cost, wholesale, or margin data exists anywhere in the
 *   decision schema or in any output of this module.
 */

import type {
  AdminProductDetail,
  AdminProductPrice,
  AdminProductVariant,
} from "@shared/research/product-admin";
import {
  CUSTOMER_PRICE_AUDIENCES,
  isCustomerSafeAmountCents,
  normalizePriceCurrency,
  type CustomerPriceAudience,
  type SupportedPriceCurrency,
} from "@shared/research/pricing";
import { parseProductControlTimestamp } from "../catalog/product-control-reader";
import type { PricingProductSource } from "./authoritative-price-resolver";

export const DECISION_STATUSES = ["APPROVED", "PROPOSED"] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export const PRODUCTION_ACTIONS = [
  "ACTIVATE_AFTER_EXACT_IDS_AND_READINESS",
  "HOLD_FOR_FOUNDER_APPROVAL",
] as const;
export type ProductionAction = (typeof PRODUCTION_ACTIONS)[number];

export const DECISION_ROW_STATUSES = ["active", "inactive"] as const;
export type DecisionRowStatus = (typeof DECISION_ROW_STATUSES)[number];

/**
 * Every field of the founder decision row schema. All keys are required to be
 * present; product_id, variant_id, effective_at, and expires_at may be null.
 */
export const REQUIRED_DECISION_FIELDS = [
  "decision_id",
  "product_name",
  "variant_selector",
  "audience",
  "amount_cents",
  "currency",
  "decision_status",
  "production_action",
  "product_id",
  "variant_id",
  "effective_at",
  "expires_at",
  "status",
  "approval_note",
] as const;

export const DECISION_ROW_ISSUE_CODES = [
  "invalid_document_shape",
  "row_not_object",
  "missing_required_field",
  "unknown_field",
  "invalid_field_type",
  "invalid_amount_cents",
  "unsupported_currency",
  "invalid_audience",
  "invalid_decision_status",
  "invalid_production_action",
  "invalid_row_status",
  "invalid_timestamp",
  "invalid_window",
  "duplicate_decision_id",
  "proposed_row_active",
  "overlapping_window_in_document",
] as const;

export type DecisionRowIssueCode = (typeof DECISION_ROW_ISSUE_CODES)[number];

export interface DecisionRowIssue {
  code: DecisionRowIssueCode;
  severity: "fatal" | "warning";
  field: string | null;
  message: string;
}

/** The parsed, typed decision row after validation. */
export interface PriceDecisionRow {
  decisionId: string;
  productName: string;
  variantSelector: string;
  audience: CustomerPriceAudience;
  amountCents: number;
  currency: SupportedPriceCurrency;
  decisionStatus: DecisionStatus;
  productionAction: ProductionAction;
  productId: string | null;
  variantId: string | null;
  effectiveAt: string | null;
  expiresAt: string | null;
  status: DecisionRowStatus;
  approvalNote: string;
}

export const ROW_VALIDATION_CLASSIFICATIONS = [
  /** APPROVED with exact product and variant ids; the planner may consider it. */
  "READY_FOR_PLANNING",
  /**
   * APPROVED but product_id or variant_id is null. This is never an error and
   * never activatable: the decision waits for exact ids, and name matching is
   * never a substitute.
   */
  "BLOCKED_UNRESOLVED_IDENTITY",
  /** PROPOSED: held for founder approval, never activatable in any state. */
  "HELD_PROPOSED",
] as const;

export type RowValidationClassification =
  (typeof ROW_VALIDATION_CLASSIFICATIONS)[number];

export type DecisionRowValidation =
  | {
      index: number;
      decisionId: string | null;
      valid: true;
      classification: RowValidationClassification;
      row: PriceDecisionRow;
      /** Warnings only (for example unknown fields). Never fatal. */
      issues: DecisionRowIssue[];
    }
  | {
      index: number;
      decisionId: string | null;
      valid: false;
      /** At least one fatal issue. */
      issues: DecisionRowIssue[];
    };

export interface DecisionDocumentValidation {
  /** True only when the document parses and no row carries a fatal issue. */
  documentValid: boolean;
  documentIssues: DecisionRowIssue[];
  rows: DecisionRowValidation[];
  /** The typed rows that passed validation, in document order. */
  validRows: PriceDecisionRow[];
  counts: {
    total: number;
    valid: number;
    fatal: number;
    warnings: number;
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fatal(
  code: DecisionRowIssueCode,
  field: string | null,
  message: string,
): DecisionRowIssue {
  return { code, severity: "fatal", field, message };
}

function warning(
  code: DecisionRowIssueCode,
  field: string | null,
  message: string,
): DecisionRowIssue {
  return { code, severity: "warning", field, message };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value)
  );
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

interface RowDraft {
  index: number;
  decisionId: string | null;
  issues: DecisionRowIssue[];
  row: PriceDecisionRow | null;
}

function validateRow(value: unknown, index: number): RowDraft {
  const issues: DecisionRowIssue[] = [];
  if (!isPlainObject(value)) {
    return {
      index,
      decisionId: null,
      issues: [
        fatal(
          "row_not_object",
          null,
          `row ${index} is not an object and cannot be a decision`,
        ),
      ],
      row: null,
    };
  }

  const known = new Set<string>(REQUIRED_DECISION_FIELDS);
  for (const key of Object.keys(value)) {
    if (!known.has(key)) {
      issues.push(
        warning(
          "unknown_field",
          key,
          `unknown field "${key}" is tolerated but ignored`,
        ),
      );
    }
  }
  for (const field of REQUIRED_DECISION_FIELDS) {
    if (!(field in value)) {
      issues.push(
        fatal(
          "missing_required_field",
          field,
          `required field "${field}" is missing`,
        ),
      );
    }
  }

  const decisionId = nonEmptyString(value.decision_id)
    ? value.decision_id.trim()
    : null;
  if ("decision_id" in value && decisionId === null) {
    issues.push(
      fatal(
        "invalid_field_type",
        "decision_id",
        "decision_id must be a non-empty string",
      ),
    );
  }
  if ("product_name" in value && !nonEmptyString(value.product_name)) {
    issues.push(
      fatal(
        "invalid_field_type",
        "product_name",
        "product_name must be a non-empty string",
      ),
    );
  }
  if ("variant_selector" in value && !nonEmptyString(value.variant_selector)) {
    issues.push(
      fatal(
        "invalid_field_type",
        "variant_selector",
        "variant_selector must be a non-empty string",
      ),
    );
  }
  if ("approval_note" in value && !nonEmptyString(value.approval_note)) {
    issues.push(
      fatal(
        "invalid_field_type",
        "approval_note",
        "approval_note must be a non-empty string",
      ),
    );
  }

  let audience: CustomerPriceAudience | null = null;
  if ("audience" in value) {
    if (
      typeof value.audience === "string" &&
      (CUSTOMER_PRICE_AUDIENCES as readonly string[]).includes(value.audience)
    ) {
      audience = value.audience as CustomerPriceAudience;
    } else {
      const detail =
        value.audience === "compare_at"
          ? "compare_at is an admin display audience, not an importable decision audience"
          : `audience must be one of ${CUSTOMER_PRICE_AUDIENCES.join(", ")}`;
      issues.push(fatal("invalid_audience", "audience", detail));
    }
  }

  let amountCents: number | null = null;
  if ("amount_cents" in value) {
    if (isCustomerSafeAmountCents(value.amount_cents)) {
      amountCents = value.amount_cents;
    } else {
      issues.push(
        fatal(
          "invalid_amount_cents",
          "amount_cents",
          "amount_cents must be a positive safe integer number of cents",
        ),
      );
    }
  }

  let currency: SupportedPriceCurrency | null = null;
  if ("currency" in value) {
    currency =
      typeof value.currency === "string"
        ? normalizePriceCurrency(value.currency)
        : null;
    if (currency === null) {
      issues.push(
        fatal(
          "unsupported_currency",
          "currency",
          "currency must be USD; no other currency is importable",
        ),
      );
    }
  }

  let decisionStatus: DecisionStatus | null = null;
  if ("decision_status" in value) {
    if (
      typeof value.decision_status === "string" &&
      (DECISION_STATUSES as readonly string[]).includes(value.decision_status)
    ) {
      decisionStatus = value.decision_status as DecisionStatus;
    } else {
      issues.push(
        fatal(
          "invalid_decision_status",
          "decision_status",
          `decision_status must be one of ${DECISION_STATUSES.join(", ")}`,
        ),
      );
    }
  }

  let productionAction: ProductionAction | null = null;
  if ("production_action" in value) {
    if (
      typeof value.production_action === "string" &&
      (PRODUCTION_ACTIONS as readonly string[]).includes(
        value.production_action,
      )
    ) {
      productionAction = value.production_action as ProductionAction;
    } else {
      issues.push(
        fatal(
          "invalid_production_action",
          "production_action",
          `production_action must be one of ${PRODUCTION_ACTIONS.join(", ")}`,
        ),
      );
    }
  }

  let rowStatus: DecisionRowStatus | null = null;
  if ("status" in value) {
    if (
      typeof value.status === "string" &&
      (DECISION_ROW_STATUSES as readonly string[]).includes(value.status)
    ) {
      rowStatus = value.status as DecisionRowStatus;
    } else {
      issues.push(
        fatal(
          "invalid_row_status",
          "status",
          `status must be one of ${DECISION_ROW_STATUSES.join(", ")}`,
        ),
      );
    }
  }

  const ids: Record<"product_id" | "variant_id", string | null> = {
    product_id: null,
    variant_id: null,
  };
  for (const field of ["product_id", "variant_id"] as const) {
    if (!(field in value)) continue;
    const raw = value[field];
    if (raw === null) {
      ids[field] = null;
    } else if (typeof raw === "string" && UUID_PATTERN.test(raw)) {
      ids[field] = raw;
    } else {
      issues.push(
        fatal(
          "invalid_field_type",
          field,
          `${field} must be null or an exact uuid; approximate identity is never accepted`,
        ),
      );
    }
  }

  const stamps: Record<"effective_at" | "expires_at", string | null> = {
    effective_at: null,
    expires_at: null,
  };
  for (const field of ["effective_at", "expires_at"] as const) {
    if (!(field in value)) continue;
    const raw = value[field];
    if (raw === null) {
      stamps[field] = null;
    } else if (
      typeof raw === "string" &&
      parseProductControlTimestamp(raw) !== null
    ) {
      stamps[field] = raw;
    } else {
      issues.push(
        fatal(
          "invalid_timestamp",
          field,
          `${field} must be null or a strict ISO-8601 timestamp with a zone`,
        ),
      );
    }
  }
  if (stamps.effective_at !== null && stamps.expires_at !== null) {
    const start = parseProductControlTimestamp(stamps.effective_at);
    const end = parseProductControlTimestamp(stamps.expires_at);
    if (start !== null && end !== null && end <= start) {
      issues.push(
        fatal(
          "invalid_window",
          "expires_at",
          "expires_at must be after effective_at",
        ),
      );
    }
  }

  if (decisionStatus === "PROPOSED" && rowStatus === "active") {
    issues.push(
      fatal(
        "proposed_row_active",
        "status",
        "a PROPOSED decision must carry status inactive; an active PROPOSED row is invalid",
      ),
    );
  }

  const hasFatal = issues.some((issue) => issue.severity === "fatal");
  if (hasFatal) {
    return { index, decisionId, issues, row: null };
  }

  return {
    index,
    decisionId,
    issues,
    row: {
      decisionId: decisionId as string,
      productName: (value.product_name as string).trim(),
      variantSelector: (value.variant_selector as string).trim(),
      audience: audience as CustomerPriceAudience,
      amountCents: amountCents as number,
      currency: currency as SupportedPriceCurrency,
      decisionStatus: decisionStatus as DecisionStatus,
      productionAction: productionAction as ProductionAction,
      productId: ids.product_id,
      variantId: ids.variant_id,
      effectiveAt: stamps.effective_at,
      expiresAt: stamps.expires_at,
      status: rowStatus as DecisionRowStatus,
      approvalNote: (value.approval_note as string).trim(),
    },
  };
}

interface Window {
  start: number;
  end: number;
}

/**
 * The decision's effective window for overlap math. A null effective_at means
 * the price takes effect on activation, so the window conservatively starts
 * at the reference instant; a null expires_at means it never expires.
 */
function decisionWindow(
  effectiveAt: string | null,
  expiresAt: string | null,
  fallbackStart: number,
): Window {
  const start =
    effectiveAt === null
      ? fallbackStart
      : (parseProductControlTimestamp(effectiveAt) ?? fallbackStart);
  const end =
    expiresAt === null
      ? Number.POSITIVE_INFINITY
      : (parseProductControlTimestamp(expiresAt) ?? Number.POSITIVE_INFINITY);
  return { start, end };
}

function windowsOverlap(left: Window, right: Window): boolean {
  return left.start < right.end && right.start < left.end;
}

function classifyValidRow(row: PriceDecisionRow): RowValidationClassification {
  if (row.decisionStatus === "PROPOSED") return "HELD_PROPOSED";
  if (row.productId === null || row.variantId === null) {
    return "BLOCKED_UNRESOLVED_IDENTITY";
  }
  return "READY_FOR_PLANNING";
}

/**
 * Validate a parsed founder decision document (unknown JSON). Accepts either
 * a bare array of rows or an object with a "decisions" array. Pure: reads
 * nothing, writes nothing.
 */
export function validateDecisionDocument(
  json: unknown,
): DecisionDocumentValidation {
  const documentIssues: DecisionRowIssue[] = [];
  let rawRows: unknown[] = [];
  if (Array.isArray(json)) {
    rawRows = json;
  } else if (isPlainObject(json) && Array.isArray(json.decisions)) {
    rawRows = json.decisions;
  } else {
    documentIssues.push(
      fatal(
        "invalid_document_shape",
        null,
        "the document must be an array of decision rows or an object with a decisions array",
      ),
    );
  }

  const drafts = rawRows.map((value, index) => validateRow(value, index));

  // Document pass 1: duplicate decision ids are fatal on every involved row.
  const idCounts = new Map<string, number>();
  for (const draft of drafts) {
    if (draft.decisionId !== null) {
      idCounts.set(draft.decisionId, (idCounts.get(draft.decisionId) ?? 0) + 1);
    }
  }
  for (const draft of drafts) {
    if (draft.decisionId !== null && (idCounts.get(draft.decisionId) ?? 0) > 1) {
      draft.issues.push(
        fatal(
          "duplicate_decision_id",
          "decision_id",
          `decision_id "${draft.decisionId}" appears more than once in this document`,
        ),
      );
      draft.row = null;
    }
  }

  // Document pass 2: overlapping effective windows for the same exact
  // (product_id, variant_id, audience, currency) identity are fatal on every
  // involved row. Rows without exact ids cannot participate.
  const withIdentity = drafts.filter(
    (draft) =>
      draft.row !== null &&
      draft.row.productId !== null &&
      draft.row.variantId !== null,
  );
  const overlapping = new Set<RowDraft>();
  for (let i = 0; i < withIdentity.length; i += 1) {
    for (let j = i + 1; j < withIdentity.length; j += 1) {
      const left = withIdentity[i].row as PriceDecisionRow;
      const right = withIdentity[j].row as PriceDecisionRow;
      if (
        left.productId !== right.productId ||
        left.variantId !== right.variantId ||
        left.audience !== right.audience ||
        left.currency !== right.currency
      ) {
        continue;
      }
      const leftWindow = decisionWindow(
        left.effectiveAt,
        left.expiresAt,
        Number.NEGATIVE_INFINITY,
      );
      const rightWindow = decisionWindow(
        right.effectiveAt,
        right.expiresAt,
        Number.NEGATIVE_INFINITY,
      );
      if (windowsOverlap(leftWindow, rightWindow)) {
        overlapping.add(withIdentity[i]);
        overlapping.add(withIdentity[j]);
      }
    }
  }
  overlapping.forEach((draft) => {
    draft.issues.push(
      fatal(
        "overlapping_window_in_document",
        "effective_at",
        "this document contains another decision for the same product, variant, audience, and currency with an overlapping effective window",
      ),
    );
    draft.row = null;
  });

  const rows: DecisionRowValidation[] = drafts.map((draft) => {
    if (draft.row === null) {
      return {
        index: draft.index,
        decisionId: draft.decisionId,
        valid: false,
        issues: draft.issues,
      };
    }
    return {
      index: draft.index,
      decisionId: draft.decisionId,
      valid: true,
      classification: classifyValidRow(draft.row),
      row: draft.row,
      issues: draft.issues,
    };
  });

  const validRows = rows.flatMap((row) => (row.valid ? [row.row] : []));
  const fatalRows = rows.filter((row) => !row.valid).length;
  const warnings = rows.reduce(
    (sum, row) =>
      sum + row.issues.filter((issue) => issue.severity === "warning").length,
    0,
  );

  return {
    documentValid: documentIssues.length === 0 && fatalRows === 0,
    documentIssues,
    rows,
    validRows,
    counts: {
      total: rows.length,
      valid: validRows.length,
      fatal: fatalRows,
      warnings,
    },
  };
}

export const IMPORT_ROW_CLASSIFICATIONS = [
  "insert",
  "update",
  "no_op",
  "conflict_existing_active",
  "unresolved_identity",
  "blocked_readiness",
] as const;

export type ImportRowClassification =
  (typeof IMPORT_ROW_CLASSIFICATIONS)[number];

export interface ImportRowPlan {
  decisionId: string;
  classification: ImportRowClassification;
  reasons: string[];
}

export interface ImportPlanReport {
  /** Always true. This module has no other mode. */
  dryRun: true;
  evaluatedAt: string;
  rows: ImportRowPlan[];
  counts: Record<ImportRowClassification, number>;
  /** Always "none": this module exports no mutation path. */
  executionPath: "none";
  note: string;
}

export interface ImportPlanInput {
  /** Rows that passed validateDecisionDocument. */
  rows: readonly PriceDecisionRow[];
  /**
   * The injected Product Control read seam. Pass null when identity
   * resolution is unavailable (for example the readers-absent CLI dry run);
   * every row with exact ids is then blocked_readiness because nothing can
   * be verified.
   */
  source: PricingProductSource | null;
  /** The reference instant for window and conflict math. Strict ISO-8601. */
  evaluatedAt: string;
}

const PLAN_NOTE =
  "Dry run only. This module exports no mutation path. Production mutation " +
  "goes through the release manager's protected approval flow using the " +
  "SECURITY DEFINER RPCs research_admin_create_product_price and " +
  "research_admin_approve_product_price.";

function plan(
  decisionId: string,
  classification: ImportRowClassification,
  reasons: string[],
): ImportRowPlan {
  return { decisionId, classification, reasons };
}

function priceIdentityMatches(
  price: AdminProductPrice,
  row: PriceDecisionRow,
): boolean {
  return (
    price.productId === row.productId &&
    price.variantId === row.variantId &&
    price.audience === row.audience &&
    price.currency === row.currency
  );
}

function storedWindow(price: AdminProductPrice): Window | null {
  const start = parseProductControlTimestamp(price.effectiveAt);
  if (start === null) return null;
  if (price.expiresAt === null) {
    return { start, end: Number.POSITIVE_INFINITY };
  }
  const end = parseProductControlTimestamp(price.expiresAt);
  return end === null ? null : { start, end };
}

async function planRow(
  row: PriceDecisionRow,
  source: PricingProductSource | null,
  at: number,
): Promise<ImportRowPlan> {
  if (row.decisionStatus === "PROPOSED") {
    return plan(row.decisionId, "no_op", [
      "PROPOSED decisions are held for founder approval and are never activatable, even with exact product and variant ids",
    ]);
  }

  if (row.productId === null || row.variantId === null) {
    const missing = [
      ...(row.productId === null ? ["product_id"] : []),
      ...(row.variantId === null ? ["variant_id"] : []),
    ];
    return plan(row.decisionId, "unresolved_identity", [
      `exact identity is unresolved (${missing.join(" and ")} null); name matching is never a substitute for exact ids`,
    ]);
  }

  if (source === null) {
    return plan(row.decisionId, "blocked_readiness", [
      "identity resolution is unavailable in this dry run, so product, variant, and existing-price facts cannot be verified",
    ]);
  }

  const product = await source.readProductForPricing(row.productId);
  const readinessReasons: string[] = [];
  if (product === null || product.id !== row.productId) {
    return plan(row.decisionId, "blocked_readiness", [
      `no canonical product row resolves for exact product_id ${row.productId}`,
    ]);
  }
  if (product.status !== "published") {
    readinessReasons.push(
      `product status is ${product.status}, not published`,
    );
  }
  if (!product.active) {
    readinessReasons.push("product is not active");
  }

  const variants = product.variants.filter(
    (variant: AdminProductVariant) =>
      variant.id === row.variantId && variant.productId === product.id,
  );
  if (variants.length === 0) {
    readinessReasons.push(
      `no variant resolves for exact variant_id ${row.variantId}`,
    );
  } else if (variants.length > 1) {
    readinessReasons.push(
      `variant_id ${row.variantId} is ambiguous on this product`,
    );
  } else {
    const variant = variants[0];
    if (variant.status !== "approved") {
      readinessReasons.push(`variant status is ${variant.status}, not approved`);
    }
    if (!variant.active) {
      readinessReasons.push("variant is not active");
    }
    if (row.audience === "member" && !variant.memberEligible) {
      readinessReasons.push("variant is not member eligible");
    }
  }
  if (readinessReasons.length > 0) {
    return plan(row.decisionId, "blocked_readiness", readinessReasons);
  }

  const window = decisionWindow(row.effectiveAt, row.expiresAt, at);
  const identityPrices = product.prices.filter((price) =>
    priceIdentityMatches(price, row),
  );

  const activeOverlapping: { price: AdminProductPrice; malformed: boolean }[] =
    [];
  for (const price of identityPrices) {
    if (price.status !== "active") continue;
    const stored = storedWindow(price);
    if (stored === null) {
      // A stored active row with an unparseable window blocks conservatively.
      activeOverlapping.push({ price, malformed: true });
    } else if (windowsOverlap(stored, window)) {
      activeOverlapping.push({ price, malformed: false });
    }
  }

  if (activeOverlapping.length > 0) {
    const disagreeing = activeOverlapping.filter(
      (entry) => entry.malformed || entry.price.amountCents !== row.amountCents,
    );
    if (disagreeing.length === 0) {
      return plan(row.decisionId, "no_op", [
        `an active price with the same amount already covers this window (existing price ${activeOverlapping
          .map((entry) => entry.price.id)
          .join(", ")})`,
      ]);
    }
    return plan(
      row.decisionId,
      "conflict_existing_active",
      disagreeing.map((entry) =>
        entry.malformed
          ? `existing active price ${entry.price.id} has an unparseable window and blocks conservatively`
          : `existing active price ${entry.price.id} overlaps this window with a different amount`,
      ),
    );
  }

  const pending = identityPrices.filter(
    (price) => price.status === "draft" || price.status === "approved",
  );
  if (pending.length > 0) {
    return plan(row.decisionId, "update", [
      `the protected flow would update pending price ${pending
        .map((price) => price.id)
        .join(", ")} for this identity rather than insert a duplicate`,
    ]);
  }

  return plan(row.decisionId, "insert", [
    "no existing price row for this product, variant, audience, and currency; the protected flow would create one",
  ]);
}

/**
 * Produce the dry-run import plan for validated rows. Read-only: the injected
 * source is the only IO, and it is only ever read. There is deliberately no
 * corresponding execute function anywhere in this module.
 */
export async function planImport(
  input: ImportPlanInput,
): Promise<ImportPlanReport> {
  const at = parseProductControlTimestamp(input.evaluatedAt);
  if (at === null) {
    throw new RangeError(
      "evaluatedAt must be a strict ISO-8601 timestamp with a zone",
    );
  }

  const rows: ImportRowPlan[] = [];
  for (const row of input.rows) {
    rows.push(await planRow(row, input.source, at));
  }

  const counts = Object.fromEntries(
    IMPORT_ROW_CLASSIFICATIONS.map((classification) => [
      classification,
      rows.filter((row) => row.classification === classification).length,
    ]),
  ) as Record<ImportRowClassification, number>;

  return {
    dryRun: true,
    evaluatedAt: input.evaluatedAt,
    rows,
    counts,
    executionPath: "none",
    note: PLAN_NOTE,
  };
}

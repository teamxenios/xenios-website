import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Request } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LoiRow } from "../supabase-store";
import {
  CARE_ACCESS_BUSINESS_NAME,
  CARE_ACCESS_ROLE_PREFIX,
  CARE_ACCESS_SCHEMA,
  isCareManualAccessOperationsRow,
} from "../care/manual-access-classifier";
import { projectCareManualAccessAdminRecord } from "../care/manual-access-admin";
import { CARE_MANUAL_ACCESS_SOURCE_PAGE } from "@shared/care/manual-access";
import {
  boundedCount,
  currentFact,
  exactCount,
  lastVerifiedFact,
  unavailableCount,
  unavailableFact,
  unavailableFounderCommandCenterSource,
  type FounderCommandCenterSourceSnapshot,
  type FounderCommandCenterSources,
} from "./founder-command-center";

type ReadFilter =
  | Readonly<{ operation: "eq" | "neq" | "lt" | "like"; column: string; value: unknown }>
  | Readonly<{ operation: "in"; column: string; value: readonly unknown[] }>;

export type FounderCommandCenterCountQuery = Readonly<{
  table: string;
  column: string;
  filters?: readonly ReadFilter[];
}>;

export type FounderCommandCenterOldestQuery = Readonly<{
  table: string;
  timestampColumn: string;
  filters?: readonly ReadFilter[];
}>;

export type FounderCommandCenterPageQuery = Readonly<{
  table: string;
  columns: string;
  filters?: readonly ReadFilter[];
  orderBy?: string;
  ascending?: boolean;
  from: number;
  to: number;
}>;

/** Read-only by construction: the port has no mutation or arbitrary RPC seam. */
export type FounderCommandCenterReadPort = Readonly<{
  count(query: FounderCommandCenterCountQuery): Promise<number>;
  oldestTimestamp(query: FounderCommandCenterOldestQuery): Promise<string | null>;
  page(query: FounderCommandCenterPageQuery): Promise<readonly Record<string, unknown>[]>;
}>;

type SupabaseReadClient = Pick<SupabaseClient, "from">;

function applyFilters(query: any, filters: readonly ReadFilter[] | undefined): any {
  let current = query;
  for (const filter of filters ?? []) {
    if (filter.operation === "in") {
      current = current.in(filter.column, [...filter.value]);
    } else {
      current = current[filter.operation](filter.column, filter.value);
    }
  }
  return current;
}

function safeExactCount(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error("exact_count_unavailable");
  }
  return value as number;
}

function safeTimestamp(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("timestamp_unavailable");
  }
  return value;
}

export function createSupabaseFounderCommandCenterReadPort(
  database: SupabaseReadClient,
): FounderCommandCenterReadPort {
  return Object.freeze({
    async count(spec) {
      const query = applyFilters(
        database
          .from(spec.table)
          .select(spec.column, { count: "exact", head: true }),
        spec.filters,
      );
      const { count, error } = await query;
      if (error) throw new Error("command_center_count_failed");
      return safeExactCount(count);
    },

    async oldestTimestamp(spec) {
      const query = applyFilters(
        database.from(spec.table).select(spec.timestampColumn),
        spec.filters,
      )
        .order(spec.timestampColumn, { ascending: true })
        .limit(1);
      const { data, error } = await query;
      if (error) throw new Error("command_center_oldest_failed");
      if (!Array.isArray(data) || data.length === 0) return null;
      return safeTimestamp((data[0] as Record<string, unknown>)[spec.timestampColumn]);
    },

    async page(spec) {
      let query = applyFilters(
        database.from(spec.table).select(spec.columns),
        spec.filters,
      );
      if (spec.orderBy) {
        query = query.order(spec.orderBy, {
          ascending: spec.ascending ?? true,
        });
      }
      const { data, error } = await query.range(spec.from, spec.to);
      if (error) throw new Error("command_center_page_failed");
      if (!Array.isArray(data)) throw new Error("command_center_page_invalid");
      return data as Record<string, unknown>[];
    },
  });
}

export type FounderCommandCenterAssistedOrderPort = Readonly<{
  list(
    request: Request,
    input: Readonly<{
      status: "submitted" | "reviewing" | "waiting_on_customer";
      page: number;
      pageSize: number;
    }>,
  ): Promise<Readonly<{
    total: number;
    items: readonly Readonly<{ createdAt: string }>[];
  }>>;
}>;

export type FounderCommandCenterProductionDependencies = Readonly<{
  reads: FounderCommandCenterReadPort | null;
  assistedOrders?: FounderCommandCenterAssistedOrderPort;
  awaitingPaymentReview?: () => Promise<readonly Readonly<{ placedAt: string }>[]>;
  settledAwaitingFulfillment?: () => Promise<
    readonly Readonly<{ settledAt: string }>[]
  >;
  openExceptions?: () => Promise<readonly Readonly<{ raisedAt: string }>[]>;
  emailConfiguration?: () => Promise<Readonly<{ provider: string }>>;
  releaseEvidence?: () => Promise<unknown>;
  environment?: NodeJS.ProcessEnv;
  now?: () => Date;
}>;

const APPLICATION_ATTENTION = [
  "submitted",
  "resubmitted",
  "under_review",
  "more_information_requested",
  "approved_pending_payment",
  "payment_pending",
] as const;
const APPLICATION_NEW = ["submitted", "resubmitted"] as const;
const APPLICATION_REVIEW = ["under_review"] as const;
const APPLICATION_INFORMATION = ["more_information_requested"] as const;
const APPLICATION_PAYMENT = [
  "approved_pending_payment",
  "payment_pending",
] as const;

const REQUIRED_INPUT_OPEN = [
  "missing",
  "entered",
  "under_review",
  "rejected",
  "expired",
] as const;
const REQUIRED_INPUT_BLOCKING = [
  "blocks_display",
  "blocks_transaction",
  "blocks_fulfillment",
  "blocks_public_launch",
  "blocks_clinical_activation",
  "blocks_provider_activation",
] as const;

const CARE_PAGE_SIZE = 500;
const CARE_MAX_PAGES_PER_MARKER = 4;
const CARE_OPERATION_COLUMNS =
  "id,business_name,role,why_interested,source_page,landing_page,status,email_status,created_at";

const RELEASE_EVIDENCE_PATH = path.resolve(
  process.cwd(),
  "docs/platform/XENIOS_SITE_SYSTEM_OF_RECORD.generated.json",
);
const SHA = /^[0-9a-f]{40}$/;
const RELEASE_VERIFICATION_STATUSES: ReadonlySet<string> = new Set([
  "source_present",
  "mounted",
  "focused_tests_pass",
  "full_suite_pass",
  "browser_verified",
  "built_not_deployed",
  "deployed_not_authenticated_smoked",
  "live_verified",
  "feature_gated",
  "blocked_external",
  "superseded",
  "unknown",
]);

function observedAt(now: () => Date): string {
  return now().toISOString();
}

function oldestState(count: number, since: string | null) {
  if (count === 0) {
    return { state: "not_applicable" as const, since: null };
  }
  if (since === null) throw new Error("oldest_waiting_unavailable");
  return { state: "available" as const, since: safeTimestamp(since) };
}

function attentionForCount(
  count: number,
  code: string,
  noun: string,
): FounderCommandCenterSourceSnapshot["attention"] {
  return count > 0
    ? {
        severity: "warning",
        code,
        reason: `${count} ${noun}${count === 1 ? "" : "s"} require an operator-owned next step.`,
      }
    : {
        severity: "none",
        code: "none",
        reason: `No ${noun}s are in this exact scoped queue.`,
      };
}

function requireReads(
  reads: FounderCommandCenterReadPort | null,
): FounderCommandCenterReadPort {
  if (!reads) throw new Error("command_center_storage_unavailable");
  return reads;
}

async function applicationsSource(
  reads: FounderCommandCenterReadPort | null,
  now: () => Date,
): Promise<FounderCommandCenterSourceSnapshot> {
  const db = requireReads(reads);
  const attentionFilters: readonly ReadFilter[] = [
    { operation: "in", column: "status", value: APPLICATION_ATTENTION },
  ];
  const [total, newCount, reviewCount, informationCount, paymentCount, oldest] =
    await Promise.all([
      db.count({ table: "research_applications", column: "id", filters: attentionFilters }),
      db.count({
        table: "research_applications",
        column: "id",
        filters: [{ operation: "in", column: "status", value: APPLICATION_NEW }],
      }),
      db.count({
        table: "research_applications",
        column: "id",
        filters: [{ operation: "in", column: "status", value: APPLICATION_REVIEW }],
      }),
      db.count({
        table: "research_applications",
        column: "id",
        filters: [{ operation: "in", column: "status", value: APPLICATION_INFORMATION }],
      }),
      db.count({
        table: "research_applications",
        column: "id",
        filters: [{ operation: "in", column: "status", value: APPLICATION_PAYMENT }],
      }),
      db.oldestTimestamp({
        table: "research_applications",
        timestampColumn: "submitted_at",
        filters: attentionFilters,
      }),
    ]);
  return {
    source: {
      state: "current",
      authority: "Canonical research applications table",
      observedAt: observedAt(now),
    },
    primaryCount: exactCount(
      "applications.open",
      "Open applications",
      total,
      "Applications in submitted, review, information, or activation-payment states.",
    ),
    breakdown: [
      exactCount("applications.new", "New", newCount, "Submitted or resubmitted."),
      exactCount("applications.review", "Under review", reviewCount, "Under review."),
      exactCount(
        "applications.information",
        "Needs information",
        informationCount,
        "More information requested.",
      ),
      exactCount(
        "applications.payment",
        "Approved / payment pending",
        paymentCount,
        "Approved pending payment or payment pending.",
      ),
    ],
    facts: [],
    oldestWaiting: oldestState(total, oldest),
    attention: attentionForCount(total, "applications_open", "application"),
  };
}

async function readBoundedPages(
  reads: FounderCommandCenterReadPort,
  base: Omit<FounderCommandCenterPageQuery, "from" | "to">,
): Promise<Readonly<{
  rows: readonly Record<string, unknown>[];
  truncated: boolean;
}>> {
  const rows: Record<string, unknown>[] = [];
  for (let pageIndex = 0; pageIndex < CARE_MAX_PAGES_PER_MARKER; pageIndex += 1) {
    const from = pageIndex * CARE_PAGE_SIZE;
    const page = await reads.page({
      ...base,
      from,
      to: from + CARE_PAGE_SIZE - 1,
    });
    rows.push(...page);
    if (page.length < CARE_PAGE_SIZE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

async function careSource(
  reads: FounderCommandCenterReadPort | null,
  now: () => Date,
): Promise<FounderCommandCenterSourceSnapshot> {
  const db = requireReads(reads);
  const markerQueries: readonly (Omit<FounderCommandCenterPageQuery, "from" | "to">)[] = [
    {
      table: "loi_submissions",
      columns: CARE_OPERATION_COLUMNS,
      filters: [{ operation: "eq", column: "business_name", value: CARE_ACCESS_BUSINESS_NAME }],
      orderBy: "created_at",
    },
    {
      table: "loi_submissions",
      columns: CARE_OPERATION_COLUMNS,
      filters: [{ operation: "like", column: "role", value: `${CARE_ACCESS_ROLE_PREFIX}%` }],
      orderBy: "created_at",
    },
    {
      table: "loi_submissions",
      columns: CARE_OPERATION_COLUMNS,
      filters: [
        { operation: "eq", column: "source_page", value: CARE_MANUAL_ACCESS_SOURCE_PAGE },
        { operation: "eq", column: "landing_page", value: CARE_MANUAL_ACCESS_SOURCE_PAGE },
      ],
      orderBy: "created_at",
    },
    {
      table: "loi_submissions",
      columns: CARE_OPERATION_COLUMNS,
      filters: [{ operation: "like", column: "why_interested", value: `%${CARE_ACCESS_SCHEMA}%` }],
      orderBy: "created_at",
    },
  ];
  const pages = await Promise.all(
    markerQueries.map((query) => readBoundedPages(db, query)),
  );
  const truncated = pages.some((page) => page.truncated);
  const byId = new Map<string, LoiRow>();
  for (const row of pages.flatMap((page) => page.rows)) {
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) throw new Error("care_operational_row_invalid");
    const candidate = row as unknown as LoiRow;
    if (isCareManualAccessOperationsRow(candidate)) byId.set(id, candidate);
  }
  const projected = [...byId.values()].map(projectCareManualAccessAdminRecord);
  const newRows = projected.filter((row) => row.status === "New");
  const failed = projected.filter((row) => row.emailStatus === "failed").length;
  const unknown = projected.filter(
    (row) => row.emailStatus !== "sent" && row.emailStatus !== "failed",
  ).length;
  const malformed = projected.filter((row) => row.dataQuality === "malformed").length;
  const attention = projected.filter((row) => row.attentionRequired).length;
  const oldest = newRows.length
    ? newRows.reduce((minimum, row) =>
        Date.parse(row.createdAt) < Date.parse(minimum) ? row.createdAt : minimum,
      safeTimestamp(newRows[0].createdAt))
    : null;
  return {
    source: {
      state: truncated ? "partial" : "current",
      authority: "Canonical Care manual-access classifier over LOI storage",
      observedAt: observedAt(now),
    },
    primaryCount: truncated
      ? boundedCount(
          "care.new",
          "New Care requests",
          newRows.length,
          "At least this many Care-classified requests are New within the bounded projection.",
        )
      : exactCount(
          "care.new",
          "New Care requests",
          newRows.length,
          "Care-classified manual-access requests whose operational status is New.",
        ),
    breakdown: [
      (truncated ? boundedCount : exactCount)(
          "care.attention",
          "Attention required",
          attention,
          truncated
            ? "At least this many bounded Care records have a canonical attention reason."
            : "Care-classified requests with one or more canonical attention reasons.",
        ),
      (truncated ? boundedCount : exactCount)(
          "care.notification_failed",
          "Notification failed",
          failed,
          truncated
            ? "At least this many bounded Care records have failed notification state."
            : "Care-classified requests with failed notification state.",
        ),
      (truncated ? boundedCount : exactCount)(
          "care.notification_unknown",
          "Notification unknown",
          unknown,
          truncated
            ? "At least this many bounded Care records lack sent or failed notification state."
            : "Care-classified requests without sent or failed notification state.",
        ),
      (truncated ? boundedCount : exactCount)(
          "care.data_quality",
          "Data quality review",
          malformed,
          truncated
            ? "At least this many bounded Care records have malformed operational data."
            : "Care-classified requests with malformed operational markers or payload.",
        ),
    ],
    facts: [],
    oldestWaiting: truncated
      ? { state: "unavailable", since: null }
      : oldestState(newRows.length, oldest),
    attention: truncated
      ? {
          severity: attention > 0 ? "warning" : "unknown",
          code: "care_projection_bounded",
          reason: attention > 0
            ? `At least ${attention} Care requests require attention; the projection reached its safety cap.`
            : "The Care projection reached its safety cap, so a zero cannot be claimed.",
        }
      : attentionForCount(attention, "care_attention", "Care request"),
  };
}

async function assistedOrdersSource(
  port: FounderCommandCenterAssistedOrderPort | undefined,
  request: Request | null,
  now: () => Date,
): Promise<FounderCommandCenterSourceSnapshot> {
  if (!port || !request) {
    return unavailableFounderCommandCenterSource(
      "assisted_orders",
      "Canonical assisted-order admin reader unavailable",
    );
  }
  const statuses = ["submitted", "reviewing", "waiting_on_customer"] as const;
  const summaries = await Promise.all(
    statuses.map(async (status) => {
      const first = await port.list(request, { status, page: 1, pageSize: 1 });
      const total = safeExactCount(first.total);
      if (total === 0) return { status, total, oldest: null };
      const last = await port.list(request, { status, page: total, pageSize: 1 });
      const oldest = last.items[0]?.createdAt;
      return { status, total, oldest: safeTimestamp(oldest) };
    }),
  );
  const total = summaries.reduce((sum, summary) => sum + summary.total, 0);
  const timestamps = summaries
    .map((summary) => summary.oldest)
    .filter((value): value is string => value !== null);
  const oldest = timestamps.length
    ? timestamps.reduce((minimum, value) =>
        Date.parse(value) < Date.parse(minimum) ? value : minimum,
      timestamps[0])
    : null;
  return {
    source: {
      state: "partial",
      authority: "Canonical assisted-order service admin projection",
      observedAt: observedAt(now),
    },
    primaryCount: exactCount(
      "assisted.open",
      "Open assisted requests",
      total,
      "Submitted, reviewing, or waiting-on-customer assisted requests.",
    ),
    breakdown: summaries.map((summary) =>
      exactCount(
        `assisted.${summary.status}`,
        summary.status === "waiting_on_customer"
          ? "Waiting on customer"
          : summary.status === "reviewing"
            ? "Reviewing"
            : "Submitted",
        summary.total,
        `Assisted-order status ${summary.status}.`,
      ),
    ),
    facts: [unavailableFact("assisted.quote_state", "Quote-specific queue")],
    oldestWaiting: oldestState(total, oldest),
    attention: attentionForCount(total, "assisted_orders_open", "assisted request"),
  };
}

function earliest(values: readonly string[]): string | null {
  if (values.length === 0) return null;
  const valid = values.map(safeTimestamp);
  return valid.reduce((minimum, value) =>
    Date.parse(value) < Date.parse(minimum) ? value : minimum,
  valid[0]);
}

async function paymentReviewSource(
  read: FounderCommandCenterProductionDependencies["awaitingPaymentReview"],
  now: () => Date,
): Promise<FounderCommandCenterSourceSnapshot> {
  if (!read) {
    return unavailableFounderCommandCenterSource(
      "payment_review",
      "Canonical Early Access payment-review reader unavailable",
    );
  }
  const rows = await read();
  const count = rows.length;
  return {
    source: {
      state: "partial",
      authority: "Canonical Early Access awaiting-review projection",
      observedAt: observedAt(now),
    },
    primaryCount: exactCount(
      "payment.under_review",
      "Awaiting review",
      count,
      "Early Access placements whose payment state is under_review.",
    ),
    breakdown: [],
    facts: [unavailableFact("payment.other_states", "Other payment states")],
    oldestWaiting: oldestState(count, earliest(rows.map((row) => row.placedAt))),
    attention: attentionForCount(count, "payment_review_open", "payment review"),
  };
}

async function fulfillmentSource(
  read: FounderCommandCenterProductionDependencies["settledAwaitingFulfillment"],
  now: () => Date,
): Promise<FounderCommandCenterSourceSnapshot> {
  if (!read) {
    const unavailable = unavailableFounderCommandCenterSource(
      "fulfillment",
      "Settled-awaiting-fulfillment authority is not mounted",
    );
    return {
      ...unavailable,
      source: { state: "feature_gated", authority: unavailable.source.authority, observedAt: null },
      attention: {
        severity: "unknown",
        code: "settled_queue_unavailable",
        reason: "Fulfillment demand cannot be inferred from payment or order state.",
      },
    };
  }
  const rows = await read();
  const count = rows.length;
  return {
    source: {
      state: "current",
      authority: "Canonical settled-awaiting-fulfillment projection",
      observedAt: observedAt(now),
    },
    primaryCount: exactCount(
      "fulfillment.waiting",
      "Awaiting fulfillment",
      count,
      "Verified settled orders returned by the fulfillment work-list authority.",
    ),
    breakdown: [],
    facts: [],
    oldestWaiting: oldestState(count, earliest(rows.map((row) => row.settledAt))),
    attention: attentionForCount(count, "fulfillment_waiting", "fulfillment item"),
  };
}

async function exceptionsSource(
  read: FounderCommandCenterProductionDependencies["openExceptions"],
  now: () => Date,
): Promise<FounderCommandCenterSourceSnapshot> {
  if (!read) {
    return unavailableFounderCommandCenterSource(
      "exceptions",
      "Canonical Early Access exception reader unavailable",
    );
  }
  const rows = await read();
  const count = rows.length;
  return {
    source: {
      state: "current",
      authority: "Canonical Early Access open-exception projection",
      observedAt: observedAt(now),
    },
    primaryCount: exactCount(
      "exceptions.open",
      "Open exceptions",
      count,
      "Rows returned by the canonical open admin exceptions projection.",
    ),
    breakdown: [],
    facts: [],
    oldestWaiting: oldestState(count, earliest(rows.map((row) => row.raisedAt))),
    attention: attentionForCount(count, "exceptions_open", "exception"),
  };
}

async function productsSource(
  reads: FounderCommandCenterReadPort | null,
  now: () => Date,
): Promise<FounderCommandCenterSourceSnapshot> {
  const db = requireReads(reads);
  const openStatuses = ["draft", "in_review", "approved"] as const;
  const filters: readonly ReadFilter[] = [
    { operation: "in", column: "admin_status", value: openStatuses },
  ];
  const [count, draft, review, approved, oldest] = await Promise.all([
    db.count({ table: "research_products", column: "id", filters }),
    db.count({
      table: "research_products",
      column: "id",
      filters: [{ operation: "eq", column: "admin_status", value: "draft" }],
    }),
    db.count({
      table: "research_products",
      column: "id",
      filters: [{ operation: "eq", column: "admin_status", value: "in_review" }],
    }),
    db.count({
      table: "research_products",
      column: "id",
      filters: [{ operation: "eq", column: "admin_status", value: "approved" }],
    }),
    db.oldestTimestamp({
      table: "research_products",
      timestampColumn: "created_at",
      filters,
    }),
  ]);
  return {
    source: {
      state: "partial",
      authority: "Canonical Product Control lifecycle rows",
      observedAt: observedAt(now),
    },
    primaryCount: exactCount(
      "products.lifecycle_open",
      "Lifecycle work",
      count,
      "Products in draft, in_review, or approved state; variant readiness is separate.",
    ),
    breakdown: [
      exactCount("products.draft", "Draft", draft, "Products in draft state."),
      exactCount("products.review", "In review", review, "Products in review state."),
      exactCount("products.approved", "Approved", approved, "Approved products not yet published."),
    ],
    facts: [unavailableFact("products.variant_union", "Variant readiness union")],
    oldestWaiting: oldestState(count, oldest),
    attention: count > 0
      ? attentionForCount(count, "product_lifecycle_open", "product")
      : {
          severity: "info",
          code: "product_source_partial",
          reason: "No lifecycle work is counted; variant readiness is not represented in this summary.",
        },
  };
}

async function draftPricesSource(
  reads: FounderCommandCenterReadPort | null,
  now: () => Date,
): Promise<FounderCommandCenterSourceSnapshot> {
  const db = requireReads(reads);
  const filters: readonly ReadFilter[] = [
    { operation: "eq", column: "status", value: "draft" },
  ];
  const [count, oldest] = await Promise.all([
    db.count({ table: "research_product_prices", column: "id", filters }),
    db.oldestTimestamp({
      table: "research_product_prices",
      timestampColumn: "created_at",
      filters,
    }),
  ]);
  return {
    source: {
      state: "current",
      authority: "Canonical Product Control price history",
      observedAt: observedAt(now),
    },
    primaryCount: exactCount(
      "prices.draft",
      "Draft prices",
      count,
      "Canonical product price records whose status is draft.",
    ),
    breakdown: [],
    facts: [],
    oldestWaiting: oldestState(count, oldest),
    attention: attentionForCount(count, "draft_prices_open", "draft price"),
  };
}

async function requiredInputsSource(
  reads: FounderCommandCenterReadPort | null,
  now: () => Date,
): Promise<FounderCommandCenterSourceSnapshot> {
  const db = requireReads(reads);
  const filters: readonly ReadFilter[] = [
    { operation: "in", column: "current_state", value: REQUIRED_INPUT_OPEN },
  ];
  const [count, blocking, informational, oldest] = await Promise.all([
    db.count({ table: "research_required_inputs", column: "id", filters }),
    db.count({
      table: "research_required_inputs",
      column: "id",
      filters: [
        ...filters,
        { operation: "in", column: "blocking_level", value: REQUIRED_INPUT_BLOCKING },
      ],
    }),
    db.count({
      table: "research_required_inputs",
      column: "id",
      filters: [
        ...filters,
        { operation: "eq", column: "blocking_level", value: "informational" },
      ],
    }),
    db.oldestTimestamp({
      table: "research_required_inputs",
      timestampColumn: "created_at",
      filters,
    }),
  ]);
  return {
    source: {
      state: "current",
      authority: "Canonical required-input records (values excluded)",
      observedAt: observedAt(now),
    },
    primaryCount: exactCount(
      "required_inputs.open",
      "Unresolved inputs",
      count,
      "Required inputs in missing, entered, review, rejected, or expired states.",
    ),
    breakdown: [
      exactCount(
        "required_inputs.blocking",
        "Blocking",
        blocking,
        "Unresolved inputs with a blocking level.",
      ),
      exactCount(
        "required_inputs.informational",
        "Informational",
        informational,
        "Unresolved informational inputs.",
      ),
    ],
    facts: [],
    oldestWaiting: oldestState(count, oldest),
    attention: attentionForCount(count, "required_inputs_open", "required input"),
  };
}

async function referralsSource(
  reads: FounderCommandCenterReadPort | null,
  now: () => Date,
): Promise<FounderCommandCenterSourceSnapshot> {
  const db = requireReads(reads);
  const filters: readonly ReadFilter[] = [
    { operation: "in", column: "status", value: ["open", "information-requested", "escalated"] },
  ];
  const [count, oldest] = await Promise.all([
    db.count({ table: "referral_fraud_flags", column: "id", filters }),
    db.oldestTimestamp({
      table: "referral_fraud_flags",
      timestampColumn: "created_at",
      filters,
    }),
  ]);
  return {
    source: {
      state: "partial",
      authority: "Legacy referral fraud-review queue",
      observedAt: observedAt(now),
    },
    primaryCount: exactCount(
      "referrals.open_flags",
      "Open review flags",
      count,
      "Fraud flags in open, information-requested, or escalated status.",
    ),
    breakdown: [],
    facts: [
      unavailableFact("referrals.v1_totals", "Referral V1 lifecycle totals"),
      unavailableFact("referrals.money", "Commission and payout readiness"),
    ],
    oldestWaiting: oldestState(count, oldest),
    attention: count > 0
      ? attentionForCount(count, "referral_flags_open", "referral flag")
      : {
          severity: "info",
          code: "referral_source_partial",
          reason: "No open fraud-review flags are counted; broader referral totals remain unavailable.",
        },
  };
}

async function supportSource(
  reads: FounderCommandCenterReadPort | null,
  now: () => Date,
): Promise<FounderCommandCenterSourceSnapshot> {
  const db = requireReads(reads);
  const openFilters: readonly ReadFilter[] = [
    { operation: "neq", column: "status", value: "completed" },
  ];
  const current = now();
  const [count, overdue, oldest] = await Promise.all([
    db.count({ table: "research_member_questions", column: "id", filters: openFilters }),
    db.count({
      table: "research_member_questions",
      column: "id",
      filters: [
        ...openFilters,
        { operation: "lt", column: "sla_target_at", value: current.toISOString() },
      ],
    }),
    db.oldestTimestamp({
      table: "research_member_questions",
      timestampColumn: "created_at",
      filters: openFilters,
    }),
  ]);
  return {
    source: {
      state: "partial",
      authority: "Canonical member questions table (question text excluded)",
      observedAt: current.toISOString(),
    },
    primaryCount: exactCount(
      "support.open",
      "Open questions",
      count,
      "Member questions whose status is not completed.",
    ),
    breakdown: [
      exactCount(
        "support.overdue",
        "Past SLA target",
        overdue,
        "Open member questions whose SLA target is earlier than this observation.",
      ),
    ],
    facts: [unavailableFact("support.queue_api", "Dedicated admin queue API")],
    oldestWaiting: oldestState(count, oldest),
    attention: overdue > 0
      ? attentionForCount(overdue, "support_overdue", "overdue support question")
      : attentionForCount(count, "support_open", "support question"),
  };
}

async function systemStatusSource(
  reads: FounderCommandCenterReadPort | null,
  emailConfiguration: FounderCommandCenterProductionDependencies["emailConfiguration"],
  now: () => Date,
): Promise<FounderCommandCenterSourceSnapshot> {
  const db = requireReads(reads);
  const attentionStatuses = ["failed_retryable", "failed_permanent"] as const;
  const [count, oldest, email] = await Promise.all([
    db.count({
      table: "research_notification_outbox",
      column: "id",
      filters: [{ operation: "in", column: "status", value: attentionStatuses }],
    }),
    db.oldestTimestamp({
      table: "research_notification_outbox",
      timestampColumn: "created_at",
      filters: [{ operation: "in", column: "status", value: attentionStatuses }],
    }),
    emailConfiguration ? emailConfiguration() : Promise.resolve(null),
  ]);
  const providerAvailable = email !== null && email.provider !== "unavailable";
  return {
    source: {
      state: "partial",
      authority: "Notification outbox plus canonical email configuration resolver",
      observedAt: observedAt(now),
    },
    primaryCount: exactCount(
      "system.notification_failures",
      "Notification failures",
      count,
      "Outbox rows in failed_retryable or failed_permanent status.",
    ),
    breakdown: [],
    facts: [
      email === null
        ? unavailableFact("system.email_provider", "Email provider")
        : currentFact(
            "system.email_provider",
            "Email provider",
            providerAvailable ? "Configured" : "Unavailable",
          ),
      unavailableFact("system.worker", "Outbox worker liveness"),
      unavailableFact("system.global_health", "All-service health"),
    ],
    oldestWaiting: oldestState(count, oldest),
    attention: count > 0
      ? attentionForCount(count, "notification_failures", "notification failure")
      : providerAvailable
        ? {
            severity: "info",
            code: "system_source_partial",
            reason: "No notification failures are counted; worker and all-service health remain unproven.",
          }
        : {
            severity: "warning",
            code: "email_provider_unavailable",
            reason: "The email configuration resolver reports no available provider.",
          },
  };
}

type ReleaseFacts = Readonly<{
  sourceSha: string | null;
  productionSha: string | null;
  productionObservedAt: string | null;
  productionVerification: string | null;
}>;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function releaseFacts(value: unknown): ReleaseFacts {
  const root = record(value);
  const source = record(root?.source);
  const production = record(root?.production);
  const sourceSha = typeof source?.sha === "string" && SHA.test(source.sha)
    ? source.sha
    : null;
  const productionSha =
    typeof production?.sha === "string" && SHA.test(production.sha)
      ? production.sha
      : null;
  const productionObservedAt =
    typeof production?.observedAt === "string" &&
    Number.isFinite(Date.parse(production.observedAt))
      ? production.observedAt
      : null;
  const productionVerification =
    typeof production?.verificationStatus === "string" &&
    RELEASE_VERIFICATION_STATUSES.has(production.verificationStatus)
      ? production.verificationStatus
      : null;
  return { sourceSha, productionSha, productionObservedAt, productionVerification };
}

export async function readFounderCommandCenterReleaseEvidence(): Promise<unknown> {
  return JSON.parse(await readFile(RELEASE_EVIDENCE_PATH, "utf8")) as unknown;
}

async function releaseStatusSource(
  evidenceReader: (() => Promise<unknown>) | undefined,
  environment: NodeJS.ProcessEnv,
): Promise<FounderCommandCenterSourceSnapshot> {
  let facts: ReleaseFacts = {
    sourceSha: null,
    productionSha: null,
    productionObservedAt: null,
    productionVerification: null,
  };
  try {
    facts = releaseFacts(await (evidenceReader ?? readFounderCommandCenterReleaseEvidence)());
  } catch {
    // The returned card remains partial and marks each unavailable fact.
  }
  const runtimeSha = typeof environment.RENDER_GIT_COMMIT === "string" &&
    SHA.test(environment.RENDER_GIT_COMMIT)
    ? environment.RENDER_GIT_COMMIT
    : null;
  return {
    source: {
      state: "partial",
      authority: "Runtime build metadata and last-verified system-of-record snapshot",
      observedAt: facts.productionObservedAt,
    },
    primaryCount: unavailableCount(
      "release.blockers",
      "Release blockers",
      "No canonical runtime reader currently supplies an exact release-blocker count.",
    ),
    breakdown: [],
    facts: [
      runtimeSha
        ? currentFact("release.runtime_sha", "Runtime SHA", runtimeSha)
        : unavailableFact("release.runtime_sha", "Runtime SHA"),
      facts.productionSha
        ? lastVerifiedFact(
            "release.production_sha",
            "Last verified production SHA",
            facts.productionSha,
          )
        : unavailableFact("release.production_sha", "Last verified production SHA"),
      facts.productionObservedAt
        ? lastVerifiedFact(
            "release.production_observed_at",
            "Production observed at",
            facts.productionObservedAt,
          )
        : unavailableFact("release.production_observed_at", "Production observed at"),
      facts.productionVerification
        ? lastVerifiedFact(
            "release.production_verification",
            "Production verification",
            facts.productionVerification,
          )
        : unavailableFact("release.production_verification", "Production verification"),
      facts.sourceSha
        ? lastVerifiedFact("release.sor_source_sha", "SOR source SHA", facts.sourceSha)
        : unavailableFact("release.sor_source_sha", "SOR source SHA"),
      unavailableFact("release.working_sha", "Working-tree SHA"),
      unavailableFact("release.active_candidate", "Active release candidate"),
    ],
    oldestWaiting: { state: "not_applicable", since: null },
    attention: {
      severity: "unknown",
      code: "release_blockers_unavailable",
      reason: "Last-verified facts are shown, but current release blockers and candidate state are unavailable.",
    },
  };
}

/**
 * Compose thirteen read-only sources over existing authorities. Each closure
 * performs only the reads needed for its card; the outer collector isolates
 * rejection and timeout per closure.
 */
export function buildFounderCommandCenterProductionSources(
  dependencies: FounderCommandCenterProductionDependencies,
): FounderCommandCenterSources {
  const now = dependencies.now ?? (() => new Date());
  return Object.freeze({
    applications: () => applicationsSource(dependencies.reads, now),
    care_requests: () => careSource(dependencies.reads, now),
    assisted_orders: ({ request }) =>
      assistedOrdersSource(dependencies.assistedOrders, request, now),
    payment_review: () => paymentReviewSource(dependencies.awaitingPaymentReview, now),
    fulfillment: () => fulfillmentSource(dependencies.settledAwaitingFulfillment, now),
    exceptions: () => exceptionsSource(dependencies.openExceptions, now),
    products: () => productsSource(dependencies.reads, now),
    draft_prices: () => draftPricesSource(dependencies.reads, now),
    required_inputs: () => requiredInputsSource(dependencies.reads, now),
    referrals: () => referralsSource(dependencies.reads, now),
    support: () => supportSource(dependencies.reads, now),
    system_status: () =>
      systemStatusSource(dependencies.reads, dependencies.emailConfiguration, now),
    release_status: () =>
      releaseStatusSource(
        dependencies.releaseEvidence,
        dependencies.environment ?? process.env,
      ),
  });
}

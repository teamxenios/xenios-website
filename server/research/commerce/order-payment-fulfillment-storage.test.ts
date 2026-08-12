import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/research-order-payment-fulfillment-pack04.sql"),
  "utf8",
);
const postcheck = readFileSync(
  resolve(process.cwd(), "supabase/research-order-payment-fulfillment-pack04-postcheck.sql"),
  "utf8",
);
const rollback = readFileSync(
  resolve(process.cwd(), "supabase/research-order-payment-fulfillment-pack04-rollback.sql"),
  "utf8",
);
const executionPacket = JSON.parse(readFileSync(
  resolve(process.cwd(), "PACK04_DB_EXECUTION_PACKET.json"),
  "utf8",
)) as {
  status: string;
  draftSha256: string;
  productionMutationAuthorized: boolean;
  requiredBehavioralMatrix: string[];
};

const PRIVATE_TABLES = [
  "research_order_business_organizations",
  "research_order_organization_buyers",
  "research_order_workflows",
  "research_order_invoices",
  "research_order_payment_evidence",
  "research_order_payment_verifications",
  "research_order_supplier_handoffs",
  "research_order_supplier_releases",
  "research_order_fulfillment_events",
  "research_order_tracking_events",
  "research_order_command_receipts",
  "research_order_timeline_events",
  "research_order_audit_events",
] as const;

describe("Pack 04 storage contract", () => {
  it("is an explicitly unrun, unmounted draft with a complete transaction", () => {
    expect(sql).toContain("DRAFT, NOT RUN");
    expect(sql).toContain("begin;");
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
    expect(sql).not.toMatch(/create\s+(or\s+replace\s+)?function\s+[^\n]*route/i);
  });

  it("defines every private record family and forces RLS over the whole set", () => {
    for (const table of PRIVATE_TABLES) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`'${table}'`);
    }
    expect(sql).toContain("alter table public.%I enable row level security");
    expect(sql).toContain("alter table public.%I force row level security");
    expect(sql).toContain("revoke all on table public.%I from public, anon, authenticated");
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete)[\s\S]{0,240}\sto\s+(anon|authenticated)/i);
  });

  it("keeps personal and business ownership in storage, including active org authority", () => {
    expect(sql).toContain("research_order_workflow_owner_shape");
    expect(sql).toContain("research_order_workflow_business_buyer");
    expect(sql).toContain("business buyer has no active organization authority");
    expect(sql).toContain("auth_user_id = auth.uid()");
    expect(sql).toContain("buyer_member_id = v_member_id");
    expect(sql).toContain("b.organization_id = research_order_workflows.organization_id");
    expect(sql).toContain("b.member_id = v_member_id");
  });

  it("makes approval, verified payment and named supplier release non-bypassable", () => {
    expect(sql).toContain("invoice requires named admin approval");
    expect(sql).toContain("settlement requires approved, invoiced, matching payment verification evidence");
    expect(sql).toContain("supplier handoff requires approval and committed payment settlement");
    expect(sql).toContain("fulfillment requires approval, verified payment, and supplier release");
    expect(sql).toContain("workflow must begin as an unapproved request");
    expect(sql).toContain("consequential order stage requires named admin approval");
    expect(sql).toContain("invalid workflow transition % -> %");
  });

  it("enforces normal order quantities from 1 through 50 without a quantity review split", () => {
    expect(sql).toContain("research_order_pack04_valid_line_quantities");
    expect(sql).toContain("not between 1 and 50");
    expect(sql).toContain("research_order_workflow_quantity_band");
    expect(sql).toContain("aggregate #> '{request,lines}'");
    expect(sql).toContain("research_order_invoice_quantity_band");
    expect(sql).toContain("record -> 'lines'");
    expect(sql).toContain("Quantity 21..50 remains in the same path as 1..20");
    expect(sql).toContain("invoice quantities must exactly match the approved buyer request");
    expect(sql).not.toMatch(/quantity\s*(?:<=|>|between)\s*20/i);
  });

  it("stores idempotency, append-only evidence, tracking and an internal audit trail", () => {
    expect(sql).toContain("primary key (owner_scope, idempotency_key)");
    expect(sql).toContain("constraint research_order_payment_evidence_proof_unique unique (proof_sha256)");
    expect(sql).toContain("external_transaction_ref text not null unique");
    expect(sql).toContain("settlement_ref text not null unique");
    expect(sql).toContain("research_order_pack04_append_only");
    expect(sql).toContain("'research_order_command_receipts'");
    expect(sql).toContain("'research_order_audit_events'");
    expect(sql).toContain("Pack 04 shipped requires tracking");
  });

  it("returns only a customer-safe timeline projection", () => {
    const projection = sql.slice(sql.indexOf("create or replace function public.research_customer_order_timeline"));
    expect(sql).toContain("research_order_timeline_customer_detail_keys");
    expect(sql).toContain("when 'buyer_request_created' then detail - array['lineCount']");
    expect(sql).toContain("when 'payment_verified' then detail - array['amountCents', 'currency']");
    expect(sql).toContain("when 'tracking_added' then detail - array['carrier', 'trackingNumber']");
    expect(projection).toContain("'trackingNumber', t.tracking_number");
    expect(projection).toContain("where e.order_id = p_order_id and e.customer_visible");
    expect(projection).toContain("pg_catalog.jsonb_strip_nulls");
    expect(projection).not.toContain("'detail', e.detail");
    expect(projection).not.toContain("external_transaction_ref");
    expect(projection).not.toContain("private_object_ref");
    expect(projection).not.toContain("supplier_id");
    expect(projection).not.toContain("payload_sha256");
  });

  it("provides bounded keyset order history with payment, fulfillment and tracking status", () => {
    const history = sql.slice(
      sql.indexOf("create or replace function public.research_customer_order_history"),
      sql.indexOf("-- Access. No raw browser table access"),
    );
    expect(history).toContain("p_limit not between 1 and 100");
    expect(history).toContain("w.updated_at < p_before_updated_at");
    expect(history).toContain("w.updated_at = p_before_updated_at and w.order_id < p_before_order_id");
    expect(history).toContain("w.buyer_member_id = v_member_id");
    expect(history).toContain("b.organization_id = w.organization_id");
    expect(history).toContain("'paymentStatus', payment_status");
    expect(history).toContain("'fulfillmentStatus', fulfillment_status");
    expect(history).toContain("'latestTracking', latest_tracking");
    expect(history).toContain("limit p_limit + 1");
    expect(history).not.toContain("external_transaction_ref");
    expect(history).not.toContain("private_object_ref");
    expect(history).not.toContain("supplier_id");
    expect(history).not.toContain("payload_sha256");
    expect(sql).toContain(
      "grant execute on function public.research_customer_order_history(integer, timestamptz, text)",
    );
  });

  it("ships a hash-pinned disposable postcheck and guarded empty-state rollback packet", () => {
    const actualHash = createHash("sha256").update(sql).digest("hex");
    expect(executionPacket.status).toBe("PREPARED_NOT_RUN");
    expect(executionPacket.productionMutationAuthorized).toBe(false);
    expect(executionPacket.draftSha256).toBe(actualHash);
    for (const quantity of [1, 20, 21, 49, 50, 51]) {
      expect(postcheck).toContain(`quantity\":${quantity}`);
    }
    expect(postcheck).toContain("begin transaction read only;");
    expect(postcheck.trimEnd().endsWith("rollback;")).toBe(true);
    expect(postcheck).not.toMatch(/\b(insert|update|delete|truncate|alter|drop|grant|revoke)\b/i);
    expect(rollback).toContain("DRAFT, NOT RUN");
    expect(rollback).toContain("rollback refused: public.% contains % row(s)");
    expect(rollback).not.toMatch(/drop\s+(?:table|function)[^;]*\bcascade\b/i);
    expect(rollback).not.toMatch(/drop\s+extension/i);
    expect(rollback).not.toMatch(/\b(delete|truncate)\b/i);
    expect(executionPacket.requiredBehavioralMatrix.join(" ")).toContain("Quantity 0");
    expect(executionPacket.requiredBehavioralMatrix.join(" ")).toContain("quantity 51");
  });

  it("locks every existing Pack 04 table before rollback counts or drops", () => {
    const preflightStart = rollback.indexOf("do $pack04_rollback_preflight$");
    const preflightEnd = rollback.indexOf("$pack04_rollback_preflight$;", preflightStart);
    const preflight = rollback.slice(preflightStart, preflightEnd);
    const loopPattern = /foreach v_table in array v_tables loop/g;
    const loops = [...preflight.matchAll(loopPattern)];

    expect(preflightStart).toBeGreaterThanOrEqual(0);
    expect(preflightEnd).toBeGreaterThan(preflightStart);
    expect(loops).toHaveLength(2);

    const lockLoopStart = loops[0]?.index ?? -1;
    const lockLoopEnd = preflight.indexOf("end loop;", lockLoopStart);
    const countLoopStart = loops[1]?.index ?? -1;
    const countLoopEnd = preflight.indexOf("end loop;", countLoopStart);
    const lockLoop = preflight.slice(lockLoopStart, lockLoopEnd);
    const countLoop = preflight.slice(countLoopStart, countLoopEnd);

    expect(lockLoop).toContain("lock table public.%I in access exclusive mode");
    expect(lockLoop).not.toContain("select count(*)");
    expect(countLoop).toContain("select count(*) from public.%I");
    expect(countLoop).not.toContain("lock table");
    expect(lockLoopEnd).toBeLessThan(countLoopStart);
    expect(countLoopEnd).toBeLessThan(rollback.indexOf("drop function"));

    const tableListStart = preflight.indexOf("v_tables constant text[] := array[");
    const tableListEnd = preflight.indexOf("];", tableListStart);
    const tableList = preflight.slice(tableListStart, tableListEnd);
    let previousTableIndex = -1;
    for (const table of PRIVATE_TABLES) {
      const tableIndex = tableList.indexOf(`'${table}'`);
      expect(tableIndex).toBeGreaterThan(previousTableIndex);
      previousTableIndex = tableIndex;
    }
  });
});

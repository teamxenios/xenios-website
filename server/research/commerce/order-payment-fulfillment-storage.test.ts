import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/research-order-payment-fulfillment-pack04.sql"),
  "utf8",
);

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
    expect(projection).toContain("'trackingNumber', t.tracking_number");
    expect(projection).toContain("where e.order_id = p_order_id and e.customer_visible");
    expect(projection).not.toContain("external_transaction_ref");
    expect(projection).not.toContain("private_object_ref");
    expect(projection).not.toContain("supplier_id");
    expect(projection).not.toContain("payload_sha256");
  });
});

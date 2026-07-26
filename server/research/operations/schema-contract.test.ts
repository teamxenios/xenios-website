import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  fileURLToPath(new URL("../../../supabase/research-operations-affiliates.sql", import.meta.url)),
  "utf8",
);

describe("operations additive schema contract", () => {
  it("extends the canonical commerce architecture instead of creating parallel core tables", () => {
    for (const forbidden of [
      "create table if not exists research_operations_orders",
      "create table if not exists research_operations_lots",
      "create table if not exists research_operations_shipments",
      "create table if not exists research_operations_affiliates",
      "create table if not exists research_operations_notification_outbox",
      "create table if not exists research_operations_commission_events",
      "create table if not exists research_operations_payouts",
    ]) {
      expect(sql).not.toContain(forbidden);
    }
    for (const canonical of [
      "public.research_orders",
      "public.research_fulfillment_orders",
      "public.research_inventory_lots",
      "public.research_partners",
      "public.research_commission_ledger",
      "public.research_notification_outbox",
    ]) {
      expect(sql).toContain(canonical);
    }
  });

  it("keeps fulfillment, shipment, and allocation projections separate", () => {
    for (const column of ["fulfillment_state", "shipment_state", "allocation_state"]) {
      expect(sql).toContain(column);
    }
  });

  it("makes operational evidence append-only", () => {
    for (const trigger of [
      "research_operations_inventory_append_only",
      "research_operations_audit_append_only",
      "research_operations_crm_events_append_only",
      "research_partner_metric_events_append_only",
      "research_partner_portal_request_events_append_only",
      "research_professional_audit_append_only",
    ]) {
      expect(sql).toContain(trigger);
    }
  });

  it("uses the one canonical notification outbox", () => {
    expect(sql).toContain("'public.research_notification_outbox'");
    expect(sql).not.toContain("create table if not exists public.research_operations_notification_outbox");
  });

  it("never double-decrements inventory during allocation or shipping", () => {
    expect(sql).toContain("movement_kind in ('allocate','release','ship') and on_hand_delta = 0");
    expect(sql).toContain("'ship',");
    expect(sql).toContain("      0,");
    expect(sql).not.toMatch(/quantity_available\s*=\s*quantity_available\s*-/);
  });

  it("atomically checks staff role, version, idempotency, exact lot, and quality evidence", () => {
    expect(sql).toContain("research_operations_apply_fulfillment_command");
    expect(sql).toContain("research_operations_staff_roles");
    expect(sql).toContain("work.version <> p_expected_version");
    expect(sql).toContain("existing.command_hash <> command_hash");
    expect(sql).toContain("research_lot_allocations");
    expect(sql).toContain("quality.coa_on_file");
    expect(sql).toContain("quality.identity_confirmed");
    expect(sql).toContain("quality.purity_confirmed");
  });

  it("enables RLS and revokes browser roles for every Website 4 table", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on table public.%I from anon, authenticated");
    expect(sql).toContain("grant select, insert, update, delete on table public.%I to service_role");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("research_operations_submit_partner_request");
  });

  it("rejects prohibited clinical referral economic keys at the database boundary", () => {
    for (const key of [
      "prescriptionPaymentCents",
      "patientReferralPaymentCents",
      "diagnosisPaymentCents",
      "clinicalApprovalPaymentCents",
      "medicationValuePaymentCents",
    ]) {
      expect(sql).toContain(key);
    }
  });

  it("persists the complete professional commercial pipeline with an atomic transition RPC", () => {
    for (const stage of ["prospect", "discovery", "diligence", "commercial_review", "agreement", "active", "paused", "closed"]) {
      expect(sql).toContain(`'${stage}'`);
    }
    expect(sql).toContain("research_operations_transition_professional_account");
    expect(sql).toContain("account.version <> p_expected_version");
  });
});

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
      "research_operations_inventory_commands_append_only",
      "research_operations_audit_append_only",
      "research_operations_crm_events_append_only",
      "research_operations_task_events_append_only",
      "research_partner_metric_events_append_only",
      "research_partner_portal_request_events_append_only",
      "research_partner_agreement_versions_append_only",
      "research_partner_agreement_events_append_only",
      "research_partner_agreements_append_only",
      "research_professional_audit_append_only",
    ]) {
      expect(sql).toContain(trigger);
    }
  });

  it("uses the one canonical notification outbox", () => {
    expect(sql).toContain("'public.research_notification_outbox'");
    expect(sql).not.toContain("create table if not exists public.research_operations_notification_outbox");
    expect(sql).toContain("research_operations_enqueue_alert");
    expect(sql).toContain("'admin_operations_alert'");
    expect(sql).toContain("preference.immediate->>'operations'");
    expect(sql).not.toContain("(preference.immediate->>'operations')::boolean");
  });

  it("never double-decrements inventory during allocation or shipping", () => {
    expect(sql).toContain("movement_kind in ('allocate','release','ship','quarantine') and on_hand_delta = 0");
    expect(sql).toContain("'ship',");
    expect(sql).toContain("      0,");
    expect(sql).not.toMatch(/quantity_available\s*=\s*quantity_available\s*-/);
  });

  it("implements the complete versioned inventory lifecycle and refuses negative balances", () => {
    expect(sql).toContain("create table if not exists public.research_operations_inventory_commands");
    expect(sql).toContain("research_operations_apply_inventory_command");
    for (const action of ["receipt", "release", "return", "damage", "quarantine", "correction", "reconcile"]) {
      expect(sql).toContain(`'${action}'`);
    }
    expect(sql).toContain("lot.quantity_available + input_delta < 0");
    expect(sql).toContain("'insufficient_available'");
    expect(sql).toContain("allocation.released_at is not null");
  });

  it("resolves a shortage without fabricating a shipment or inventory movement", () => {
    expect(sql).toContain("'resolve_exception'");
    expect(sql).toContain("status = 'resolved'");
    expect(sql).toContain("resolution = trim(p_payload->>'resolution')");
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

  it("persists assigned operations tasks with optimistic concurrency and replay protection", () => {
    expect(sql).toContain("create table if not exists public.research_operations_tasks");
    expect(sql).toContain("create table if not exists public.research_operations_task_events");
    expect(sql).toContain("research_operations_apply_task_command");
    expect(sql).toContain("task.version <> p_expected_version");
    expect(sql).toContain("prior.command_hash <> command_hash");
  });

  it("persists operational CRM commands while refusing clinical note content", () => {
    expect(sql).toContain("research_operations_apply_crm_command");
    expect(sql).toContain("contact.version <> p_expected_version");
    expect(sql).toContain("prior.command_hash <> command_hash");
    expect(sql).toContain("privacy_refused");
    expect(sql).toContain("patient|medical|medication");
  });

  it("persists the complete professional commercial pipeline with an atomic transition RPC", () => {
    for (const stage of ["prospect", "discovery", "diligence", "commercial_review", "agreement", "active", "paused", "closed"]) {
      expect(sql).toContain(`'${stage}'`);
    }
    expect(sql).toContain("research_operations_transition_professional_account");
    expect(sql).toContain("account.version <> p_expected_version");
  });

  it("publishes immutable partner terms and blocks activation until the current version is accepted", () => {
    for (const table of [
      "research_partner_agreement_versions",
      "research_partner_agreement_heads",
      "research_partner_agreement_events",
    ]) {
      expect(sql).toContain(`create table if not exists public.${table}`);
    }
    expect(sql).toContain("research_operations_publish_partner_agreement");
    expect(sql).toContain("research_operations_accept_partner_agreement");
    expect(sql).toContain("research_operations_partner_terms_ready");
    expect(sql).toContain("AFFILIATE AGREEMENT REQUIRED");
    expect(sql).toContain("member.auth_user_id::text = trim(p_actor_id)");
    expect(sql).toContain("accepted.content_hash = version.content_hash");
  });
});

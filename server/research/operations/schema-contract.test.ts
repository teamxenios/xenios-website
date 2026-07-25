import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  fileURLToPath(new URL("../../../supabase/research-operations-affiliates.sql", import.meta.url)),
  "utf8",
);

describe("operations additive schema contract", () => {
  it("keeps payment, order, fulfillment, shipment, and allocation states separate", () => {
    for (const column of ["payment_state", "order_state", "fulfillment_state", "shipment_state", "allocation_state"]) {
      expect(sql).toContain(column);
    }
  });

  it("makes movements, audit, attribution, and commission events append-only", () => {
    for (const trigger of [
      "research_operations_inventory_append_only",
      "research_operations_audit_append_only",
      "research_operations_attribution_append_only",
      "research_operations_commission_append_only",
    ]) {
      expect(sql).toContain(trigger);
    }
  });

  it("uses one notification outbox and enforces external privacy suppression", () => {
    expect(sql.match(/create table if not exists research_operations_notification_outbox/g)).toHaveLength(1);
    expect(sql).toContain("channel not in ('sms', 'telegram')");
    expect(sql).toContain("status = 'suppressed'");
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
});

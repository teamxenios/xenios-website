import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/care-foundation.sql"), "utf8").toLowerCase();

const tables = [
  "care_capabilities",
  "care_role_assignments",
  "care_medical_groups",
  "care_clinicians",
  "care_clinician_coverage",
  "care_patients",
  "care_consents",
  "care_eligibility_checks",
  "care_intake_instances",
  "care_appointments",
  "care_clinician_reviews",
  "care_clinical_orders",
  "care_prescriptions",
  "care_pharmacy_assignments",
  "care_instruction_bindings",
  "care_supply_kits",
  "care_lab_shares",
  "care_message_threads",
  "care_secure_messages",
  "care_support_cases",
  "care_adverse_events",
  "care_discovery_referrals",
  "care_audit_events",
];

describe("Care migration foundation", () => {
  it("is additive and rerunnable", () => {
    for (const table of tables) {
      expect(sql).toContain(`create table if not exists public.${table}`);
    }
    expect(sql).toContain("create index if not exists");
    expect(sql).toContain("on conflict (capability_key) do nothing");
    expect(sql).not.toContain("drop table");
  });

  it("defaults disabled and cannot enable without approval fields", () => {
    expect(sql).toContain("state text not null default 'disabled'");
    expect(sql).toContain("state <> 'enabled'");
    expect(sql).toContain("approved_by is not null and approved_at is not null");
  });

  it("enables and forces RLS for the complete Care table list", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("force row level security");
    for (const table of tables) {
      expect(sql).toContain(`'${table}'`);
    }
  });

  it("has no public/anonymous or allow-all policies", () => {
    expect(sql).not.toMatch(/create policy[\s\S]{0,240}\bto\s+(anon|public)\b/);
    expect(sql).not.toContain("using (true)");
    expect(sql).toContain("revoke all on table public.%i from anon");
    expect(sql).toContain("revoke all on table public.%i from public");
  });

  it("does not reference Research products, orders, purchases, or inventory", () => {
    expect(sql).not.toMatch(/references\s+public\.research_/);
    expect(sql).not.toContain("research_product");
    expect(sql).not.toContain("research_order");
    expect(sql).not.toContain("research_inventory");
  });

  it("stores portal message content as ciphertext and includes rollback notes", () => {
    expect(sql).toContain("body_ciphertext bytea not null");
    expect(sql).toContain("rollback notes");
    expect(sql).not.toContain("body text");
  });
});

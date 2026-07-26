import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(__dirname, "../../supabase/care-appointments-clinician.sql"),
  "utf8",
);
const lifecycle = readFileSync(
  resolve(
    __dirname,
    "../../supabase/tests/care-appointments-clinician-lifecycle.test.sql",
  ),
  "utf8",
);

describe("Care PR 3 migration posture", () => {
  const tables = [
    "care_medical_groups",
    "care_clinician_profiles",
    "care_clinician_licenses",
    "care_scheduling_providers",
    "care_clinical_configuration_audit",
    "care_appointments",
    "care_telehealth_sessions",
    "care_appointment_events",
    "care_clinician_assignment_events",
    "care_clinician_reviews",
    "care_clinician_review_events",
    "care_appointment_reminders",
  ];

  it("creates the complete PR 3 domain without seeding clinical facts", () => {
    for (const table of tables) {
      expect(migration).toContain(`create table if not exists public.${table}`);
    }
    const schemaSection = migration.split(
      "create or replace function public.care_request_appointment",
    )[0];
    expect(schemaSection).not.toMatch(
      /insert into public\.(care_medical_groups|care_clinician_profiles|care_clinician_licenses|care_scheduling_providers|care_appointments)/i,
    );
  });

  it("forces RLS and keeps browser roles without table authority", () => {
    expect(migration).toContain("alter table public.%I force row level security");
    expect(migration).toContain(
      "revoke all on table public.%I from public, anon, authenticated",
    );
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all).*authenticated/i);
  });

  it("requires verified medical-group, clinician, license, coverage, and provider records", () => {
    expect(migration).toContain("public.care_clinician_ready");
    expect(migration).toContain("medical_group.verification_state = 'verified'");
    expect(migration).toContain("license.verification_state = 'verified'");
    expect(migration).toContain("coverage.active");
    expect(migration).toContain("provider.verification_state = 'verified'");
  });

  it("proves cross-patient rejection, immutable histories, and a human final decision", () => {
    for (const proof of [
      "cross-patient appointment request was accepted",
      "cross-patient appointment mutation was accepted",
      "unauthorized assignment replay was accepted",
      "unauthorized no-show replay was accepted",
      "unauthorized schedule replay was accepted",
      "appointment event update was accepted",
      "clinician assignment event delete was accepted",
      "clinical configuration audit update was accepted",
      "human clinician final-decision proof failed",
      "decided review assignment mutation was accepted",
      "clinician review event update was accepted",
      "clinician review event delete was accepted",
      "Care capability changed from disabled",
    ]) {
      expect(lifecycle).toContain(proof);
    }
    expect(lifecycle.trimEnd()).toMatch(/rollback;$/);
  });
});

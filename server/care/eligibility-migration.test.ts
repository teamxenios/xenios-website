import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(__dirname, "../../supabase/care-eligibility-intake.sql"),
  "utf8",
);
const lifecycle = readFileSync(
  resolve(
    __dirname,
    "../../supabase/tests/care-eligibility-intake-lifecycle.test.sql",
  ),
  "utf8",
);

describe("Care PR 2 migration posture", () => {
  const tables = [
    "care_patients",
    "care_patient_locations",
    "care_supported_states",
    "care_supported_state_audit",
    "care_clinician_state_coverage",
    "care_clinician_coverage_audit",
    "care_consent_documents",
    "care_consent_events",
    "care_eligibility_checks",
    "care_waitlist_events",
    "care_intake_definitions",
    "care_intakes",
    "care_intake_revisions",
  ];

  it("creates the isolated Care foundation without seeding external facts", () => {
    for (const table of tables) {
      expect(migration).toContain(`create table if not exists public.${table}`);
    }
    expect(migration).not.toMatch(
      /insert into public\.(care_supported_states|care_clinician_state_coverage|care_consent_documents|care_intake_definitions)/i,
    );
    expect(migration).not.toMatch(
      /\b(semaglutide|tirzepatide|dose|diagnosis|symptom|pharmacy name)\b/i,
    );
  });

  it("requires an explicit approval record before support or waitlist publication", () => {
    expect(migration).toContain(
      "not (supported_state_active or service_coverage_active or waitlist_enabled)",
    );
    expect(migration).toContain(
      "or (approved_by is not null and approved_at is not null)",
    );
  });

  it("forces RLS and removes all browser table authority", () => {
    expect(migration).toContain(
      "alter table public.%I force row level security",
    );
    expect(migration).toContain(
      "revoke all on table public.%I from public, anon, authenticated",
    );
    expect(migration).not.toMatch(
      /grant\s+(insert|update|delete|all).*authenticated/i,
    );
  });

  it("makes histories database-enforced append-only", () => {
    for (const trigger of [
      "care_supported_state_audit_append_only",
      "care_clinician_coverage_audit_append_only",
      "care_locations_append_only",
      "care_consent_events_append_only",
      "care_eligibility_checks_append_only",
      "care_waitlist_events_append_only",
      "care_intake_revisions_append_only",
      "care_consent_document_version_guard",
      "care_intake_definition_version_guard",
    ]) {
      expect(migration).toContain(`create trigger ${trigger}`);
    }
    expect(migration).toContain(
      "create or replace function public.care_reject_immutable_mutation()",
    );
    expect(lifecycle).toContain("location update was accepted");
    expect(lifecycle).toContain("supported-state audit update was accepted");
    expect(lifecycle).toContain("clinician coverage audit delete was accepted");
    expect(lifecycle).toContain("consent event delete was accepted");
    expect(lifecycle).toContain("eligibility history update was accepted");
    expect(lifecycle).toContain("waitlist history delete was accepted");
    expect(lifecycle).toContain("intake revision update was accepted");
    expect(lifecycle).toContain("intake revision delete was accepted");
    expect(lifecycle).toContain(
      "approved consent document mutation was accepted",
    );
    expect(lifecycle).toContain(
      "approved intake definition delete was accepted",
    );
  });

  it("proves ownership, idempotency, optimistic versioning, and no residual fixtures", () => {
    expect(migration).toContain(
      "create or replace function public.care_active_clinician_count",
    );
    expect(migration).toContain(
      "assignment.role = 'clinician'",
    );
    expect(lifecycle).toContain(
      "active clinician role/coverage count proof failed",
    );
    expect(lifecycle).toContain("cross-patient consent binding was accepted");
    expect(lifecycle).toContain("cross-patient autosave was accepted");
    expect(lifecycle).toContain("cross-patient submit was accepted");
    expect(lifecycle).toContain("autosave idempotency proof failed");
    expect(lifecycle).toContain("stale-version autosave was accepted");
    expect(lifecycle.trimEnd()).toMatch(/rollback;$/);
  });

  it("revalidates exact current consent inside both intake transition RPCs", () => {
    expect(
      migration.match(/raise exception 'care_intake_consent_required'/g),
    ).toHaveLength(4);
    expect(
      migration.match(
        /order by latest\.occurred_at desc, latest\.id desc/g,
      ),
    ).toHaveLength(4);
    expect(lifecycle).toContain(
      "autosave after consent revocation was accepted",
    );
    expect(lifecycle).toContain(
      "submit after consent revocation was accepted",
    );
    expect(lifecycle).toContain(
      "autosave after consent supersession was accepted",
    );
    expect(lifecycle).toContain(
      "submit after consent supersession was accepted",
    );
    expect(lifecycle).toContain(
      "revocation changed intake version or status",
    );
    expect(lifecycle).toContain(
      "supersession changed intake version or status",
    );
  });
});

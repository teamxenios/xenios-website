import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260727190000_research_admin_authority.sql",
  ),
  "utf8",
);
const rollback = readFileSync(
  resolve(
    process.cwd(),
    "supabase/production/research-admin-authority-rollback.sql",
  ),
  "utf8",
);
const bootstrap = readFileSync(
  resolve(process.cwd(), "scripts/assign-initial-super-admin.mjs"),
  "utf8",
);

describe("administrator authority migration contract", () => {
  it("is additive, empty by default, forced-RLS, and RPC-only for mutations", () => {
    expect(migration).toContain(
      "create table if not exists public.research_admin_experience_preferences",
    );
    expect(migration).toContain(
      "create table if not exists public.research_admin_authority_audit",
    );
    expect(migration).toContain(
      "alter table public.research_admin_experience_preferences\n  force row level security",
    );
    expect(migration).toContain(
      "alter table public.research_admin_authority_audit\n  force row level security",
    );
    expect(migration).toContain(
      "revoke insert, update, delete\n  on table public.research_prelaunch_role_assignments\n  from service_role",
    );
    expect(migration).not.toMatch(
      /insert\s+into\s+auth\.users|samuel@|research_members\s*\(/i,
    );
  });

  it("uses fixed-search-path, idempotent, versioned security-definer RPCs", () => {
    for (const name of [
      "research_admin_set_experience_preference",
      "research_admin_role_grant",
      "research_admin_role_revoke",
      "research_admin_assign_initial_super_admin",
    ]) {
      expect(migration).toContain(`function public.${name}`);
    }
    expect(migration.match(/security definer/g)?.length).toBeGreaterThanOrEqual(
      5,
    );
    expect(
      migration.match(/set search_path = pg_catalog, public/g)?.length,
    ).toBeGreaterThanOrEqual(5);
    expect(migration).toContain("p_expected_version bigint");
    expect(migration).toContain("p_idempotency_key text");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("preference version conflict");
  });

  it("keeps authority audit immutable and direct browser execution denied", () => {
    expect(migration).toContain(
      "research_admin_authority_audit_no_mutation",
    );
    expect(migration).toContain(
      "raise exception 'administrator authority audit records are append-only'",
    );
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });

  it("provides a zero-state rollback and a UUID-only reviewed bootstrap boundary", () => {
    expect(rollback).toContain(
      "rollback refused: administrator authority audit exists",
    );
    expect(rollback).toContain(
      "rollback refused: administrator preferences exist",
    );
    expect(bootstrap).toContain("XENIOS_VERIFIED_ADMIN_AUTH_USER_ID");
    expect(bootstrap).toContain("XENIOS_WEBSITE6_ACCEPTED_SHA");
    expect(bootstrap).toContain("XENIOS_WEBSITE2_ACCOUNT_CONTINUITY");
    expect(bootstrap).not.toMatch(/samuel@/i);
  });
});

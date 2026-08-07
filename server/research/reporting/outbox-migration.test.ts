import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../../..");
const migration = readFileSync(resolve(repoRoot, "supabase/research-operational-reporting-outbox.sql"), "utf8");
const lifecycle = readFileSync(resolve(repoRoot, "supabase/tests/research-operational-reporting-outbox-lifecycle.test.sql"), "utf8");

describe("operational reporting outbox migration", () => {
  it("is unapplied, atomic, rerunnable, and refuses partial installs", () => {
    expect(migration.trimStart().startsWith("-- Unapplied")).toBe(true);
    expect(migration).toMatch(/begin;[\s\S]*commit;/);
    expect(migration).toContain("present_count not in (0, 7)");
    expect(migration).toContain("refusing unsafe apply");
    expect(migration).toMatch(/create table if not exists/g);
    expect(migration).toMatch(/create or replace function/g);
    expect(migration).not.toContain("schema_migrations");
    expect(migration).not.toContain("supabase_migrations");
  });

  it("defines retry, dead-letter, lease, and reconciliation primitives", () => {
    for (const value of ["retry_scheduled", "dead_letter", "lease_expires_at", "for update skip locked", "research_reconcile_operational_reports"]) {
      expect(migration).toContain(value);
    }
    expect(migration).toContain("p_max_attempts not between 1 and 20");
    expect(migration).toContain("p_limit not between 1 and 100");
  });

  it("forces RLS and exposes only reviewed RPCs to service_role", () => {
    expect(migration.match(/force row level security/g)).toHaveLength(2);
    expect(migration).toContain("revoke all on table public.research_operational_reporting_outbox from public, anon, authenticated, service_role");
    expect(migration).toContain("revoke all on table public.research_operational_reporting_attempts from public, anon, authenticated, service_role");
    expect(migration).not.toMatch(/grant (select|insert|update|delete|truncate|references|trigger) on table/i);
    expect(migration.match(/grant execute on function/g)).toHaveLength(5);
  });

  it("keeps sensitive command inputs hashed and errors bounded", () => {
    expect(migration).toContain("idempotency_key_hash");
    expect(migration).toContain("provider_receipt_hash");
    expect(migration).not.toMatch(/idempotency_key\s+text\s+not null/i);
    expect(migration).toContain("length(last_error_summary) <= 500");
  });

  it("proves apply-twice separately and rolls lifecycle mutations back", () => {
    expect(lifecycle.trimStart()).toMatch(/^-- Disposable/);
    expect(lifecycle).toMatch(/begin;[\s\S]*rollback;/);
    expect(lifecycle).toContain("enqueue idempotency failed");
    expect(lifecycle).toContain("dead-letter transition failed");
    expect(lifecycle).toContain("lease reconciliation failed");
    expect(lifecycle).toContain("service_role direct DML unexpectedly succeeded");
  });

  it("does not add runtime routes, providers, or production apply behavior", () => {
    expect(migration).not.toMatch(/express|router\.|stripe|resend|telegram|http_request|net\.http/i);
    expect(lifecycle).not.toMatch(/insert into .*products|insert into .*orders/i);
  });
});

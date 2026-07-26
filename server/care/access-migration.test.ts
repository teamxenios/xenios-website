import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Care PR 1 migration", () => {
  const sql = readFileSync(
    resolve(__dirname, "../../supabase/care-access-foundation.sql"),
    "utf8",
  );

  it("is additive, repeatable, and disabled by default", () => {
    expect(sql.match(/create table if not exists/g)).toHaveLength(3);
    expect(sql).toContain("on conflict (capability_key) do nothing");
    expect(sql).toContain("values ('care', 'disabled')");
    expect(sql).not.toMatch(/\b(drop table|truncate|delete from)\b/i);
  });

  it("allows re-grant after revocation but forbids two active grants", () => {
    expect(sql).not.toMatch(/unique\s*\(\s*user_id\s*,\s*role\s*\)/i);
    expect(sql).toMatch(
      /create unique index if not exists care_roles_user_active_idx[\s\S]*where revoked_at is null/i,
    );

    const lifecycle = readFileSync(
      resolve(
        __dirname,
        "../../supabase/tests/care-access-foundation-lifecycle.test.sql",
      ),
      "utf8",
    );
    expect(lifecycle).toContain("grant -> revoke -> re-grant lifecycle proof failed");
    expect(lifecycle).toContain("when unique_violation");
    expect(lifecycle).toContain("rollback;");
  });

  it("forces RLS and removes public and anonymous table authority", () => {
    expect(sql.match(/enable row level security/g)).toHaveLength(3);
    expect(sql.match(/force row level security/g)).toHaveLength(3);
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).not.toMatch(/\bgrant\b[^;]*\bto\s+(public|anon)\b/i);
  });

  it("makes access audit database-enforced append-only", () => {
    expect(sql).toMatch(
      /create or replace function public\.care_reject_access_audit_mutation\(\)[\s\S]*set search_path = ''/i,
    );
    expect(sql).toMatch(
      /create trigger care_access_audit_append_only[\s\S]*before update or delete on public\.care_access_audit/i,
    );

    const lifecycle = readFileSync(
      resolve(
        __dirname,
        "../../supabase/tests/care-access-foundation-lifecycle.test.sql",
      ),
      "utf8",
    );
    expect(lifecycle).toContain("care access audit insert proof failed");
    expect(lifecycle).toContain("care access audit update was accepted");
    expect(lifecycle).toContain("care access audit actor reassignment was accepted");
    expect(lifecycle).toContain("audited auth-user deletion did not redact actor");
    expect(lifecycle).toContain("care access audit actor restoration was accepted");
    expect(lifecycle).toContain("care access audit delete was accepted");
    expect(lifecycle.match(/when sqlstate '55000'/g)).toHaveLength(4);
  });

  it("does not establish clinical records or a Research linkage", () => {
    expect(sql).not.toMatch(/create table if not exists public\.care_(patients|clinicians|prescriptions|pharmacy|instructions|supplies)/i);
    expect(sql).not.toMatch(/references\s+public\.research_/i);
    expect(sql).not.toMatch(/\b(insert into|update)\s+public\.research_/i);
  });

  it("keeps client access read-only and security-admin constrained", () => {
    expect(sql).toContain("care_security_roles_read");
    expect(sql).toContain("care_security_access_audit_read");
    expect(sql).toContain("array['care_security_admin']");
    expect(sql).not.toMatch(/for\s+(insert|update|delete|all)\s+to authenticated/i);
  });
});

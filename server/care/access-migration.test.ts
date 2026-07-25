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

  it("forces RLS and removes public and anonymous table authority", () => {
    expect(sql.match(/enable row level security/g)).toHaveLength(3);
    expect(sql.match(/force row level security/g)).toHaveLength(3);
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).not.toMatch(/\bgrant\b[^;]*\bto\s+(public|anon)\b/i);
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

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.resolve(process.cwd(), "supabase/research-authenticated-experience.sql"),
  "utf8",
);

describe("authenticated experience preference migration", () => {
  it("persists navigation preference without granting browser table access", () => {
    expect(sql).toMatch(
      /create table if not exists public\.research_authenticated_experience_preferences/i,
    );
    expect(sql).toMatch(/auth_user_id uuid primary key references auth\.users\(id\)/i);
    expect(sql).toMatch(/preferred_experience in \('admin', 'member'\)/i);
    expect(sql).toMatch(
      /alter table public\.research_authenticated_experience_preferences force row level security/i,
    );
    expect(sql).toMatch(
      /revoke all on table public\.research_authenticated_experience_preferences[\s\S]*from public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant select, insert, update, delete[\s\S]*to service_role/i,
    );
  });

  it("does not create or assign an administrator, member, or Samuel identity", () => {
    expect(sql).not.toMatch(/insert\s+into/i);
    expect(sql).not.toMatch(/samuel@/i);
    expect(sql).not.toMatch(/research_prelaunch_role_assignments\s*\(/i);
    expect(sql).not.toMatch(/research_members\s*\(/i);
  });
});

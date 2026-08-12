import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Pack 02 isolation and single-system boundaries", () => {
  it("does not mount the candidate routes or UI", () => {
    expect(read("server/index.ts")).not.toContain("registerAccountIdentityApi");
    expect(read("client/src/research/section.tsx")).not.toContain("OrganizationDashboard");
    expect(read("client/src/research/section.tsx")).not.toContain("AccountSignIn");
  });

  it("keeps the database artifact outside managed migrations and contains no credential storage", () => {
    const sql = read("supabase/pack02-candidates/20260812_research_account_organizations.sql");
    expect(sql).toContain("PACK 02 CANDIDATE ONLY");
    expect(sql).toContain("references auth.users(id)");
    expect(sql).toContain("research_early_access_*");
    expect(sql).not.toMatch(/\bpassword\s+(text|varchar|bytea)/i);
    expect(sql).not.toMatch(/\bpassword_hash\b/i);
    expect(sql).not.toMatch(/\bcredential_hash\b/i);
  });

  it("seeds Roman Digital without inventing a Supabase Auth UID", () => {
    const sql = read("supabase/pack02-candidates/20260812_research_account_organizations.sql");
    expect(sql).toContain("'roman-digital','Roman Digital','Roman Digital'");
    expect(sql).toContain("'k@romandigital.io'");
    expect(sql).toContain("array['organization_owner','business_buyer']");
    expect(sql).toContain("pending manual Supabase Auth UID");
    expect(sql).not.toContain("K@romandigital.io");
  });
});

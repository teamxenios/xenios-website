import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const bindingPath = "supabase/pack02-candidates/20260812_roman_digital_existing_auth_binding.sql";

describe("Roman Digital dependent Pack 02 binding", () => {
  it("binds the exact existing verified Supabase identity with both required roles", () => {
    const sql = read(bindingPath);
    expect(sql).toContain("20ec822d-8123-4088-ac05-9c8f4b2da784");
    expect(sql).toContain("info@romanhealthcollective.com");
    expect(sql).toContain("array['organization_owner','business_buyer']::text[]");
    expect(sql).toContain("email_confirmed_at is null");
    expect(sql).toContain("research_bind_verified_organization_user");
  });

  it("supersedes the old email audibly without creating credentials or auth users", () => {
    const sql = read(bindingPath);
    const executableSql = sql.replace(/^\s*--.*$/gm, "");
    expect(sql).toContain("organization_identity_superseded");
    expect(sql).toContain("k@romandigital.io");
    expect(sql).toContain("state='revoked'");
    expect(executableSql).not.toMatch(/auth\.users\s*\([^)]*\)\s*values/i);
    expect(executableSql).not.toMatch(/insert\s+into\s+auth\.users/i);
    expect(executableSql).not.toMatch(/\b(password|password_hash|credential|credential_hash)\s*(,|\)|=)/i);
  });

  it("depends on Pack 02 organization and canonical order ownership instead of creating parallel systems", () => {
    const sql = read(bindingPath);
    expect(sql).not.toMatch(/create\s+table/i);
    expect(sql).not.toMatch(/insert\s+into\s+public\.research_orders/i);
    expect(sql).not.toMatch(/insert\s+into\s+public\.research_members/i);
    expect(sql).not.toMatch(/insert\s+into\s+public\.research_customer_account_bindings/i);
    expect(sql).not.toMatch(/insert\s+into\s+public\.research_organization_order_ownership/i);
  });

  it("remains outside managed migrations and ships a read-only identity verifier", () => {
    const verification = read("supabase/pack02-candidates/verify_roman_digital_existing_auth_binding.sql");
    expect(bindingPath).toContain("pack02-candidates");
    expect(verification).toContain("exact verified Roman Digital Supabase Auth identity is missing");
    expect(verification).not.toMatch(/\b(insert|update|delete|create|alter|drop|grant|revoke)\b/i);
  });
});

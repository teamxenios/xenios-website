import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.join(
  process.cwd(),
  "supabase/pack02-candidates/20260813_research_business_buyer_bridge.sql",
), "utf8");

describe("business buyer bridge SQL packet", () => {
  it("avoids the colliding organization model and personal application path", () => {
    expect(sql).not.toMatch(/create table if not exists public\.research_organizations/i);
    expect(sql).not.toMatch(/insert into public\.research_(applications|members)/i);
    expect(sql).toContain("research_business_buyers");
  });

  it("binds confirmed Supabase Auth, Roman customer ownership, and Kris pricing atomically", () => {
    expect(sql).toContain("v_auth.email_confirmed_at is null");
    expect(sql).toContain("research_early_access_customers");
    expect(sql).toContain("KRIS_VOLUME_PARTNER");
    expect(sql).toContain("research_finalize_business_buyer_claim");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("'Roman Health'");
    expect(sql).not.toContain("Roman Health Marketplace");
  });

  it("exposes only a scoped authenticated context and keeps tables private", () => {
    expect(sql).toContain("research_current_business_buyer_context");
    expect(sql).toContain("o.auth_user_id = auth.uid()");
    expect(sql.match(/force row level security/g)?.length).toBe(4);
    expect(sql).toMatch(
      /grant execute on function public\.research_current_business_buyer_context\(\)\s+to authenticated, service_role/,
    );
  });
});

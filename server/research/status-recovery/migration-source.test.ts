import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const managedPath = path.join(root, "supabase/migrations/20260927203000_research_status_recovery.sql");
const candidatePath = path.join(root, "supabase/candidates/20260927203000_research_status_recovery.sql");
const sql = readFileSync(managedPath, "utf8");

describe("P-17 status recovery migration source", () => {
  it("keeps candidate and managed bytes identical", () => {
    const managed = readFileSync(managedPath);
    const candidate = readFileSync(candidatePath);
    expect(candidate.equals(managed)).toBe(true);
    expect(createHash("sha256").update(managed).digest("hex")).toHaveLength(64);
  });

  it("stores only bounded digests and exact-subject grants", () => {
    expect(sql).toContain("research_status_recovery_tokens");
    expect(sql).toContain("research_status_recovery_sessions");
    expect(sql).toMatch(/token_digest text not null unique/iu);
    expect(sql).toMatch(/session_digest text not null unique/iu);
    expect(sql).toMatch(/subject_id uuid not null references public\.research_assisted_order_requests/iu);
    expect(sql).toMatch(/purpose = 'status_recovery'/u);
    expect(sql).toMatch(/interval '30 minutes'/u);
    expect(sql).toMatch(/interval '24 hours'/u);
    expect(sql).not.toMatch(/raw_token|plaintext_email|submitted_email|raw_ip/iu);
  });

  it("forces RLS, removes direct grants, and exposes only service-role RPCs", () => {
    for (const table of ["research_status_recovery_tokens", "research_status_recovery_sessions"]) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} force row level security`, "iu"));
      expect(sql).toMatch(new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated, service_role`, "iu"));
    }
    expect(sql).not.toMatch(/grant\s+(?:select|insert|update|delete|all)\s+on\s+(?:table\s+)?public\.research_status_recovery/iu);
    expect(sql.match(/grant execute on function public\.research_status_recovery_/gu)).toHaveLength(5);
    expect(sql).not.toMatch(/grant execute[\s\S]{0,180}to (?:anon|authenticated|public)/iu);
    expect(sql.match(/security definer/gu)).toHaveLength(5);
    expect(sql.match(/set search_path = pg_catalog, public/gu)).toHaveLength(5);
  });

  it("uses row locking and state predicates for single-use exchange", () => {
    const exchange = sql.slice(sql.indexOf("create or replace function public.research_status_recovery_exchange"), sql.indexOf("create or replace function public.research_status_recovery_status"));
    expect(exchange).toMatch(/consumed_at is null/iu);
    expect(exchange).toMatch(/revoked_at is null/iu);
    expect(exchange).toMatch(/expires_at > p_created_at/iu);
    expect(exchange).toMatch(/for update/iu);
    expect(exchange).toMatch(/set consumed_at = p_created_at/iu);
  });
});

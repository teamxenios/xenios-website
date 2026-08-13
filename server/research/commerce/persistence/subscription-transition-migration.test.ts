import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260813080000_research_subscription_atomic_transitions.sql",
);
const sql = readFileSync(migrationPath, "utf8").toLowerCase();

describe("subscription atomic transition migration candidate", () => {
  it("uses one locked database transaction for CAS, state, event, and replay result", () => {
    expect(sql).toContain("research_subscription_commit_transition");
    expect(sql).toContain("for update");
    expect(sql).toContain("version = v_next_version");
    expect(sql).toContain("insert into public.research_subscription_events");
    expect(sql).toContain("result_snapshot");
    expect(sql).toContain("research_subscription_events_command_unique");
    expect(sql.indexOf("for update")).toBeLessThan(
      sql.indexOf("update public.research_product_subscriptions set"),
    );
    expect(sql.indexOf("update public.research_product_subscriptions set")).toBeLessThan(
      sql.indexOf("insert into public.research_subscription_events"),
    );
  });

  it("preserves Q1-50 and refuses Q51 at both schema and command boundaries", () => {
    expect(sql).toContain("check (quantity between 1 and 50)");
    expect(sql).toContain("v_quantity not between 1 and 50");
    expect(sql).not.toMatch(/quantity\s+between\s+1\s+and\s+20/);
  });

  it("keeps both RPCs server-only and search-path hardened", () => {
    expect(sql.match(/set search_path = ''/g)).toHaveLength(2);
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql.match(/to service_role/g)).toHaveLength(2);
    expect(sql).not.toMatch(/grant execute[\s\s]*to authenticated/);
  });
});

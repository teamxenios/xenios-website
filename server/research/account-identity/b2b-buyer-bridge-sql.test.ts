import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sqlPath = path.resolve(
  process.cwd(),
  "supabase/pack02-candidates/20260813_research_b2b_buyer_bridge.sql",
);
const sql = fs.readFileSync(sqlPath, "utf8");

describe("Pack02 B2B buyer bridge candidate", () => {
  it("never creates or alters the colliding organization principal", () => {
    expect(sql).not.toMatch(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.research_organizations\b/i);
    expect(sql).not.toMatch(/alter\s+table\s+public\.research_organizations\b/i);
    expect(sql).toContain("owner_partner_id");
    expect(sql).toContain("partially converged");
  });

  it("keeps canonical identity and order authorities", () => {
    expect(sql).toContain("references public.research_members(id)");
    expect(sql).toContain("references public.research_orders(id)");
    expect(sql).not.toMatch(/create\s+table[^;]+(?:auth_users|users_auth|b2b_orders)/is);
    expect(sql).not.toMatch(/insert\s+into\s+auth\.users/i);
    expect(sql).not.toMatch(/insert\s+into\s+public\.research_members/i);
    expect(sql).not.toMatch(/insert\s+into\s+public\.research_orders/i);
  });

  it("binds partner pricing to the business relationship, not email", () => {
    expect(sql).toContain("profile_key='KRIS_VOLUME_PARTNER'");
    expect(sql).toContain("research_b2b_entitlement_one_active_profile_idx");
    expect(sql).not.toMatch(/email_at_binding|normalized_email|p_email|contact_email/i);
    expect(sql).toContain("research_b2b_entitlement_facts_immutable");
  });

  it("supports tenant-scoped operators and rejects non-buyer roles", () => {
    expect(sql).toContain("unique (relationship_id, member_id)");
    expect(sql).toContain("research_b2b_operator_one_active_relationship_idx");
    expect(sql).toContain("array['organization_owner','business_buyer']::text[]");
    expect(sql).toContain("member lacks active business buyer authority");
  });

  it("makes canonical order ownership immutable and replay safe", () => {
    expect(sql).toContain("order_id uuid primary key references public.research_orders(id)");
    expect(sql).toContain("research_b2b_order_ownership_immutable");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("return 'replayed'");
    expect(sql).toContain("return 'conflict'");
    expect(sql).toContain("v_established_at timestamptz := clock_timestamp()");
    expect(sql).not.toContain("p_established_at");
  });

  it("forbids payment activity before the durable business claim", () => {
    expect(sql).toContain("business ownership must be established before payment activity");
    expect(sql).toContain("v_order.payment_reference is not null");
    expect(sql).toContain("v_order.authorized_amount_cents");
    expect(sql).toContain("v_order.captured_amount_cents");
  });

  it("keeps the candidate private and explicitly unapplied", () => {
    expect(sql).toContain("CANDIDATE ONLY. DO NOT APPLY");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("grant select on public.research_b2b_buyer_relationships to service_role");
    expect(sql).not.toMatch(/grant\s+(?:insert|update|delete|select,insert|select,insert,update)[^;]+to\s+service_role/i);
    expect(sql).toContain("v_actor_auth_user_id uuid := auth.uid()");
    expect(sql).toContain("to authenticated");
  });
});

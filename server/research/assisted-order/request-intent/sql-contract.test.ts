import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../../../../supabase/candidates/mixed_catalog_request_intent.sql", import.meta.url), "utf8");
describe("unapplied request-intent SQL contract (static, NOT database execution)", () => {
  it("denies direct table and sequence access and forces RLS", () => {
    expect(sql).toContain("revoke all on all tables in schema request_intent_private from public, anon, authenticated, service_role");
    expect(sql).toContain("revoke all on all sequences in schema request_intent_private from public, anon, authenticated, service_role");
    expect(sql).toContain("alter table request_intent_private.requests force row level security");
    expect(sql).toContain("alter table request_intent_private.access_events force row level security");
    expect(sql).not.toMatch(/create\s+policy/i);
  });
  it("declares staff-reader checks for service-role context, a named actor's role and approved scope", () => {
    expect(sql).toContain("auth.uid() is distinct from p_actor_user_id");
    expect(sql).toContain("role='clinical_admin' and revoked_at is null");
    expect(sql).toContain("capability_key='request_intent_pending_read'");
    expect(sql).toContain("grant execute on function public.request_intent_staff_get(uuid,uuid) to service_role");
    expect(sql).not.toContain("grant execute on function public.request_intent_staff_get(uuid,uuid) to authenticated");
  });
  it("rechecks the independent approved read scope in BOTH RPCs without activating Care or granting roles", () => {
    for (const name of ["staff_get", "staff_list"]) {
      const body = sql.split("create function request_intent_private." + name + "(")[1].split("$$;")[0];
      expect(body).toContain("current_setting('role',true) is distinct from 'service_role'");
      expect(body).toContain("auth.uid() is distinct from p_actor_user_id");
      expect(body).toContain("role='clinical_admin' and revoked_at is null");
      expect(body).toContain("capability_key='request_intent_pending_read'");
      expect(body).toContain("state='enabled' and approved_by is not null and approved_at is not null");
      expect(body).not.toContain("capability_key='care'");
    }
    expect(sql).not.toMatch(/(?:insert into|update)\s+public\.care_(?:capabilities|role_assignments)/i);
    expect(sql).toContain("grant execute on function public.request_intent_staff_list(uuid,integer) to service_role");
    expect(sql).not.toContain("grant execute on function public.request_intent_staff_list(uuid,integer) to authenticated");
  });
  it("supports one atomic owner/attempt winner and immutable pending-only records", () => {
    expect(sql).toContain("unique (owner_hash, attempt_hash)");
    expect(sql).toContain("on conflict(owner_hash,attempt_hash) do nothing");
    expect(sql).toContain("request_intent_attempt_conflict");
    expect(sql).toContain("check (status = 'pending_review')");
    expect(sql).toContain("entry->>'reviewState' is distinct from 'pending'");
    expect(sql).toContain("before update or delete on request_intent_private.requests");
  });
  it("does not write any existing order, invoice, notification or payment authority", () => {
    const inserted = [...sql.matchAll(/insert into\s+([a-z_.]+)/gi)].map((match) => match[1]);
    expect([...new Set(inserted)].sort()).toEqual(["request_intent_private.access_events", "request_intent_private.requests"]);
    expect(sql).not.toMatch(/grant\s+[^;]*\bto\s+(?:public|anon)\s*;/i);
  });
});

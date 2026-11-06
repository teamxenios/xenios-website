import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql=readFileSync(new URL("../../../../supabase/candidates/request_intent_notification_reconciliation.sql",import.meta.url),"utf8");
describe("unapplied notification SQL SOURCE contract, NOT database execution",()=>{
  it("is a separate absent-by-default private approval policy, not another delivery queue",()=>{
    expect(sql).toContain("enabled boolean not null default false");
    expect(sql).toContain("force row level security");
    expect(sql).not.toMatch(/insert into request_intent_private.notification_policy/i);
    expect(sql).not.toMatch(/create table.*outbox/i);
  });
  it("restricts both RPC layers and keeps policy table access revoked",()=>{
    expect(sql).toContain("current_setting('role',true) is distinct from 'service_role'");
    expect(sql).toContain("security invoker set search_path = ''");
    expect(sql).toContain("revoke all on request_intent_private.notification_policy from public, anon, authenticated, service_role");
    expect(sql).not.toMatch(/grant .* to (anon|authenticated|public);/i);
  });
  it("uses submitted events and canonical unique keys without a moving watermark",()=>{
    expect(sql).toContain("e.event_type='submitted'");
    expect(sql).toContain("on conflict(event_key) do nothing");
    expect(sql).toContain("and not exists(select 1 from public.research_notification_outbox");
    expect(sql).not.toMatch(/max\(.*id|last_event_id|interval.*minute/i);
    expect(sql).toContain("order by r.created_at, r.id, targets.recipient limit p_limit");
    expect(sql).toContain("o.recipient=targets.recipient");
  });
  it("never copies private request fields or changes intake state",()=>{
    const payloads=[...sql.matchAll(/jsonb_build_object\('publicReference',([^)]*)\)/g)];
    expect(payloads.length).toBeGreaterThan(1);
    expect(sql).not.toMatch(/r\.(contact|lines|agreements|owner_hash|attempt_hash|fingerprint)/);
    expect(sql).not.toMatch(/update request_intent_private.requests|delete from|create trigger/i);
  });
  it("fails closed on source multiplicity/binding mismatch and bounds one transaction",()=>{
    expect(sql).toContain("request_intent_notification_source_invalid");
    expect(sql).toContain("request_intent_notification_binding_invalid");
    expect(sql).toContain("pg_try_advisory_xact_lock");
    expect(sql).toContain("p_limit not between 1 and 10");
    expect(sql).toContain("p_recipients is distinct from policy.recipients");
    expect(sql).toContain("get diagnostics changed = row_count");
  });
});

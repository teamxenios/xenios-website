import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/20261001040351_research_assisted_order_quote_effects.sql");
const audit = read("supabase/migrations/20261001040349_research_assisted_order_quote_audit_store.sql");
const proof = read("supabase/verification/research_assisted_order_quote_effects_local.mjs");
const pre80 = read("supabase/verification/research_assisted_order_quote_pre80_preflight.sql");

describe("HL-12 canonical durable effects SQL source contract", () => {
  it("promotes the existing canonical audit bytes without changing its authority", () => {
    expect(audit).toBe(read("supabase/candidates/20260828_research_assisted_order_audit_store.sql"));
    expect(sql).not.toMatch(/create table/i);
    expect(sql).not.toMatch(/create or replace function public\.research_assisted_order_payment_verify\(/i);
  });
  it("captures a held canonical outbox intent in the verification transaction", () => {
    expect(sql).toMatch(/after insert on public\.research_assisted_order_payment_verifications/);
    expect(sql).toContain("insert into public.research_notification_outbox");
    expect(sql).toContain("'held',date_trunc('milliseconds',new.verified_at)");
    expect(sql).toContain("ASSISTED_ORDER_EFFECTS_ADOPTION_REQUIRED");
    expect(sql).not.toMatch(/insert into public\.research_assisted_order_payment_verifications/);
  });
  it("reserves payment-shaped messages and gates release on the existing audit receipt", () => {
    expect(sql).toContain("old.event_key like 'assisted-order:%:payment-verification:%'");
    expect(sql).toContain("old.payload->>'status' = 'paid'");
    expect(sql).toContain("ASSISTED_ORDER_EFFECTS_IMMUTABLE");
    expect(sql).toContain("ASSISTED_ORDER_EFFECTS_AUDIT_REQUIRED");
    expect(sql).toContain("perform public.research_assisted_order_audit_append(p_schema_version,p_attestation,p_event)");
    expect(sql).toContain("before truncate");
  });
  it("recovers from persisted facts without consulting active verifier grants", () => {
    expect(sql).not.toContain("payment_verifier_grants");
    expect(sql).toContain("for update;");
    expect(sql).toContain("if c->'auditReceipt' = 'null'::jsonb then");
    expect(sql).toContain("'verifiedBy',v.verified_by");
    expect(sql).toContain("(created_at,id) > (p_after_created_at,p_after_id)");
    expect(sql).toContain("p_limit not between 1 and 100");
  });
  it("keeps internal helpers private and the five bounded RPCs service-role-only", () => {
    for (const fragment of ["audit_receipt(uuid)", "outbox_guard()", "capture()", "authority()", "context(uuid)",
      "pending(timestamptz,uuid,integer)", "complete(uuid,text,text,jsonb)", "outbox_ready(uuid,uuid,text,text,text,jsonb)"]) {
      expect(sql).toContain(`revoke all on function public.research_assisted_order_payment_effects_${fragment} from public,anon,authenticated,service_role;`);
    }
    expect(sql.match(/grant execute on function public\.research_assisted_order_payment_effects_/g)).toHaveLength(5);
  });
  it("ships the disposable interruption, ACL and rotated-key concurrency proof", () => {
    for (const fragment of ["--network", "none", "POSTGRES_HOST_AUTH_METHOD=trust", "v20.19.0", "SYNTHETIC_INTERRUPTION",
      "Promise.all", 'event(c91,"synthetic2")', "set revoked_at=now()", "timestampCounts", "length:25", "legacyVerification"]) {
      expect(proof).toContain(fragment);
    }
  });
  it("keeps the pre80 census read-only and independent of future financial tables", () => {
    const statements = pre80.replace(/--[^\n]*/g, "");
    expect(statements).toMatch(/\bbegin\s+isolation\s+level\s+repeatable\s+read\s+read\s+only\s*;/i);
    expect(statements).toMatch(/set\s+local\s+statement_timeout\s*=\s*'10s'/i);
    expect(statements).toMatch(/set\s+local\s+lock_timeout\s*=\s*'2s'/i);
    expect(statements).toMatch(/set\s+local\s+row_security\s*=\s*off\s*;/i);
    expect(statements).not.toMatch(/\b(insert|update|delete|truncate|alter|create|drop|grant|revoke)\b/i);
    expect(statements).not.toMatch(/public\.research_assisted_order_(quotes|payment_observations|payment_verifications)\b/i);
    expect(statements).toContain("public.research_notification_outbox");
    expect(statements).toContain("nonterminal_frozen_rows_requiring_decision");
  });
  it("adds a separately labelled notification census without treating zero counts as authorization", () => {
    for (const field of ["hl12_pre80_notification_census_v1", "legacy_paid_notices", "reserved_verification_keys",
      "adoption_required_outbox_rows", "invalid_status_envelopes", "delivery_status_counts", "notification_chain_gate",
      "NO_GO", "CLEAR_COUNTS_ONLY_NOT_AUTHORIZATION"]) {
      expect(pre80).toContain(field);
    }
    expect(pre80).toContain("research.assisted_order.status_changed.customer");
    expect(pre80).toContain("assisted-order:%:payment-verification:%");
    // These static checks complement, but do not replace, the disposable SQL proof.
    const outboxInstall = proof.indexOf('await psql(await readFile("supabase/research-notification-outbox.sql","utf8"))');
    const censusRun = proof.indexOf('const pre80=await psql(');
    expect(outboxInstall).toBeGreaterThan(-1);
    expect(censusRun).toBeGreaterThan(outboxInstall);
    expect(proof).toContain('assert.equal(pre80Rows.length,3)');
    expect(proof).toContain('["paid","1","0","1","0"]');
    expect(proof).toContain('assert.equal(pre80Rows[1],"1")');
    expect(proof).toContain('const notificationCensus=JSON.parse(pre80Rows[2])');
    expect(proof).toContain('assert.deepEqual(notificationCensus,{');
    expect(proof).toContain('notification_chain_gate:"CLEAR_COUNTS_ONLY_NOT_AUTHORIZATION"');
  });
  it("refuses malformed canonical status envelopes instead of adopting renderer trimming", () => {
    expect(sql).toContain("ASSISTED_ORDER_STATUS_ENVELOPE_INVALID");
    expect(sql).toContain("jsonb_typeof(new.payload->'status') is distinct from 'string'");
    expect(sql).toContain("jsonb_typeof(payload->'status') is distinct from 'string'");
    expect(sql).toContain("new.payload->>'status' not in ('submitted','reviewing'");
    expect(proof).toContain("invalidStatusPayloads");
  });
  it("refuses non-auditable actors inside atomic capture with JavaScript-compatible boundaries", () => {
    expect(sql).toContain("ASSISTED_ORDER_EFFECTS_ACTOR_INVALID");
    expect(sql).toContain("ascii(ch)>65535 then 2 else 1");
    expect(sql).toContain("v_actor_units not between 1 and 512");
    expect(sql).toContain("\\FEFF");
    expect(proof).toContain('"🔬".repeat(257)');
    expect(proof).toContain('"🔬".repeat(256)');
  });
});

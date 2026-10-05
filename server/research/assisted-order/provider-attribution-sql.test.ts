// Source controls only. Effective SQL behavior belongs to the separately run
// disposable verifier; these checks do not claim managed or race qualification.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const sql = read("supabase/candidates/20261003_research_assisted_order_provider_attribution.sql");
const predecessor = read("supabase/migrations/20261001160730_research_assisted_order_provider_quarantine_isolation.sql");
const journal = read("supabase/migrations/20261001085559_research_assisted_order_quote_provider_journal.sql");
const settlement = read("supabase/migrations/20261001115512_research_assisted_order_quote_provider_settlement.sql");
const prefix = "research_assisted_order_";

function quoted(document: string, label: string): string {
  const delimiter = `$${label}$`;
  const start = document.indexOf(delimiter);
  if (start < 0) throw new Error(`Missing ${label}`);
  const end = document.indexOf(delimiter, start + delimiter.length);
  if (end < 0) throw new Error(`Unclosed ${label}`);
  return document.slice(start + delimiter.length, end);
}
function definition(name: string, document = sql): string {
  const found = new RegExp(`create (?:or replace )?function public\\.${prefix}${name}\\s*\\(`, "i").exec(document);
  if (!found) throw new Error(`Missing function ${name}`);
  const rest = document.slice(found.index);
  const tag = /\bas\s+(\$[a-z0-9_]*\$)/i.exec(rest);
  if (!tag) throw new Error(`Missing body ${name}`);
  const end = rest.indexOf(tag[1], tag.index + tag[0].length);
  if (end < 0) throw new Error(`Unclosed body ${name}`);
  return rest.slice(0, end + tag[1].length);
}

describe("source-only provider risk attribution", () => {
  it("pins the unchanged M94 bytes and the distinct predecessor installer digest", () => {
    expect(hash(predecessor)).toBe("91a20f681038a5e845137feb6556c4041b1645f6b2c8f9122bc7c9e85280f477");
    const installerHash = hash(quoted(predecessor, "install") + quoted(predecessor, "fingerprint_query"));
    expect(installerHash).toBe("5302be3131cca3dc97bc9d9a9bb40b0f8addab975aaa76c9b74b68343921d349");
    expect(sql).toContain(`predecessor_definition constant text := '${installerHash}'`);
    expect(quoted(sql, "fingerprint_query")).toBe(quoted(predecessor, "fingerprint_query"));
  });

  it("does not write existing money, request, journal, settlement or outbox rows", () => {
    const targets = Array.from(sql.matchAll(/\b(?:insert\s+into|update|delete\s+from|truncate)\s+public\.(research_assisted_order_\w+|research_notification_\w+)/gi), match => match[1]);
    expect(targets).toEqual([`${prefix}provider_attributions`]);
    expect(sql).not.toMatch(/\bdrop\s+(?:function|table|trigger|constraint)\b/i);
    const tables = Array.from(sql.matchAll(/create table public\.(\w+)/g), match => match[1]);
    expect(tables).toEqual([`${prefix}provider_attribution_policies`, `${prefix}provider_attribution_grants`, `${prefix}provider_attributions`]);
  });

  it("takes only journal identity and scoped authority, never a chosen target or money claim", () => {
    const commit = definition("provider_attribution_commit");
    const parameters = commit.slice(0, commit.indexOf("returns jsonb"));
    expect(parameters).not.toMatch(/p_request_id|p_attempt_id|p_amount|p_verified|p_note|p_reason/);
    expect(parameters).toContain("p_journal_id uuid,p_source_id text,p_adapter_revision text,p_expected_scope jsonb");
    expect(commit).toContain("provider_attribution_context");
    expect(commit).toContain("witness_snapshot is distinct from c->'witnessSnapshot'");
    expect(commit).toContain("actor_auth_user_id is distinct from p_actor_auth_user_id");
  });

  it("derives and reloads immutable witnesses under request-before-fence locking", () => {
    const context = definition("provider_attribution_context");
    const requestLock = context.indexOf("where id=target_request for update");
    const fenceLock = context.indexOf("provider_fence where id for update");
    expect(requestLock).toBeGreaterThan(0);
    expect(fenceLock).toBeGreaterThan(requestLock);
    expect(context.indexOf("select * into e from", fenceLock)).toBeGreaterThan(fenceLock);
    expect(context).toContain("binding.provider_identity=journal.event->>'providerPaymentId'");
    expect(context).toContain("where id=b.result_id");
    expect(context).toContain("x.classification<>'bound'");
    expect(context).toContain("c.request_id is distinct from a.request_id");
    expect(context).toContain("e.expected_scope is distinct from p_expected_scope");
    expect(context).toContain("a.request_id is distinct from target_request");
  });

  it("requires affirmative earlier chronology and exact optional session agreement", () => {
    const predicate = definition("provider_attribution_witness_precedes");
    expect(predicate).toContain("p_result_at=p_bound_at and p_result_at<p_received_at");
    expect(predicate).toContain("false)");
    const context = definition("provider_attribution_context");
    expect(context).toContain("sb.provider_identity is distinct from e.event->>'providerSessionId'");
    expect(context).toContain("provider_attribution_witness_precedes(sx.recorded_at,sb.bound_at,e.received_at) is not true");
    expect(context).toContain("e.event->>'claimedCanonicalOrderId' is not null");
    expect(context).toContain("e.event->>'claimedRequestId' is not null");
  });

  it("keeps narrow receipts unique, server-derived and permanently held", () => {
    expect(sql).toContain("journal_id uuid not null unique references");
    expect(sql).toContain("state text not null default 'held' check(state='held')");
    const guard = definition("provider_attribution_guard");
    expect(guard).toContain("new.request_id is not null or new.attempt_id is not null");
    expect(guard).toContain("new.witness_fingerprint is not null or new.witness_snapshot is not null");
    expect(guard).toContain("new.request_id:=(c->>'requestId')::uuid");
    const receipt = definition("provider_attribution_receipt");
    expect(receipt).toContain("'state','held'");
    expect(receipt).not.toMatch(/'paid'|'verified'|'fulfillmentEligible'/);
  });

  it("preserves target quarantine independently of revoked authority or elapsed time", () => {
    const request = definition("provider_request_quarantine_held");
    expect(request).toContain("from public.research_assisted_order_provider_attributions where request_id=p_request_id");
    expect(request).toContain("journal.source_id=attempt.source_id");
    expect(request).toContain("attribution.journal_id=journal.id");
    expect(request).not.toMatch(/revoked_at|granted_at|clock_timestamp|lease_expires|claimedRequestId/);
    const source = definition("provider_source_quarantine_held");
    expect(source).toContain("p_source_id is null or exists");
    expect(source).toContain("a.journal_id=j.id");
  });

  it("changes only the old classifier conflict predicate, preserving original journal IDs", () => {
    const oldPredicate = "and (j.established_request_id is null or j.established_request_id<>a.request_id)";
    expect(definition("provider_event_classify", journal).split(oldPredicate)).toHaveLength(2);
    const change = quoted(sql, "classifier");
    expect(change).toContain(`old_predicate constant text := '${oldPredicate}'`);
    expect(change).toContain("provider_event_risk_target(j.id) is distinct from a.request_id");
    expect(change).toContain("<>1 then");
    expect(change).toContain("execute replace(definition,old_predicate,new_predicate)");
    expect(sql).not.toContain("create or replace function public.research_assisted_order_provider_create_result_guard");
  });

  it("extends the RPC allowlist with exactly two service operations", () => {
    const signatures = (document: string) => Array.from(definition("provider_settlement_rpc_oids", document).matchAll(/'([^']+)'::regprocedure/g), match => match[1]);
    const old = signatures(settlement);
    expect(signatures(sql)).toEqual([...old,
      "public.research_assisted_order_provider_attribution_authority()",
      "public.research_assisted_order_provider_attribution_commit(uuid,text,text,jsonb,text,uuid)",
    ]);
    expect(quoted(sql, "acl")).toContain("revoke all on function %s from public,anon,authenticated,service_role");
    expect(quoted(sql, "acl")).toContain("grant execute on function %s to service_role");
  });

  it("seals private ACLs and append-only guards including replica-mode protection", () => {
    const guards = quoted(sql, "guards");
    expect(guards).toContain("enable row level security");
    expect(guards).toContain("force row level security");
    expect(guards).toContain("revoke all on table public.%I from public,anon,authenticated,service_role");
    expect(guards).toContain("enable always trigger adp05a_no_truncate");
    expect(guards).toContain("enable always trigger adp05a_immutable");
    expect(sql).toContain("enable always trigger adp05a_attribution");
    expect(definition("provider_settlement_integrity")).toContain("has_any_column_privilege");
    expect(definition("provider_settlement_integrity")).toContain("provider_require_read_committed");
  });

  it("keeps authority explicitly incapable of settlement or refunds", () => {
    expect(definition("provider_attribution_authority")).toContain("'settlementEnabled',false,'refundEnabled',false,'targetHoldRequired',true");
    expect(sql).toContain("ADP05A_SCHEMA_V1:");
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
  });
});

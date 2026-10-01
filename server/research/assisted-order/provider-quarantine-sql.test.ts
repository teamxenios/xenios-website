// Source contract only. These assertions do not qualify effective PostgreSQL,
// provider authenticity, transaction races, or any managed environment.
// The separately executed disposable quarantine driver owns that evidence.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
const sql = read(
  "supabase/migrations/20261001160730_research_assisted_order_provider_quarantine_isolation.sql",
);
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const predecessorHashes = [
  [
    "20261001062651_research_assisted_order_quote_no_funds_disposition.sql",
    "512799646a0779dcaa88ea036a9920ff2f54c33b48ff831825e9870dcd0b8881",
  ],
  [
    "20261001085559_research_assisted_order_quote_provider_journal.sql",
    "15de2acb72835b520b1e902641e334643c18b7ea0ad9bcb8f6be4dca77668875",
  ],
  [
    "20261001102904_research_assisted_order_quote_provider_execution.sql",
    "5386c62508e5f3ae9a3584c936ece35e04fe13c1fef42f1627e3784327de7035",
  ],
  [
    "20261001115512_research_assisted_order_quote_provider_settlement.sql",
    "1470740bf17a0fbb9a2eeaffe9173712861a17da15d52b5492ca1f28e2c91e6f",
  ],
] as const;

function body(name: string, document = sql): string {
  const signature = new RegExp(
    `create (?:or replace )?function public\\.research_assisted_order_${name}\\s*\\(`,
    "i",
  );
  const start = document.search(signature);
  if (start < 0) throw new Error(`Missing function definition: ${name}`);
  const definition = document.slice(start);
  const delimiter = /\bas\s+(\$[A-Za-z_0-9]*\$)/i.exec(definition);
  if (!delimiter) throw new Error(`Missing function body: ${name}`);
  const startBody = delimiter.index + delimiter[0].length;
  const endBody = definition.indexOf(delimiter[1], startBody);
  if (endBody < 0) throw new Error(`Unclosed function body: ${name}`);
  return definition.slice(startBody, endBody);
}

const journal = read(`supabase/migrations/${predecessorHashes[1][0]}`);
const execution = read(`supabase/migrations/${predecessorHashes[2][0]}`);
const settlement = read(`supabase/migrations/${predecessorHashes[3][0]}`);
const globalUnbound = "exists(select 1 from public.research_assisted_order_provider_event_journal where established_request_id is null)";
const inheritedChanges = [
  ["provider_uncertainty", journal, globalUnbound, "public.research_assisted_order_provider_request_quarantine_held(p_request_id)"],
  ["provider_create_context", execution,
    "exists(select 1 from public.research_assisted_order_provider_event_journal where established_request_id is null or established_request_id=r.id)",
    "(public.research_assisted_order_provider_request_quarantine_held(r.id)\n      or exists(select 1 from public.research_assisted_order_provider_event_journal where established_request_id=r.id))"],
  ["provider_settlement_guard", settlement, globalUnbound, "public.research_assisted_order_provider_request_quarantine_held(r.id)"],
  ["financial_eligibility", settlement, globalUnbound, "public.research_assisted_order_provider_request_quarantine_held(p_request_id)"],
  ["provider_settlement_row_allowed", settlement, globalUnbound, "public.research_assisted_order_provider_request_quarantine_held(s.request_id)"],
  ["provider_financial_guard", settlement, globalUnbound, "public.research_assisted_order_provider_request_quarantine_held(new.id)"],
] as const;

function dollarBlock(document: string, delimiter: string): string {
  const parts = document.split(`$${delimiter}$`);
  if (parts.length !== 3) throw new Error(`Expected exactly one ${delimiter} block`);
  return parts[1];
}

describe("ADP04Q exposure-scoped provider quarantine SQL source contract", () => {
  it.each(predecessorHashes)(
    "preserves immutable predecessor %s at its canonical LF SHA-256",
    (filename, expected) => {
      expect(sha256(read(`supabase/migrations/${filename}`))).toBe(expected);
    },
  );

  it("retains unbound source evidence without interpreting it as payment absence or a chosen order", () => {
    const source = body("provider_source_quarantine_held");
    expect(source).toContain("research_assisted_order_provider_event_journal");
    expect(source).toContain("p_source_id is null or exists(");
    expect(source).toMatch(/source_id\s*=\s*p_source_id/);
    expect(source).toMatch(/established_request_id\s+is\s+null/i);
    expect(source).not.toMatch(/claimedRequestId|claimedAttemptId|limit\s+\d+/i);
    expect(source).not.toMatch(/revoked_at|lease_expires_at|received_at\s*[<>]/i);
  });

  it("derives request exposure from immutable reservations, never browser claims or active-only authority", () => {
    const request = body("provider_request_quarantine_held");
    expect(request).toContain("research_assisted_order_provider_attempts");
    expect(request).toMatch(/request_id\s*=\s*p_request_id/);
    expect(request).toMatch(/join public\.research_assisted_order_provider_event_journal j on j\.source_id=a\.source_id/);
    expect(request).toMatch(/j\.established_request_id\s+is\s+null/i);
    expect(request).toContain("p_request_id is null or exists(");
    expect(request).not.toMatch(/claimedRequestId|claimedAttemptId|source_grants|execution_grants/i);
    expect(request).not.toMatch(/revoked_at|lease_expires_at|reserved_at\s*[<>]|limit\s+\d+/i);
  });

  it.each(inheritedChanges)(
    "changes only the global predicate in %s, retaining all existing authority and lock behavior",
    (name, predecessor, previous, replacement) => {
      const before = body(name, predecessor);
      expect(before.split(previous)).toHaveLength(2);
      expect(body(name)).toBe(before.replace(previous, replacement));
      expect(body(name)).not.toContain(globalUnbound);
    },
  );

  it("refuses prospective source exposure before insertion without losing the existing request/fence lock order", () => {
    const previous = body("provider_attempt_guard", journal);
    const guard = body("provider_attempt_guard");
    const addition = "\n  -- Check prospective exposure before the attempt exists. Refusal inserts no\n  -- reservation and therefore cannot strand a previously manual-only order.\n  if public.research_assisted_order_provider_source_quarantine_held(new.source_id) then\n    raise exception 'Configured provider source has unresolved quarantine'\n      using errcode='P0001',detail='ASSISTED_ORDER_PROVIDER_UNCERTAINTY_HELD';end if;";
    expect(guard.split(addition)).toHaveLength(2);
    expect(guard.replace(addition, "")).toBe(previous);
    expect(guard.indexOf("where id=new.request_id for update")).toBeLessThan(guard.indexOf("provider_assert_clear(r.id)"));
    expect(guard.indexOf("provider_assert_clear(r.id)")).toBeLessThan(guard.indexOf("provider_source_quarantine_held(new.source_id)"));
    const uncertainty = body("provider_uncertainty");
    expect(uncertainty.indexOf("provider_fence where id for share")).toBeLessThan(uncertainty.indexOf("provider_request_quarantine_held(p_request_id)"));
    expect(body("provider_assert_clear", journal)).toContain("provider_uncertainty(p_request_id)");
  });

  it("keeps helper authority private and indexes source-scoped unbound evidence without filtering history", () => {
    for (const [name, type] of [["provider_source_quarantine_held", "text"], ["provider_request_quarantine_held", "uuid"]]) {
      expect(sql).toContain(`revoke all on function public.research_assisted_order_${name}(${type}) from public,anon,authenticated,service_role;`);
    }
    expect(sql.match(/returns boolean language sql security definer set search_path=''/g)).toHaveLength(2);
    expect(sql).toContain("on public.research_assisted_order_provider_event_journal(source_id)\n  where established_request_id is null;");
    // Source IDs cannot be aliases for a second identical provider/account/mode.
    expect(journal).toContain("unique(provider_namespace,account_ref,mode)");
    expect(body("provider_source_guard", journal)).toContain("(to_jsonb(new)-'revoked_at') is distinct from (to_jsonb(old)-'revoked_at')");
  });

  it("changes no canonical financial facts, identities, historical records, or live configuration", () => {
    expect(sql).not.toMatch(/(?:insert\s+into|update|delete\s+from|truncate(?:\s+table)?)\s+public\.research_assisted_order_(?:provider_(?:sources|source_grants|attempts|event_journal|create_claims|create_results|identity_bindings|settlements)|payment_observations|payment_verifications|evidence_claims|events|requests)\b/i);
    expect(sql).not.toMatch(/create\s+(?:or\s+replace\s+)?function\s+public\.research_assisted_order_(?:financial_state|payment_observe|payment_verify_bound|disposition_commit_cancel|provider_event_classify|provider_event_append)\s*\(/i);
    expect(sql).not.toMatch(/create\s+table\s+/i);
    expect(sql).not.toMatch(/grant\s+(?:insert|update|delete|truncate|all)\b/i);
  });

  it("adds a successor integrity seal without rewriting or accepting a mismatched predecessor", () => {
    expect(sql).toContain("ADP03_SCHEMA_V1:");
    expect(sql).toContain("ADP04Q_SCHEMA_V1:");
    expect(sql).toContain("research_assisted_order_provider_schema_fingerprint()");
    expect(sql).toContain("research_assisted_order_provider_settlement_integrity()");
    expect(sql).toContain("research_assisted_order_provider_require_read_committed()");
    expect(sql).toContain("pg_get_functiondef");
    expect(dollarBlock(sql, "fingerprint_query")).toBe(dollarBlock(settlement, "fingerprint_query"));
    const predecessorDefinition = sha256(dollarBlock(settlement, "install") + dollarBlock(settlement, "fingerprint_query"));
    expect(sql).toContain(`predecessor_definition constant text := '${predecessorDefinition}';`);
    expect(sql).toContain("if installed not in(0,3) then");
    expect(sql).toContain("Exact final ADP03 predecessor required");
    expect(sql).toContain("Quarantine isolation definition or schema drift");
    expect(body("provider_settlement_integrity")).toBe(
      body("provider_settlement_integrity", settlement).replace(
        "ADP03_SCHEMA_V1:5a59a6d48cf40faa74f8b971d4abc43d1e65f5896d42843fc2bf362dfde36430:",
        `ADP04Q_SCHEMA_V1:${predecessorDefinition}:`,
      ),
    );
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ASSISTED_ORDER_AUDIT_ATTESTATION,
  ASSISTED_ORDER_AUDIT_SCHEMA_VERSION,
  assistedOrderAuditActorTypes,
  assistedOrderAuditEventTypes,
} from "./audit-store";

const candidatePath = resolve(
  process.cwd(),
  "supabase/candidates/20260828_research_assisted_order_audit_store.sql",
);
const precheckPath = resolve(
  process.cwd(),
  "supabase/candidates/20260828_research_assisted_order_audit_store_precheck.sql",
);
const postcheckPath = resolve(
  process.cwd(),
  "supabase/candidates/20260828_research_assisted_order_audit_store_postcheck.sql",
);
const dagPath = resolve(process.cwd(), "docs/coordination/MIGRATION_DAG.json");

const sql = readFileSync(candidatePath, "utf8");
const precheck = readFileSync(precheckPath, "utf8");
const postcheck = readFileSync(postcheckPath, "utf8");
const dag = readFileSync(dagPath, "utf8");

describe("unapplied assisted-order audit-store candidate", () => {
  it("stays explicitly outside the migration DAG", () => {
    expect(sql).toContain("UNAPPLIED CANDIDATE");
    expect(precheck).toContain("UNAPPLIED candidate");
    expect(postcheck).toContain("UNAPPLIED candidate");
    expect(dag).not.toContain("20260828_research_assisted_order_audit_store");
  });

  it("pins the same schema, attestation, event, and actor vocabularies as the adapter", () => {
    expect(sql).toContain(ASSISTED_ORDER_AUDIT_SCHEMA_VERSION);
    expect(sql).toContain(ASSISTED_ORDER_AUDIT_ATTESTATION);
    for (const eventType of assistedOrderAuditEventTypes) {
      expect(sql).toContain(`'${eventType}'`);
      expect(postcheck).toContain(`'${eventType}'`);
    }
    for (const actorType of assistedOrderAuditActorTypes) {
      expect(sql).toContain(`'${actorType}'`);
    }
  });

  it("is forced-RLS, REVOKE-first, service-role-RPC-only, and immutable", () => {
    expect(sql).toMatch(
      /alter table public\.research_assisted_order_audit_events_v1 enable row level security/i,
    );
    expect(sql).toMatch(
      /alter table public\.research_assisted_order_audit_events_v1 force row level security/i,
    );
    expect(sql).toMatch(
      /revoke all on table public\.research_assisted_order_audit_events_v1[\s\S]*from public, anon, authenticated, service_role/i,
    );
    expect(sql).not.toMatch(
      /grant\s+(?:select|insert|update|delete|truncate|all)[\s\S]{0,120}research_assisted_order_audit_events_v1/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.research_assisted_order_audit_append\(text, text, jsonb\)[\s\S]*grant execute[\s\S]*to service_role/i,
    );
    expect(sql).toMatch(/before update or delete/i);
    expect(sql).toMatch(/before truncate/i);
    expect(sql.match(/set search_path = ''/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("stores no raw request, contact, address, note, path, token, URL, or error field", () => {
    const table = sql.slice(
      sql.indexOf("create table if not exists public.research_assisted_order_audit_events_v1"),
      sql.indexOf("create index if not exists research_assisted_order_audit_request_time_idx"),
    );
    expect(table).not.toMatch(
      /\b(?:request_body|email|phone|contact|address|note|file_name|file_path|object_path|token|url|error|stack|supplier|price|payment_reference)\b/i,
    );
    expect(table).toContain("actor_alias text");
    expect(table).not.toContain("actor_id");
  });

  it("postchecks direct grants, exact authority, internal helpers, RLS, and mutation triggers", () => {
    for (const fragment of [
      "direct table privilege exists",
      "RPC execute boundary invalid",
      "internal helper reachable",
      "forced RLS absent",
      "immutability trigger absent",
      "authority drift",
    ]) {
      expect(postcheck).toContain(fragment);
    }
  });
});

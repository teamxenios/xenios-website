import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * QA coverage for two advisor findings routed to bottom-right:
 *
 * 1. function_search_path_mutable (12 WARN): the hardening candidate pins
 *    search_path on exactly those twelve functions. Pinning is only safe when
 *    every object a body references is schema-qualified (builtins keep
 *    resolving through the implicit pg_catalog). This file PROVES that
 *    qualification property from the repo sources, and proves the prover
 *    itself with a planted-defect negative control.
 *
 * 2. Caller binding on the three authenticated-executable SECURITY DEFINER
 *    claim-rail RPCs: a plain authenticated JWT with no role-assignment row
 *    must be refused with 42501, and the actor must come from auth.uid(),
 *    never a parameter.
 */

const MIGRATION = fs.readFileSync(
  path.resolve("supabase/pack02-candidates/20260814_research_function_search_path_hardening.sql"),
  "utf8",
);
const claimSql = fs.readFileSync(
  path.resolve("supabase/pack02-candidates/20260813_research_b2b_sponsored_claim.sql"),
  "utf8",
);
const bridgeSql = fs.readFileSync(
  path.resolve("supabase/pack02-candidates/20260813_research_b2b_buyer_bridge.sql"),
  "utf8",
);

const HARDENED = [
  "research_fm_history_is_append_only",
  "research_fm_append_only",
  "research_fm_identity_audit_is_append_only",
  "research_fm_versions_guard",
  "research_fm_versions_no_delete",
  "research_fm_signature_requires_published",
  "research_fm_signatures_append_only",
  "research_fm_checklist_touch",
  "research_fm_esign_touch_updated_at",
  "research_ledger_is_append_only",
  "research_reject_product_request_event_mutation",
  "research_rate_limit_hit",
] as const;

/** Source files that define the twelve functions. */
const DEFINITION_FILES = [
  "supabase/production/research-founding-membership.sql",
  "supabase/production/research-full-production.sql",
  "supabase/production/research-track-b-commerce.sql",
  "supabase/research-product-requests.sql",
  "supabase/research-referral-fraud.sql",
];

/**
 * Table references a body makes through FROM / INSERT INTO / UPDATE / DELETE
 * FROM / JOIN that are not schema-qualified. OLD./NEW. record fields and the
 * UPDATE ... SET keyword are grammar, not table references.
 */
function unqualifiedTableRefs(body: string): string[] {
  const refs = [...body.matchAll(/(?:\bfrom|\binsert into|\bdelete from|\bjoin)\s+([a-z_][\w.]*)/gi)]
    .map((match) => match[1] as string);
  return refs.filter(
    (ref) =>
      !ref.startsWith("public.") &&
      !ref.startsWith("pg_") &&
      !ref.startsWith("old.") &&
      !ref.startsWith("new.") &&
      !["new", "old", "excluded", "set"].includes(ref.toLowerCase()),
  );
}

function bodiesOf(name: string): string[] {
  const bodies: string[] = [];
  for (const file of DEFINITION_FILES) {
    const text = fs.readFileSync(path.resolve(file), "utf8");
    const marker = `create or replace function public.${name}`;
    let at = text.indexOf(marker);
    while (at !== -1) {
      const open = text.indexOf("$$", at);
      const close = text.indexOf("$$", open + 2);
      if (open === -1 || close === -1) break;
      bodies.push(text.slice(open + 2, close));
      at = text.indexOf(marker, close);
    }
  }
  return bodies;
}

describe("function search_path hardening candidate (advisor: function_search_path_mutable)", () => {
  it("alters exactly the twelve flagged functions, with exact signatures", () => {
    const altered = [...MIGRATION.matchAll(/alter function public\.(\w+)\(([^)]*)\) set search_path = '';/g)]
      .map((match) => `${match[1]}(${match[2]})`)
      .sort();
    expect(altered).toEqual(
      [
        "research_fm_history_is_append_only()",
        "research_fm_append_only()",
        "research_fm_identity_audit_is_append_only()",
        "research_fm_versions_guard()",
        "research_fm_versions_no_delete()",
        "research_fm_signature_requires_published()",
        "research_fm_signatures_append_only()",
        "research_fm_checklist_touch()",
        "research_fm_esign_touch_updated_at()",
        "research_ledger_is_append_only()",
        "research_reject_product_request_event_mutation()",
        "research_rate_limit_hit(text,integer,integer)",
      ].sort(),
    );
  });

  it("fails closed before and proves the pin after, and never touches bodies or grants", () => {
    expect(MIGRATION).toContain("refusing to guess");
    expect(MIGRATION).toContain("is still mutable");
    expect(MIGRATION).toContain("is wired to no trigger");
    expect(MIGRATION).not.toMatch(/create or replace function/i);
    expect(MIGRATION).not.toMatch(/\bgrant\b/i);
    expect(MIGRATION).not.toMatch(/\brevoke\b/i);
    expect(MIGRATION).not.toMatch(/\bdrop\b/i);
  });

  it("every hardened body references only schema-qualified tables, so the pin cannot change resolution", () => {
    for (const name of HARDENED) {
      const bodies = bodiesOf(name);
      expect(bodies.length, `${name} must be defined in the repo sources`).toBeGreaterThan(0);
      for (const body of bodies) {
        expect(unqualifiedTableRefs(body), `${name} carries an unqualified table reference`).toEqual([]);
      }
    }
  });

  it("NEGATIVE CONTROL: the qualification prover catches a planted unqualified reference", () => {
    const planted = `
begin
  insert into research_rate_limits (key, hits) values (p_key, 1);
  delete from research_rate_limits where key = p_key;
end`;
    expect(unqualifiedTableRefs(planted)).toEqual([
      "research_rate_limits",
      "research_rate_limits",
    ]);
  });
});

describe("caller binding on the authenticated-executable claim-rail RPCs (advisor WARN x4)", () => {
  it("exactly three rail RPCs are granted to authenticated, and order ownership stays service_role-only", () => {
    expect(claimSql).toContain(
      "grant execute on function public.research_prepare_sponsored_b2b_claim(",
    );
    expect(claimSql).toMatch(
      /grant execute on function public\.research_activate_sponsored_b2b_buyer\(uuid,uuid,uuid\)\s+to authenticated;/,
    );
    expect(bridgeSql).toMatch(
      /grant execute on function public\.research_activate_b2b_buyer_bridge\([\s\S]{0,80}?\) to authenticated;/,
    );
    expect(bridgeSql).toMatch(
      /grant execute on function public\.research_claim_b2b_order_ownership\(\s*uuid,uuid,uuid,uuid,text,integer\s*\) to service_role;/,
    );
    expect(bridgeSql).not.toMatch(
      /research_claim_b2b_order_ownership\([\s\S]{0,80}?\) to authenticated/,
    );
  });

  it("each authenticated RPC derives its actor from auth.uid() and refuses a missing actor with 42501", () => {
    // Sponsored claim prep.
    expect(claimSql).toContain("v_actor uuid:=auth.uid()");
    expect(claimSql).toContain(
      "raise exception 'authenticated sponsorship actor required' using errcode='42501';",
    );
    // Sponsored activation.
    expect(claimSql).toContain(
      "raise exception 'authenticated activation actor required' using errcode='42501';",
    );
    // Bridge activation.
    expect(bridgeSql).toContain("v_actor_auth_user_id uuid := auth.uid()");
    expect(bridgeSql).toContain(
      "raise exception 'authenticated activation actor is required' using errcode='42501';",
    );
  });

  it("each authenticated RPC independently verifies a live admin role row and refuses otherwise with 42501", () => {
    expect(claimSql).toContain(
      "raise exception 'actor lacks sponsored B2B claim authority' using errcode='42501';",
    );
    expect(claimSql).toContain(
      "raise exception 'actor lacks sponsored B2B activation authority' using errcode='42501';",
    );
    expect(bridgeSql).toContain(
      "raise exception 'actor lacks B2B activation authority' using errcode='42501';",
    );
    // The role source is the assignments table in every case, expiry-checked.
    const roleChecks = (claimSql + bridgeSql).match(
      /from public\.research_prelaunch_role_assignments/g,
    );
    expect(roleChecks && roleChecks.length).toBeGreaterThanOrEqual(3);
    const expiryChecked = (claimSql + bridgeSql).match(
      /expires_at is null or expires_at>clock_timestamp\(\)/g,
    );
    expect(expiryChecked && expiryChecked.length).toBeGreaterThanOrEqual(3);
  });

  it("no rail RPC accepts the actor as a parameter", () => {
    // The prepare and activation signatures carry business facts and ids only;
    // an actor/admin uuid parameter would let a caller impersonate an approver.
    const signatures = [
      ...claimSql.matchAll(/create or replace function public\.(research_\w+)\s*\(([\s\S]*?)\)\s*returns/g),
      ...bridgeSql.matchAll(/create or replace function public\.(research_\w+)\s*\(([\s\S]*?)\)\s*returns/g),
    ];
    const railRpcs = signatures.filter(([, name]) =>
      [
        "research_prepare_sponsored_b2b_claim",
        "research_activate_sponsored_b2b_buyer",
        "research_activate_b2b_buyer_bridge",
      ].includes(name as string),
    );
    expect(railRpcs.length).toBeGreaterThanOrEqual(3);
    for (const [, name, params] of railRpcs) {
      expect(params, `${name} must not take an actor parameter`).not.toMatch(
        /p_(actor|admin|approver|reviewed_by|auth_uid|actor_id)\b/i,
      );
    }
  });
});

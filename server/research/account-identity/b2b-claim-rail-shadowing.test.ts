import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * QA regression for the production claim-rail repair (migration
 * research_b2b_claim_rail_variable_conflict_repair, repo mirror 50b18f6).
 *
 * The defect class: a PL/pgSQL OUT column or declared variable shadows an
 * unqualified column of the same name inside a WHERE-context, and the routine
 * dies with "column reference is ambiguous" the FIRST time that path executes.
 * Three instances shipped and were repaired after the failed claim-prep
 * transaction rolled back in production. This suite pins the repair, scans
 * BOTH rail files for any remaining instance of the class, and proves via a
 * planted-defect negative control that the scanner actually catches the
 * exact pre-repair text.
 */

const bridgePath = path.resolve(
  "supabase/pack02-candidates/20260813_research_b2b_buyer_bridge.sql",
);
const claimPath = path.resolve(
  "supabase/pack02-candidates/20260813_research_b2b_sponsored_claim.sql",
);
const bridgeSql = fs.readFileSync(bridgePath, "utf8");
const claimSql = fs.readFileSync(claimPath, "utf8");

interface ShadowingDefect {
  functionName: string;
  name: string;
  excerpt: string;
}

/**
 * Split the file into plpgsql function blocks and, for each, collect the
 * names that live in PL/pgSQL scope: OUT columns from `returns table(...)`,
 * declared variables, and parameters. Then flag any UNQUALIFIED use of one
 * of those names on the left side of a comparison inside a WHERE-ish
 * context. A dotted reference (alias.name) is qualified and safe; a
 * function whose scope does not contain the name cannot be ambiguous.
 */
function findShadowingDefects(sql: string): ShadowingDefect[] {
  const defects: ShadowingDefect[] = [];
  const fnPattern =
    /create or replace function public\.(\w+)\s*\(([\s\S]*?)\)\s*returns\s+(table\s*\(([\s\S]*?)\)|\w+)[\s\S]*?language plpgsql[\s\S]*?as \$\$([\s\S]*?)\$\$;/g;
  for (const match of sql.matchAll(fnPattern)) {
    const functionName = match[1] as string;
    const paramsRaw = match[2] as string;
    const returnsTableColumns = match[4] as string | undefined;
    const body = match[5] as string;

    const scopeNames = new Set<string>();
    if (returnsTableColumns) {
      for (const column of returnsTableColumns.split(",")) {
        const name = column.trim().split(/\s+/)[0];
        if (name) scopeNames.add(name.toLowerCase());
      }
    }
    for (const parameter of paramsRaw.split(",")) {
      const name = parameter.trim().split(/\s+/)[0];
      if (name) scopeNames.add(name.toLowerCase());
    }
    const declareSection = body.split(/\bbegin\b/i)[0] ?? "";
    for (const line of declareSection.split("\n")) {
      const declared = line.trim().match(/^(\w+)\s+[\w.%]+/);
      if (declared) scopeNames.add((declared[1] as string).toLowerCase());
    }

    // Unqualified `name =` right after where/and/or. `(?<![.\w])` refuses
    // alias-dotted and longer identifiers; `:=` assignments never match
    // because the context requires where/and/or immediately before.
    const wherePattern = /\b(where|and|or)\s+(?:exists\s*\(\s*select[\s\S]{0,120}?where\s+)?([a-z_][a-z0-9_]*)\s*=(?!=)/gi;
    for (const use of body.matchAll(wherePattern)) {
      const name = (use[2] as string).toLowerCase();
      if (!scopeNames.has(name)) continue;
      const at = use.index ?? 0;
      const preceding = body.slice(Math.max(0, at), at + (use[0] as string).length);
      if (/\.\s*[a-z_][a-z0-9_]*\s*=$/.test(preceding)) continue;
      defects.push({
        functionName,
        name,
        excerpt: body.slice(Math.max(0, at - 20), at + 60).replace(/\s+/g, " ").trim(),
      });
    }
  }
  return defects;
}

describe("B2B claim rail: variable shadowing repair (50b18f6)", () => {
  it("carries the three exact repaired forms", () => {
    expect(bridgeSql).toContain(
      "where o.relationship_id=v_relationship_id and o.member_id=p_member_id",
    );
    expect(bridgeSql).toContain("where e.relationship_id=v_relationship_id");
    expect(claimSql).toContain(
      "from public.research_b2b_sponsored_claims sc where sc.normalized_email=p_normalized_email",
    );
  });

  it("no longer carries any pre-repair defect form", () => {
    expect(bridgeSql).not.toMatch(
      /where relationship_id=v_relationship_id and member_id=p_member_id/,
    );
    expect(bridgeSql).not.toMatch(/where relationship_id=v_relationship_id(?!\w)/);
    expect(claimSql).not.toMatch(
      /research_b2b_sponsored_claims where normalized_email=p_normalized_email/,
    );
  });

  it("scans clean: no in-scope name is compared unqualified anywhere in either rail file", () => {
    expect(findShadowingDefects(bridgeSql)).toEqual([]);
    expect(findShadowingDefects(claimSql)).toEqual([]);
  });

  it("NEGATIVE CONTROL: the scanner catches all three planted pre-repair defects", () => {
    const brokenBridge = bridgeSql
      .replace(
        "where o.relationship_id=v_relationship_id and o.member_id=p_member_id",
        "where relationship_id=v_relationship_id and member_id=p_member_id",
      )
      .replace(
        "where e.relationship_id=v_relationship_id",
        "where relationship_id=v_relationship_id",
      );
    const brokenClaim = claimSql.replace(
      "from public.research_b2b_sponsored_claims sc where sc.normalized_email=p_normalized_email",
      "from public.research_b2b_sponsored_claims where normalized_email=p_normalized_email",
    );

    const bridgeDefects = findShadowingDefects(brokenBridge);
    const bridgeNames = bridgeDefects.map((defect) => defect.name).sort();
    expect(bridgeNames).toContain("relationship_id");
    expect(bridgeDefects.length).toBeGreaterThanOrEqual(2);

    const claimDefects = findShadowingDefects(brokenClaim);
    expect(claimDefects.map((defect) => defect.name)).toContain("normalized_email");
  });

  it("keeps the rail's attack invariants: strict expiry, advisory locks, single-use claim states", () => {
    // Strict, database-clock expiry on both rails; an exactly-expired claim
    // or entitlement is refused, never honoured.
    expect(claimSql).toContain("expires_at is null or expires_at>clock_timestamp()");
    expect(bridgeSql).toContain("expires_at is null or expires_at>clock_timestamp()");
    expect(claimSql).toContain("claim_expires_at>prepared_at");
    // Email-scoped and business-scoped advisory locks still guard the writes.
    expect(claimSql).toContain(
      "pg_advisory_xact_lock(hashtextextended('sponsored-b2b:'||p_normalized_email,0))",
    );
    expect(bridgeSql).toContain(
      "pg_advisory_xact_lock(hashtextextended('b2b:' || p_business_key, 0))",
    );
    expect(bridgeSql).toContain(
      "pg_advisory_xact_lock(hashtextextended('b2b-order:' || p_order_id::text, 0))",
    );
    // Claim state machine remains single-use: activated and revoked states
    // are structurally exclusive of a second activation.
    expect(claimSql).toContain("and activated_at is null and revoked_at is null)");
    expect(claimSql).toContain("and activated_at is not null and revoked_at is null)");
  });
});

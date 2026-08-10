/**
 * The SQL half of the shipping-commitment work list (M64).
 *
 * The behavioural proof lives in the PG16/PG17 harness
 * (`scripts/verify-m64-shipping-commitments.sh`), which applies the real
 * migration to a real managed-Supabase-shaped database twice and runs the
 * verification suite after each apply. These fast tests pin the things a
 * reviewer must be able to check without Docker, and the things that would
 * make the harness itself meaningless if they drifted: that the migration is a
 * READ-ONLY addition, that its privilege shape is exactly right, and that it
 * does not widen the M62 table boundary it exists to work within.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..", "..", "..", "..");
const MIGRATION_PATH =
  "supabase/migrations/20260810130000_research_early_access_cart_shipping_commitments.sql";
const VERIFY_PATH =
  "supabase/verification/research-early-access-cart-shipping-commitments.verify.sql";
const HARNESS_PATH = "scripts/verify-m64-shipping-commitments.sh";
const ROUTINE = "research_early_access_cart_shipping_commitments_due";

const migration = readFileSync(resolve(ROOT, MIGRATION_PATH), "utf8");

/**
 * The migration with its `--` comments removed.
 *
 * Every structural assertion below runs against THIS, never the raw file. The
 * migration's prose explains at length what it does not do ("writes no row",
 * "no table gains a SELECT grant"), and a naive grep over the raw text would
 * either trip on that prose or, worse, be satisfied by it.
 */
const code = migration
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n")
  .trim();

describe("M64 is a read-only addition", () => {
  it("creates the one routine and declares it STABLE, SECURITY DEFINER, search_path-pinned", () => {
    expect(code).toContain(`create or replace function public.${ROUTINE}(`);
    expect(code).toMatch(
      /returns jsonb\s+language sql\s+stable\s+security definer\s+set search_path = pg_catalog/,
    );
  });

  it("creates exactly ONE routine and no other", () => {
    expect(code.match(/create or replace function/g) ?? []).toHaveLength(1);
  });

  it("creates, alters and drops NO relation", () => {
    for (const forbidden of [
      /create\s+table/i,
      /alter\s+table/i,
      /drop\s+table/i,
      /create\s+index/i,
      /drop\s+index/i,
      /add\s+column/i,
      /drop\s+column/i,
      /create\s+trigger/i,
      /create\s+type/i,
    ]) {
      expect(code, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it("writes NO row: no insert, update, delete or truncate", () => {
    for (const forbidden of [
      /\binsert\s+into\b/i,
      /\bupdate\s+public\./i,
      /\bdelete\s+from\b/i,
      /\btruncate\b/i,
    ]) {
      expect(code, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it("touches no earlier migration's object", () => {
    for (const earlier of [
      "research_early_access_commit_cart_settlement",
      "research_early_access_record_cart_fulfilment_event",
      "research_fm_document_versions",
      "research_fm_document_signatures",
    ]) {
      expect(code.includes(`create or replace function public.${earlier}`)).toBe(false);
      expect(code.includes(`alter table public.${earlier}`)).toBe(false);
    }
  });

  it("runs inside one transaction, so a refused apply leaves nothing behind", () => {
    expect(code.startsWith("begin;")).toBe(true);
    expect(code.endsWith("commit;")).toBe(true);
  });
});

describe("M64's privilege shape", () => {
  it("revokes the routine from PUBLIC, anon and authenticated", () => {
    expect(code).toContain(`revoke all on function public.${ROUTINE}(timestamptz)`);
    expect(code).toContain("from public, anon, authenticated;");
  });

  it("grants EXECUTE to service_role and to nothing else", () => {
    // `grant\s` and not `grant`, so the ACL check's `acl.grantee` is not read
    // as a privilege statement.
    const grants = code.match(/\bgrant\s+[\s\S]*?;/gi) ?? [];
    expect(grants).toHaveLength(1);
    expect(grants[0]).toContain(`public.${ROUTINE}(timestamptz)`);
    expect(grants[0]).toContain("to service_role");
  });

  it("grants NO table privilege: the M62 boundary is worked within, not widened", () => {
    expect(code).not.toMatch(/grant\s+select\s+on/i);
    expect(code).not.toMatch(/grant\s+all\s+on\s+(table|public\.)/i);
    // And it asserts the same thing about itself before committing.
    expect(code).toContain("the M62 boundary is broken");
  });

  it("proves its own privilege shape in a post-condition before committing", () => {
    for (const assertion of [
      "must be STABLE",
      "must be SECURITY DEFINER",
      "PUBLIC may execute the read routine",
      "service_role cannot execute the read routine",
    ]) {
      expect(code).toContain(assertion);
    }
  });
});

describe("M64 fails closed", () => {
  it("refuses when the M62 cart schema is absent, with the repository's 55000 code", () => {
    expect(code).toContain("M64 requires the accepted M62 cart schema");
    expect(code).toContain("using errcode = '55000'");
  });

  it("requires the exact columns it reads", () => {
    expect(code).toContain("ship_by_at");
    expect(code).toContain("disposition (M62 duplicate guard)");
  });
});

describe("M64 answers the exact application contract", () => {
  it("returns the three fields EarlyAccessShippingCommitment declares, and no more", () => {
    const contract = readFileSync(resolve(__dirname, "shipping-sla-monitor.ts"), "utf8");
    const start = contract.indexOf("EarlyAccessShippingCommitment = Readonly<{");
    const declared = contract.slice(start, contract.indexOf("}>", start));
    for (const field of ["cartCheckoutNumber", "shipByAt", "stage"]) {
      expect(declared).toContain(field);
      expect(code).toContain(`'${field}'`);
    }
    const built = code.match(/jsonb_build_object\(\s*'cartCheckoutNumber'[\s\S]*?\n\s*\)/)?.[0] ?? "";
    expect(built.match(/'[a-zA-Z]+',/g)).toHaveLength(3);
  });

  it("derives every stage the contract accepts, and no unreachable fourth", () => {
    for (const stage of ["processing", "partially_shipped", "shipped"]) {
      expect(code).toContain(`'${stage}'`);
    }
    expect(code).not.toContain("'checkout_reserved'");
  });

  it("filters on the two facts the database owns, and decides no overdue-ness", () => {
    expect(code).toContain("h.ship_by_at <= p_now");
    expect(code).toContain("c.disposition is null");

    // The routine's WHERE clause is EXACTLY those two facts and nothing else,
    // so the SQL cannot be quietly taught a second, divergent copy of the
    // overdue rule. The `stage` expression is a projection, never a filter.
    const body = code.slice(code.indexOf("as $$"), code.indexOf("$$;"));
    const outerWhere = body.slice(body.lastIndexOf("where h.ship_by_at"));
    expect(outerWhere.replace(/\s+/g, " ").trim()).toBe(
      "where h.ship_by_at <= p_now and c.disposition is null ) as due",
    );

    // The word "overdue" survives in the routine's own COMMENT, which says the
    // routine decides none, and nowhere in executable logic.
    const executable = code.replace(/comment on function[\s\S]*?;/gi, "");
    expect(executable).not.toMatch(/overdue/i);
    expect(code).toMatch(/comment on function[\s\S]*?decides no overdue-ness/i);
    expect(migration).toContain("earlyAccessIsOverdue");
  });

  it("uses the SAME supersession rule as the application projection", () => {
    expect(code).toContain("supersedes_event_id");
    expect(code).toContain("shipment_shipped");
    expect(migration).toContain("projectEarlyAccessShipmentEvents");
  });

  it("orders deterministically, so two sweeps read the same list", () => {
    expect(code).toContain("order by due.ship_by_at, due.checkout_number");
  });
});

describe("the verification suite and harness exist and are wired to this migration", () => {
  it("the verification suite names the same routine", () => {
    const verify = readFileSync(resolve(ROOT, VERIFY_PATH), "utf8");
    expect(verify).toContain(ROUTINE);
    expect(verify).toContain("service_role still has NO direct SELECT");
  });

  it("the harness applies THIS migration twice and runs THIS verification", () => {
    const harness = readFileSync(resolve(ROOT, HARNESS_PATH), "utf8");
    expect(harness).toContain(MIGRATION_PATH);
    expect(harness).toContain(VERIFY_PATH);
    expect(harness).toContain("second apply");
    expect(harness).toContain("FAIL CLOSED");
  });
});

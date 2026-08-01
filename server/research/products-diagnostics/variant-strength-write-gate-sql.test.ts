/**
 * The SQL half of the strength write gate.
 *
 * The TypeScript service gate stops the admin API from creating or approving a
 * price for a contested unit. It does nothing about a direct call to
 * research_admin_create_product_price or research_admin_approve_product_price,
 * which is a real path: those RPCs are SECURITY DEFINER and do not pass through
 * the application. supabase/migrations/20260801120000 puts the same rule in the
 * database.
 *
 * These tests run no database. They pin two things a reviewer cannot check by
 * eye: that the migration's founder-locked registry is a faithful row-for-row
 * mirror of the catalog (so the SQL enforces the same facts as the TypeScript,
 * and neither lane can drift silently), and that the enforcement is shaped the
 * way the brief requires (idempotent, non-destructive, fail closed).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PEPTIDE_CATALOG } from "@shared/research/catalog/peptide-catalog";
import { normalizeSkuKey } from "./variant-strength-dispute";

const MIGRATION = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "supabase",
  "migrations",
  "20260801120000_research_variant_strength_write_gate.sql",
);

const SQL = readFileSync(MIGRATION, "utf8");

function withoutComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => {
      const index = line.indexOf("--");
      return index === -1 ? line : line.slice(0, index);
    })
    .join("\n");
}

const BODY = withoutComments(SQL);

interface SeedRow {
  skuKey: string;
  sku: string;
  productCode: string;
  legacyProductCode: string | null;
  founderLockedStrength: string;
  supplierMasterStrength: string | null;
}

/**
 * Read the VALUES tuples out of the seed. Deliberately a real parser rather than
 * a split on commas: a presentation such as
 * "GHK-Cu 50 mg / BPC-157 10 mg / TB-500 10 mg (70 mg total)" contains commas
 * and parentheses, and a sloppy parse would silently compare the wrong fields.
 */
function parseSeed(sql: string): SeedRow[] {
  const start = sql.indexOf("insert into public.research_catalog_founder_locked_variant");
  expect(start).toBeGreaterThan(-1);
  const valuesAt = sql.indexOf(") values", start);
  expect(valuesAt).toBeGreaterThan(-1);
  const rows: SeedRow[] = [];
  let index = valuesAt + ") values".length;
  let current: Array<string | null> = [];
  let inTuple = false;
  while (index < sql.length) {
    const char = sql[index];
    if (!inTuple) {
      if (char === "(") {
        inTuple = true;
        current = [];
        index += 1;
        continue;
      }
      if (/^on conflict/i.test(sql.slice(index).trimStart().slice(0, 11))) break;
      if (char === ";") break;
      index += 1;
      continue;
    }
    if (char === " " || char === "\n" || char === "\r" || char === "\t" || char === ",") {
      index += 1;
      continue;
    }
    if (char === ")") {
      inTuple = false;
      expect(current).toHaveLength(6);
      rows.push({
        skuKey: String(current[0]),
        sku: String(current[1]),
        productCode: String(current[2]),
        legacyProductCode: current[3],
        founderLockedStrength: String(current[4]),
        supplierMasterStrength: current[5],
      });
      index += 1;
      continue;
    }
    if (char === "'") {
      let value = "";
      index += 1;
      while (index < sql.length) {
        if (sql[index] === "'" && sql[index + 1] === "'") {
          value += "'";
          index += 2;
          continue;
        }
        if (sql[index] === "'") {
          index += 1;
          break;
        }
        value += sql[index];
        index += 1;
      }
      current.push(value);
      continue;
    }
    if (sql.slice(index, index + 4).toLowerCase() === "null") {
      current.push(null);
      index += 4;
      continue;
    }
    throw new Error(`unparsed seed character at ${index}: ${sql.slice(index, index + 20)}`);
  }
  return rows;
}

const SEED = parseSeed(BODY);

interface CatalogRow extends SeedRow {}

function catalogRows(): CatalogRow[] {
  const rows: CatalogRow[] = [];
  for (const product of PEPTIDE_CATALOG) {
    for (const item of product.variants) {
      rows.push({
        skuKey: normalizeSkuKey(item.sku),
        sku: item.sku,
        productCode: product.internalProductCode,
        legacyProductCode: product.legacyProductCode,
        founderLockedStrength: item.strength,
        supplierMasterStrength: item.disputedBySignedSupplierMasterStrength,
      });
    }
  }
  return rows;
}

function byKey(rows: SeedRow[]): Map<string, SeedRow> {
  return new Map(rows.map((row) => [row.skuKey, row]));
}

describe("the migration's registry mirrors the founder-locked catalog exactly", () => {
  const catalog = catalogRows();

  it("parses a real, non-trivial seed", () => {
    expect(SEED.length).toBeGreaterThan(50);
    expect(catalog.length).toBeGreaterThan(50);
  });

  it("holds exactly one row per catalog variant, and no extra unit", () => {
    expect(SEED.length).toBe(catalog.length);
    expect([...byKey(SEED).keys()].sort()).toEqual(
      [...byKey(catalog).keys()].sort(),
    );
  });

  it("transcribes every field of every unit without alteration", () => {
    const seeded = byKey(SEED);
    for (const row of catalog) {
      expect(seeded.get(row.skuKey), `missing seed row for ${row.sku}`).toEqual(row);
    }
  });

  it("carries every recorded dispute, and invents none", () => {
    const disputedInCatalog = catalog
      .filter((row) => row.supplierMasterStrength !== null)
      .map((row) => row.skuKey)
      .sort();
    const disputedInSeed = SEED.filter(
      (row) => row.supplierMasterStrength !== null,
    )
      .map((row) => row.skuKey)
      .sort();
    expect(disputedInSeed).toEqual(disputedInCatalog);
    expect(disputedInSeed.length).toBeGreaterThan(0);
  });

  it("never records a supplier strength equal to the founder-locked one", () => {
    for (const row of SEED) {
      if (row.supplierMasterStrength === null) continue;
      expect(row.supplierMasterStrength).not.toBe(row.founderLockedStrength);
    }
  });
});

describe("the SQL enforcement is shaped the way a price gate must be", () => {
  it("gates the price table itself, so a direct RPC cannot go around it", () => {
    expect(BODY).toMatch(
      /create trigger research_product_prices_strength_gate\s+before insert or update on public\.research_product_prices\s+for each row execute function public\.research_product_price_strength_gate\(\)/,
    );
  });

  it("refuses on insert and on any move into approved or active", () => {
    expect(BODY).toMatch(
      /if tg_op = 'INSERT' or new\.status in \('approved', 'active'\) then/,
    );
    expect(BODY).toMatch(/raise exception 'research product price refused: %', v_reason/);
  });

  it("fails closed on an empty registry and on unresolvable identity", () => {
    expect(BODY).toContain("variant_strength_registry_unavailable");
    expect(BODY).toContain("variant_identity_unresolved");
    expect(BODY).toMatch(
      /if not exists \(\s*select 1 from public\.research_catalog_founder_locked_variant\s*\)/,
    );
    expect(BODY).toMatch(/if v_sku_key = '' then/);
  });

  it("joins on the SKU and on the catalog number, like the TypeScript guard", () => {
    expect(BODY).toContain("where sku_key in (v_sku_key, v_catalog_key)");
  });

  it("collapses only case and whitespace in its keys", () => {
    expect(BODY).toMatch(
      /research_normalize_sku_key[\s\S]{0,200}upper\(regexp_replace\(coalesce\(p_value, ''\), '\\s\+', '', 'g'\)\)/,
    );
    expect(BODY).toMatch(
      /research_normalize_presentation_key[\s\S]{0,220}lower\(regexp_replace\(coalesce\(p_value, ''\), '\\s\+', '', 'g'\)\)/,
    );
  });

  it("is idempotent: re-applying creates nothing twice and refreshes the registry", () => {
    expect(BODY).toContain(
      "create table if not exists public.research_catalog_founder_locked_variant",
    );
    expect(BODY).toContain("create index if not exists");
    expect(BODY).toContain("on conflict (sku_key) do update set");
    for (const fn of [
      "research_normalize_sku_key",
      "research_normalize_presentation_key",
      "research_variant_strength_dispute_reason",
      "research_product_price_strength_gate",
    ]) {
      expect(BODY).toContain(`create or replace function public.${fn}`);
    }
    expect(BODY).toContain(
      "drop trigger if exists research_product_prices_strength_gate",
    );
  });

  it("destroys no data and rewrites no price, variant, or product row", () => {
    expect(BODY).not.toMatch(/\bdrop\s+table\b/i);
    expect(BODY).not.toMatch(/\bdrop\s+column\b/i);
    expect(BODY).not.toMatch(/\btruncate\b/i);
    expect(BODY).not.toMatch(/\bdelete\s+from\b/i);
    expect(BODY).not.toMatch(
      /\bupdate\s+public\.(research_product_prices|research_product_variants|research_products)\b/i,
    );
    const inserts = BODY.match(/insert\s+into\s+public\.(\w+)/gi) ?? [];
    expect(inserts).toEqual([
      "insert into public.research_catalog_founder_locked_variant",
    ]);
  });

  it("keeps the registry server-only and creates no policy", () => {
    expect(BODY).toContain(
      "alter table public.research_catalog_founder_locked_variant\n  force row level security",
    );
    expect(BODY).toContain(
      "revoke all on table public.research_catalog_founder_locked_variant\n  from public, anon, authenticated",
    );
    expect(BODY).not.toMatch(/create\s+policy/i);
  });

  it("errors rather than silently no-opping when the price table is absent", () => {
    expect(BODY).toMatch(
      /if to_regclass\('public\.research_product_prices'\) is null/,
    );
    expect(BODY).toMatch(/raise exception\s*\n?\s*'research_variant_strength_write_gate:/);
  });

  it("reports presentations only, never an amount or a cost", () => {
    for (const token of [
      "amount_cents",
      "wholesale",
      "margin",
      "multiplier",
      "price_cents",
    ]) {
      expect(BODY.toLowerCase()).not.toContain(token);
    }
  });
});

describe("R2: the variant-side trigger, which the price trigger alone did not cover", () => {
  // An adversarial audit established that research_admin_update_product_variant is
  // SECURITY DEFINER, granted to service_role, assigns sku/catalog_number/strength
  // with no screen, and that NO trigger existed on research_product_variants. So a
  // service-role caller reached an active price on a contested unit in three RPC
  // calls while writing nothing to research_product_prices, meaning the price
  // trigger never fired. These assertions pin the closure.

  it("declares a BEFORE UPDATE row trigger on research_product_variants", () => {
    expect(SQL).toContain("create trigger research_product_variants_strength_gate");
    expect(SQL).toContain("before update on public.research_product_variants");
    expect(SQL).toContain("for each row");
  });

  it("checks the OLD row first, so a rename cannot screen itself clean", () => {
    const gate = SQL.slice(SQL.indexOf("$variant_gate$"));
    const rule1 = gate.indexOf("old.sku, old.catalog_number, old.strength");
    const rule2 = gate.indexOf("new.sku, new.catalog_number, new.strength");
    expect(rule1).toBeGreaterThan(-1);
    expect(rule2).toBeGreaterThan(-1);
    // Order is the whole defence: after a rename the NEW triple screens clean.
    expect(rule1).toBeLessThan(rule2);
  });

  it("runs no check when the identity triple is untouched", () => {
    expect(SQL).toContain("if not v_touches then");
    expect(SQL).toContain("coalesce(new.sku, '') is distinct from coalesce(old.sku, '')");
  });

  it("refuses with check_violation so the RPC surfaces it as a constraint failure", () => {
    const gate = SQL.slice(SQL.indexOf("$variant_gate$"));
    expect((gate.match(/errcode = 'check_violation'/g) ?? []).length).toBe(2);
  });

  it("fails closed on an unseeded registry and on a cleared SKU", () => {
    const fn = SQL.slice(SQL.indexOf("$triple_reason$"));
    expect(fn).toContain("variant_strength_registry_unavailable");
    expect(fn).toContain("the edit would leave the variant");
  });

  it("adds no destructive statement", () => {
    expect(SQL).not.toMatch(/drop table/i);
    expect(SQL).not.toMatch(/truncate/i);
    expect(SQL).not.toMatch(/delete from/i);
  });
});

describe("R3: the registry the gate consults is not writable by the application role", () => {
  // The whole SQL gate reads research_catalog_founder_locked_variant. If the role
  // the application runs as can write it, one statement blinds the gate for every
  // unit and both triggers then pass every contested variant:
  //   update public.research_catalog_founder_locked_variant
  //      set supplier_master_strength = null;
  //
  // FORCE ROW LEVEL SECURITY does not cover this, because service_role bypasses
  // row security. That is the same reason 20260729100000_research_rls_retro_hardening
  // exists, and that file states at :24 that it deliberately never touches the
  // server role grants. So this table has to revoke it explicitly.

  it("revokes ALL from service_role, not only from the browser roles", () => {
    expect(SQL).toContain(
      "from public, anon, authenticated, service_role;",
    );
  });

  it("re-grants SELECT and nothing more", () => {
    const block = SQL.slice(
      SQL.indexOf("revoke all on table public.research_catalog_founder_locked_variant"),
      SQL.indexOf("create index if not exists research_catalog_founder_locked_variant_disputed_idx"),
    );
    expect(block).toContain("grant select on table public.research_catalog_founder_locked_variant");
    // No write privilege may be handed back anywhere in that block.
    expect(block).not.toMatch(/grant\s+(insert|update|delete|all)/i);
  });

  it("still forces row level security, as defence in depth for non-bypassing roles", () => {
    expect(SQL).toContain("force row level security");
  });
});

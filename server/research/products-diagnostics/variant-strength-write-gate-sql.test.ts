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
 * The fast tests pin the catalog mirror and SQL shape. The final CI-only test
 * also executes the exact migration and verifier on stock PostgreSQL 16, so a
 * parse error, partial installation, noncausal verifier, or broken rollback
 * cannot pass merely because the static source still contains expected words.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PEPTIDE_CATALOG } from "@shared/research/catalog/peptide-catalog";
import { normalizeSkuKey } from "./variant-strength-dispute";

const ROOT = process.cwd();
const MIGRATION = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "supabase",
  "migrations",
  "20260801120000_research_variant_strength_write_gate.sql",
);
const VERIFIER = resolve(
  ROOT,
  "supabase",
  "verification",
  "research-variant-strength-write-gate.verify.sql",
);
const PRODUCT_CONTROL = resolve(
  ROOT,
  "supabase",
  "migrations",
  "20260726143000_research_product_control_center.sql",
);
const PRODUCT_CONTROL_HARDENING = resolve(
  ROOT,
  "supabase",
  "migrations",
  "20260726214500_research_product_control_center_privilege_hardening.sql",
);
const DISPOSABLE_BOOTSTRAP = resolve(
  ROOT,
  "supabase",
  "verification",
  "research-pricing-lineage-disposable-bootstrap.sql",
);
const pg16It =
  process.env.CI || process.env.XENIOS_RUN_PG16_VERIFIER === "1" ? it : it.skip;

const SQL = readFileSync(MIGRATION, "utf8");
const VERIFICATION_SQL = readFileSync(VERIFIER, "utf8");

function withoutComments(sql: string): string {
  return sql
    .replace(/\r\n/g, "\n")
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

// The mirror repair (founder-authorized): migration 47 RAN in production
// 2026-08-02 and is immutable, so the eight identities the founder added
// afterwards enter through the ADDITIVE migration below. The registry the
// database actually holds is the union of the two seeds, and that union is
// what must mirror the catalog exactly. Neither file may drift: 47's
// contribution is pinned at its historical 70 rows and its exact bytes, and
// the repair is pinned to exactly the eight accepted variants.
const MIGRATION_57 = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "supabase",
  "migrations",
  "20260804160000_research_early_access_strength_registry_mirror.sql",
);
const SQL_57 = readFileSync(MIGRATION_57, "utf8");
const BODY_57 = withoutComments(SQL_57);
const SEED_57 = parseSeed(BODY_57);
const REGISTRY = [...SEED, ...SEED_57];

const ACCEPTED_EIGHT = [
  "R360-BPC157-5MG-VIAL",
  "R360-CAGRILINTIDE-10MG-VIAL",
  "R360-DSIP-10MG-VIAL",
  "R360-GHKCU-50MG-VIAL",
  "R360-GLUTATHIONE-500MG-VIAL",
  "R360-HEXARELIN-10MG-VIAL",
  "R360-OXYTOCIN-5MG-VIAL",
  "R360-SERMORELIN-5MG-VIAL",
] as const;

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

describe("the registry (migration 47 + the mirror repair) mirrors the founder-locked catalog exactly", () => {
  const catalog = catalogRows();

  it("parses a real, non-trivial seed", () => {
    expect(SEED.length).toBeGreaterThan(50);
    expect(catalog.length).toBeGreaterThan(50);
  });

  it("migration 47 is immutable: byte-for-byte pinned, contributing exactly its historical 70 rows", () => {
    // Canonical git bytes, not the checkout: line endings differ per OS, and
    // the pin is the same one the release control plane holds.
    const canonical = execFileSync(
      "git",
      ["show", ":supabase/migrations/20260801120000_research_variant_strength_write_gate.sql"],
      { cwd: ROOT, encoding: "buffer" },
    );
    expect(createHash("sha256").update(canonical).digest("hex")).toBe(
      "6cd11e07eb764d0f803db4baa308ae397c23aacb8ff5d29306c8797be60b4818",
    );
    expect(SEED.length).toBe(70);
  });

  it("the repair contributes exactly the eight accepted variants, all non-disputed, and no key migration 47 already holds", () => {
    expect(SEED_57.map((row) => row.skuKey).sort()).toEqual([...ACCEPTED_EIGHT]);
    for (const row of SEED_57) {
      expect(row.supplierMasterStrength, `${row.sku} must enter non-disputed`).toBeNull();
    }
    const seededKeys = new Set(SEED.map((row) => row.skuKey));
    for (const row of SEED_57) {
      expect(seededKeys.has(row.skuKey), `${row.skuKey} duplicates migration 47`).toBe(false);
    }
  });

  it("holds exactly one row per catalog variant, and no extra unit", () => {
    expect(REGISTRY.length).toBe(catalog.length);
    expect([...byKey(REGISTRY).keys()].sort()).toEqual(
      [...byKey(catalog).keys()].sort(),
    );
  });

  it("transcribes every field of every unit without alteration", () => {
    const seeded = byKey(REGISTRY);
    for (const row of catalog) {
      expect(seeded.get(row.skuKey), `missing seed row for ${row.sku}`).toEqual(row);
    }
  });

  it("carries every recorded dispute, and invents none", () => {
    const disputedInCatalog = catalog
      .filter((row) => row.supplierMasterStrength !== null)
      .map((row) => row.skuKey)
      .sort();
    const disputedInSeed = REGISTRY.filter(
      (row) => row.supplierMasterStrength !== null,
    )
      .map((row) => row.skuKey)
      .sort();
    expect(disputedInSeed).toEqual(disputedInCatalog);
    expect(disputedInSeed.length).toBeGreaterThan(0);
  });

  it("never records a supplier strength equal to the founder-locked one", () => {
    for (const row of REGISTRY) {
      if (row.supplierMasterStrength === null) continue;
      expect(row.supplierMasterStrength).not.toBe(row.founderLockedStrength);
    }
  });

  it("the repair touches nothing but the registry: one upsert, no destructive statement, absent-target-safe", () => {
    const inserts = BODY_57.match(/insert\s+into\s+public\.(\w+)/gi) ?? [];
    expect(inserts).toEqual([
      "insert into public.research_catalog_founder_locked_variant",
    ]);
    expect(BODY_57).not.toMatch(/\bdrop\s+/i);
    expect(BODY_57).not.toMatch(/\btruncate\b/i);
    expect(BODY_57).not.toMatch(/\bdelete\s+from\b/i);
    expect(BODY_57).not.toMatch(/\balter\s+table\b/i);
    expect(BODY_57).not.toMatch(/\bcreate\s+(table|function|trigger|policy|index)\b/i);
    expect(BODY_57.toLowerCase()).not.toContain("price_cents");
    expect(BODY_57.toLowerCase()).not.toContain("amount_cents");
    expect(BODY_57).toContain("on conflict (sku_key) do update set");
    expect(BODY_57).toContain(
      "lock table public.research_catalog_founder_locked_variant in access exclusive mode;",
    );
    expect(BODY_57).toMatch(/to_regclass\('public\.research_catalog_founder_locked_variant'\)/);
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
      "research_variant_strength_triple_dispute_reason",
      "research_product_variant_strength_gate",
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

  it("applies atomically and serializes the registry refresh", () => {
    expect(BODY.trimStart()).toMatch(/^begin;/);
    expect(BODY.trimEnd()).toMatch(/commit;$/);
    expect(BODY).toContain(
      "lock table public.research_catalog_founder_locked_variant in access exclusive mode;",
    );
    expect(BODY).toContain("existing_price_preflight");
  });

  it("keeps the registry owner-only and creates no policy", () => {
    expect(BODY).toContain(
      "alter table public.research_catalog_founder_locked_variant\n  force row level security",
    );
    expect(BODY).toContain(
      "revoke all on table public.research_catalog_founder_locked_variant\n  from public, anon, authenticated, service_role",
    );
    expect(BODY).not.toMatch(/create\s+policy/i);
    expect(BODY).not.toMatch(
      /grant\s+select\s+on\s+table\s+public\.research_catalog_founder_locked_variant/i,
    );
  });

  it("revokes every internal helper from browser and service roles", () => {
    for (const signature of [
      "research_normalize_sku_key(text)",
      "research_normalize_presentation_key(text)",
      "research_variant_strength_dispute_reason(uuid,uuid)",
      "research_product_price_strength_gate()",
      "research_variant_strength_triple_dispute_reason(text,text,text)",
      "research_product_variant_strength_gate()",
    ]) expect(BODY).toContain(`revoke all on function public.${signature}`);
    expect((BODY.match(/from public, anon, authenticated, service_role;/g) ?? []).length)
      .toBeGreaterThanOrEqual(7);
  });

  it("errors rather than silently no-opping when the price table is absent", () => {
    expect(BODY).toMatch(
      /if to_regclass\('public\.research_product_prices'\) is null/,
    );
    expect(BODY).toMatch(/raise exception\s*\n?\s*'research_variant_strength_write_gate:/);
  });

  it("preserves the exact named negative controls", () => {
    expect(VERIFICATION_SQL).toContain("P2 direct service-role DML is refused");
    expect(VERIFICATION_SQL).toContain("P7 lifecycle-only RPC remains available");
    expect(VERIFICATION_SQL).toContain("P8 undisputed variant update succeeds");
    expect(VERIFICATION_SQL).toContain(
      "P12 clean price create+approve succeeds",
    );
    expect(VERIFICATION_SQL).toContain(
      '{"status":"archived","active":false}',
    );
    expect(VERIFICATION_SQL).toMatch(
      /set local role service_role;\s*do \$p2_role\$/,
    );
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
    const start = SQL.indexOf("as $variant_gate$");
    const end = SQL.indexOf("$variant_gate$;", start);
    const gate = SQL.slice(start, end);
    expect((gate.match(/errcode = '23514'/g) ?? []).length).toBe(2);
    expect(gate).not.toMatch(/raise exception[\s\S]{0,160}\|\|/);
  });

  it("fails closed on an unseeded registry and on a cleared SKU", () => {
    const fn = SQL.slice(SQL.indexOf("$triple_reason$"));
    expect(fn).toContain("variant_strength_registry_unavailable");
    expect(fn).toContain("the edit would leave the variant");
  });

  it("adds no destructive statement", () => {
    expect(BODY).not.toMatch(/\bdrop\s+table\b/i);
    expect(BODY).not.toMatch(/\btruncate\b/i);
    expect(BODY).not.toMatch(/\bdelete\s+from\b/i);
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

  it("hands no table privilege back to service_role", () => {
    const block = SQL.slice(
      SQL.indexOf("revoke all on table public.research_catalog_founder_locked_variant"),
      SQL.indexOf("create index if not exists research_catalog_founder_locked_variant_disputed_idx"),
    );
    expect(block).not.toMatch(/grant\s+/i);
  });

  it("locks the registry during each idempotent refresh", () => {
    expect(SQL).toContain(
      "lock table public.research_catalog_founder_locked_variant in access exclusive mode;",
    );
  });

  it("still forces row level security, as defence in depth for non-bypassing roles", () => {
    expect(SQL).toContain("force row level security");
  });
});

describe("PostgreSQL 16 executable strength-gate qualification", () => {
  pg16It(
    "applies twice, executes all probes, rolls back full/absent/partial states, and reapplies",
    () => {
      const container = "xenios-pr230-strength-" + process.pid;
      const applySql = (
        source: string | Buffer,
        variables: string[] = [],
      ): string => {
        const variableArgs = variables.flatMap((value) => ["-v", value]);
        return execFileSync(
          "docker",
          [
            "exec",
            "-i",
            container,
            "psql",
            "-X",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "-v",
            "ON_ERROR_STOP=1",
            ...variableArgs,
          ],
          {
            input: source,
            encoding: "utf8",
            maxBuffer: 32 * 1024 * 1024,
            stdio: ["pipe", "pipe", "pipe"],
          },
        );
      };

      const migration = readFileSync(MIGRATION);
      const verifier = readFileSync(VERIFIER);
      const fullRollback = (): string =>
        applySql(verifier, ["pr230_run_full_rollback=1"]);

      try {
        execFileSync(
          "docker",
          [
            "run",
            "--rm",
            "-d",
            "--name",
            container,
            "-e",
            "POSTGRES_PASSWORD=postgres",
            "postgres:16",
          ],
          { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        );
        execFileSync(
          "docker",
          [
            "exec",
            container,
            "sh",
            "-c",
            "until pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done",
          ],
          {
            encoding: "utf8",
            timeout: 30_000,
            stdio: ["ignore", "pipe", "pipe"],
          },
        );

        const bootstrap = readFileSync(DISPOSABLE_BOOTSTRAP, "utf8").replace(
          /^\\ir\s+.*$/gm,
          "",
        );
        applySql(bootstrap);
        applySql(`
          alter table public.research_products
            add column if not exists slug text,
            add column if not exists lane text;
        `);
        applySql(readFileSync(PRODUCT_CONTROL));
        applySql(readFileSync(PRODUCT_CONTROL_HARDENING));

        applySql(`
          insert into public.research_products (
            id, sku, slug, display_name, canonical_name, lane,
            category, product_classification, created_by, updated_by
          ) values (
            'f2310000-0000-4000-8000-000000000001',
            'PR230-UNSAFE-PRODUCT',
            'pr230-unsafe-product',
            'PR230 unsafe preflight product',
            'PR230 unsafe preflight product',
            'research_material',
            'verification',
            'verification',
            'pr230-ci',
            'pr230-ci'
          );
          insert into public.research_product_variants (
            id, product_id, sku, catalog_number, label, strength,
            status, active, version, created_by, updated_by
          ) values (
            'f2310000-0000-4000-8000-000000000011',
            'f2310000-0000-4000-8000-000000000001',
            'R360-TESAMORELIN-10MG-VIAL',
            'R360-TESAMORELIN-10MG-VIAL',
            'PR230 unsafe disputed variant',
            '10 mg',
            'draft',
            false,
            1,
            'pr230-ci',
            'pr230-ci'
          );
          insert into public.research_product_prices (
            id, product_id, variant_id, audience, amount_cents, currency,
            effective_at, status, version, created_by
          ) values (
            'f2310000-0000-4000-8000-000000000021',
            'f2310000-0000-4000-8000-000000000001',
            'f2310000-0000-4000-8000-000000000011',
            'member',
            12345,
            'USD',
            '2026-08-01T00:00:00Z',
            'draft',
            1,
            'pr230-ci'
          );
        `);

        let unsafeApplyError: unknown;
        try {
          applySql(
            Buffer.concat([
              Buffer.from("\\set VERBOSITY verbose\n"),
              migration,
            ]),
          );
        } catch (error) {
          unsafeApplyError = error;
        }
        expect(unsafeApplyError).toBeTruthy();
        const unsafeApplyStderr = String(
          (unsafeApplyError as { stderr?: string | Buffer }).stderr ??
            unsafeApplyError,
        );
        expect(unsafeApplyStderr).toContain("23514");
        expect(unsafeApplyStderr).toContain(
          "research_variant_strength_write_gate: existing price",
        );

        applySql(`
          do \$atomic_refusal\$
          begin
            if to_regclass(
              'public.research_catalog_founder_locked_variant'
            ) is not null then
              raise exception 'atomic preflight left the registry table installed';
            end if;
            if to_regprocedure(
              'public.research_normalize_sku_key(text)'
            ) is not null
              or to_regprocedure(
                'public.research_normalize_presentation_key(text)'
              ) is not null
              or to_regprocedure(
                'public.research_variant_strength_dispute_reason(uuid,uuid)'
              ) is not null
              or to_regprocedure(
                'public.research_product_price_strength_gate()'
              ) is not null
              or to_regprocedure(
                'public.research_variant_strength_triple_dispute_reason(text,text,text)'
              ) is not null
              or to_regprocedure(
                'public.research_product_variant_strength_gate()'
              ) is not null then
              raise exception 'atomic preflight left a gate function installed';
            end if;
            if exists (
              select 1 from pg_trigger
              where tgname in (
                'research_product_prices_strength_gate',
                'research_product_variants_strength_gate'
              )
            ) then
              raise exception 'atomic preflight left a gate trigger installed';
            end if;
            if (select count(*) from public.research_products) <> 1
              or (select count(*) from public.research_product_variants) <> 1
              or (select count(*) from public.research_product_prices) <> 1
              or (select count(*) from public.research_product_admin_audit) <> 0
              or not exists (
                select 1 from public.research_product_prices
                where id = 'f2310000-0000-4000-8000-000000000021'
                  and status = 'draft'
                  and created_by = 'pr230-ci'
              ) then
              raise exception 'atomic preflight changed unsafe business state';
            end if;
          end
          \$atomic_refusal\$;

          alter table public.research_product_prices
            disable trigger research_product_prices_history_immutable;
          delete from public.research_product_prices
          where id = 'f2310000-0000-4000-8000-000000000021';
          alter table public.research_product_prices
            enable trigger research_product_prices_history_immutable;
          delete from public.research_product_variants
          where id = 'f2310000-0000-4000-8000-000000000011';
          delete from public.research_products
          where id = 'f2310000-0000-4000-8000-000000000001';
        `);

        applySql(migration);
        applySql(migration);
        const firstVerification = applySql(verifier);
        expect(firstVerification).toContain(
          "PR230 VERIFICATION COMPLETE: ALL PROBES PASS",
        );

        const full = fullRollback();
        expect(full).toContain("PR230 FULL GATE ROLLBACK");
        const absent = fullRollback();
        expect(absent).toContain("PR230 FULL GATE ROLLBACK");

        applySql(`
          create table public.research_catalog_founder_locked_variant (
            sku_key text primary key
          );
          create function public.research_normalize_sku_key(text)
          returns text
          language sql
          immutable
          set search_path = pg_catalog
          as 'select upper(coalesce(\$1, ''''))';
          create function public.research_product_price_strength_gate()
          returns trigger
          language plpgsql
          security definer
          set search_path = pg_catalog
          as 'begin return new; end';
          create trigger research_product_prices_strength_gate
          before insert or update on public.research_product_prices
          for each row execute function
            public.research_product_price_strength_gate();
        `);
        const partial = fullRollback();
        expect(partial).toContain("PR230 FULL GATE ROLLBACK");

        applySql(migration);
        const finalVerification = applySql(verifier);
        expect(finalVerification).toContain(
          "PR230 VERIFICATION COMPLETE: ALL PROBES PASS",
        );
      } finally {
        try {
          execFileSync("docker", ["rm", "-f", container], {
            stdio: ["ignore", "ignore", "ignore"],
          });
        } catch {
          // The disposable container may already be absent after startup failure.
        }
      }
    },
    120_000,
  );
});

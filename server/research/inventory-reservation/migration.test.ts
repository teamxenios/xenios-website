import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../../..");
const migrationPath = "supabase/research-inventory-reservation-commands.sql";
const sql = readFileSync(
  resolve(repoRoot, migrationPath),
  "utf8",
);
const sha256 = (value: NodeJS.ArrayBufferView) =>
  createHash("sha256").update(value).digest("hex");

describe("atomic inventory reservation migration", () => {
  it("pins the canonical raw Git-blob checksum rather than working-tree line endings", () => {
    const gitBlob = execFileSync("git", ["show", `HEAD:${migrationPath}`], {
      cwd: repoRoot,
    });
    const crlfNegativeControl = Buffer.from(
      gitBlob.toString("utf8").replace(/\r?\n/g, "\r\n"),
      "utf8",
    );

    expect(gitBlob).toHaveLength(49_917);
    expect(sha256(gitBlob)).toBe(
      "4dbb183f367e6dcd847cba3048a37f132ab4cc559791c2719baf7e05c42767f7",
    );
    expect(sha256(crlfNegativeControl)).not.toBe(sha256(gitBlob));
  });

  it("reuses the canonical lot, movement, reservation, and allocation records", () => {
    expect(sql).toContain("alter table public.research_lot_reservations");
    expect(sql).toContain("alter table public.research_lot_reservation_allocations");
    expect(sql).toContain("public.research_inventory_lots");
    expect(sql).toContain("public.research_inventory_movements");
    expect(sql).toContain("create table if not exists public.research_inventory_reservation_events");
    expect(sql).not.toMatch(/create table .*product/i);
    expect(sql).not.toMatch(/create table .*order/i);
    expect(sql).not.toMatch(/research_operations_/i);
  });

  it("defines exactly four service commands with fixed search paths", () => {
    for (const name of [
      "research_reserve_inventory",
      "research_release_inventory_reservations",
      "research_finalize_inventory_reservations",
      "research_expire_inventory_reservations",
    ]) {
      expect(sql).toContain(`create or replace function public.${name}`);
      expect(sql).toMatch(
        new RegExp(
          `create or replace function public\\.${name}[\\s\\S]*?security definer\\s+set search_path = pg_catalog`,
          "i",
        ),
      );
      expect(sql).toContain(`grant execute on function public.${name}`);
    }
    expect(sql).not.toMatch(/grant execute .*authenticated/i);
    expect(sql).not.toMatch(/grant execute .*anon/i);
  });

  it("keeps reserve atomic, deterministic, readiness-bound, and movement-versioned", () => {
    expect(sql).toContain("research_inventory_product_variant_ready");
    expect(sql).toContain("research_lot_is_allocatable");
    expect(sql).toMatch(/order by\s+least\(l\.expiry_date/);
    expect(sql).toContain("for update of l");
    expect(sql).toContain("public.research_apply_inventory_movement");
    expect(sql).toContain("research_lot_is_allocatable(v_lot.id, p_expires_at)");
    expect(sql).toContain("'reserve'");
    expect(sql).toContain("v_remaining <> 0");
    expect(sql).toContain("pg_advisory_xact_lock");
  });

  it("hashes command identity and stores only redacted replay receipts", () => {
    expect(sql).toContain("idempotency_key_hash");
    expect(sql).toContain("actor_member_scope_hash");
    expect(sql).toContain("redacted_result");
    expect(sql).toContain("xenios:inventory-reservation-scope:v1");
    expect(sql).toContain("xenios:inventory-reservation-command:reserve:v1");
    expect(sql).not.toMatch(/idempotency_key text not null/i);
    expect(sql).not.toMatch(/actor_id text not null/i);
    expect(sql).toContain("inventory reservation events are immutable");
  });

  it("enforces terminal transitions and exposure-reducing release behavior", () => {
    expect(sql).toContain("status in ('held', 'released', 'finalized', 'expired')");
    expect(sql).toContain("status <> 'held'");
    expect(sql).toContain("expires_at <= p_at");
    expect(sql).toContain("expires_at > p_at");
    expect(sql).toContain("quantity_quarantined = v_quarantined");
    expect(sql).toContain("research_lot_quality_ready");
    expect(sql).toContain("status = 'finalized'");
    expect(sql).toContain("status = 'expired'");
    expect(sql.match(/p_at < created_at/g)).toHaveLength(3);
    expect(sql.match(/p_at < updated_at/g)).toHaveLength(3);
  });

  it("serializes readiness invalidation and revalidates exact allocations before finalize", () => {
    expect(sql).toContain("research_inventory_readiness_serialization_guard");
    expect(sql).toContain(
      "research_inventory_lot_identity_serialization_guard",
    );
    expect(sql).toContain("xenios:inventory-readiness:v1|");
    expect(sql).toContain("xenios:inventory-product-readiness:v1|");
    expect(sql).toContain("xenios:inventory-variant-readiness:v1|");
    expect(sql).toContain("pg_advisory_xact_lock_shared");
    expect(sql).toContain("pg_try_advisory_xact_lock");
    expect(sql).toContain("research_inventory_lot_identity_serialization");
    expect(sql).toContain("research_reservation_quality_document_readiness_lock");
    expect(sql).toContain("research_reservation_quality_test_readiness_lock");
    expect(sql).toContain("research_reservation_product_readiness_lock");
    expect(sql).toContain("research_reservation_variant_readiness_lock");
    expect(sql).toContain(
      "readiness invalidation conflicts with an active inventory reservation",
    );
    expect(sql).toContain("array_agg(distinct r.sku order by r.sku) as skus");
    expect(sql).toContain("not public.research_lot_quality_ready(v_lot.id, p_at)");
  });

  it("forces RLS and leaves service role with SELECT plus reviewed RPCs only", () => {
    for (const table of [
      "research_lot_reservations",
      "research_lot_reservation_allocations",
      "research_inventory_reservation_events",
    ]) {
      expect(sql).toContain(`alter table public.${table} force row level security`);
      expect(sql).toMatch(
        new RegExp(
          `revoke all privileges on table public\\.${table} from service_role`,
          "i",
        ),
      );
    }
    expect(sql).toContain("grant select on table");
    expect(sql).not.toMatch(/grant (insert|update|delete|truncate|references|trigger)/i);
  });
});

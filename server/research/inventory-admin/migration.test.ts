import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(__dirname, "../../../supabase/research-inventory-lot-coa-admin.sql"),
  "utf8",
);

describe("Website 4 canonical inventory/lot/COA schema delta", () => {
  it("extends canonical commerce records and creates no parallel operations tables", () => {
    expect(sql).toContain("alter table public.research_inventory_lots");
    expect(sql).toContain("alter table public.research_lot_quality_documents");
    expect(sql).toContain("create table if not exists public.research_inventory_movements");
    expect(sql).not.toMatch(/research_operations_/i);
    expect(sql).not.toMatch(/create table if not exists public\.research_product/i);
  });

  it("makes quantities command-driven, versioned, idempotent, and append-only", () => {
    expect(sql).toContain("research_inventory_lots_quantity_invariant");
    expect(sql).toContain("research_apply_inventory_movement");
    expect(sql).toContain("inventory lot version conflict");
    expect(sql).toContain("idempotency key was reused");
    expect(sql).toContain("research_inventory_movements_no_update");
    expect(sql).toContain("before update or delete");
    expect(sql).toContain("reconcile is an explicit available-quantity delta");
    expect(sql).toContain("adjust is an explicit available-quantity delta");
    expect(sql).toContain("inventory quantities may change only through an atomic movement command");
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0))");
    expect(sql).toContain("research_inventory_lots_quantity_command_only");
    expect(sql).toContain("research_create_inventory_lot");
    expect(sql).toContain("'created', null, 'quarantined'");
    expect(sql).toContain("0, 0, 0, 0, 0, 1, false, 'none'");
    expect(sql).toContain("inventory expected version must be positive");
    expect(sql).toContain("illegal inventory lot disposition transition");
    expect(sql).toContain("'shipped', 'damaged', 'expired', 'recalled', 'destroyed'");
  });

  it("fails allocation closed for blocked dates, disposition, and exact-lot quality", () => {
    expect(sql).toContain("research_lot_is_allocatable");
    expect(sql).toContain("l.disposition = 'available'");
    expect(sql).toContain("l.expiry_date > p_as_of::date");
    expect(sql).toContain("research_inventory_product_variant_ready");
    expect(sql).toContain("from public.research_products p");
    expect(sql).toContain("join public.research_product_variants v");
    expect(sql).toContain("p.admin_status in ('approved', 'published')");
    expect(sql).toContain("v.status = 'approved'");
    expect(sql).not.toContain("select false;");
    expect(sql).toContain("d.published_at is not null");
    expect(sql).toContain("d.coa_on_file = true");
  });

  it("models missing test states without treating absence as passing", () => {
    for (const state of [
      "not_provided",
      "not_tested",
      "not_applicable",
      "under_review",
      "passed",
      "failed",
    ]) {
      expect(sql).toContain(`'${state}'`);
    }
    expect(sql).toContain("required exact-lot quality tests are not approved");
    expect(sql).toContain("research_lot_quality_tests_ready");
    expect(sql).toContain("t.state not in ('passed', 'not_applicable')");
    expect(sql).toContain("quality tests may change only during approval");
    expect(sql).toContain("research_lot_quality_tests_command_only");
    expect(sql).toContain("research_prepare_lot_quality_upload");
    expect(sql).toContain("prepared_document.superseded_at is not null");
    expect(sql).toContain("replaces_document_id");
    expect(sql).toContain("prior.event_type <> 'upload_referenced'");
    expect(sql).toContain("'superseded'");
    expect(sql).toContain("superseded COA records are terminal");
    expect(sql).toContain("withdrawn or rejected COA records are terminal");
    expect(sql).toContain("only an unconfirmed pending COA can be confirmed");
    expect(sql).toContain("only a confirmed pending COA can be reviewed");
    expect(sql).toContain("only one approved unpublished COA can be published");
    expect(sql).toContain("lot quality expected version must be positive");
    expect(sql).toContain(
      "if p_action not in ('confirm_upload', 'approve', 'reject', 'publish', 'withdraw')",
    );
  });

  it("forces RLS, removes browser grants, and restricts private Storage references", () => {
    for (const table of [
      "research_inventory_lots",
      "research_lot_quality_documents",
      "research_lot_allocations",
      "research_inventory_movements",
      "research_inventory_lot_events",
      "research_lot_quality_tests",
      "research_lot_quality_events",
      "research_lot_quality_access_events",
    ]) {
      expect(sql).toContain(`alter table public.${table} force row level security`);
      expect(sql).toMatch(
        new RegExp(`revoke all on table public\\.${table}\\s+from public, anon, authenticated`, "i"),
      );
    }
    expect(sql).toContain("bucket_id = 'research-coa-production'");
    expect(sql).toContain("private_storage_key like 'lots/%'");
    expect(sql).toContain("content_type = 'application/pdf'");
    expect(sql).toContain("grant select on table public.research_inventory_lots");
    expect(sql).not.toContain("grant select, insert on table public.research_inventory_lots");
    expect(sql).toContain("grant execute on function public.research_create_inventory_lot");
    expect(sql).toContain("grant execute on function public.research_prepare_lot_quality_upload");
    expect(sql).not.toContain("grant select, insert, update, delete on table public.research_inventory_lots");
    expect(sql).toContain("grant execute on function public.research_apply_inventory_movement");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("research_lot_quality_document_command_only");
    expect(sql).toContain("quality records may change only through a reviewed quality command");
    expect(sql).toContain(
      "revoke all privileges on table public.research_lot_quality_documents from service_role",
    );
    expect(sql).not.toContain(
      "grant select, insert, update on table public.research_lot_quality_documents",
    );
    expect(sql).toContain("research_authorize_lot_quality_access");
    expect(sql).toContain("research_lot_quality_access_events_no_update");
  });
});

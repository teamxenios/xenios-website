import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("unregistered D/E descriptor candidate source boundary", () => {
  const candidate = readFileSync("supabase/candidates/20261005_research_product_media_descriptor.sql", "utf8");
  it("preserves legacy rows and binds populated descriptors to an exact variant", () => {
    expect(candidate).toContain("foreign key (product_id, variant_id)");
    expect(candidate).toContain("references public.research_product_variants(product_id, id)");
    for (const field of ["variant_id", "width", "height", "content_sha256", "illustrative"]) {
      expect(candidate).toContain(`${field} is null`);
      expect(candidate).toContain(`${field} is not null`);
    }
    expect(candidate).toContain("width = 1024 and height = 1024");
    expect(candidate).toContain("'^[a-f0-9]{64}$'");
    expect(candidate).toContain("media_descriptor_requires_review");
    expect(candidate).not.toMatch(/security definer|insert into|update public\.|delete from|grant /i);
  });
  it("does not enter the managed migration ledger or DAG", () => {
    for (const file of ["supabase/MIGRATIONS.md", "docs/coordination/MIGRATION_DAG.json"]) {
      expect(readFileSync(file, "utf8")).not.toContain("20261005_research_product_media_descriptor");
    }
  });
});

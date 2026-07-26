import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  SupabaseBiomarkerUploadProvider,
  SupabasePrivateCertificateProvider,
} from "./production-deps";

describe("Website 3 production migration", () => {
  const sql = readFileSync(
    resolve(__dirname, "../../../supabase/research-products-diagnostics.sql"),
    "utf8",
  );

  it("extends the canonical lot architecture instead of creating a parallel one", () => {
    expect(sql).toContain("alter table public.research_lot_quality_documents");
    expect(sql).toContain("references public.research_inventory_lots(id)");
    expect(sql).not.toMatch(/create table if not exists public\.research_product_lots/i);
    expect(sql).not.toMatch(/create table if not exists public\.research_product_certificates/i);
  });

  it("creates durable diagnostics/config records with RLS and no browser table grants", () => {
    const tables = [
      "research_certificate_access_audit",
      "research_metabolic_pathways",
      "research_metabolic_interests",
      "research_superpower_offers",
      "research_biomarker_records",
      "research_biomarker_uploads",
      "research_product_content",
    ];
    for (const table of tables) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(
        `alter table public.${table} enable row level security`,
      );
      expect(sql).toContain(
        `alter table public.${table} force row level security`,
      );
      expect(sql).toMatch(
        new RegExp(`revoke all on table public\\.${table}\\s+from public, anon, authenticated`, "i"),
      );
    }
  });

  it("keeps storage private and confirmation service-role only", () => {
    expect(sql).toContain("'research-coa-production'");
    expect(sql).toContain("'research-biomarker-reports-production'");
    expect(sql).toContain("public = false");
    expect(sql).toContain("research_confirm_biomarker_upload");
    expect(sql).toMatch(/revoke all on function public\.research_confirm_biomarker_upload[\s\S]*from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.research_confirm_biomarker_upload[\s\S]*to service_role/i);
  });
});

function storageDb(bucket: Record<string, unknown>) {
  return {
    storage: {
      from: vi.fn(() => bucket),
    },
  } as never;
}

describe("Website 3 private Storage providers", () => {
  it("mints no biomarker upload grant while the capability is disabled", async () => {
    const bucket = {
      createSignedUploadUrl: vi.fn(),
    };
    const provider = new SupabaseBiomarkerUploadProvider(
      storageDb(bucket),
      "research-biomarker-reports-production",
      false,
    );

    await expect(provider.createPrivateUpload({
      memberId: "member-1",
      storageKey: "biomarker-reports/member/file.pdf",
      contentType: "application/pdf",
      sizeBytes: 5,
      expiresInSeconds: 60,
    })).resolves.toEqual({ ok: false, code: "disabled" });
    expect(bucket.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("verifies declared metadata and the actual file signature", async () => {
    const bytes = new TextEncoder().encode("%PDF-example");
    const bucket = {
      info: vi.fn(async () => ({
        data: { size: bytes.byteLength, contentType: "application/pdf" },
        error: null,
      })),
      download: vi.fn(async () => ({
        data: new Blob([bytes], { type: "application/pdf" }),
        error: null,
      })),
      remove: vi.fn(async () => ({ data: [], error: null })),
    };
    const provider = new SupabaseBiomarkerUploadProvider(
      storageDb(bucket),
      "research-biomarker-reports-production",
      true,
    );

    await expect(provider.verifyPrivateUpload({
      memberId: "member-1",
      storageKey: "biomarker-reports/member/file.pdf",
      contentType: "application/pdf",
      sizeBytes: bytes.byteLength,
    })).resolves.toEqual({ ok: true });
    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it("removes an object whose bytes do not match its declared type", async () => {
    const bytes = new TextEncoder().encode("not-a-pdf");
    const bucket = {
      info: vi.fn(async () => ({
        data: { size: bytes.byteLength, contentType: "application/pdf" },
        error: null,
      })),
      download: vi.fn(async () => ({
        data: new Blob([bytes], { type: "application/pdf" }),
        error: null,
      })),
      remove: vi.fn(async () => ({ data: [], error: null })),
    };
    const provider = new SupabaseBiomarkerUploadProvider(
      storageDb(bucket),
      "research-biomarker-reports-production",
      true,
    );

    await expect(provider.verifyPrivateUpload({
      memberId: "member-1",
      storageKey: "biomarker-reports/member/file.pdf",
      contentType: "application/pdf",
      sizeBytes: bytes.byteLength,
    })).resolves.toEqual({ ok: false, code: "object_mismatch" });
    expect(bucket.remove).toHaveBeenCalledWith([
      "biomarker-reports/member/file.pdf",
    ]);
  });

  it("keeps COA access data-gated and signs only a safe private object path", async () => {
    const bucket = {
      createSignedUrl: vi.fn(async () => ({
        data: { signedUrl: "https://storage.example/signed" },
        error: null,
      })),
    };
    const disabled = new SupabasePrivateCertificateProvider(
      storageDb(bucket),
      "research-coa-production",
      false,
    );
    await expect(disabled.createSignedReadUrl({
      storageKey: "lots/lot-1/coa.pdf",
      memberId: "member-1",
      certificateId: "certificate-1",
      expiresInSeconds: 300,
    })).resolves.toEqual({ ok: false, code: "disabled" });

    const enabled = new SupabasePrivateCertificateProvider(
      storageDb(bucket),
      "research-coa-production",
      true,
    );
    const result = await enabled.createSignedReadUrl({
      storageKey: "lots/lot-1/coa.pdf",
      memberId: "member-1",
      certificateId: "certificate-1",
      expiresInSeconds: 300,
    });
    expect(result.ok).toBe(true);
    expect(bucket.createSignedUrl).toHaveBeenCalledWith(
      "lots/lot-1/coa.pdf",
      300,
    );
  });
});

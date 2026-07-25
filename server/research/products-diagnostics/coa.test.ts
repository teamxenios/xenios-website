import { describe, expect, it } from "vitest";
import {
  COA_LIMITATION_NOTICE,
  DisabledPrivateCertificateProvider,
  ExactLotCertificateService,
  MemoryCertificateAudit,
  type PrivateCertificateProvider,
} from "./coa";
import type {
  ProductCertificateRecord,
  ProductLotRecord,
  ProductVariantRecord,
} from "./model";

const at = "2026-07-25T12:00:00.000Z";
const variant: ProductVariantRecord = {
  variantId: "variant_p001",
  productId: "product_p001",
  sku: "P001",
  label: "Primary",
  attributes: {},
  createdAt: at,
  updatedAt: at,
};
const lot: ProductLotRecord = {
  lotId: "lot_001",
  variantId: variant.variantId,
  lotCode: "LOT-ALPHA",
  state: "released",
  receivedAt: at,
  expiresAt: null,
  createdAt: at,
  updatedAt: at,
};
const certificate: ProductCertificateRecord = {
  certificateId: "certificate_001",
  lotId: lot.lotId,
  documentType: "certificate_of_analysis",
  documentState: "available",
  privateStorageKey: "private/coa/lot-alpha.pdf",
  verificationState: "document_on_file",
  reviewedAt: at,
  createdAt: at,
  updatedAt: at,
};

function provider(): PrivateCertificateProvider {
  return {
    async createSignedReadUrl(input) {
      expect(input.storageKey).toBe("private/coa/lot-alpha.pdf");
      expect(input.expiresInSeconds).toBe(300);
      return {
        ok: true,
        signedUrl: "https://signed.example/private-document",
        expiresAt: "2026-07-25T12:05:00.000Z",
      };
    },
  };
}

describe("exact-lot certificate access", () => {
  it("grants signed private access only when SKU and exact lot match", async () => {
    const audit = new MemoryCertificateAudit();
    const service = new ExactLotCertificateService(
      [variant],
      [lot],
      [certificate],
      provider(),
      audit,
      () => new Date(at),
    );
    const result = await service.requestAccess({
      actor: { memberId: "member_1", active: true },
      sku: "P001",
      lotCode: "LOT-ALPHA",
    });
    expect(result).toMatchObject({
      ok: true,
      lotCode: "LOT-ALPHA",
      notice: COA_LIMITATION_NOTICE,
    });
    expect(audit.events[0]).toMatchObject({
      certificateId: "certificate_001",
      lotId: "lot_001",
      outcome: "granted",
      reason: "exact_lot_match",
    });
  });

  it("does not fall back to a certificate for a different lot", async () => {
    const service = new ExactLotCertificateService(
      [variant],
      [lot],
      [certificate],
      provider(),
      new MemoryCertificateAudit(),
    );
    await expect(
      service.requestAccess({
        actor: { memberId: "member_1", active: true },
        sku: "P001",
        lotCode: "LOT-BETA",
      }),
    ).resolves.toMatchObject({ ok: false, code: "lot_not_found" });
  });

  it("reports documentation pending without claiming verification", async () => {
    const pending = {
      ...certificate,
      documentState: "pending" as const,
      privateStorageKey: null,
      verificationState: "review_pending" as const,
    };
    const service = new ExactLotCertificateService(
      [variant],
      [lot],
      [pending],
      provider(),
      new MemoryCertificateAudit(),
    );
    await expect(
      service.requestAccess({
        actor: { memberId: "member_1", active: true },
        sku: "P001",
        lotCode: "LOT-ALPHA",
      }),
    ).resolves.toMatchObject({ ok: false, code: "documentation_pending" });
  });

  it("fails closed when private signed access is disabled", async () => {
    const service = new ExactLotCertificateService(
      [variant],
      [lot],
      [certificate],
      new DisabledPrivateCertificateProvider(),
      new MemoryCertificateAudit(),
    );
    await expect(
      service.requestAccess({
        actor: { memberId: "member_1", active: true },
        sku: "P001",
        lotCode: "LOT-ALPHA",
      }),
    ).resolves.toMatchObject({ ok: false, code: "private_access_unavailable" });
  });
});


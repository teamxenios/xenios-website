import { describe, expect, it } from "vitest";

import { MediaProvenanceViolation, type ProductMediaAssetInput, type RightsRecord } from "@shared/research/product-media/types";
import { PHOTOGRAPHIC_SOURCE_TYPES, RIGHTS_STATUSES } from "@shared/research/product-media/types";
import { productImageManifest } from "@shared/research/product-media/manifest";

import { MediaRegistryRefusal, ProductMediaRegistry } from "./registry";

const GRANT: RightsRecord = {
  recordId: "RGT-77",
  holder: "Momentous",
  grantedOn: "2026-05-04",
  expiresOn: null,
  evidenceRef: "vault://rights/RGT-77.pdf",
  scope: "product_photography",
};

function input(overrides: Partial<ProductMediaAssetInput> = {}): ProductMediaAssetInput {
  return {
    assetId: "AST-1",
    productId: "PEP-001",
    variantId: "15 mg / 15 mg",
    role: "detail_hero",
    sourceType: "xenios_generated_render",
    rightsStatus: "RIGHTS_NOT_REQUIRED",
    identityStatus: "PENDING_VERIFICATION",
    declaredStrength: "15 mg / 15 mg",
    altText: "BPC-157 + TB-500 Research Blend 15 mg / 15 mg",
    publicStatus: "PENDING_APPROVAL",
    ...overrides,
  };
}

describe("the registry binds an asset to an exact manifest row", () => {
  it("registers a render against a real workbook row", () => {
    const registry = new ProductMediaRegistry();
    const asset = registry.register(input());
    expect(asset.provenanceTag).toBe("generated_product_render");
    expect(registry.get("AST-1")).toBe(asset);
    expect(registry.all().length).toBe(1);
  });

  it("refuses an asset that names no manifest row", () => {
    const registry = new ProductMediaRegistry();
    expect(() => registry.register(input({ productId: "NOT-A-SKU" }))).toThrow(MediaRegistryRefusal);
    expect(() => registry.register(input({ variantId: "999 mg" }))).toThrow(/no manifest row/i);
    expect(registry.all().length).toBe(0);
  });

  it("refuses a duplicate asset id", () => {
    const registry = new ProductMediaRegistry();
    registry.register(input());
    expect(() => registry.register(input({ productId: "PEP-002", variantId: "10 mg / 10 mg / 50 mg" }))).toThrow(
      /already registered/i,
    );
  });

  it("refuses any imagery on a competitor expansion candidate", () => {
    const manifest = productImageManifest();
    const candidate = manifest.find((entry) => entry.isExpansionCandidate);
    expect(candidate).toBeDefined();
    const registry = new ProductMediaRegistry();
    expect(() =>
      registry.register(
        input({
          productId: candidate!.sku,
          variantId: candidate!.variant,
          declaredStrength: null,
          altText: candidate!.altText,
        }),
      ),
    ).toThrow(/expansion candidate/i);
  });
});

// The lane's central rule at the write boundary. The registry is the only door,
// and the door refuses a supplier photograph claim without evidence.
describe("no code path records a supplier photograph without a rights record", () => {
  it("refuses every photographic source across every rights status without a record", () => {
    const registry = new ProductMediaRegistry();
    for (const sourceType of PHOTOGRAPHIC_SOURCE_TYPES) {
      for (const rightsStatus of RIGHTS_STATUSES) {
        const result = registry.tryRegister(
          input({ assetId: `AST-${sourceType}-${rightsStatus}`, sourceType, rightsStatus, rightsRecord: null }),
        );
        expect(result.ok, `${sourceType} / ${rightsStatus}`).toBe(false);
      }
    }
    expect(registry.all().length).toBe(0);
  });

  it("refuses a generated render that claims a supplier photograph tag", () => {
    const registry = new ProductMediaRegistry();
    const smuggled = { ...input(), provenanceTag: "supplier_photograph" } as ProductMediaAssetInput;
    const asset = registry.register(smuggled);
    expect(asset.provenanceTag).toBe("generated_product_render");
  });

  it("accepts a brand photograph once the rights record exists", () => {
    const registry = new ProductMediaRegistry();
    const asset = registry.register(
      input({ sourceType: "official_brand", rightsStatus: "RIGHTS_ON_FILE", rightsRecord: GRANT }),
    );
    expect(asset.provenanceTag).toBe("supplier_photograph");
    expect(asset.rightsRecord?.recordId).toBe("RGT-77");
  });

  it("reports the refusal code instead of throwing when asked to", () => {
    const registry = new ProductMediaRegistry();
    const result = registry.tryRegister(input({ sourceType: "official_brand", rightsStatus: "RIGHTS_REQUESTED" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("PHOTOGRAPH_WITHOUT_RIGHTS_ON_FILE");
    }
  });

  it("still throws for an error that is not a refusal", () => {
    const registry = new ProductMediaRegistry();
    expect(() => registry.register(input({ altText: "" }))).toThrow(MediaProvenanceViolation);
  });
});

describe("the registry refuses a strength that is not the variant's", () => {
  it("refuses a 10 mg vial on a 15 mg / 15 mg variant", () => {
    const registry = new ProductMediaRegistry();
    expect(() => registry.register(input({ declaredStrength: "10 mg" }))).toThrow(/never display a strength/i);
  });

  it("refuses a strength claim on a format variant", () => {
    const manifest = productImageManifest();
    const format = manifest.find((entry) => entry.variant === "Capsules" && !entry.isExpansionCandidate);
    expect(format).toBeDefined();
    const registry = new ProductMediaRegistry();
    expect(() =>
      registry.register(
        input({ productId: format!.sku, variantId: "Capsules", declaredStrength: "500 mg", altText: format!.altText }),
      ),
    ).toThrow(/never display a strength/i);
  });

  it("accepts a matching strength written differently", () => {
    const registry = new ProductMediaRegistry();
    const asset = registry.register(input({ declaredStrength: "15mg/15mg" }));
    expect(asset.declaredStrength).toBe("15mg/15mg");
  });
});

describe("the registry refuses competitor provenance and duplicated bytes", () => {
  it("refuses a file path that names a competitor", () => {
    const registry = new ProductMediaRegistry();
    expect(() =>
      registry.register(input({ filePath: "media/reference/FastTrack/vial.webp" })),
    ).toThrow(/never reused/i);
  });

  it("refuses the same bytes labelled as a second product", () => {
    const registry = new ProductMediaRegistry();
    registry.register(input({ checksum: "sha256:same" }));
    expect(() =>
      registry.register(
        input({
          assetId: "AST-2",
          productId: "PEP-002",
          variantId: "10 mg / 10 mg / 50 mg",
          declaredStrength: "10 mg / 10 mg / 50 mg",
          checksum: "sha256:same",
        }),
      ),
    ).toThrow(/One file, one claim/);
  });

  it("allows a second crop of the same product at the same strength", () => {
    const registry = new ProductMediaRegistry();
    registry.register(input({ checksum: "sha256:same" }));
    const second = registry.register(input({ assetId: "AST-2", role: "card", checksum: "sha256:same" }));
    expect(second.assetId).toBe("AST-2");
  });
});

describe("reads", () => {
  it("returns an empty list rather than a placeholder when we hold nothing", () => {
    const registry = new ProductMediaRegistry();
    expect(registry.publishedFor("PEP-001", "15 mg / 15 mg")).toEqual([]);
    expect(registry.get("nope")).toBeUndefined();
  });

  it("verifies its own contents against the manifest", () => {
    const registry = new ProductMediaRegistry();
    registry.register(input());
    const report = registry.verify();
    expect(report.assetsChecked).toBe(1);
    expect(report.rowsChecked).toBe(1179);
    expect(report.findings.filter((item) => item.assetId === "AST-1")).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import {
  createProductMediaAsset,
  isCompleteRightsRecord,
  isPhotographicSource,
  reclassifySourceType,
  rightsViolationFor,
} from "./asset";
import {
  MEDIA_SOURCE_TYPES,
  MediaProvenanceViolation,
  PHOTOGRAPHIC_SOURCE_TYPES,
  RIGHTS_STATUSES,
  provenanceTagFor,
  type MediaSourceType,
  type ProductMediaAssetInput,
  type RightsRecord,
  type RightsStatus,
} from "./types";

const GRANT: RightsRecord = {
  recordId: "RGT-1001",
  holder: "Momentous",
  grantedOn: "2026-05-04",
  expiresOn: null,
  evidenceRef: "vault://rights/RGT-1001.pdf",
  scope: "product_photography",
};

function baseInput(overrides: Partial<ProductMediaAssetInput> = {}): ProductMediaAssetInput {
  return {
    assetId: "AST-1",
    productId: "PEP-001",
    variantId: "15 mg / 15 mg",
    role: "detail_hero",
    sourceType: "xenios_generated_render",
    rightsStatus: "RIGHTS_NOT_REQUIRED",
    identityStatus: "PENDING_VERIFICATION",
    altText: "BPC-157 + TB-500 Research Blend 15 mg / 15 mg",
    publicStatus: "PENDING_APPROVAL",
    ...overrides,
  };
}

describe("provenance derivation", () => {
  it("tags a Xenios render as generated_product_render and never as a photograph", () => {
    const asset = createProductMediaAsset(baseInput());
    expect(asset.provenanceTag).toBe("generated_product_render");
    expect(asset.sourceType).toBe("xenios_generated_render");
  });

  it("derives the tag from the source type for every source type", () => {
    expect(provenanceTagFor("official_brand")).toBe("supplier_photograph");
    expect(provenanceTagFor("licensed_supplier")).toBe("supplier_photograph");
    expect(provenanceTagFor("commissioned_photography")).toBe("commissioned_photograph");
    expect(provenanceTagFor("xenios_generated_render")).toBe("generated_product_render");
    expect(provenanceTagFor("internal_placeholder")).toBe("internal_placeholder");
  });

  it("ignores a provenance tag a caller tries to smuggle in", () => {
    const smuggled = {
      ...baseInput(),
      provenanceTag: "supplier_photograph",
    } as ProductMediaAssetInput;
    const asset = createProductMediaAsset(smuggled);
    expect(asset.provenanceTag).toBe("generated_product_render");
  });
});

// The lane's central rule, stated as an exhaustive matrix rather than a spot
// check: for every source type and every rights status, a supplier photograph
// claim is only constructible with a complete rights record on file.
describe("no supplier photograph without a rights record", () => {
  it("refuses every photographic source type across every rights status without a record", () => {
    for (const sourceType of PHOTOGRAPHIC_SOURCE_TYPES) {
      for (const rightsStatus of RIGHTS_STATUSES) {
        const code = rightsViolationFor(sourceType, rightsStatus, null);
        expect(code, `${sourceType} / ${rightsStatus} must be refused without a record`).not.toBeNull();

        expect(() =>
          createProductMediaAsset(baseInput({ sourceType, rightsStatus, rightsRecord: null })),
        ).toThrow(MediaProvenanceViolation);
      }
    }
  });

  it("refuses a photographic source with an incomplete rights record", () => {
    const incomplete: RightsRecord[] = [
      { ...GRANT, recordId: "" },
      { ...GRANT, holder: "   " },
      { ...GRANT, grantedOn: "" },
      { ...GRANT, evidenceRef: "" },
    ];
    for (const record of incomplete) {
      expect(isCompleteRightsRecord(record)).toBe(false);
      expect(() =>
        createProductMediaAsset(
          baseInput({ sourceType: "official_brand", rightsStatus: "RIGHTS_ON_FILE", rightsRecord: record }),
        ),
      ).toThrow(MediaProvenanceViolation);
    }
  });

  it("refuses RIGHTS_NOT_REQUIRED as a shortcut on a photographic source", () => {
    expect(() =>
      createProductMediaAsset(
        baseInput({ sourceType: "licensed_supplier", rightsStatus: "RIGHTS_NOT_REQUIRED", rightsRecord: GRANT }),
      ),
    ).toThrow(/PHOTOGRAPH_CLAIMS_RIGHTS_NOT_REQUIRED|rights/i);
  });

  it("accepts a photographic source only with RIGHTS_ON_FILE and a complete record", () => {
    const asset = createProductMediaAsset(
      baseInput({ sourceType: "official_brand", rightsStatus: "RIGHTS_ON_FILE", rightsRecord: GRANT }),
    );
    expect(asset.provenanceTag).toBe("supplier_photograph");
    expect(asset.rightsRecord?.evidenceRef).toBe("vault://rights/RGT-1001.pdf");
  });

  it("refuses a third party rights claim on Xenios owned pixels", () => {
    for (const sourceType of ["xenios_generated_render", "internal_placeholder"] as MediaSourceType[]) {
      expect(rightsViolationFor(sourceType, "RIGHTS_ON_FILE", GRANT)).toBe(
        "XENIOS_OWNED_SOURCE_CLAIMS_THIRD_PARTY_RIGHTS",
      );
      expect(rightsViolationFor(sourceType, "RIGHTS_NOT_REQUIRED", GRANT)).toBe(
        "XENIOS_OWNED_SOURCE_CARRIES_RIGHTS_RECORD",
      );
    }
  });

  it("covers every declared source type in the photographic partition", () => {
    for (const sourceType of MEDIA_SOURCE_TYPES) {
      const photographic = isPhotographicSource(sourceType);
      expect(photographic).toBe(PHOTOGRAPHIC_SOURCE_TYPES.includes(sourceType));
      if (!photographic) {
        expect(rightsViolationFor(sourceType, "RIGHTS_NOT_REQUIRED", null)).toBeNull();
      }
    }
  });
});

describe("reclassification cannot upgrade a claim", () => {
  it("refuses to relabel a generated render as a supplier photograph", () => {
    const render = createProductMediaAsset(baseInput());
    for (const sourceType of PHOTOGRAPHIC_SOURCE_TYPES) {
      expect(() =>
        reclassifySourceType(render, sourceType, { rightsStatus: "RIGHTS_ON_FILE", rightsRecord: GRANT }),
      ).toThrow(/PROVENANCE_UPGRADE_REFUSED|cannot be relabelled/);
    }
  });

  it("refuses to relabel a placeholder as a photograph", () => {
    const placeholder = createProductMediaAsset(
      baseInput({ assetId: "AST-PH", sourceType: "internal_placeholder", rightsStatus: "RIGHTS_NOT_REQUIRED" }),
    );
    expect(() =>
      reclassifySourceType(placeholder, "official_brand", { rightsStatus: "RIGHTS_ON_FILE", rightsRecord: GRANT }),
    ).toThrow(MediaProvenanceViolation);
  });

  it("allows a photograph to move between photographic sources with fresh evidence", () => {
    const brand = createProductMediaAsset(
      baseInput({ sourceType: "official_brand", rightsStatus: "RIGHTS_ON_FILE", rightsRecord: GRANT }),
    );
    const commissioned = reclassifySourceType(brand, "commissioned_photography", {
      rightsStatus: "RIGHTS_ON_FILE",
      rightsRecord: { ...GRANT, recordId: "RGT-2002", holder: "Xenios commissioned shoot" },
    });
    expect(commissioned.provenanceTag).toBe("commissioned_photograph");
    expect(commissioned.version).toBe(brand.version + 1);
    expect(commissioned.publicStatus).toBe("PENDING_APPROVAL");
    expect(commissioned.approvalOwner).toBeNull();
  });

  it("allows a downgrade to a placeholder", () => {
    const brand = createProductMediaAsset(
      baseInput({ sourceType: "official_brand", rightsStatus: "RIGHTS_ON_FILE", rightsRecord: GRANT }),
    );
    const downgraded = reclassifySourceType(brand, "internal_placeholder", {
      rightsStatus: "RIGHTS_NOT_REQUIRED",
      rightsRecord: null,
    });
    expect(downgraded.provenanceTag).toBe("internal_placeholder");
  });

  it("is a no-op when the source type is unchanged", () => {
    const render = createProductMediaAsset(baseInput());
    expect(reclassifySourceType(render, "xenios_generated_render", {
      rightsStatus: "RIGHTS_NOT_REQUIRED",
      rightsRecord: null,
    })).toBe(render);
  });
});

describe("publishing preconditions", () => {
  const published = (overrides: Partial<ProductMediaAssetInput>) =>
    createProductMediaAsset(
      baseInput({
        sourceType: "official_brand",
        rightsStatus: "RIGHTS_ON_FILE",
        rightsRecord: GRANT,
        identityStatus: "VERIFIED_EXACT_VARIANT",
        checksum: "sha256:abc",
        filePath: "media/pep-001/hero.webp",
        approvalOwner: "Samuel Boadu",
        approvalDate: "2026-08-01",
        publicStatus: "PUBLISHED",
        ...overrides,
      }),
    );

  it("publishes when every precondition holds", () => {
    expect(published({}).publicStatus).toBe("PUBLISHED");
  });

  it("refuses to publish a placeholder", () => {
    expect(() =>
      createProductMediaAsset(
        baseInput({
          sourceType: "internal_placeholder",
          rightsStatus: "RIGHTS_NOT_REQUIRED",
          identityStatus: "VERIFIED_EXACT_VARIANT",
          checksum: "sha256:abc",
          filePath: "media/placeholder.webp",
          approvalOwner: "Samuel Boadu",
          approvalDate: "2026-08-01",
          publicStatus: "PUBLISHED",
        }),
      ),
    ).toThrow(/PUBLISHED_PLACEHOLDER|placeholder/);
  });

  it("refuses to publish without verified identity, bytes, or a named approver", () => {
    expect(() => published({ identityStatus: "PENDING_VERIFICATION" })).toThrow(/identity|exact product/i);
    expect(() => published({ checksum: null })).toThrow(/checksum|stored file/i);
    expect(() => published({ filePath: "  " })).toThrow(/checksum|stored file/i);
    expect(() => published({ approvalOwner: null })).toThrow(/approver/i);
    expect(() => published({ approvalDate: "" })).toThrow(/approver/i);
  });
});

describe("basic field discipline", () => {
  it("refuses blank ids and blank alt text", () => {
    expect(() => createProductMediaAsset(baseInput({ assetId: " " }))).toThrow(/id/i);
    expect(() => createProductMediaAsset(baseInput({ productId: "" }))).toThrow(/product/i);
    expect(() => createProductMediaAsset(baseInput({ altText: "   " }))).toThrow(/alt text/i);
  });

  it("refuses impossible numbers", () => {
    expect(() => createProductMediaAsset(baseInput({ version: 0 }))).toThrow(/version/i);
    expect(() => createProductMediaAsset(baseInput({ byteSize: -1 }))).toThrow(/byte size/i);
    expect(() =>
      createProductMediaAsset(baseInput({ crop: { focal: { x: 1.5, y: 0.5 }, authoredAspect: 1 } })),
    ).toThrow(/focal/i);
    expect(() =>
      createProductMediaAsset(baseInput({ crop: { focal: { x: 0.5, y: 0.5 }, authoredAspect: 0 } })),
    ).toThrow(/aspect/i);
  });

  it("defaults every optional field to an absence, never to a placeholder value", () => {
    const asset = createProductMediaAsset(baseInput());
    expect(asset.checksum).toBeNull();
    expect(asset.filePath).toBeNull();
    expect(asset.byteSize).toBeNull();
    expect(asset.declaredStrength).toBeNull();
    expect(asset.approvalOwner).toBeNull();
    expect(asset.approvalDate).toBeNull();
    expect(asset.version).toBe(1);
  });
});

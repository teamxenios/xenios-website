// xenios research: the forgery this module exists to make impossible.
//
// QA did not describe the hole, they built it. The exact object they constructed
// is reproduced below, field for field:
//
//   sourceType     "xenios_generated_render"
//   provenanceTag  "supplier_photograph"
//   rightsRecord   null
//   publicStatus   "PUBLISHED"
//   approvalOwner  null
//
// It constructed cleanly, it typechecked, and `isPublishable` returned true. That
// is a drawing we made, published to a reader as a photograph of the real product
// supplied by the party that makes it, with nobody's name on the approval and no
// rights on file. It is the image system's version of writing a certificate of
// analysis we do not hold.
//
// Every test here asserts a refusal. If any of them starts passing trivially,
// something in the guard was removed.

import { describe, expect, it } from "vitest";

import { createProductMediaAsset } from "./asset";
import type { ManifestEntry } from "./manifest";
import {
  MediaProvenanceViolation,
  provenanceViolationIn,
  sealProductMediaAsset,
  type ProductMediaAsset,
  type SealableAssetFields,
} from "./types";
import { isPublishable, verifyProductMedia } from "./verification";

const PRODUCT_ID = "PEP-001";
const VARIANT_ID = "15 mg / 15 mg";

function entry(overrides: Partial<ManifestEntry> = {}): ManifestEntry {
  return {
    imageId: "IMG-00001",
    category: "Peptides & Research",
    sku: PRODUCT_ID,
    product: "BPC-157 + TB-500 Research Blend",
    variant: VARIANT_ID,
    requiredAssets: "Transparent vial PNG; catalog WebP",
    sourceRights: "Xenios / Renew-style rendered vial after exact identity approval",
    identityRule: "Exact product and variant required",
    accessState: "Approval required",
    currentImageState: "Blocked if identity/strength/label unresolved",
    priority: "P0",
    filePath: null,
    altText: "BPC-157 + TB-500 Research Blend 15 mg / 15 mg",
    approver: "Product + Brand + Quality",
    status: "Needed",
    rightsPath: "XENIOS_GENERATED_RENDER",
    coverageState: "BLOCKED_ON_IDENTITY",
    variantCarriesStrength: true,
    isExpansionCandidate: false,
    ...overrides,
  };
}

/** The fields QA used, minus the provenance tag the seal derives. */
const QA_FIELDS: SealableAssetFields = {
  assetId: "AST-FORGED",
  productId: PRODUCT_ID,
  variantId: VARIANT_ID,
  role: "detail_hero",
  sourceType: "xenios_generated_render",
  rightsStatus: "RIGHTS_NOT_REQUIRED",
  rightsRecord: null,
  identityStatus: "VERIFIED_EXACT_VARIANT",
  declaredStrength: VARIANT_ID,
  version: 1,
  checksum: "sha256:forged",
  filePath: "media/pep-001/render.webp",
  byteSize: 120_000,
  contentType: "image/webp",
  altText: "BPC-157 + TB-500 Research Blend 15 mg / 15 mg",
  crop: null,
  publicStatus: "PUBLISHED",
  approvalOwner: null,
  approvalDate: null,
};

/**
 * QA's asset exactly as it was: the tag forced on, no rights record, published,
 * nobody accountable. It can only be built now by asserting past the type, which
 * is the point: this value is what a database row or a JSON payload could look
 * like, and the read path has to refuse it on its own.
 */
const QA_FORGERY = {
  ...QA_FIELDS,
  provenanceTag: "supplier_photograph",
} as unknown as ProductMediaAsset;

/**
 * The hardest version of the forgery: everything else immaculate. A named
 * approver, a real approval date, identity verified against the exact variant,
 * bytes and a checksum on file, a rights position consistent with a Xenios owned
 * render. The only thing wrong is the claim on the label.
 *
 * Nothing but the provenance rule can refuse this one, which is what makes it the
 * test that proves the rule is load bearing rather than shadowed by a neighbour.
 */
const QA_FORGERY_OTHERWISE_IMMACULATE = {
  ...QA_FIELDS,
  assetId: "AST-FORGED-SIGNED",
  approvalOwner: "Samuel Boadu",
  approvalDate: "2026-08-01",
  provenanceTag: "supplier_photograph",
} as unknown as ProductMediaAsset;

describe("the QA forgery, at the constructor", () => {
  it("cannot even be asked for: the seal's parameter type has no provenance tag", () => {
    // The compile time half of the guarantee is asserted inside `types.ts`, not
    // here, because `tsconfig.json` excludes `**/*.test.ts` from `npm run check`
    // and a type claim no gate reads is not a guarantee. What this test can prove
    // is the field's absence at runtime, which is what a JavaScript caller sees.
    expect(Object.keys(QA_FIELDS)).not.toContain("provenanceTag");
  });

  it("refuses QA's exact object rather than returning it", () => {
    expect(() => sealProductMediaAsset(QA_FIELDS)).toThrow(MediaProvenanceViolation);
    try {
      sealProductMediaAsset(QA_FIELDS);
      expect.unreachable("the seal accepted a published asset with no named approver");
    } catch (error) {
      expect((error as MediaProvenanceViolation).code).toBe("PUBLISHED_WITHOUT_NAMED_APPROVAL");
    }
  });

  it("derives the tag from the source, so a smuggled tag cannot survive", () => {
    // Passed as a widened value, so the excess property check does not fire and we
    // are testing the runtime derivation rather than the compiler.
    const smuggled = {
      ...QA_FIELDS,
      approvalOwner: "Samuel Boadu",
      approvalDate: "2026-08-01",
      provenanceTag: "supplier_photograph",
    } as SealableAssetFields;

    const sealed = sealProductMediaAsset(smuggled);
    expect(sealed.provenanceTag).toBe("generated_product_render");
    expect(sealed.sourceType).toBe("xenios_generated_render");
  });

  it("refuses a supplier photograph claim with no rights record and no named approver", () => {
    // The mirror image of the forgery: claim the photograph honestly by source
    // type, and the rights gate is what stops it.
    expect(() =>
      createProductMediaAsset({
        ...QA_FIELDS,
        sourceType: "licensed_supplier",
        rightsStatus: "RIGHTS_ON_FILE",
        rightsRecord: null,
      }),
    ).toThrow(MediaProvenanceViolation);

    expect(() =>
      createProductMediaAsset({
        ...QA_FIELDS,
        sourceType: "licensed_supplier",
        rightsStatus: "RIGHTS_NOT_REQUIRED",
        rightsRecord: null,
      }),
    ).toThrow(MediaProvenanceViolation);
  });

  it("requires a named approval owner and date on every published asset", () => {
    expect(() =>
      createProductMediaAsset({ ...QA_FIELDS, approvalOwner: "Samuel Boadu", approvalDate: null }),
    ).toThrow(MediaProvenanceViolation);
    expect(() =>
      createProductMediaAsset({ ...QA_FIELDS, approvalOwner: "   ", approvalDate: "2026-08-01" }),
    ).toThrow(MediaProvenanceViolation);
  });
});

describe("the QA forgery, at the read path", () => {
  it("names the violation instead of accepting the record", () => {
    expect(provenanceViolationIn(QA_FORGERY)).toBe("PROVENANCE_TAG_DOES_NOT_FOLLOW_FROM_SOURCE");
  });

  it("is not publishable, which was the assertion QA got wrong", () => {
    expect(isPublishable(QA_FORGERY, entry())).toBe(false);
  });

  it("is reported as a blocking finding by verification", () => {
    const report = verifyProductMedia({ manifest: [entry()], assets: [QA_FORGERY] });
    const forged = report.findings.filter((item) => item.code === "UNSUPPORTED_PROVENANCE_CLAIM");
    expect(forged).toHaveLength(1);
    expect(forged[0].severity).toBe("blocking");
    expect(forged[0].assetId).toBe("AST-FORGED");
    expect(report.blockingCount).toBeGreaterThan(0);
  });

  it("refuses the forgery even when every other field is immaculate", () => {
    expect(provenanceViolationIn(QA_FORGERY_OTHERWISE_IMMACULATE)).toBe(
      "PROVENANCE_TAG_DOES_NOT_FOLLOW_FROM_SOURCE",
    );
    expect(isPublishable(QA_FORGERY_OTHERWISE_IMMACULATE, entry())).toBe(false);

    const report = verifyProductMedia({ manifest: [entry()], assets: [QA_FORGERY_OTHERWISE_IMMACULATE] });
    expect(report.findings.map((item) => item.code)).toContain("UNSUPPORTED_PROVENANCE_CLAIM");
    expect(report.blockingCount).toBeGreaterThan(0);
  });

  it("refuses a published asset whose approval nobody signed, however it was built", () => {
    const unsigned = { ...QA_FIELDS, provenanceTag: "generated_product_render" } as unknown as ProductMediaAsset;
    expect(provenanceViolationIn(unsigned)).toBe("PUBLISHED_WITHOUT_NAMED_APPROVAL");
    expect(isPublishable(unsigned, entry())).toBe(false);
  });

  it("still publishes an honest asset, so the guard is a gate and not a wall", () => {
    const honest = createProductMediaAsset({
      ...QA_FIELDS,
      assetId: "AST-HONEST",
      sourceType: "commissioned_photography",
      rightsStatus: "RIGHTS_ON_FILE",
      rightsRecord: {
        recordId: "RGT-7",
        holder: "Xenios commissioned studio",
        grantedOn: "2026-06-01",
        expiresOn: null,
        evidenceRef: "vault://rights/RGT-7.pdf",
        scope: "product_photography",
      },
      approvalOwner: "Samuel Boadu",
      approvalDate: "2026-08-01",
    });

    expect(honest.provenanceTag).toBe("commissioned_photograph");
    expect(provenanceViolationIn(honest)).toBeNull();
    expect(isPublishable(honest, entry())).toBe(true);
  });
});

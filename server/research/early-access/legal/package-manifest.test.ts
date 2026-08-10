import { describe, expect, it } from "vitest";
import { LEGAL_PACKAGE_SEMVER } from "../../membership-activation/legal-import";
import {
  deriveCandidatePackage,
  fullCandidatePackage,
  resolveDesignatedPackage,
  type EarlyAccessPackageDesignation,
} from "./package-manifest";

/**
 * A designation naming every required document of the activation stage, so
 * tests can subtract exactly one thing and watch that one refusal appear.
 */
function activationDesignation(
  overrides: Partial<EarlyAccessPackageDesignation> = {},
): EarlyAccessPackageDesignation {
  const ids = deriveCandidatePackage(["activation"])
    .filter((entry) => entry.requirement === "required")
    .map((entry) => entry.documentId);
  return {
    packageSemver: LEGAL_PACKAGE_SEMVER,
    stages: ["activation"],
    documentIds: ids,
    designatedBy: "Samuel Boadu",
    designatedAt: "2026-08-09T00:00:00.000Z",
    approvalReference: "Counsel approval letter 2026-07-22",
    ...overrides,
  };
}

describe("Early Access package derivation", () => {
  it("reads the package from the existing manifest and invents nothing", () => {
    const full = fullCandidatePackage();
    expect(full).toHaveLength(17);
    expect(full.map((entry) => entry.signingOrder)).toEqual(
      Array.from({ length: 17 }, (_unused, index) => index + 1),
    );
    // Position 1 is the electronic records consent, which is the one ordering
    // rule the signature engine actually enforces.
    expect(full[0].documentId).toBe("XR-LEGAL-01");
  });

  it("stages the product checkout documents exactly as counsel staged them", () => {
    const checkout = deriveCandidatePackage(["product_checkout"]);
    expect(checkout.map((entry) => entry.documentId)).toEqual(["XR-LEGAL-13", "XR-LEGAL-14"]);
    expect(checkout.every((entry) => entry.requirement === "required")).toBe(true);
  });

  it("classifies every required document as signable, and names its category (M63)", () => {
    // This WAS the structural blocker for an Early Access purchase: the
    // documents the purchase itself requires mapped to no category, so the
    // signature engine had nowhere to record them. M63 gave all four a real
    // category, so each now has a signing path.
    const mapping = new Map(
      fullCandidatePackage().map((entry) => [
        entry.documentId,
        entry.classification.kind === "signable" ? entry.classification.category : null,
      ]),
    );
    expect(mapping.get("XR-LEGAL-12")).toBe("website_terms_of_use");
    expect(mapping.get("XR-LEGAL-13")).toBe("product_purchase_terms");
    expect(mapping.get("XR-LEGAL-14")).toBe("shipping_claims_replacement_policy");
    expect(mapping.get("XR-LEGAL-15")).toBe("payment_evidence_upload_consent");

    for (const entry of deriveCandidatePackage(["product_checkout"])) {
      expect(entry.classification.kind).toBe("signable");
    }
    const consent = deriveCandidatePackage(["payment_evidence_upload"]);
    expect(consent.map((entry) => entry.documentId)).toEqual(["XR-LEGAL-15"]);
    expect(consent[0].classification.kind).toBe("signable");

    // Not one REQUIRED document anywhere in the package is left unsignable.
    const unsignableRequired = fullCandidatePackage()
      .filter((entry) => entry.requirement === "required")
      .filter((entry) => entry.classification.kind !== "signable")
      .map((entry) => entry.documentId);
    expect(unsignableRequired).toEqual([]);
  });

  it("keeps the not-signable classification alive for the one document that has no category", () => {
    // The mechanism is not deleted, only emptied of required documents. The
    // optional cookie and tracking notice is still an additional document, so
    // a designation naming it still reports honestly.
    const cookie = deriveCandidatePackage(["cookie_notice"]);
    expect(cookie.map((entry) => entry.documentId)).toEqual(["XR-LEGAL-16"]);
    expect(cookie[0].requirement).toBe("optional");
    expect(cookie[0].classification.kind).toBe("not_signable");
  });

  it("carries the separate acknowledgment flag from the category registry", () => {
    const activation = deriveCandidatePackage(["activation"]);
    const separate = activation.filter(
      (entry) =>
        entry.classification.kind === "signable" &&
        entry.classification.requiresSeparateAcknowledgment,
    );
    expect(separate.map((entry) => entry.documentId).sort()).toEqual(["XR-LEGAL-08", "XR-LEGAL-17"]);
    // The package's own conspicuous-acceptance flag names the same two, so the
    // two registers agree and neither can silently drop one.
    expect(
      activation.filter((entry) => entry.separateConspicuousAcceptance).map((e) => e.documentId).sort(),
    ).toEqual(["XR-LEGAL-08", "XR-LEGAL-17"]);
  });
});

describe("Early Access package designation", () => {
  it("refuses when no founder or counsel designation exists", () => {
    const result = resolveDesignatedPackage(null);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("designation_missing");
  });

  it("refuses a designation written against a different package version", () => {
    const result = resolveDesignatedPackage(activationDesignation({ packageSemver: "0.9.0" }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("package_version_mismatch");
  });

  it("refuses an unnamed designator", () => {
    const result = resolveDesignatedPackage(activationDesignation({ designatedBy: "   " }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("designator_unnamed");
  });

  it("refuses an unknown document id rather than quietly shrinking the package", () => {
    const base = activationDesignation();
    const result = resolveDesignatedPackage({
      ...base,
      documentIds: [...base.documentIds, "XR-LEGAL-99"],
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("unknown_document_id");
    expect(result.detail).toEqual(["XR-LEGAL-99"]);
  });

  it("refuses a document that belongs to a stage this designation does not cover", () => {
    const base = activationDesignation();
    const result = resolveDesignatedPackage({
      ...base,
      documentIds: [...base.documentIds, "XR-LEGAL-13"],
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("document_outside_designated_stage");
    expect(result.detail).toEqual(["XR-LEGAL-13"]);
  });

  it("refuses a designation that drops a required document", () => {
    const base = activationDesignation();
    const result = resolveDesignatedPackage({
      ...base,
      documentIds: base.documentIds.filter((id) => id !== "XR-LEGAL-04"),
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("required_document_omitted");
    expect(result.detail).toEqual(["XR-LEGAL-04"]);
  });

  it("gives arbitration its own refusal when it is dropped", () => {
    const base = activationDesignation();
    const result = resolveDesignatedPackage({
      ...base,
      documentIds: base.documentIds.filter((id) => id !== "XR-LEGAL-08"),
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("separate_acknowledgment_document_omitted");
    expect(result.detail).toEqual(["XR-LEGAL-08"]);
  });

  it("gives the release and waiver its own refusal when it is dropped", () => {
    const base = activationDesignation();
    const result = resolveDesignatedPackage({
      ...base,
      documentIds: base.documentIds.filter((id) => id !== "XR-LEGAL-17"),
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    // Dropping the release must not read as an ordinary missing required
    // document, because the two failures need different legal attention.
    expect(result.code).toBe("separate_acknowledgment_document_omitted");
    expect(result.detail).toEqual(["XR-LEGAL-17"]);
  });

  it("resolves a complete activation designation in the package's signing order", () => {
    const result = resolveDesignatedPackage(activationDesignation());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.entries.map((entry) => entry.signingOrder)).toEqual(
      [...result.entries].map((entry) => entry.signingOrder).sort((a, b) => a - b),
    );
    expect(result.entries[0].documentId).toBe("XR-LEGAL-01");
    expect(result.designatedBy).toBe("Samuel Boadu");
  });

  it("resolves a checkout designation with every document signable (M63)", () => {
    const ids = deriveCandidatePackage(["activation", "product_checkout"])
      .filter((entry) => entry.requirement === "required")
      .map((entry) => entry.documentId);
    const result = resolveDesignatedPackage(
      activationDesignation({ stages: ["activation", "product_checkout"], documentIds: ids }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.containsUnsignableDocuments).toBe(false);
    expect(result.entries.map((entry) => entry.documentId)).toContain("XR-LEGAL-13");
    expect(result.entries.map((entry) => entry.documentId)).toContain("XR-LEGAL-14");
  });

  it("still reports an unsignable document when one is designated", () => {
    // The flag is not dead code: designating the optional cookie notice, which
    // has no category, still resolves and still says so.
    const result = resolveDesignatedPackage(
      activationDesignation({ stages: ["cookie_notice"], documentIds: ["XR-LEGAL-16"] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.containsUnsignableDocuments).toBe(true);
  });
});

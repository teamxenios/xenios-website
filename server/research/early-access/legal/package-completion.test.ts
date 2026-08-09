import { describe, expect, it } from "vitest";
import { sha256Hex, type DocumentCategory, type DocumentVersionRecord } from "../../membership-activation/documents";
import type { SignatureRecord } from "../../membership-activation/signatures";
import { LEGAL_PACKAGE_SEMVER } from "../../membership-activation/legal-import";
import {
  deriveCandidatePackage,
  resolveDesignatedPackage,
  type ResolvedEarlyAccessPackage,
} from "./package-manifest";
import {
  recomputePackageCompletion,
  type MemberSignatureReader,
  type PublishedVersionReader,
} from "./package-completion";

const MEMBER = "33333333-3333-4333-8333-333333333333";
const OTHER_MEMBER = "44444444-4444-4444-8444-444444444444";

/**
 * The signable part of the activation stage, as a resolved package.
 *
 * Built directly rather than through resolveDesignatedPackage, because no
 * legally correct designation can exclude XR-LEGAL-12: it is a required
 * activation document that maps to no category. These tests need to exercise
 * the completion rules on documents that CAN be signed, so the unsignable case
 * gets its own dedicated tests below rather than poisoning every other one.
 */
function signableActivationPackage(): ResolvedEarlyAccessPackage {
  const entries = deriveCandidatePackage(["activation"]).filter(
    (entry) => entry.requirement === "required" && entry.classification.kind === "signable",
  );
  return {
    ok: true,
    packageSemver: LEGAL_PACKAGE_SEMVER,
    stages: ["activation"],
    entries,
    designatedBy: "Samuel Boadu",
    designatedAt: "2026-08-09T00:00:00.000Z",
    approvalReference: "Counsel approval letter 2026-07-22",
    containsUnsignableDocuments: false,
  };
}

/** The activation designation exactly as counsel staged it. */
function activationPackage() {
  const ids = deriveCandidatePackage(["activation"])
    .filter((entry) => entry.requirement === "required")
    .map((entry) => entry.documentId);
  return resolveDesignatedPackage({
    packageSemver: LEGAL_PACKAGE_SEMVER,
    stages: ["activation"],
    documentIds: ids,
    designatedBy: "Samuel Boadu",
    designatedAt: "2026-08-09T00:00:00.000Z",
    approvalReference: "Counsel approval letter 2026-07-22",
  });
}

function version(category: DocumentCategory, overrides: Partial<DocumentVersionRecord> = {}) {
  const content = `text for ${category}`;
  return {
    id: `ver-${category}`,
    category,
    title: category,
    semver: "1.0.0",
    status: "published",
    effectiveDate: "2026-07-22",
    publishedAt: "2026-07-22T00:00:00.000Z",
    jurisdiction: "Texas",
    content,
    contentHash: sha256Hex(content),
    downloadRef: null,
    requirement: "required",
    activationStep: "activation_agreements",
    reacceptanceRequired: false,
    requiresSeparateAcknowledgment: false,
    supersededVersionId: null,
    publisher: "counsel",
    counselReview: "approved",
    notes: null,
    createdAt: "2026-07-22T00:00:00.000Z",
    updatedAt: "2026-07-22T00:00:00.000Z",
    ...overrides,
  } as DocumentVersionRecord;
}

function signature(
  category: DocumentCategory,
  overrides: Partial<SignatureRecord> = {},
): SignatureRecord {
  const published = version(category);
  return {
    id: `sig-${category}`,
    memberId: MEMBER,
    documentVersionId: published.id,
    category,
    semver: "1.0.0",
    contentHash: published.contentHash,
    typedLegalName: "Samuel Boadu",
    fullDocumentShown: true,
    affirmativeConsent: true,
    separateAcknowledgment: false,
    electronicConsentVersionId: "ver-electronic_record_consent",
    ipHash: null,
    userAgentHash: null,
    signedAt: "2026-08-09T00:10:00.000Z",
    ...overrides,
  } as SignatureRecord;
}

function readers(input: {
  versions: Partial<Record<DocumentCategory, DocumentVersionRecord | null>>;
  signatures: readonly SignatureRecord[];
}): { versions: PublishedVersionReader; signatures: MemberSignatureReader } {
  return {
    versions: {
      async getPublished(category) {
        if (category in input.versions) return input.versions[category] ?? null;
        return version(category);
      },
    },
    signatures: {
      async listSignaturesForMember() {
        return [...input.signatures];
      },
    },
  };
}

/** Every signable category of the activation package, signed on the current version. */
function fullySigned(): SignatureRecord[] {
  const resolved = signableActivationPackage();
  if (!resolved.ok) throw new Error("designation should resolve");
  return resolved.entries.flatMap((entry) => {
    if (entry.classification.kind !== "signable") return [];
    return [
      signature(entry.classification.category, {
        id: `sig-${entry.documentId}`,
        separateAcknowledgment: entry.classification.requiresSeparateAcknowledgment,
      }),
    ];
  });
}

describe("recomputePackageCompletion", () => {
  it("completes only when every signable document is signed on the current version", async () => {
    const resolved = signableActivationPackage();
    if (!resolved.ok) throw new Error("unreachable");
    const result = await recomputePackageCompletion({
      resolved,
      memberId: MEMBER,
      ...readers({ versions: {}, signatures: fullySigned() }),
    });
    expect(result.blocking).toEqual([]);
    expect(result.complete).toBe(true);
  });

  it("takes completedAt from the real signature timestamps, never from a clock", async () => {
    const resolved = signableActivationPackage();
    if (!resolved.ok) throw new Error("unreachable");
    const signatures = fullySigned();
    signatures[signatures.length - 1] = {
      ...signatures[signatures.length - 1],
      signedAt: "2026-08-09T09:45:00.000Z",
    };
    const result = await recomputePackageCompletion({
      resolved,
      memberId: MEMBER,
      ...readers({ versions: {}, signatures }),
    });
    expect(result.complete).toBe(true);
    // The latest real signing moment, which is when the package actually
    // became complete. Not now, and not when a proof was uploaded.
    expect(result.completedAt).toBe("2026-08-09T09:45:00.000Z");
  });

  it("fails closed when a required category has no published version", async () => {
    const resolved = signableActivationPackage();
    if (!resolved.ok) throw new Error("unreachable");
    const result = await recomputePackageCompletion({
      resolved,
      memberId: MEMBER,
      ...readers({ versions: { arbitration_agreement: null }, signatures: fullySigned() }),
    });
    expect(result.complete).toBe(false);
    expect(result.blocking.map((b) => b.reason)).toContain("no_published_version");
  });

  it("does not count another member's signatures", async () => {
    const resolved = signableActivationPackage();
    if (!resolved.ok) throw new Error("unreachable");
    const foreign = fullySigned().map((record) => ({ ...record, memberId: OTHER_MEMBER }));
    const result = await recomputePackageCompletion({
      resolved,
      memberId: MEMBER,
      ...readers({ versions: {}, signatures: foreign }),
    });
    expect(result.complete).toBe(false);
    expect(result.blocking.every((b) => b.reason === "not_signed")).toBe(true);
  });

  it("refuses a signature whose content hash no longer matches the published text", async () => {
    const resolved = signableActivationPackage();
    if (!resolved.ok) throw new Error("unreachable");
    const signatures = fullySigned().map((record) =>
      record.category === "privacy_notice" ? { ...record, contentHash: sha256Hex("other words") } : record,
    );
    const result = await recomputePackageCompletion({
      resolved,
      memberId: MEMBER,
      ...readers({ versions: {}, signatures }),
    });
    expect(result.complete).toBe(false);
    expect(result.blocking.map((b) => b.reason)).toContain("content_hash_drift");
  });

  it("blocks on reacceptance when the published version demands it", async () => {
    const resolved = signableActivationPackage();
    if (!resolved.ok) throw new Error("unreachable");
    const republished = version("privacy_notice", {
      id: "ver-privacy_notice-v2",
      reacceptanceRequired: true,
    });
    const result = await recomputePackageCompletion({
      resolved,
      memberId: MEMBER,
      ...readers({ versions: { privacy_notice: republished }, signatures: fullySigned() }),
    });
    expect(result.complete).toBe(false);
    expect(result.blocking.map((b) => b.reason)).toContain("reacceptance_required");
  });

  it("requires a real separate acknowledgment on arbitration", async () => {
    const resolved = signableActivationPackage();
    if (!resolved.ok) throw new Error("unreachable");
    const signatures = fullySigned().map((record) =>
      record.category === "arbitration_agreement" ? { ...record, separateAcknowledgment: false } : record,
    );
    const result = await recomputePackageCompletion({
      resolved,
      memberId: MEMBER,
      ...readers({ versions: {}, signatures }),
    });
    expect(result.complete).toBe(false);
    expect(
      result.blocking.find((b) => b.category === "arbitration_agreement")?.reason,
    ).toBe("separate_acknowledgment_missing");
  });

  it("requires a real separate acknowledgment on the release and waiver", async () => {
    const resolved = signableActivationPackage();
    if (!resolved.ok) throw new Error("unreachable");
    const signatures = fullySigned().map((record) =>
      record.category === "membership_covenant" ? { ...record, separateAcknowledgment: false } : record,
    );
    const result = await recomputePackageCompletion({
      resolved,
      memberId: MEMBER,
      ...readers({ versions: {}, signatures }),
    });
    expect(result.complete).toBe(false);
    expect(
      result.blocking.find((b) => b.category === "membership_covenant")?.reason,
    ).toBe("separate_acknowledgment_missing");
  });

  it("will not let an external provider completion stand in for a separate acknowledgment", async () => {
    const resolved = signableActivationPackage();
    if (!resolved.ok) throw new Error("unreachable");
    // Everything is signed except arbitration, which arrives only as a
    // provider acceptance. A provider acceptance carries no acknowledgment
    // evidence, so it cannot satisfy the one document that requires it.
    const signatures = fullySigned().filter((r) => r.category !== "arbitration_agreement");
    const result = await recomputePackageCompletion({
      resolved,
      memberId: MEMBER,
      ...readers({ versions: {}, signatures }),
      providerAcceptances: [
        { category: "arbitration_agreement", documentVersionId: "ver-arbitration_agreement" },
      ],
    });
    expect(result.complete).toBe(false);
    expect(
      result.blocking.find((b) => b.category === "arbitration_agreement")?.reason,
      // The blocker names the real reason: the provider completion was seen and
      // rejected for carrying no acknowledgment, which is more useful to a
      // customer and an auditor than reporting the document as simply unsigned.
    ).toBe("separate_acknowledgment_missing");
  });

  it("accepts a provider completion for an ordinary document", async () => {
    const resolved = signableActivationPackage();
    if (!resolved.ok) throw new Error("unreachable");
    const signatures = fullySigned().filter((r) => r.category !== "privacy_notice");
    const result = await recomputePackageCompletion({
      resolved,
      memberId: MEMBER,
      ...readers({ versions: {}, signatures }),
      providerAcceptances: [
        { category: "privacy_notice", documentVersionId: "ver-privacy_notice" },
      ],
    });
    expect(result.blocking).toEqual([]);
    expect(result.complete).toBe(true);
  });

  it("blocks everything else until the electronic records consent is on file", async () => {
    const resolved = signableActivationPackage();
    if (!resolved.ok) throw new Error("unreachable");
    const signatures = fullySigned().filter((r) => r.category !== "electronic_record_consent");
    const result = await recomputePackageCompletion({
      resolved,
      memberId: MEMBER,
      ...readers({ versions: {}, signatures }),
    });
    expect(result.complete).toBe(false);
    expect(result.blocking.map((b) => b.reason)).toContain("electronic_consent_required");
    // The sequence is reported, so a caller can send the customer to the one
    // document that unblocks the rest.
    expect(result.nextToSign?.documentId).toBe("XR-LEGAL-01");
  });

  it("fails closed on a package containing documents nothing can sign", async () => {
    const ids = deriveCandidatePackage(["activation", "product_checkout"])
      .filter((entry) => entry.requirement === "required")
      .map((entry) => entry.documentId);
    const resolved = resolveDesignatedPackage({
      packageSemver: LEGAL_PACKAGE_SEMVER,
      stages: ["activation", "product_checkout"],
      documentIds: ids,
      designatedBy: "Samuel Boadu",
      designatedAt: "2026-08-09T00:00:00.000Z",
      approvalReference: "Counsel approval letter 2026-07-22",
    });
    if (!resolved.ok) throw new Error("unreachable");
    const result = await recomputePackageCompletion({
      resolved,
      memberId: MEMBER,
      ...readers({ versions: {}, signatures: fullySigned() }),
    });
    expect(result.complete).toBe(false);
    const unsignable = result.blocking.filter((b) => b.reason === "document_not_signable");
    // The two product checkout documents, plus the website terms that the
    // activation stage already carries in the same unsignable shape.
    expect(unsignable.map((b) => b.documentId).sort()).toEqual([
      "XR-LEGAL-12",
      "XR-LEGAL-13",
      "XR-LEGAL-14",
    ]);
  });

  it("cannot complete even the activation package as counsel staged it", async () => {
    // The finding this lane exists to surface, pinned as a test so it cannot be
    // lost. XR-LEGAL-12 (Website Terms of Use) is a REQUIRED activation
    // document that maps to no DocumentCategory, so it is never persisted as a
    // signable version and no member can ever satisfy it. A designation that
    // omits it is refused as incomplete; a designation that includes it cannot
    // complete. Until the registry gains a category for it, the honest answer
    // is that the package is unsatisfiable, and this fails closed rather than
    // reporting a customer as nearly finished.
    const resolved = activationPackage();
    if (!resolved.ok) throw new Error("unreachable");
    expect(resolved.containsUnsignableDocuments).toBe(true);
    const result = await recomputePackageCompletion({
      resolved,
      memberId: MEMBER,
      ...readers({ versions: {}, signatures: fullySigned() }),
    });
    expect(result.complete).toBe(false);
    expect(result.blocking).toEqual([
      { documentId: "XR-LEGAL-12", category: null, reason: "document_not_signable" },
    ]);
  });

  it("throws rather than reporting progress on a refused designation", async () => {
    await expect(
      recomputePackageCompletion({
        resolved: resolveDesignatedPackage(null),
        memberId: MEMBER,
        ...readers({ versions: {}, signatures: [] }),
      }),
    ).rejects.toThrow(/designated package/);
  });
});

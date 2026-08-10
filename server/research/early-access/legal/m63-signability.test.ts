/**
 * M63: the four required legal documents are signable.
 *
 * This file is the focused evidence for one correction and nothing else. The
 * accepted release SHA carried four REQUIRED member-facing documents that
 * mapped to no DocumentCategory:
 *
 *   XR-LEGAL-12  Website Terms of Use                     (activation)
 *   XR-LEGAL-13  Product Purchase Terms                   (product_checkout)
 *   XR-LEGAL-14  Shipping, Claims and Replacement Policy  (product_checkout)
 *   XR-LEGAL-15  Payment Evidence Upload Consent          (payment_evidence_upload)
 *
 * With no category they could hold no published version and bind no signature.
 * A package naming one could never complete (document_not_signable); a package
 * omitting one was refused (required_document_omitted); and every stage carried
 * at least one, so no stage scoping escaped it. These tests prove the deadlock
 * is gone and, just as importantly, that the refusals that SHOULD still fire
 * still do.
 */

import { describe, expect, it } from "vitest";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_REGISTRY,
  InvalidDocumentInput,
  categoryDefinitionFor,
  type DocumentCategory,
} from "../../membership-activation/documents";
import {
  LEGAL_PACKAGE_SEMVER,
  MEMBER_FACING_IMPORT_PLAN,
  type PackageStage,
} from "../../membership-activation/legal-import";
import {
  deriveCandidatePackage,
  fullCandidatePackage,
  resolveDesignatedPackage,
  type EarlyAccessPackageDesignation,
} from "./package-manifest";
import { recomputePackageCompletion } from "./package-completion";
import { sha256Hex, type DocumentVersionRecord } from "../../membership-activation/documents";
import type { SignatureRecord } from "../../membership-activation/signatures";

const MEMBER = "55555555-5555-4555-8555-555555555555";

/** The four documents this lane exists for, and the categories they now hold. */
const M63_MAPPING: ReadonlyArray<readonly [string, DocumentCategory]> = [
  ["XR-LEGAL-12", "website_terms_of_use"],
  ["XR-LEGAL-13", "product_purchase_terms"],
  ["XR-LEGAL-14", "shipping_claims_replacement_policy"],
  ["XR-LEGAL-15", "payment_evidence_upload_consent"],
];

/** The sixteen categories as they stood before M63, in their exact order. */
const PRE_M63_CATEGORIES: readonly DocumentCategory[] = [
  "electronic_record_consent",
  "founding_membership_agreement",
  "activation_terms",
  "recurring_membership_authorization",
  "immediate_cancellation_acknowledgment",
  "membership_covenant",
  "confidentiality_covenant",
  "privacy_notice",
  "research_education_disclaimer",
  "assumption_of_risk_acknowledgment",
  "no_guarantee_acknowledgment",
  "arbitration_agreement",
  "manual_payment_bridge_terms",
  "identity_age_verification_consent",
  "sensitive_health_data_consent",
  "referral_store_credit_terms",
];

function designation(
  overrides: Partial<EarlyAccessPackageDesignation> = {},
): EarlyAccessPackageDesignation {
  const stages: readonly PackageStage[] = overrides.stages ?? ["activation"];
  return {
    packageSemver: LEGAL_PACKAGE_SEMVER,
    stages,
    documentIds: deriveCandidatePackage(stages)
      .filter((entry) => entry.requirement === "required")
      .map((entry) => entry.documentId),
    designatedBy: "Samuel Boadu",
    designatedAt: "2026-08-10T00:00:00.000Z",
    approvalReference: "Counsel approval letter 2026-07-22",
    ...overrides,
  };
}

function publishedVersion(category: DocumentCategory): DocumentVersionRecord {
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
  } as DocumentVersionRecord;
}

function signatureOn(category: DocumentCategory, separateAcknowledgment: boolean): SignatureRecord {
  const published = publishedVersion(category);
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
    separateAcknowledgment,
    electronicConsentVersionId: "ver-electronic_record_consent",
    ipHash: null,
    userAgentHash: null,
    signedAt: "2026-08-10T00:10:00.000Z",
  } as SignatureRecord;
}

/**
 * Every signable entry of the given stages, signed on its current version.
 *
 * The electronic-records consent is always included: it is the precondition
 * the completion engine enforces before anything else counts, and a member who
 * has reached a payment or checkout stage has necessarily activated. A stage
 * designated on its own would otherwise report `electronic_consent_required`,
 * which is correct behaviour and is proved on its own below.
 */
function signaturesFor(stages: readonly PackageStage[]): SignatureRecord[] {
  const byCategory = new Map<DocumentCategory, SignatureRecord>([
    ["electronic_record_consent", signatureOn("electronic_record_consent", false)],
  ]);
  for (const entry of deriveCandidatePackage(stages).filter((e) => e.requirement === "required")) {
    if (entry.classification.kind !== "signable") continue;
    byCategory.set(
      entry.classification.category,
      signatureOn(entry.classification.category, entry.classification.requiresSeparateAcknowledgment),
    );
  }
  return [...byCategory.values()];
}

function readers(signatures: readonly SignatureRecord[]) {
  return {
    versions: {
      async getPublished(category: DocumentCategory) {
        return publishedVersion(category);
      },
    },
    signatures: {
      async listSignaturesForMember() {
        return [...signatures];
      },
    },
  };
}

// ---------------------------------------------------------------------------
// A. Twenty recognized categories.
// ---------------------------------------------------------------------------

describe("M63 / A: the category register", () => {
  it("recognizes exactly twenty categories, each with a definition", () => {
    expect(DOCUMENT_CATEGORIES).toHaveLength(20);
    expect(new Set(DOCUMENT_CATEGORIES).size).toBe(20);
    expect(DOCUMENT_CATEGORY_REGISTRY).toHaveLength(20);
    for (const category of DOCUMENT_CATEGORIES) {
      expect(categoryDefinitionFor(category).category).toBe(category);
    }
  });

  it("refuses a twenty-first, unknown category", () => {
    expect(() => categoryDefinitionFor("xenios_not_a_category" as DocumentCategory)).toThrow(
      InvalidDocumentInput,
    );
  });
});

// ---------------------------------------------------------------------------
// B to E. The four mappings, each named exactly.
// ---------------------------------------------------------------------------

describe("M63 / B to E: the four document mappings", () => {
  for (const [documentId, category] of M63_MAPPING) {
    it(`maps ${documentId} to ${category}`, () => {
      const entry = MEMBER_FACING_IMPORT_PLAN.find((e) => e.documentId === documentId);
      expect(entry, documentId).toBeDefined();
      expect(entry?.target).toEqual({ kind: "category", category });
      // The requirement and the stage counsel set are untouched by the mapping.
      expect(entry?.requirement).toBe("required");
    });
  }

  it("leaves each document in the stage counsel staged it at", () => {
    const stageOf = (id: string) => MEMBER_FACING_IMPORT_PLAN.find((e) => e.documentId === id)?.stage;
    expect(stageOf("XR-LEGAL-12")).toBe("activation");
    expect(stageOf("XR-LEGAL-13")).toBe("product_checkout");
    expect(stageOf("XR-LEGAL-14")).toBe("product_checkout");
    expect(stageOf("XR-LEGAL-15")).toBe("payment_evidence_upload");
  });
});

// ---------------------------------------------------------------------------
// F. classify() no longer returns not_signable for those four.
// ---------------------------------------------------------------------------

describe("M63 / F: classification", () => {
  it("classifies all four as signable, and every required document with them", () => {
    const byId = new Map(fullCandidatePackage().map((entry) => [entry.documentId, entry]));
    for (const [documentId, category] of M63_MAPPING) {
      const entry = byId.get(documentId);
      expect(entry?.classification.kind, documentId).toBe("signable");
      if (entry?.classification.kind !== "signable") throw new Error("unreachable");
      expect(entry.classification.category).toBe(category);
      // None of the four is a separate-conspicuous-acceptance document; the
      // package flags exactly XR-LEGAL-08 and XR-LEGAL-17 for that.
      expect(entry.classification.requiresSeparateAcknowledgment).toBe(false);
      expect(entry.separateConspicuousAcceptance).toBe(false);
    }
    const stillUnsignable = fullCandidatePackage()
      .filter((entry) => entry.requirement === "required")
      .filter((entry) => entry.classification.kind !== "signable")
      .map((entry) => entry.documentId);
    expect(stillUnsignable).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// G. Completion no longer emits document_not_signable for them.
// ---------------------------------------------------------------------------

describe("M63 / G: package completion", () => {
  it("emits no document_not_signable for any stage that includes the four", async () => {
    for (const stages of [
      ["activation"],
      ["payment_evidence_upload"],
      ["product_checkout"],
      ["activation", "payment_evidence_upload", "product_checkout"],
    ] as const) {
      const resolved = resolveDesignatedPackage(designation({ stages: [...stages] }));
      expect(resolved.ok, stages.join("+")).toBe(true);
      if (!resolved.ok) throw new Error("unreachable");
      expect(resolved.containsUnsignableDocuments, stages.join("+")).toBe(false);
      const result = await recomputePackageCompletion({
        resolved,
        memberId: MEMBER,
        ...readers(signaturesFor(stages)),
      });
      expect(
        result.blocking.filter((b) => b.reason === "document_not_signable"),
        stages.join("+"),
      ).toEqual([]);
      // Fully signed, the package now actually completes. Before M63 no
      // designation of any stage could reach this.
      expect(result.complete, stages.join("+")).toBe(true);
    }
  });

  it("still requires the electronic-records consent before a later stage counts", async () => {
    // The precondition is untouched by M63: signing the payment-evidence
    // consent alone does not complete that stage.
    const resolved = resolveDesignatedPackage(designation({ stages: ["payment_evidence_upload"] }));
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) throw new Error("unreachable");
    const result = await recomputePackageCompletion({
      resolved,
      memberId: MEMBER,
      ...readers([signatureOn("payment_evidence_upload_consent", false)]),
    });
    expect(result.complete).toBe(false);
    expect(result.blocking.map((b) => b.reason)).toContain("electronic_consent_required");
    expect(result.blocking.filter((b) => b.reason === "document_not_signable")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// H. required_document_omitted still fires on a genuine omission.
// ---------------------------------------------------------------------------

describe("M63 / H: omitting a required document still refuses", () => {
  it("refuses when one of the four newly signable documents is dropped", () => {
    for (const [documentId] of M63_MAPPING) {
      const base = designation({
        stages: ["activation", "payment_evidence_upload", "product_checkout"],
      });
      const result = resolveDesignatedPackage({
        ...base,
        documentIds: base.documentIds.filter((id) => id !== documentId),
      });
      expect(result.ok, documentId).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.code, documentId).toBe("required_document_omitted");
      expect(result.detail, documentId).toEqual([documentId]);
    }
  });

  it("keeps the separate-acknowledgment omission its own distinct refusal", () => {
    const base = designation();
    const result = resolveDesignatedPackage({
      ...base,
      documentIds: base.documentIds.filter((id) => id !== "XR-LEGAL-08"),
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("separate_acknowledgment_document_omitted");
  });
});

// ---------------------------------------------------------------------------
// I. Stage scoping is still fail-closed.
// ---------------------------------------------------------------------------

describe("M63 / I: stage scoping stays fail-closed", () => {
  it("still refuses a missing designation rather than defaulting to a package", () => {
    const result = resolveDesignatedPackage(null);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("designation_missing");
  });

  it("still refuses a document that reaches outside its designated stage", () => {
    const result = resolveDesignatedPackage(
      designation({
        stages: ["activation"],
        documentIds: [
          ...deriveCandidatePackage(["activation"])
            .filter((entry) => entry.requirement === "required")
            .map((entry) => entry.documentId),
          "XR-LEGAL-13",
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("document_outside_designated_stage");
    expect(result.detail).toEqual(["XR-LEGAL-13"]);
  });

  it("still refuses an unknown document id and an empty stage list", () => {
    const unknown = resolveDesignatedPackage(
      designation({ documentIds: ["XR-LEGAL-99"] }),
    );
    expect(unknown.ok).toBe(false);
    if (unknown.ok) throw new Error("unreachable");
    expect(unknown.code).toBe("unknown_document_id");

    const empty = resolveDesignatedPackage(designation({ stages: [], documentIds: ["XR-LEGAL-01"] }));
    expect(empty.ok).toBe(false);
    if (empty.ok) throw new Error("unreachable");
    expect(empty.code).toBe("stages_empty");
  });
});

// ---------------------------------------------------------------------------
// J. The original sixteen categories are unchanged.
// ---------------------------------------------------------------------------

describe("M63 / J: the original sixteen categories are untouched", () => {
  it("keeps the first sixteen category values in their original order", () => {
    expect(DOCUMENT_CATEGORIES.slice(0, 16)).toEqual(PRE_M63_CATEGORIES);
  });

  it("keeps every original definition byte-for-byte in its metadata", () => {
    const expected: Record<string, { requirement: string; step: string | null; sepAck: boolean }> = {
      electronic_record_consent: { requirement: "required", step: "electronic_consent", sepAck: false },
      founding_membership_agreement: { requirement: "required", step: "activation_agreements", sepAck: false },
      activation_terms: { requirement: "required", step: "activation_agreements", sepAck: false },
      recurring_membership_authorization: { requirement: "required", step: "recurring_authorization", sepAck: false },
      immediate_cancellation_acknowledgment: { requirement: "required", step: "activation_agreements", sepAck: false },
      membership_covenant: { requirement: "required", step: "activation_agreements", sepAck: true },
      confidentiality_covenant: { requirement: "required", step: "activation_agreements", sepAck: false },
      privacy_notice: { requirement: "required", step: "activation_agreements", sepAck: false },
      research_education_disclaimer: { requirement: "required", step: "activation_agreements", sepAck: false },
      assumption_of_risk_acknowledgment: { requirement: "required", step: "activation_agreements", sepAck: false },
      no_guarantee_acknowledgment: { requirement: "required", step: "activation_agreements", sepAck: false },
      arbitration_agreement: { requirement: "required", step: "arbitration_acknowledgment", sepAck: true },
      manual_payment_bridge_terms: { requirement: "required", step: "payment_bridge", sepAck: false },
      identity_age_verification_consent: { requirement: "required", step: "activation_agreements", sepAck: false },
      sensitive_health_data_consent: { requirement: "required", step: "assessment_entry", sepAck: false },
      referral_store_credit_terms: { requirement: "optional", step: null, sepAck: false },
    };
    for (const category of PRE_M63_CATEGORIES) {
      const definition = categoryDefinitionFor(category);
      expect(definition.defaultRequirement, category).toBe(expected[category].requirement);
      expect(definition.activationStep, category).toBe(expected[category].step);
      expect(definition.requiresSeparateAcknowledgment, category).toBe(expected[category].sepAck);
    }
  });

  it("still flags exactly the covenant slot and arbitration for separate acknowledgment", () => {
    expect(
      DOCUMENT_CATEGORY_REGISTRY.filter((d) => d.requiresSeparateAcknowledgment).map((d) => d.category),
    ).toEqual(["membership_covenant", "arbitration_agreement"]);
  });

  it("leaves the twelve pre-M63 document mappings exactly where they were", () => {
    const expected: Record<string, DocumentCategory> = {
      "XR-LEGAL-01": "electronic_record_consent",
      "XR-LEGAL-02": "privacy_notice",
      "XR-LEGAL-03": "identity_age_verification_consent",
      "XR-LEGAL-04": "founding_membership_agreement",
      "XR-LEGAL-05": "confidentiality_covenant",
      "XR-LEGAL-06": "research_education_disclaimer",
      "XR-LEGAL-07": "assumption_of_risk_acknowledgment",
      "XR-LEGAL-08": "arbitration_agreement",
      "XR-LEGAL-09": "manual_payment_bridge_terms",
      "XR-LEGAL-10": "recurring_membership_authorization",
      "XR-LEGAL-11": "immediate_cancellation_acknowledgment",
      "XR-LEGAL-17": "membership_covenant",
    };
    for (const [documentId, category] of Object.entries(expected)) {
      const entry = MEMBER_FACING_IMPORT_PLAN.find((e) => e.documentId === documentId);
      expect(entry?.target, documentId).toEqual({ kind: "category", category });
    }
  });

  it("leaves the optional cookie notice as the one additional document", () => {
    const additional = MEMBER_FACING_IMPORT_PLAN.filter(
      (entry) => entry.target.kind === "additional_required_document",
    );
    expect(additional.map((entry) => entry.documentId)).toEqual(["XR-LEGAL-16"]);
    expect(additional[0].requirement).toBe("optional");
  });
});

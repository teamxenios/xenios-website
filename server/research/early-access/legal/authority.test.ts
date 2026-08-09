import { describe, expect, it } from "vitest";
import { customerPayloadIsClean } from "@shared/research/early-access-hardening";
import { sha256Hex, type DocumentCategory, type DocumentVersionRecord } from "../../membership-activation/documents";
import type { SignatureRecord } from "../../membership-activation/signatures";
import { LEGAL_PACKAGE_SEMVER } from "../../membership-activation/legal-import";
import { deriveCandidatePackage, type ResolvedEarlyAccessPackage } from "./package-manifest";
import { recomputePackageCompletion } from "./package-completion";
import {
  AgreementAuthority,
  LegalBindingDirectory,
  packageVersionDigest,
  toContractBlockReason,
  toStandingView,
} from "./authority";
import type { EarlyAccessSignerBinding, EarlyAccessSignerBindingStore } from "./signer-identity";

const MEMBER = "33333333-3333-4333-8333-333333333333";
const ROSTER_REF = "eac_d80e62ad2039e515b943d4d7cb6c2e32";
const ALIAS_REF = "eac_11111111111111111111111111111111";

function signablePackage(): ResolvedEarlyAccessPackage {
  return {
    ok: true,
    packageSemver: LEGAL_PACKAGE_SEMVER,
    stages: ["activation"],
    entries: deriveCandidatePackage(["activation"]).filter(
      (entry) => entry.requirement === "required" && entry.classification.kind === "signable",
    ),
    designatedBy: "Samuel Boadu",
    designatedAt: "2026-08-09T00:00:00.000Z",
    approvalReference: "Counsel approval letter 2026-07-22",
    containsUnsignableDocuments: false,
  };
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

const versions = {
  async getPublished(category: DocumentCategory) {
    return version(category);
  },
};

function fullySigned(): SignatureRecord[] {
  return signablePackage().ok
    ? (signablePackage() as { entries: ReturnType<typeof deriveCandidatePackage> }).entries.flatMap(
        (entry) => {
          if (entry.classification.kind !== "signable") return [];
          const category = entry.classification.category;
          const published = version(category);
          return [
            {
              id: `sig-${entry.documentId}`,
              memberId: MEMBER,
              documentVersionId: published.id,
              category,
              semver: "1.0.0",
              contentHash: published.contentHash,
              typedLegalName: "Samuel Boadu",
              fullDocumentShown: true,
              affirmativeConsent: true,
              separateAcknowledgment: entry.classification.requiresSeparateAcknowledgment,
              electronicConsentVersionId: "ver-electronic_record_consent",
              ipHash: null,
              userAgentHash: null,
              signedAt: "2026-08-09T00:10:00.000Z",
            } as SignatureRecord,
          ];
        },
      )
    : [];
}

function signatureReader(records: readonly SignatureRecord[]) {
  return {
    async listSignaturesForMember() {
      return [...records];
    },
  };
}

function binding(overrides: Partial<EarlyAccessSignerBinding> = {}): EarlyAccessSignerBinding {
  return {
    customerRef: ROSTER_REF,
    coveredRefs: [ROSTER_REF, ALIAS_REF],
    memberId: MEMBER,
    authUserId: "auth-user-1",
    memberEmail: "member@example.test",
    verification: { method: "member_claim_token", tokenPurpose: "account_claim" },
    boundAt: "2026-08-09T00:00:00.000Z",
    supersededAt: null,
    ...overrides,
  };
}

function storeOf(table: Record<string, EarlyAccessSignerBinding>): EarlyAccessSignerBindingStore {
  return {
    async findByCustomerRef(ref) {
      return table[ref] ?? null;
    },
    async findByMemberId(memberId) {
      return Object.values(table).find((entry) => entry.memberId === memberId) ?? null;
    },
  };
}

describe("packageVersionDigest", () => {
  it("matches the algorithm the membership gate already uses", () => {
    // sha-256 over `category:id:contentHash` joined by a pipe, first 24 hex.
    // Reproduced independently here so a change to either side is caught.
    const docs = [
      { category: "privacy_notice", id: "ver-a", contentHash: "a".repeat(64) },
      { category: "arbitration_agreement", id: "ver-b", contentHash: "b".repeat(64) },
    ];
    const expected = sha256Hex(
      docs.map((d) => `${d.category}:${d.id}:${d.contentHash}`).join("|"),
    ).slice(0, 24);
    expect(packageVersionDigest(docs)).toBe(expected);
  });

  it("changes when a document version changes, so drift is detectable", () => {
    const before = packageVersionDigest([
      { category: "privacy_notice", id: "ver-a", contentHash: "a".repeat(64) },
    ]);
    const after = packageVersionDigest([
      { category: "privacy_notice", id: "ver-a2", contentHash: "c".repeat(64) },
    ]);
    expect(after).not.toBe(before);
  });
});

describe("block reason mapping", () => {
  it("maps every internal reason onto the frozen vocabulary", () => {
    expect(toContractBlockReason("not_signed")).toBe("not_signed");
    expect(toContractBlockReason("reacceptance_required")).toBe("reacceptance_required");
    expect(toContractBlockReason("no_published_version")).toBe("no_published_version");
    expect(toContractBlockReason("separate_acknowledgment_missing")).toBe(
      "separate_acknowledgment_missing",
    );
    // Assent to different words is not assent to these words.
    expect(toContractBlockReason("content_hash_drift")).toBe("not_signed");
    expect(toContractBlockReason("electronic_consent_required")).toBe("not_signed");
    // No category exists to publish into, so no published version can exist.
    expect(toContractBlockReason("document_not_signable")).toBe("no_published_version");
  });
});

describe("AgreementAuthority", () => {
  it("resolves the package to the versions published right now", async () => {
    const authority = new AgreementAuthority(signablePackage(), versions, signatureReader([]));
    const pkg = await authority.currentPackage();
    expect(pkg.packageId).toBe(`xenios-research@${LEGAL_PACKAGE_SEMVER}`);
    expect(pkg.packageVersion).toHaveLength(24);
    expect(pkg.requirements.map((r) => r.ordering)).toEqual(
      [...pkg.requirements].map((r) => r.ordering).sort((a, b) => a - b),
    );
    const arbitration = pkg.requirements.find((r) => r.category === "arbitration_agreement");
    expect(arbitration?.requiresSeparateAcknowledgment).toBe(true);
  });

  it("recomputes standing rather than reading a stored flag", async () => {
    const authority = new AgreementAuthority(
      signablePackage(),
      versions,
      signatureReader(fullySigned()),
      () => new Date("2026-08-09T12:00:00.000Z"),
    );
    const standing = await authority.standingFor(MEMBER);
    expect(standing.satisfied).toBe(true);
    expect(standing.blocking).toEqual([]);
    expect(standing.memberId).toBe(MEMBER);
    // The answer carries the package it was computed against, so a later
    // reviewer can tell which paper was in force.
    expect(standing.packageVersion).toHaveLength(24);
    expect(standing.evaluatedAt).toBe("2026-08-09T12:00:00.000Z");
  });

  it("un-satisfies a standing when a document is republished", async () => {
    const signed = fullySigned();
    const republished = {
      async getPublished(category: DocumentCategory) {
        if (category === "privacy_notice") {
          return version("privacy_notice", { id: "ver-privacy_notice-v2", reacceptanceRequired: true });
        }
        return version(category);
      },
    };
    const before = await new AgreementAuthority(
      signablePackage(),
      versions,
      signatureReader(signed),
    ).standingFor(MEMBER);
    const after = await new AgreementAuthority(
      signablePackage(),
      republished,
      signatureReader(signed),
    ).standingFor(MEMBER);

    expect(before.satisfied).toBe(true);
    // A package that was complete a minute ago is not complete now, and the
    // package version records that the required set moved.
    expect(after.satisfied).toBe(false);
    expect(after.packageVersion).not.toBe(before.packageVersion);
    expect(after.blocking.map((b) => b.reason)).toContain("reacceptance_required");
  });
});

describe("toStandingView", () => {
  it("carries no key a customer payload may never contain", async () => {
    const completion = await recomputePackageCompletion({
      resolved: signablePackage(),
      memberId: MEMBER,
      versions,
      signatures: signatureReader(fullySigned().filter((r) => r.category !== "privacy_notice")),
    });
    const view = toStandingView(completion, "abc123def456abc123def456");
    // The frozen contract forbids memberId and customerRef at ANY depth in a
    // customer payload. The server answer carries memberId; the projection
    // must not.
    expect(customerPayloadIsClean(view)).toBe(true);
    expect(JSON.stringify(view)).not.toContain(MEMBER);
    expect(view.satisfied).toBe(false);
    expect(view.outstanding.map((o) => o.category)).toContain("privacy_notice");
  });

  it("lists outstanding documents in signing order", async () => {
    const completion = await recomputePackageCompletion({
      resolved: signablePackage(),
      memberId: MEMBER,
      versions,
      signatures: signatureReader([]),
    });
    const view = toStandingView(completion, "abc123def456abc123def456");
    expect(view.outstanding[0].category).toBe("electronic_record_consent");
    const arbitration = view.outstanding.find((o) => o.category === "arbitration_agreement");
    expect(arbitration?.requiresSeparateAcknowledgment).toBe(true);
  });
});

describe("LegalBindingDirectory", () => {
  const candidateFor = async (customerRef: string) =>
    customerRef === ROSTER_REF
      ? { customerRef: ROSTER_REF, aliasRefs: [ALIAS_REF], boundBy: "verified_link" as const }
      : null;

  it("reports a claim-token binding as verified_link", async () => {
    const directory = new LegalBindingDirectory(
      storeOf({ [ROSTER_REF]: binding() }),
      async () => true,
      candidateFor,
    );
    const result = await directory.forCustomer(ROSTER_REF);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.binding.establishedBy).toBe("verified_link");
    expect(result.binding.memberId).toBe(MEMBER);
    expect(result.binding.attestedBy).toBeNull();
    // Aliases are preserved so verifying an identity never orphans an older
    // checkout placed under the other handle.
    expect(result.binding.aliasRefs).toEqual([ALIAS_REF]);
  });

  it("reports an admin-attested binding with the named human", async () => {
    const directory = new LegalBindingDirectory(
      storeOf({
        [ROSTER_REF]: binding({
          verification: {
            method: "named_admin_review",
            reviewedBy: "Samuel Boadu",
            reference: "founder checkout XEC-E1703CC63BBE89E6839E24C1",
          },
        }),
      }),
      async () => true,
      candidateFor,
    );
    const result = await directory.forCustomer(ROSTER_REF);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.binding.establishedBy).toBe("admin_attested");
    expect(result.binding.attestedBy).toBe("Samuel Boadu");
  });

  it("refuses an admin attestation with no named human", async () => {
    const directory = new LegalBindingDirectory(
      storeOf({
        [ROSTER_REF]: binding({
          verification: { method: "named_admin_review", reviewedBy: "  ", reference: "none" },
        }),
      }),
      async () => true,
      candidateFor,
    );
    const result = await directory.forCustomer(ROSTER_REF);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("binding_unverified");
  });

  it("gives a coarse answer so the route is not an oracle", async () => {
    // Two handles naming two members is a conflict internally. To the caller it
    // is simply: there is no binding you may sign under.
    const directory = new LegalBindingDirectory(
      storeOf({
        [ROSTER_REF]: binding(),
        [ALIAS_REF]: binding({ customerRef: ALIAS_REF, memberId: "other-member" }),
      }),
      async () => true,
      candidateFor,
    );
    const result = await directory.forCustomer(ROSTER_REF);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("binding_absent");
  });

  it("refuses an unknown handle", async () => {
    const directory = new LegalBindingDirectory(
      storeOf({ [ROSTER_REF]: binding() }),
      async () => true,
      candidateFor,
    );
    const result = await directory.forCustomer("eac_00000000000000000000000000000000");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.code).toBe("binding_absent");
  });

  it("delegates checkout ownership to the cart's own rule", async () => {
    const directory = new LegalBindingDirectory(
      storeOf({ [ROSTER_REF]: binding() }),
      async (memberId, checkout) =>
        memberId === MEMBER && checkout === "XEC-E1703CC63BBE89E6839E24C1",
      candidateFor,
    );
    expect(await directory.ownsCheckout(MEMBER, "XEC-E1703CC63BBE89E6839E24C1")).toBe(true);
    expect(await directory.ownsCheckout("other-member", "XEC-E1703CC63BBE89E6839E24C1")).toBe(false);
  });
});

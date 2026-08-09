import { describe, expect, it } from "vitest";
import { LEGAL_PACKAGE_SEMVER, MEMBER_FACING_IMPORT_PLAN } from "../../membership-activation/legal-import";
import type { DocumentVersionRecord } from "../../membership-activation/documents";
import type { SignatureRecord } from "../../membership-activation/signatures";
import {
  EARLY_ACCESS_LEGAL_PACKAGE_ENV,
  UndesignatedEarlyAccessAgreementAuthority,
  buildEarlyAccessAgreementAuthority,
  readEarlyAccessPackageDesignation,
  toMemberSignatureReader,
} from "./production-authority";

/**
 * The property under test is one sentence: with no designated and published
 * legal package, the proof-submission checkpoint refuses, and there is no
 * configuration that makes it satisfied by accident.
 */

const MEMBER = "11111111-1111-4111-8111-111111111111";

const NO_VERSIONS = {
  async getPublished(): Promise<DocumentVersionRecord | null> {
    return null;
  },
};

const NO_SIGNATURES = {
  async listSignaturesForMember(): Promise<SignatureRecord[]> {
    return [];
  },
};

/** A designation naming every activation-stage document, so it resolves. */
function activationDesignation(): Record<string, unknown> {
  const documentIds = MEMBER_FACING_IMPORT_PLAN.filter(
    (entry) => entry.stage === "activation",
  ).map((entry) => entry.documentId);
  return {
    packageSemver: LEGAL_PACKAGE_SEMVER,
    stages: ["activation"],
    documentIds,
    designatedBy: "Samuel Boadu",
    designatedAt: "2026-08-09T00:00:00.000Z",
    approvalReference: "counsel-approval-2026-08",
  };
}

describe("reading the designation", () => {
  it("returns null and warns when nothing is configured", () => {
    const warnings: string[] = [];
    expect(readEarlyAccessPackageDesignation({}, warnings)).toBeNull();
    expect(warnings.join(" ")).toContain(EARLY_ACCESS_LEGAL_PACKAGE_ENV);
  });

  it("returns null for malformed JSON, a non-object, and a partial designation", () => {
    for (const raw of [
      "{not json",
      '"a string"',
      "[]",
      JSON.stringify({ packageSemver: LEGAL_PACKAGE_SEMVER }),
      JSON.stringify({ ...activationDesignation(), designatedBy: "  " }),
      JSON.stringify({ ...activationDesignation(), documentIds: "XR-LEGAL-12" }),
    ]) {
      const warnings: string[] = [];
      expect(
        readEarlyAccessPackageDesignation({ [EARLY_ACCESS_LEGAL_PACKAGE_ENV]: raw }, warnings),
      ).toBeNull();
      expect(warnings).toHaveLength(1);
    }
  });

  it("reads a complete designation", () => {
    const designation = readEarlyAccessPackageDesignation({
      [EARLY_ACCESS_LEGAL_PACKAGE_ENV]: JSON.stringify(activationDesignation()),
    });
    expect(designation?.designatedBy).toBe("Samuel Boadu");
    expect(designation?.stages).toEqual(["activation"]);
  });
});

describe("the undesignated authority", () => {
  it("can never report a satisfied standing", async () => {
    const authority = new UndesignatedEarlyAccessAgreementAuthority("designation_missing");
    const standing = await authority.standingFor(MEMBER);
    expect(standing.satisfied).toBe(false);
    expect(standing.memberId).toBe(MEMBER);
    expect(standing.blocking[0].reason).toBe("no_published_version");
  });

  it("throws rather than describing a package that does not exist", async () => {
    const authority = new UndesignatedEarlyAccessAgreementAuthority("designation_missing");
    await expect(authority.currentPackage()).rejects.toThrow(/no early access legal package/i);
  });
});

describe("building the production authority", () => {
  it("refuses, without throwing, when nothing is designated", async () => {
    const warnings: string[] = [];
    const built = buildEarlyAccessAgreementAuthority({
      env: {},
      versions: NO_VERSIONS,
      signatures: NO_SIGNATURES,
      warnings,
    });
    expect(built.resolved.ok).toBe(false);
    await expect(built.authority.standingFor(MEMBER)).resolves.toMatchObject({
      satisfied: false,
    });
    expect(warnings.join(" ")).toContain(EARLY_ACCESS_LEGAL_PACKAGE_ENV);
  });

  it("reports the exact refusal when a designation is present but wrong", () => {
    const warnings: string[] = [];
    const built = buildEarlyAccessAgreementAuthority({
      env: {
        [EARLY_ACCESS_LEGAL_PACKAGE_ENV]: JSON.stringify({
          ...activationDesignation(),
          documentIds: ["XR-LEGAL-NOPE"],
        }),
      },
      versions: NO_VERSIONS,
      signatures: NO_SIGNATURES,
      warnings,
    });
    expect(built.resolved.ok).toBe(false);
    if (!built.resolved.ok) expect(built.resolved.code).toBe("unknown_document_id");
    expect(warnings.join(" ")).toContain("unknown_document_id");
  });

  it("builds the real authority for a resolvable designation, and it still refuses with nothing published", async () => {
    const built = buildEarlyAccessAgreementAuthority({
      env: {
        [EARLY_ACCESS_LEGAL_PACKAGE_ENV]: JSON.stringify(activationDesignation()),
      },
      versions: NO_VERSIONS,
      signatures: NO_SIGNATURES,
    });
    expect(built.resolved.ok).toBe(true);
    // The authority is real, and with no published version for any category the
    // recomputed standing is unsatisfied. That is the state of the tree today
    // and it is the correct one: nothing here publishes a package.
    await expect(built.authority.standingFor(MEMBER)).resolves.toMatchObject({
      satisfied: false,
    });
  });
});

describe("the signature reader adapter", () => {
  it("copies rather than widening the store's readonly array", async () => {
    const stored: readonly SignatureRecord[] = Object.freeze([]);
    const reader = toMemberSignatureReader({
      async listSignaturesForMember() {
        return stored;
      },
    });
    const copy = await reader.listSignaturesForMember(MEMBER);
    expect(copy).toEqual([]);
    expect(copy).not.toBe(stored);
  });
});

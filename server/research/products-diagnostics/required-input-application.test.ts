import { describe, expect, it } from "vitest";
import type {
  DomainReadiness,
  RequiredInput,
  RequiredInputBlockingLevel,
  RequiredInputState,
} from "@shared/research/required-inputs";
import {
  evaluateWebsite3Readiness,
  toWebsite3PublicReadiness,
  type Website3RequiredInputDomain,
} from "./required-input-application";

function input(
  domain: Website3RequiredInputDomain,
  label: string,
  blockingLevel: RequiredInputBlockingLevel,
  currentState: RequiredInputState,
): RequiredInput {
  return {
    id: crypto.randomUUID(),
    key: `${domain}.${label.toLowerCase().replaceAll(" ", "_")}`,
    domain,
    label,
    description: "Exact verified business input.",
    whyRequired: "The server requires this fact before release.",
    recordType: domain,
    recordId: null,
    fieldPath: "release.input",
    currentState,
    blockingLevel,
    responsibleRole: "product_admin",
    verificationMethod: "Independent administrator review.",
    evidenceRequired: ["Approved source record"],
    entryMode: "record_reference",
    valueSensitivity: "ordinary",
    enteredValue: null,
    externalReferenceName: null,
    enteredBy: null,
    enteredAt: null,
    verifiedBy: null,
    verifiedAt: null,
    rejectionReason: null,
    publicLaunchImpact: "The affected capability stays unavailable.",
    nextAction: "Enter and submit the verified source record.",
    adminEntryHref: "/admin/research/required-inputs",
    version: 1,
    auditHistory: [],
  };
}

function readiness(
  domain: Website3RequiredInputDomain,
  count: number,
): DomainReadiness {
  return {
    domain,
    launchStatus: "public_enabled",
    softwareComplete: true,
    realInputsRequired: false,
    publicEnabled: true,
    manifestApproved: true,
    expectedInputCount: count,
    actualInputCount: count,
    blockingInputCount: 0,
    blockingKeys: [],
    version: 3,
  };
}

describe("Website 3 canonical required-input application", () => {
  it.each([
    ["pricing", "RETAIL PRICE REQUIRED"],
    ["inventory", "AVAILABLE INVENTORY REQUIRED"],
    ["lots", "ACTIVE LOT REQUIRED"],
    ["coas", "LOT-SPECIFIC COA REQUIRED"],
  ] as const)("blocks %s while its exact input is missing", (domain, label) => {
    const item = input(domain, label, "blocks_transaction", "missing");
    const decision = evaluateWebsite3Readiness(
      domain,
      [item],
      readiness(domain, 1),
    );

    expect(decision).toMatchObject({
      publicEnabled: false,
      realInputsRequired: true,
      blockingLabels: [label],
      publicMessage: "Not currently available",
    });
  });

  it.each(["rejected", "expired"] as const)(
    "restores the blocking state when an input is %s",
    (state) => {
      const item = input(
        "superpower",
        "SUPERPOWER LAUNCH APPROVAL REQUIRED",
        "blocks_provider_activation",
        state,
      );

      expect(
        evaluateWebsite3Readiness(
          "superpower",
          [item],
          readiness("superpower", 1),
        ),
      ).toMatchObject({
        publicEnabled: false,
        publicMessage: "Partner configuration pending",
      });
    },
  );

  it("accepts only the canonical fully ready launch result", () => {
    const item = input(
      "products",
      "PRODUCT RELEASE APPROVAL REQUIRED",
      "blocks_public_launch",
      "verified",
    );
    const decision = evaluateWebsite3Readiness(
      "products",
      [item],
      readiness("products", 1),
    );

    expect(decision).toEqual({
      publicEnabled: true,
      softwareComplete: true,
      realInputsRequired: false,
      blockingLabels: [],
      publicMessage: null,
    });
  });

  it("fails closed when the supplied active item set is empty or truncated", () => {
    const verified = input(
      "products",
      "PRODUCT RELEASE APPROVAL REQUIRED",
      "blocks_public_launch",
      "verified",
    );

    expect(
      evaluateWebsite3Readiness("products", [], readiness("products", 5)),
    ).toMatchObject({
      publicEnabled: false,
      realInputsRequired: true,
    });
    expect(
      evaluateWebsite3Readiness(
        "products",
        [verified],
        readiness("products", 5),
      ),
    ).toMatchObject({
      publicEnabled: false,
      realInputsRequired: true,
    });
  });

  it("excludes superseded rows from the canonical active item count", () => {
    const verified = input(
      "products",
      "PRODUCT RELEASE APPROVAL REQUIRED",
      "blocks_public_launch",
      "verified",
    );
    const superseded = input(
      "products",
      "SUPERSEDED PRODUCT APPROVAL",
      "blocks_public_launch",
      "superseded",
    );

    expect(
      evaluateWebsite3Readiness(
        "products",
        [verified, superseded],
        readiness("products", 1),
      ).publicEnabled,
    ).toBe(true);
    expect(
      evaluateWebsite3Readiness(
        "products",
        [verified, superseded],
        readiness("products", 2),
      ).publicEnabled,
    ).toBe(false);
  });

  it("fails closed when canonical blocking metadata is inconsistent", () => {
    const verified = input(
      "products",
      "PRODUCT RELEASE APPROVAL REQUIRED",
      "blocks_public_launch",
      "verified",
    );

    expect(
      evaluateWebsite3Readiness("products", [verified], {
        ...readiness("products", 1),
        blockingKeys: ["products.stale_blocker"],
        blockingInputCount: 0,
      }).publicEnabled,
    ).toBe(false);
    expect(
      evaluateWebsite3Readiness("products", [verified], {
        ...readiness("products", 1),
        blockingKeys: [],
        blockingInputCount: 1,
      }).publicEnabled,
    ).toBe(false);
  });

  it("fails closed for an absent, stale, or mismatched readiness manifest", () => {
    const verified = input(
      "diagnostics",
      "DIAGNOSTIC PARTNER CONFIGURATION REQUIRED",
      "blocks_provider_activation",
      "verified",
    );
    expect(
      evaluateWebsite3Readiness("diagnostics", [verified], null).publicEnabled,
    ).toBe(false);
    expect(
      evaluateWebsite3Readiness("diagnostics", [verified], {
        ...readiness("diagnostics", 1),
        manifestApproved: false,
      }).publicEnabled,
    ).toBe(false);
    expect(
      evaluateWebsite3Readiness(
        "diagnostics",
        [verified],
        readiness("products", 1),
      ).publicEnabled,
    ).toBe(false);
  });

  it("returns a public projection without internal keys or evidence", () => {
    const internal = input(
      "coas",
      "LOT-SPECIFIC COA REQUIRED",
      "blocks_display",
      "under_review",
    );
    const projection = toWebsite3PublicReadiness(
      evaluateWebsite3Readiness("coas", [internal], readiness("coas", 1)),
    );

    expect(projection).toEqual({
      available: false,
      message: "Documentation pending",
    });
    expect(JSON.stringify(projection)).not.toContain(internal.key);
    expect(JSON.stringify(projection)).not.toContain("Approved source record");
  });
});

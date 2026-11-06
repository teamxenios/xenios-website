import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  EARLY_ACCESS_PRODUCT_POLICY_AGREEMENT,
  EARLY_ACCESS_PRODUCT_POLICY_CONTENT_SHA256,
  EARLY_ACCESS_PRODUCT_POLICY_SLUG,
  RESEARCH_USE_POLICY_AGREEMENT,
  RESEARCH_USE_POLICY_CONTENT_SHA256,
  policies,
  publishedEarlyAccessAgreement,
  researchPolicyContentSha256,
  type ResearchPublishedPolicy,
} from "./policies-data";

/**
 * The agreement a customer accepts is a (kind, version) pair, and the durable
 * table stores only that pair. These pins are what make the pair mean one
 * exact document: the reviewed v2 body for new acceptances, and the untouched
 * v1 body for every acceptance already on file.
 */

const REVIEWED_V2_DIGEST =
  "491d2559f05f6201ee0279bbd0fb711ebc7eeb1fd0a826c8d9141373c146fa06";
const HISTORICAL_V1_DIGEST =
  "98918e35e5a0f749790fb31cd406399818ced5d197cbed02679744ccf94ac325";

function withPolicy(
  slug: string,
  replacement: ResearchPublishedPolicy | undefined,
  run: () => void,
): void {
  const original = policies[slug];
  if (replacement === undefined) {
    delete policies[slug];
  } else {
    policies[slug] = replacement;
  }
  try {
    run();
  } finally {
    if (original === undefined) {
      delete policies[slug];
    } else {
      policies[slug] = original;
    }
  }
}

describe("Early Access agreement documents", () => {
  it("publishes the reviewed Early Access Product Policy as early_access_terms/v2", () => {
    expect(EARLY_ACCESS_PRODUCT_POLICY_SLUG).toBe("early-access-product-policy");
    const policy = policies[EARLY_ACCESS_PRODUCT_POLICY_SLUG];
    expect(policy?.title).toBe("Early Access Product Policy");
    expect(policy?.updated).toBe("November 2026");
    expect(policy?.agreement).toEqual({ kind: "early_access_terms", version: "v2" });
    expect(EARLY_ACCESS_PRODUCT_POLICY_AGREEMENT).toEqual({
      kind: "early_access_terms",
      version: "v2",
    });
    expect(policy?.sections.map((section) => section.heading)).toEqual([
      "About Early Access",
      "Requests, review and availability",
      "Clinical products",
      "Supplements",
      "Research-only products",
      "Topicals, supplies and services",
      "Product details and artwork",
      "Shipping, returns and replacements",
      "Information and support",
    ]);
    expect(
      policy?.sections.reduce((count, section) => count + section.paragraphs.length, 0),
    ).toBe(14);
    expect(policy?.sections.every((section) => section.bullets === undefined)).toBe(true);
  });

  it("pins the v2 body to the digest that was reviewed", () => {
    expect(EARLY_ACCESS_PRODUCT_POLICY_CONTENT_SHA256).toBe(REVIEWED_V2_DIGEST);
    expect(researchPolicyContentSha256(policies[EARLY_ACCESS_PRODUCT_POLICY_SLUG])).toBe(
      REVIEWED_V2_DIGEST,
    );
  });

  it("keeps the v1 Research Use Policy byte-identical as the historical document", () => {
    const v1 = policies["research-use"];
    expect(v1?.title).toBe("Research Use Policy");
    expect(v1?.updated).toBe("July 2026");
    expect(v1?.agreement).toEqual({ kind: "early_access_terms", version: "v1" });
    expect(RESEARCH_USE_POLICY_AGREEMENT).toEqual({ kind: "early_access_terms", version: "v1" });
    expect(RESEARCH_USE_POLICY_CONTENT_SHA256).toBe(HISTORICAL_V1_DIGEST);
    expect(researchPolicyContentSha256(v1)).toBe(HISTORICAL_V1_DIGEST);
  });

  it("names v2, never v1, as the agreement a customer can accept now", () => {
    expect(publishedEarlyAccessAgreement()).toEqual({
      kind: "early_access_terms",
      version: "v2",
    });
  });

  it("closes when the v2 body drifts from its reviewed digest", () => {
    const reviewed = policies[EARLY_ACCESS_PRODUCT_POLICY_SLUG]!;
    withPolicy(
      EARLY_ACCESS_PRODUCT_POLICY_SLUG,
      { ...reviewed, updated: "December 2026" },
      () => expect(publishedEarlyAccessAgreement()).toBeNull(),
    );
    withPolicy(
      EARLY_ACCESS_PRODUCT_POLICY_SLUG,
      {
        ...reviewed,
        sections: reviewed.sections.map((section, index) =>
          index === 0
            ? { ...section, paragraphs: [`${section.paragraphs[0]} `] }
            : section,
        ),
      },
      () => expect(publishedEarlyAccessAgreement()).toBeNull(),
    );
    expect(publishedEarlyAccessAgreement()).toEqual({
      kind: "early_access_terms",
      version: "v2",
    });
  });

  it("closes when the v2 agreement metadata is missing, extended or replaced", () => {
    const reviewed = policies[EARLY_ACCESS_PRODUCT_POLICY_SLUG]!;
    const { agreement: _omitted, ...withoutAgreement } = reviewed;
    for (const replacement of [
      withoutAgreement,
      { ...reviewed, agreement: { kind: "early_access_terms", version: "v1" } },
      { ...reviewed, agreement: { kind: "early_access_terms", version: "v3" } },
      { ...reviewed, agreement: { kind: "terms", version: "v2" } },
      {
        ...reviewed,
        agreement: { kind: "early_access_terms", version: "v2", extra: "x" },
      } as unknown as ResearchPublishedPolicy,
    ]) {
      withPolicy(EARLY_ACCESS_PRODUCT_POLICY_SLUG, replacement, () =>
        expect(publishedEarlyAccessAgreement()).toBeNull(),
      );
    }
  });

  it("closes when the v2 document is absent, even though v1 is still published", () => {
    withPolicy(EARLY_ACCESS_PRODUCT_POLICY_SLUG, undefined, () => {
      expect(policies["research-use"]?.agreement).toEqual({
        kind: "early_access_terms",
        version: "v1",
      });
      expect(publishedEarlyAccessAgreement()).toBeNull();
    });
  });

  it("never lets the v1 document stand in for v2", () => {
    const v1 = policies["research-use"]!;
    withPolicy(
      EARLY_ACCESS_PRODUCT_POLICY_SLUG,
      { ...v1, agreement: { kind: "early_access_terms", version: "v2" } },
      () => expect(publishedEarlyAccessAgreement()).toBeNull(),
    );
  });
});

/**
 * Shipping and Returns carry the Early Access content package's operational
 * drafts, section for section. The section digests are the package's own
 * section bytes; the titles stay the served names the accepted v2 text refers
 * to. Neither document is an agreement, and both stay publication-unconfirmed
 * on their pages until their facts are reviewed.
 */
const PACKAGE_SHIPPING_SECTIONS_SHA256 =
  "55ee30908768f429097bd6d1570486521d2f9738a15c3ad8081b5751078d5b72";
const PACKAGE_RETURNS_SECTIONS_SHA256 =
  "26094b811c2ebbab426bdbdf4d5168fcb48d5c6312ddc142c42f16f4c1978722";

function sectionsSha256(policy: ResearchPublishedPolicy): string {
  return createHash("sha256").update(JSON.stringify(policy.sections), "utf8").digest("hex");
}

describe("linked Shipping and Returns documents", () => {
  it("serves the package's Shipping sections under the served Shipping Policy name", () => {
    const shipping = policies.shipping;
    expect(shipping.title).toBe("Shipping Policy");
    expect(shipping.updated).toBe("November 5, 2026");
    expect(sectionsSha256(shipping)).toBe(PACKAGE_SHIPPING_SECTIONS_SHA256);
    expect(researchPolicyContentSha256(shipping)).toBe(
      "344d429a87af01670910075a097988e9c900a976c2c327741581beb546a44950",
    );
    expect(shipping.agreement).toBeUndefined();
  });

  it("serves the package's Returns sections under the served Returns and Replacements name", () => {
    const returns = policies.returns;
    expect(returns.title).toBe("Returns and Replacements");
    expect(returns.updated).toBe("November 5, 2026");
    expect(sectionsSha256(returns)).toBe(PACKAGE_RETURNS_SECTIONS_SHA256);
    expect(researchPolicyContentSha256(returns)).toBe(
      "1f2b69d50e9466cff93214d14559d9bab5cf922ec99d5a05739e60cba6e820d3",
    );
    expect(returns.agreement).toBeUndefined();
  });

  it("drops the old single-supplier starter assumptions from Shipping", () => {
    expect(JSON.stringify(policies.shipping)).not.toMatch(/starter architecture|holds inventory/i);
  });
});

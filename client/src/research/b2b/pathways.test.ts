import { describe, expect, it } from "vitest";
import {
  buildPartnershipInquirySummary,
  PARTNERSHIP_CONTACT_MAILTO,
  PARTNERSHIP_INQUIRY_LIMITS,
  PARTNERSHIP_PATHWAYS,
  type PartnershipInquiryDraft,
} from "./pathways";

const draft: PartnershipInquiryDraft = {
  pathway: "clinic_medical_spa",
  name: "Synthetic Contact\nInjected header",
  businessEmail: "contact@example.test",
  organization: "Example Research Practice",
  role: "Operations lead",
  website: "https://example.test",
  region: "Texas",
  context: "We need a reviewed Research purchasing relationship that remains separate from provider-governed Care.",
};

describe("public B2B pathway contract", () => {
  it("names every required commercial relationship without silently merging pathways", () => {
    expect(PARTNERSHIP_PATHWAYS.map((pathway) => pathway.id)).toEqual([
      "research_organization",
      "clinic_medical_spa",
      "provider_practice",
      "affiliate",
      "supplier_lab_fulfillment",
      "white_label",
      "strategic_partner",
    ]);
    expect(new Set(PARTNERSHIP_PATHWAYS.map((pathway) => pathway.id)).size).toBe(
      PARTNERSHIP_PATHWAYS.length,
    );
    expect(PARTNERSHIP_PATHWAYS.find((pathway) => pathway.id === "provider_practice")?.route).toBe(
      "/research/organizations",
    );
    expect(
      PARTNERSHIP_PATHWAYS.filter((pathway) => pathway.route === "#partnership-inquiry").map(
        (pathway) => pathway.id,
      ),
    ).toEqual(["white_label", "strategic_partner"]);
  });

  it("builds a bounded plain-text handoff and removes injected line breaks from single-line fields", () => {
    const summary = buildPartnershipInquirySummary(draft);

    expect(summary).toContain("Pathway: Clinical businesses");
    expect(summary).toContain("Name: Synthetic Contact Injected header");
    expect(summary).toContain("provider-governed Care");
    expect(summary).toContain("not for clinical advice or patient, health, payment, credential, or secret information");
    expect(summary).not.toContain("Name: Synthetic Contact\nInjected header");
  });

  it("bounds every caller-supplied value even when the summary builder is called outside the form", () => {
    const oversized = buildPartnershipInquirySummary({
      ...draft,
      name: "N".repeat(PARTNERSHIP_INQUIRY_LIMITS.name + 25),
      context: "C".repeat(PARTNERSHIP_INQUIRY_LIMITS.context + 250),
    });

    expect(oversized).toContain(`Name: ${"N".repeat(PARTNERSHIP_INQUIRY_LIMITS.name)}`);
    expect(oversized).not.toContain("N".repeat(PARTNERSHIP_INQUIRY_LIMITS.name + 1));
    expect(oversized).toContain("C".repeat(PARTNERSHIP_INQUIRY_LIMITS.context));
    expect(oversized).not.toContain("C".repeat(PARTNERSHIP_INQUIRY_LIMITS.context + 1));
  });

  it("omits URL query and fragment values from the prepared summary", () => {
    const summary = buildPartnershipInquirySummary({
      ...draft,
      website: "https://example.test/partners?token=synthetic-secret#private",
    });

    expect(summary).toContain("Website: https://example.test/partners");
    expect(summary).not.toContain("synthetic-secret");
    expect(summary).not.toContain("#private");

    const credentialUrl = buildPartnershipInquirySummary({
      ...draft,
      website: "https://placeholder-user:placeholder-value@example.test/private",
    });
    expect(credentialUrl).toContain("Website: Not provided");
    expect(credentialUrl).not.toContain("placeholder-value");
  });

  it("keeps all contact data out of the static email URL", () => {
    expect(PARTNERSHIP_CONTACT_MAILTO).toMatch(/^mailto:research@xeniostechnology\.com\?subject=/);
    expect(PARTNERSHIP_CONTACT_MAILTO).not.toContain(draft.name);
    expect(PARTNERSHIP_CONTACT_MAILTO).not.toContain(draft.businessEmail);
    expect(PARTNERSHIP_CONTACT_MAILTO).not.toContain(draft.organization);
    expect(PARTNERSHIP_CONTACT_MAILTO).not.toContain("body=");
  });
});

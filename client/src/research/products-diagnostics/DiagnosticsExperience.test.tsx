import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import {
  BiomarkerCenter,
  DiagnosticsMemberHome,
  SuperpowerDiagnostics,
  type SuperpowerOfferView,
} from "./DiagnosticsExperience";
import {
  StorageAndOrganization,
  SupportCenter,
} from "./SupportStorageExperience";

beforeAll(() => {
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: new URL("https://xeniostechnology.com/research/member/diagnostics"),
  });
});

const offer: SuperpowerOfferView = {
  label: "Superpower Diagnostics",
  summary: "A transparent diagnostics offer is being prepared.",
  status: "coming_soon",
  availability: "Not currently enabled",
  collectionMethod: null,
  priceLabel: null,
  priceEffectiveDate: null,
  lastVerificationDate: null,
  disclosure: "No affiliate link is active today.",
  affiliateUrl: null,
  researchBoundary:
    "Bloodwork and diagnostic services are separate from Research products. Test results do not validate a Research product, establish its quality, or make it suitable for human use.",
};

describe("diagnostics member experience", () => {
  it("renders a disabled Superpower card with disclosure and no affiliate link", () => {
    const html = renderToStaticMarkup(<SuperpowerDiagnostics offer={offer} />);
    expect(html).toContain("Coming soon");
    expect(html).toContain("Partner offer not enabled");
    expect(html).toContain("No affiliate link is active today.");
    expect(html).not.toContain("sponsored noreferrer");
  });

  it("renders all biomarker states, consent, private upload, and qualified-review boundary", () => {
    const html = renderToStaticMarkup(
      <BiomarkerCenter record={{ state: "Results pending", updatedAt: null }} />,
    );
    for (const state of [
      "Not started",
      "Coming soon",
      "Test ordered",
      "Collection scheduled",
      "Results pending",
      "Results available through partner",
      "Report uploaded",
      "Review requested",
      "Qualified review complete",
      "Follow-up due",
      "Closed",
    ]) {
      expect(html).toContain(state);
    }
    expect(html).toContain("I consent to storing this report privately");
    expect(html).toContain("does not create an automated medical interpretation");
  });

  it("states that diagnostics does not validate Research products", () => {
    const html = renderToStaticMarkup(
      <DiagnosticsMemberHome
        offer={offer}
        biomarker={{ state: "Not started", updatedAt: null }}
      />,
    );
    expect(html).toContain("does not validate Research products");
  });

  it("uses the member shell and complete route states without diagnostics-only styling", () => {
    const populated = renderToStaticMarkup(
      <DiagnosticsMemberHome
        offer={offer}
        biomarker={{ state: "Not started", updatedAt: null }}
      />,
    );
    const unavailable = renderToStaticMarkup(
      <DiagnosticsMemberHome
        offer={offer}
        biomarker={{ state: "Not started", updatedAt: null }}
        state="unavailable"
      />,
    );
    const error = renderToStaticMarkup(
      <DiagnosticsMemberHome
        offer={offer}
        biomarker={{ state: "Not started", updatedAt: null }}
        state="error"
        errorMessage="Diagnostics request failed."
      />,
    );
    expect(populated).toContain("research-app");
    expect(populated).toContain("ra-pagehead");
    expect(unavailable).toContain("Diagnostics are not available right now.");
    expect(error).toContain("Diagnostics request failed.");
    expect(populated).not.toMatch(
      /linear-gradient|radial-gradient|rounded-\[2rem\]|rounded-2xl|shadow-(?:sm|md|lg|xl)|(?:slate|indigo|amber|emerald)-/,
    );
  });
});

describe("storage and support", () => {
  it("renders only neutral accessories with no administration guidance", () => {
    const accessories = [
      "Refrigerator thermometer",
      "Temperature logger",
      "Opaque organizer",
      "Lockable container",
      "Tamper-evident bag",
      "Labels",
      "Document organizer",
      "Inventory tray",
      "Insulated transport pouch",
      "Approved cool pack",
    ];
    const html = renderToStaticMarkup(
      <StorageAndOrganization accessories={accessories} />,
    );
    for (const accessory of accessories) expect(html).toContain(accessory);
    expect(html).toContain("not human administration supplies");
  });

  it("renders one Support Center with every topic", () => {
    const categories = [
      "Account",
      "Membership",
      "Assessment",
      "Plans",
      "Products",
      "Product requests",
      "Orders",
      "Shipping",
      "Certificates",
      "Diagnostics",
      "Supplements",
      "Programs",
      "Clinician-guided pathway interest",
      "Affiliate",
      "Professional accounts",
      "Privacy",
      "Accessibility",
      "General",
    ];
    const html = renderToStaticMarkup(<SupportCenter categories={categories} />);
    for (const category of categories) expect(html).toContain(category);
    expect((html.match(/Support Center/g) ?? []).length).toBe(1);
  });
});


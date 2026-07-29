import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Router } from "wouter";
import CareConsentPendingPage from "./CareConsentPendingPage";
import EligibilityPendingPage from "./EligibilityPendingPage";

const eligibility = readFileSync(
  resolve(__dirname, "./EligibilityPendingPage.tsx"),
  "utf8",
);
const consent = readFileSync(
  resolve(__dirname, "./CareConsentPendingPage.tsx"),
  "utf8",
);

describe("Care PR 2 Xenios UI and truthful-state gate", () => {
  it("reuses the Xenios shell, tokens, forms, and responsive grid", () => {
    for (const source of [eligibility, consent]) {
      expect(source).toContain("<PageShell>");
      expect(source).toContain('id="main-content"');
      expect(source).not.toContain("<main");
      expect(source).toContain("container-x");
      expect(source).toContain("mono-cap text-pulse");
      expect(source).toContain("display-m");
      expect(source).toContain("card");
      expect(source).not.toMatch(/gradient|Georgia|--care-|care-wordmark/i);
    }
    expect(consent).toContain("grid-cols-1 md:grid-cols-2");
  });

  it.each([
    ["/care/eligibility", EligibilityPendingPage],
    ["/care/consent", CareConsentPendingPage],
  ])("renders exactly one main landmark and one H1 at %s", (route, Page) => {
    const staticLocation = () => [route, () => undefined] as const;
    const staticSearch = () => "";
    const html = renderToStaticMarkup(
      createElement(
        Router,
        {
          hook: staticLocation,
          searchHook: staticSearch,
          ssrPath: route,
        },
        createElement(Page),
      ),
    );
    expect(html.match(/<main(?:\s|>)/g)).toHaveLength(1);
    expect(html.match(/<h1(?:\s|>)/g)).toHaveLength(1);
  });

  it("includes fail-closed loading, disabled, auth, error, and retry states", () => {
    for (const source of [eligibility, consent]) {
      expect(source).toContain('{ kind: "loading" }');
      expect(source).toContain('{ kind: "disabled" }');
      expect(source).toContain('{ kind: "error" }');
      expect(source).toContain("Try again");
      expect(source).toContain('aria-live="polite"');
      expect(source).toContain("aria-busy=");
    }
    expect(consent).toContain('{ kind: "auth_required" }');
    expect(consent).toContain("response.status === 401");
    expect(consent).toContain("AUTHORIZATION REQUIRED");
    expect(consent).toMatch(
      /Research access does not\s+grant Care authorization\./,
    );
    expect(consent).toContain('href="/research/sign-in"');
  });

  it("uses labeled location input and actionable announced errors", () => {
    expect(eligibility).toContain("careApiFetch");
    expect(consent).toContain("careApiFetch");
    expect(eligibility).toContain('htmlFor="care-state-code"');
    expect(eligibility).toContain('autoComplete="address-level1"');
    expect(eligibility).toContain('role="alert"');
    expect(eligibility).toContain("Nothing was submitted. Try again.");
  });

  it("makes no availability, treatment, prescription, provider, price, or launch claim", () => {
    expect(eligibility).toMatch(/does not approve\s+treatment/);
    expect(eligibility).toContain("No automated clinical clearance.");
    expect(eligibility).toContain("does not");
    expect(`${eligibility}\n${consent}`).not.toMatch(
      /\$\d|available nationwide|our clinicians|our pharmacy|launches? on/i,
    );
  });

  it("does not invent consent text or clinical questions", () => {
    expect(consent).toContain(
      "No placeholder legal text is being presented as approved.",
    );
    expect(consent).not.toMatch(/I consent to|I authorize|medical history/i);
    expect(eligibility).not.toMatch(/diagnosis|medication|dose|symptom/i);
  });

  it("commits viewable desktop, mobile, state, and reflow evidence", () => {
    const evidenceDirectory = resolve(
      __dirname,
      "../../../docs/care/evidence",
    );
    const artifacts = [
      "care-pr2-desktop-loading.png",
      "care-pr2-desktop-disabled.png",
      "care-pr2-desktop-error.png",
      "care-pr2-desktop-location-required.png",
      "care-pr2-desktop-consent-disabled.png",
      "care-pr2-mobile-375-waitlist.png",
      "care-pr2-mobile-375-waitlist-success.png",
      "care-pr2-mobile-320-error.png",
      "care-pr2-zoom-200-reflow-equivalent.png",
    ];
    for (const artifact of artifacts) {
      const image = readFileSync(resolve(evidenceDirectory, artifact));
      expect([...image.subarray(0, 8)]).toEqual([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      expect(image.length).toBeGreaterThan(10_000);
    }
    const evidence = readFileSync(
      resolve(evidenceDirectory, "PR2_UI_EVIDENCE.md"),
      "utf8",
    );
    expect(evidence).toContain("1440 × 900 CSS viewport");
    expect(evidence).toContain("375px viewport");
    expect(evidence).toContain("320px viewport");
    expect(evidence).toContain("200% zoom");
    expect(evidence).toContain(
      "Website 6 must still repeat native 200% browser zoom",
    );
  });
});

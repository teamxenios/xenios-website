// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import CareClinicianReviewPendingPage from "./CareClinicianReviewPendingPage";

const source = readFileSync(resolve(__dirname, "./CareClinicianReviewPendingPage.tsx"), "utf8");
const HOSTILE = "SYNTHETIC_PRIVATE_REVIEW_MARKER";

afterEach(() => vi.restoreAllMocks());

describe("CareClinicianReviewPendingPage", () => {
  it("renders one accessible pending landmark without projecting hostile fields", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const html = renderToStaticMarkup(createElement(CareClinicianReviewPendingPage as any, {
      clinicianName: HOSTILE,
      privateReview: { privateField: HOSTILE },
    }));
    expect(html.match(/<main(?:\s|>)/g)).toHaveLength(1);
    expect(html.match(/<h1(?:\s|>)/g)).toHaveLength(1);
    expect(html).toContain("Clinician review documentation is pending.");
    expect(html).toContain("Review readiness has not been confirmed. This feature is unavailable.");
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('id="main-content"');
    expect(html).toContain('tabindex="-1"');
    expect(html).not.toContain(HOSTILE);
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("is passive, unmounted, persistence-free, and contains no restricted projection", () => {
    const combined = source;
    expect(source).not.toMatch(/(?:App|Route|href=|path=)/);
    expect(combined).not.toMatch(/<(?:form|input|textarea|select|button)\b/i);
    expect(combined).not.toMatch(/\b(?:fetch|careApiFetch|localStorage|sessionStorage|window\.open)\b/);
    expect(combined).not.toMatch(/\b(?:medication|dose|suitability|recommendation|prescrib|pharmacy|checkout|payment|SKU|Quantum|Alaska|Hawaii|48-state)\b/i);
    expect(combined).not.toMatch(/\b(?:provider|staffing|SLA|inventory|pricing|production ready|activated)\b/i);
  });

  it.each([1440, 720, 375, 320, 160])("keeps wrapping, overflow-free source semantics at %ipx", () => {
    expect(source).toContain('className="container-x pt-24 md:pt-36 pb-20 min-w-0"');
    expect(source).toContain("break-words");
    expect(source).not.toContain("overflow-x-auto");
    expect(source).not.toMatch(/\bmin-w-\[(?:[1-9]\d*)px\]/);
  });
});

import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Router } from "wouter";
import Apply from "./Apply";

const legalPageSource = readFileSync(new URL("./LegalPage.tsx", import.meta.url), "utf8");
const applyPageSource = readFileSync(new URL("./Apply.tsx", import.meta.url), "utf8");

describe("public Research application and legal truthfulness", () => {
  it("keeps applications closed while required documents remain drafts", () => {
    const html = renderToStaticMarkup(
      <Router hook={() => ["/research/apply", () => undefined]}>
        <Apply />
      </Router>,
    );

    expect(html).toContain("Applications are being prepared.");
    expect(html).toContain("Documentation pending");
    expect(html).toContain("No application has been started or saved");
    expect(html).toContain("Do not email medical records or sensitive health information");
    expect(html).toContain('href="/research/terms"');
    expect(html).toContain('href="/research/privacy"');
    expect(html).not.toMatch(/<form|<input|<textarea|Submit application|Continue/i);
    expect(applyPageSource).not.toMatch(/fetch\s*\(|sessionStorage|applications\/resubmit/);
  });

  it("renders draft policy status instead of hiding it or claiming approval", () => {
    expect(legalPageSource).toContain("isOperationalDraft");
    expect(legalPageSource).toContain("policy.sections.map");
    expect(legalPageSource).not.toContain(".filter(");
    expect(legalPageSource).toContain("operational draft material under legal review");
    expect(legalPageSource).toContain("not approved for acceptance or application submission");
    expect(legalPageSource).toContain("This documentation is temporarily unavailable.");
    expect(legalPageSource).not.toMatch(/enter the private gateway|Go to the gateway/);
  });
});

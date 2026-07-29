import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  resolve(__dirname, "./CareAppointmentsPage.tsx"),
  "utf8",
);
const readiness = readFileSync(
  resolve(__dirname, "./CareAppointmentReadinessPanel.tsx"),
  "utf8",
);

describe("Care PR 3 appointment UI", () => {
  it("uses the existing Xenios shell and shared UI tokens", () => {
    expect(page).toContain("<PageShell>");
    expect(page).toContain("container-x");
    expect(page).toContain("text-pulse");
    expect(page).toContain('className="card');
    expect(page).toContain('id="main-content"');
    expect(page).not.toContain("<main");
    expect(page).not.toMatch(/gradient|Georgia|rounded-\[|shadow-(xl|2xl)/i);
  });

  it("provides fail-closed loading, disabled, auth, empty, populated, and retry states", () => {
    for (const state of [
      '"loading"',
      '"disabled"',
      '"auth_required"',
      '"ready"',
      '"error"',
      "Try again",
      "No Care appointments are recorded.",
    ]) {
      expect(page).toContain(state);
    }
    expect(page).toContain('aria-live="polite"');
    expect(page).toContain('aria-busy={state.kind === "loading"}');
    expect(page).toContain('href="/care/eligibility"');
    expect(page).not.toContain("/care/intake");
  });

  it("contains no fabricated clinician, pharmacy, product, state, price, or availability", () => {
    expect(page).not.toMatch(/\$\d+|Dr\.\s+[A-Z]|Rx\s|in stock|available in [A-Z]{2}/);
    expect(page).toContain(
      "A human clinician remains responsible for review and any decision.",
    );
  });

  it("shows exact required facts only in the authorized readiness surface", () => {
    expect(readiness).toContain("MEDICAL GROUP REQUIRED");
    expect(readiness).toContain("LICENSED CLINICIAN RECORD REQUIRED");
    expect(readiness).toContain("CLINICIAN LICENSE REQUIRED");
    expect(readiness).toContain("CLINICIAN COVERAGE REQUIRED");
    expect(readiness).toContain("TELEHEALTH PROVIDER REQUIRED");
    expect(readiness).toContain("CARE ACTIVATION APPROVAL REQUIRED");
    expect(page).not.toContain("MEDICAL GROUP REQUIRED");
    expect(page).toContain("<CareAppointmentReadinessPanel />");
    expect(readiness).toContain('{ kind: "disabled" }');
    expect(readiness).toContain('{ kind: "auth_required" }');
    expect(readiness).toContain("FRONTEND ACCESS");
    expect(readiness).toContain("Unavailable");
    expect(readiness).toContain('data-care-readonly-readiness="true"');
    expect(readiness).not.toContain('publicReady ? "Approved"');
    expect(readiness).not.toMatch(/\b(Create|Configure|Enter)\b/);
  });
});

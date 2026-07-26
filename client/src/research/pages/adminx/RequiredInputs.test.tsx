// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type {
  DomainReadiness,
  RequiredInput,
  RequiredInputSummary,
} from "@shared/research/required-inputs";
import { Dashboard } from "./RequiredInputs";

const SUMMARY: RequiredInputSummary = {
  total: 1,
  missing: 1,
  launchBlocking: 1,
  transactionBlocking: 0,
  clinicalBlocking: 0,
  entered: 0,
  underReview: 0,
  verified: 0,
  rejected: 0,
  expired: 0,
};

const INPUT: RequiredInput = {
  id: "077ff55c-8787-4713-9802-1e7d697ac967",
  key: "products.payment.credentials",
  domain: "products",
  label: "PAYMENT CREDENTIAL CONFIGURATION REQUIRED",
  description: "Approved payment configuration.",
  whyRequired: "Checkout cannot send a transaction without reviewed configuration.",
  recordType: "environment_configuration",
  recordId: null,
  fieldPath: "payments.credentials",
  currentState: "missing",
  blockingLevel: "blocks_public_launch",
  responsibleRole: "super_admin",
  verificationMethod: "Presence and provider account review.",
  evidenceRequired: ["Configuration name", "Provider approval"],
  entryMode: "external_secret",
  valueSensitivity: "sensitive_reference",
  enteredValue: null,
  externalReferenceName: null,
  enteredBy: null,
  enteredAt: null,
  verifiedBy: null,
  verifiedAt: null,
  rejectionReason: null,
  publicLaunchImpact: "Checkout remains unavailable.",
  nextAction: "Configure and verify the payment credential.",
  adminEntryHref: "/admin/research/required-inputs",
  version: 1,
  auditHistory: [],
};

const READINESS: DomainReadiness = {
  domain: "products",
  launchStatus: "internal_review",
  softwareComplete: true,
  realInputsRequired: true,
  publicEnabled: false,
  manifestApproved: true,
  expectedInputCount: 1,
  actualInputCount: 1,
  blockingInputCount: 1,
  blockingKeys: [INPUT.key],
  version: 2,
};

function renderDashboard(
  items: RequiredInput[],
  readiness: DomainReadiness[],
  summary: RequiredInputSummary,
) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <Dashboard
        token="admin-token"
        data={{ ok: true, items, readiness, summary }}
        reload={vi.fn()}
      />,
    );
  });
  return {
    host,
    unmount: () => act(() => root.unmount()),
  };
}

describe("required-input admin dashboard", () => {
  it("renders truthful empty register and readiness states", () => {
    const view = renderDashboard(
      [],
      [],
      { ...SUMMARY, total: 0, missing: 0, launchBlocking: 0 },
    );

    expect(view.host.textContent).toContain(
      "No required inputs have been defined.",
    );
    expect(view.host.textContent).toContain(
      "No readiness manifests are approved.",
    );
    view.unmount();
  });

  it("renders exact first-principles labels and separates software from real inputs", () => {
    const view = renderDashboard([INPUT], [READINESS], SUMMARY);

    expect(view.host.textContent).toContain(
      "PAYMENT CREDENTIAL CONFIGURATION REQUIRED",
    );
    expect(view.host.textContent).toContain("Software complete");
    expect(view.host.textContent).toContain("1 blocking input");
    expect(view.host.textContent).toContain("Configuration name");
    expect(
      view.host.querySelector('a[href="/admin/research/required-inputs"]'),
    ).not.toBeNull();
    expect(view.host.textContent).not.toContain("secret-value");
    view.unmount();
  });

  it("offers a secret configuration name, never a credential value, when entering external configuration", () => {
    const view = renderDashboard([INPUT], [READINESS], SUMMARY);
    const state = view.host.querySelector(
      `#state-${INPUT.id}`,
    ) as HTMLSelectElement;
    expect(state.value).toBe("entered");
    expect(
      view.host.querySelector(`label[for="entry-${INPUT.id}"]`)?.textContent,
    ).toContain("Secret configuration name");
    expect(view.host.textContent).toContain(
      "Never paste a credential value.",
    );
    view.unmount();
  });
});

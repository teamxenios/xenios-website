// @vitest-environment jsdom
// The lifecycle stepper against the server's real state machine
// (server/research/partners/partners.ts, nextPendingState): every PartnerState
// lands on exactly one truthful presentation — a position on the path, or an
// exception notice — and the "certified, awaiting activation" nuance the
// server exposes is said rather than rounded up to active.

import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PartnerState } from "@shared/research/distribution";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import type { PartnerSelfDto } from "../../adapters/partner";
import { LIFECYCLE_STEPS, PartnerLifecycle, lifecycleStatuses } from "./lifecycle";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

function render(partner: PartnerSelfDto): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<PartnerLifecycle partner={partner} />);
  });
  return container!;
}

function partnerIn(state: PartnerState, overrides: Partial<PartnerSelfDto> = {}): PartnerSelfDto {
  return {
    partnerId: "prt_1",
    role: "research_rep",
    state,
    certified: false,
    active: state === "active",
    training: [],
    agreements: [],
    ...overrides,
  };
}

describe("lifecycleStatuses maps every server state onto one truthful position", () => {
  it("a fresh application is the first step, everything else upcoming", () => {
    expect(lifecycleStatuses("application")).toEqual(["current", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming"]);
  });

  it("tax and payout clearance share one step, with earlier gates done", () => {
    expect(lifecycleStatuses("tax_status_pending")).toEqual(["done", "done", "current", "upcoming", "upcoming", "upcoming"]);
    expect(lifecycleStatuses("payout_status_pending")).toEqual(["done", "done", "current", "upcoming", "upcoming", "upcoming"]);
  });

  it("training and certification share one step", () => {
    expect(lifecycleStatuses("training_pending")).toEqual(["done", "done", "done", "done", "current", "upcoming"]);
    expect(lifecycleStatuses("certification_pending")).toEqual(["done", "done", "done", "done", "current", "upcoming"]);
  });

  it("active means every gate behind it is done", () => {
    expect(lifecycleStatuses("active")).toEqual(["done", "done", "done", "done", "done", "current"]);
  });

  it("exception states are not positions on the path", () => {
    expect(lifecycleStatuses("quality_review")).toBeNull();
    expect(lifecycleStatuses("suspended")).toBeNull();
    expect(lifecycleStatuses("terminated")).toBeNull();
  });

  it("every non-exception PartnerState has exactly one step claiming it", () => {
    const pathStates: PartnerState[] = [
      "application",
      "identity_verification_pending",
      "tax_status_pending",
      "payout_status_pending",
      "agreement_pending",
      "training_pending",
      "certification_pending",
      "active",
    ];
    for (const state of pathStates) {
      expect(LIFECYCLE_STEPS.filter((s) => s.states.includes(state))).toHaveLength(1);
    }
  });
});

describe("PartnerLifecycle renders server facts only", () => {
  it("marks the agreement step in progress for agreement_pending", () => {
    const view = render(partnerIn("agreement_pending"));
    const current = view.querySelector('[aria-current="step"]');
    expect(current?.textContent).toContain("Partner agreement");
    expect(current?.textContent).toContain("In progress");
    expect(view.textContent).toContain("Done");
    expect(view.textContent).toContain("Up next");
  });

  it("says certified-awaiting-activation instead of pretending activation", () => {
    const view = render(partnerIn("certification_pending", { certified: true }));
    expect(view.textContent).toContain("Certified — awaiting activation");
    expect(view.querySelector('[aria-current="step"]')?.textContent).toContain("Training and certification");
  });

  it("renders an active partner with the accepted agreements and completed training on record", () => {
    const view = render(
      partnerIn("active", {
        certified: true,
        agreements: [{ agreementKey: "partner_agreement", agreementVersion: "1.0.0", decidedAt: "2026-08-01T10:00:00Z" }],
        training: [{ moduleKey: "compliance_core", moduleVersion: "1.0.0", completedAt: "2026-08-03T10:00:00Z" }],
      }),
    );
    expect(view.textContent).toContain("Active");
    expect(view.querySelector('[data-testid="plc-record"]')?.textContent).toContain("partner agreement (v1.0.0) — 2026-08-01");
    expect(view.querySelector('[data-testid="plc-record"]')?.textContent).toContain("compliance core (v1.0.0) — 2026-08-03");
  });

  it("renders suspension as a notice, never as progress", () => {
    const view = render(partnerIn("suspended"));
    expect(view.querySelector('[data-testid="plc-exception"]')?.textContent).toContain("Suspended");
    expect(view.querySelector('[data-testid="plc-steps"]')).toBeNull();
    expect(view.textContent).not.toContain("Up next");
  });
});

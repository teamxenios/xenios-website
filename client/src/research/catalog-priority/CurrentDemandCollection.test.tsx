// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { describe, expect, it } from "vitest";
import { activationPresentation } from "./activation-presentation";
import { CurrentDemandCollection } from "./CurrentDemandCollection";
import {
  CURRENT_CLIENT_DEMAND_DEFINITIONS,
  PENDING_VARIANT_PLACEHOLDERS,
  projectActivationQueue,
  projectDemandDefinitions,
  type PriorityCatalogItem,
} from "./priority-config";

async function render(items: readonly PriorityCatalogItem[]) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  const root = createRoot(container);
  const memory = memoryLocation({ path: "/research/account", static: true });
  await act(async () => root.render(<Router hook={memory.hook}><CurrentDemandCollection items={items} showFilters={false} /></Router>));
  return { container, root };
}

describe("priority catalog activation UX", () => {
  it("uses closed status copy and truthful calls to action", () => {
    expect(activationPresentation("provider_required")).toMatchObject({ label: "Provider review required", actionLabel: "View Care requirements" });
    expect(activationPresentation("verbally_confirmed_pending_documentation")).toMatchObject({ label: "Documentation pending", actionable: true });
    expect(activationPresentation("unavailable")).toMatchObject({ label: "Unavailable", actionLabel: null, actionable: false });
  });

  // P1-7: held and unavailable never gain ANY action — not Buy Now, not
  // Order Now, not Available/In Stock, and not Join availability list. The
  // server resolver is monotonically restrictive; this pins the receiving side.
  it("held and unavailable states are terminal: no CTA of any kind", () => {
    for (const status of ["held", "unavailable"] as const) {
      const presentation = activationPresentation(status);
      expect(presentation.actionable, status).toBe(false);
      expect(presentation.actionLabel, status).toBeNull();
      for (const forbidden of ["Buy Now", "Order Now", "Available", "In Stock", "Join availability list"]) {
        expect(presentation.label, `${status} label must not read as ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("never presents provider-required or pending products as live", async () => {
    const items: readonly PriorityCatalogItem[] = [
      { key: "provider", title: "Example provider item", formulation: null, lanes: ["Provider / Care"], activationStatus: "provider_required", detailsPath: null, actionPath: "/research/account/care" },
      { key: "pending", title: "Example pending item", formulation: null, lanes: ["Request-only / Pending activation"], activationStatus: "verbally_confirmed_pending_documentation", detailsPath: null, actionPath: "/research/account/support" },
      { key: "held", title: "Example held item", formulation: null, lanes: ["Research"], activationStatus: "held", detailsPath: null, actionPath: "/research/account/support" },
    ];
    const { container, root } = await render(items);
    expect(container.textContent).toContain("Provider review required");
    expect(container.textContent).toContain("Documentation pending");
    expect(container.textContent).toContain("No ordering action available");
    expect(container.querySelector('[data-status="provider_required"]')?.textContent).not.toContain("Live");
    expect(container.querySelector('[data-status="verbally_confirmed_pending_documentation"]')?.textContent).not.toContain("Live");
    await act(async () => root.unmount());
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("keeps all exact-variant placeholders non-live and free of demand counts", () => {
    expect(PENDING_VARIANT_PLACEHOLDERS).toHaveLength(13);
    expect(PENDING_VARIANT_PLACEHOLDERS.every((item) => item.activationStatus === "pending_pharmacy_activation")).toBe(true);
    expect(JSON.stringify(PENDING_VARIANT_PLACEHOLDERS)).not.toMatch(/customerCount|mentions|Seth|Vitality/i);
  });

  it("fails closed when an activation status is missing", () => {
    const projected = projectDemandDefinitions({});
    expect(projected).toHaveLength(CURRENT_CLIENT_DEMAND_DEFINITIONS.length);
    expect(projected.every((item) => item.activationStatus === "unavailable")).toBe(true);
  });

  it("projects the served activation queue verbatim — statuses are never loosened", () => {
    const projected = projectActivationQueue([
      { key: "Q-2026-08-26-01", title: "Retatrutide 48 mg", status: "verbally_confirmed_pending_documentation" },
      { key: "Q-2026-08-26-11", title: "Initial hormone-evaluation labs", status: "unavailable" },
    ]);
    expect(projected).toHaveLength(2);
    expect(projected[0].activationStatus).toBe("verbally_confirmed_pending_documentation");
    expect(projected[1].activationStatus).toBe("unavailable");
    expect(projected.every((item) => item.detailsPath === null)).toBe(true);
    expect(projected.every((item) => item.actionPath === "/research/account/support")).toBe(true);
    expect(projected.every((item) => item.lanes.includes("Request-only / Pending activation"))).toBe(true);
    // no live, no orderable state can come out of this projection
    expect(projected.some((item) => item.activationStatus === "live")).toBe(false);
    expect(JSON.stringify(projected)).not.toMatch(/customerCount|mentions|Seth|Vitality/i);
  });
});

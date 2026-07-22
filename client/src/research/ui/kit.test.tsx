// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import {
  ResearchCapabilityBoundary,
  ResearchDataTable,
  ResearchRouteBoundary,
  ResearchSelectCard,
  ResearchStatusBadge,
} from "./kit";
import { pendingStatus } from "../lib/capabilities";

function render(ui: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(ui));
  return {
    host,
    unmount: () => act(() => root.unmount()),
  };
}

describe("research ui kit", () => {
  it("capability boundary renders children only when enabled, a truthful pending panel otherwise", () => {
    const pending = render(
      <ResearchCapabilityBoundary status={pendingStatus("membership_billing")}>
        <p data-testid="live-content">live</p>
      </ResearchCapabilityBoundary>,
    );
    expect(pending.host.querySelector('[data-testid="live-content"]')).toBeNull();
    expect(pending.host.textContent).toContain("Provider connection pending");
    expect(pending.host.textContent).toContain("Membership billing opens soon");
    pending.unmount();

    const enabled = render(
      <ResearchCapabilityBoundary
        status={{ ...pendingStatus("membership_billing"), state: "enabled" }}
      >
        <p data-testid="live-content">live</p>
      </ResearchCapabilityBoundary>,
    );
    expect(enabled.host.querySelector('[data-testid="live-content"]')).not.toBeNull();
    enabled.unmount();
  });

  it("capability boundary never shows admin configuration detail unless asked", () => {
    const status = {
      ...pendingStatus("transactional_email"),
      missingEnvironmentVariables: ["RESEND_API_KEY"],
    };
    const memberView = render(<ResearchCapabilityBoundary status={status}>x</ResearchCapabilityBoundary>);
    expect(memberView.host.textContent).not.toContain("RESEND_API_KEY");
    memberView.unmount();
    const adminView = render(
      <ResearchCapabilityBoundary status={status} showAdminDetail>
        x
      </ResearchCapabilityBoundary>,
    );
    expect(adminView.host.textContent).toContain("RESEND_API_KEY");
    adminView.unmount();
  });

  it("route boundary branches: loading, error with retry, unavailable, unauthorized, ok", () => {
    const retry = vi.fn();
    const err = render(<ResearchRouteBoundary state="error" onRetry={retry}>ok</ResearchRouteBoundary>);
    expect(err.host.querySelector('[data-testid="ra-error"]')).not.toBeNull();
    err.unmount();
    for (const [state, testid] of [
      ["loading", "ra-loading"],
      ["unavailable", "ra-empty"],
      ["unauthorized", "ra-empty"],
    ] as const) {
      const view = render(<ResearchRouteBoundary state={state}>ok</ResearchRouteBoundary>);
      expect(view.host.querySelector(`[data-testid="${testid}"]`)).not.toBeNull();
      view.unmount();
    }
    const ok = render(<ResearchRouteBoundary state="ok"><p data-testid="page">page</p></ResearchRouteBoundary>);
    expect(ok.host.querySelector('[data-testid="page"]')).not.toBeNull();
    ok.unmount();
  });

  it("select card exposes aria-pressed and a visible check, not color alone", () => {
    const view = render(
      <ResearchSelectCard selected onSelect={() => {}} label="Sleep better" description="d" />,
    );
    const button = view.host.querySelector("button")!;
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.textContent).toContain("✓");
    view.unmount();
  });

  it("status badge carries its state as text and data table renders an empty state", () => {
    const badge = render(<ResearchStatusBadge label="Pending review" tone="warning" />);
    expect(badge.host.textContent).toContain("Pending review");
    badge.unmount();
    const table = render(
      <ResearchDataTable caption="Orders" columns={[]} rows={[]} rowKey={() => ""} empty="No orders yet." />,
    );
    expect(table.host.textContent).toContain("No orders yet.");
    table.unmount();
  });
});

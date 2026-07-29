// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act, useState } from "react";
import {
  ResearchCapabilityBoundary,
  ResearchDataTable,
  ResearchModal,
  ResearchRouteBoundary,
  ResearchSelectCard,
  ResearchStatusBadge,
  ResearchTabPanel,
  ResearchTabs,
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

  it("modal traps Tab focus inside the dialog (forward wraps to first, Shift+Tab wraps to last)", () => {
    const view = render(
      <ResearchModal open title="Trap test" onClose={() => {}}>
        <button data-testid="modal-btn-1">One</button>
        <button data-testid="modal-btn-2">Two</button>
      </ResearchModal>,
    );
    const closeBtn = view.host.querySelector('button[aria-label="Close"]') as HTMLButtonElement;
    const btn2 = view.host.querySelector('[data-testid="modal-btn-2"]') as HTMLButtonElement;
    expect(closeBtn).not.toBeNull();
    expect(btn2).not.toBeNull();

    // Tab forward from the last focusable wraps around to the first.
    btn2.focus();
    expect(document.activeElement).toBe(btn2);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(closeBtn);

    // Shift+Tab from the first focusable wraps back around to the last.
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }),
      );
    });
    expect(document.activeElement).toBe(btn2);

    view.unmount();
  });

  it("modal closes on Escape and restores focus to the element that opened it", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const onClose = vi.fn();

    act(() => {
      root.render(
        <ResearchModal open title="Escape test" onClose={onClose}>
          <button>Inner</button>
        </ResearchModal>,
      );
    });
    const dialog = host.querySelector('[role="dialog"]') as HTMLElement;
    expect(document.activeElement).toBe(dialog);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    // The parent owns `open`; simulate it flipping to false in response to onClose.
    act(() => {
      root.render(
        <ResearchModal open={false} title="Escape test" onClose={onClose}>
          <button>Inner</button>
        </ResearchModal>,
      );
    });
    expect(document.activeElement).toBe(opener);

    act(() => root.unmount());
    host.remove();
    opener.remove();
  });

  it("tabs use roving tabindex and support ArrowLeft/ArrowRight/Home/End with wraparound", () => {
    const tabs = [
      { key: "a", label: "A" },
      { key: "b", label: "B" },
      { key: "c", label: "C" },
    ];
    function Harness() {
      const [active, setActive] = useState("a");
      return <ResearchTabs tabs={tabs} active={active} onSelect={setActive} label="Demo tabs" />;
    }
    const view = render(<Harness />);
    const tabButtons = () => Array.from(view.host.querySelectorAll('[role="tab"]')) as HTMLButtonElement[];

    let buttons = tabButtons();
    expect(buttons.map((b) => b.tabIndex)).toEqual([0, -1, -1]);
    expect(buttons.map((b) => b.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    // Backward compatible: no panelId supplied, so no dangling aria-controls reference.
    expect(buttons[0].hasAttribute("aria-controls")).toBe(false);

    buttons[0].focus();
    act(() => {
      buttons[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    });
    buttons = tabButtons();
    expect(buttons.map((b) => b.getAttribute("aria-selected"))).toEqual(["false", "true", "false"]);
    expect(buttons.map((b) => b.tabIndex)).toEqual([-1, 0, -1]);
    expect(document.activeElement).toBe(buttons[1]);

    act(() => {
      buttons[1].dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));
    });
    buttons = tabButtons();
    expect(buttons.map((b) => b.getAttribute("aria-selected"))).toEqual(["false", "false", "true"]);
    expect(document.activeElement).toBe(buttons[2]);

    // Wraps from the last tab back to the first.
    act(() => {
      buttons[2].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    });
    buttons = tabButtons();
    expect(buttons.map((b) => b.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    expect(document.activeElement).toBe(buttons[0]);

    act(() => {
      buttons[0].dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }));
    });
    buttons = tabButtons();
    expect(buttons.map((b) => b.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);

    view.unmount();
  });

  it("tabs opt into full tabpanel association when a panelId is supplied, without breaking callers who omit it", () => {
    const view = render(
      <ResearchTabs
        tabs={[{ key: "a", label: "A", panelId: "panel-a" }, { key: "b", label: "B" }]}
        active="a"
        onSelect={() => {}}
        label="Optional panel wiring"
      />,
    );
    const tabA = view.host.querySelector('[role="tab"]') as HTMLElement;
    expect(tabA.getAttribute("aria-controls")).toBe("panel-a");
    const panel = render(
      <ResearchTabPanel id="panel-a" tabId={tabA.id}>
        content
      </ResearchTabPanel>,
    );
    const panelEl = panel.host.querySelector('[role="tabpanel"]') as HTMLElement;
    expect(panelEl.id).toBe("panel-a");
    expect(panelEl.getAttribute("aria-labelledby")).toBe(tabA.id);
    panel.unmount();
    view.unmount();
  });
});

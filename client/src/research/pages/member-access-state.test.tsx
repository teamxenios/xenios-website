// @vitest-environment jsdom
// The distinct screens for server-issued member-access denial codes: one code,
// one screen, each with its own testid and our own copy (never the server's
// text, never the raw code). Routing pins live in lib/member-routing.test.ts;
// this file pins what each screen renders.
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import MemberAccessState from "./MemberAccessState";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

const ALL_SCREEN_TESTIDS = [
  "access-state-recovery_session",
  "access-state-billing_past_due",
  "access-state-billing_attention",
  "access-state-membership_inactive",
  "access-state-account_access_required",
  "access-state-account_closed",
  "access-state-unknown",
];

async function renderAt(search: string) {
  window.history.replaceState(null, "", `/research/access-state${search}`);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<MemberAccessState />);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return container!;
}

function onlyScreen(view: HTMLElement, testid: string) {
  expect(view.querySelector(`[data-testid="${testid}"]`)).not.toBeNull();
  for (const other of ALL_SCREEN_TESTIDS.filter((id) => id !== testid)) {
    expect(view.querySelector(`[data-testid="${other}"]`)).toBeNull();
  }
}

describe("the access-state screens", () => {
  it("renders the recovery-session screen with the reset next step", async () => {
    const view = await renderAt("?code=recovery_session");
    onlyScreen(view, "access-state-recovery_session");
    expect(view.textContent).toContain("Not available during password recovery.");
    const reset = view.querySelector('[data-testid="link-access-state-reset"]') as HTMLAnchorElement;
    expect(reset?.getAttribute("href")).toBe("/research/reset-password");
  });

  it("renders the past-due billing screen with the support next step", async () => {
    const view = await renderAt("?code=billing_past_due");
    onlyScreen(view, "access-state-billing_past_due");
    expect(view.textContent).toContain("Billing needs attention.");
    expect(view.textContent).toContain("past-due account status");
    expect(view.textContent).toContain("no payment or automatic reactivation is requested here");
    const support = view.querySelector('[data-testid="link-access-state-billing-support"]') as HTMLAnchorElement;
    expect(support?.getAttribute("href")).toBe("mailto:research@xeniostechnology.com");
  });

  it.each(["billing_paused", "billing_delinquent"])(
    "renders the billing-attention screen for the dynamic family code %s, without claiming a payment is late",
    async (code) => {
      const view = await renderAt(`?code=${code}`);
      onlyScreen(view, "access-state-billing_attention");
      expect(view.textContent).toContain("Billing needs attention.");
      expect(view.textContent).not.toContain("past due");
      expect(view.textContent).not.toContain(code);
    },
  );

  it("renders the inactive-membership screen with apply and support next steps", async () => {
    const view = await renderAt("?code=membership_inactive");
    onlyScreen(view, "access-state-membership_inactive");
    expect(view.textContent).toContain("Account access is not active.");
    expect(view.textContent).toContain("need an explicit review");
    expect(view.textContent).not.toContain("Apply for membership");
    const apply = view.querySelector('[data-testid="link-access-state-apply"]') as HTMLAnchorElement;
    expect(apply?.getAttribute("href")).toBe("/research/apply");
  });

  it.each([
    ["account_access_required", "Customer access is not set up yet."],
    ["account_closed", "This account is closed."],
  ])("renders the exact %s refusal without promoting it into an approval", async (code, title) => {
    const view = await renderAt(`?code=${code}`);
    onlyScreen(view, `access-state-${code}`);
    expect(view.textContent).toContain(title);
    expect(view.querySelector('[data-testid="link-access-state-account-support"]')?.getAttribute("href"))
      .toBe("mailto:research@xeniostechnology.com");
    expect(view.querySelector("form")).toBeNull();
    expect(view.querySelector('a[href="/research/account"]')).toBeNull();
  });

  it("redirects activation_required to the canonical activation flow instead of duplicating it", async () => {
    await renderAt("?code=activation_required");
    expect(window.location.pathname).toBe("/research/activate");
  });

  it("renders the calm unknown screen for a code it has never seen, and never echoes it", async () => {
    const view = await renderAt("?code=some_future_code_v9");
    onlyScreen(view, "access-state-unknown");
    expect(view.textContent).toContain("This is not available right now.");
    expect(view.textContent).not.toContain("some_future_code_v9");
  });

  it("treats a code outside the grammar as unknown, so arbitrary text never influences rendering", async () => {
    for (const hostile of ["%3Cscript%3Ealert(1)%3C%2Fscript%3E", "Billing_PAUSED", "a".repeat(80)]) {
      if (root) act(() => root!.unmount());
      container?.remove();
      root = null;
      container = null;
      const view = await renderAt(`?code=${hostile}`);
      onlyScreen(view, "access-state-unknown");
      expect(view.textContent).not.toContain("script");
      expect(view.textContent).not.toContain("alert(1)");
    }
  });

  it("renders the unknown screen when no code is provided", async () => {
    const view = await renderAt("");
    onlyScreen(view, "access-state-unknown");
  });

  it("gives every screen a route back to the gateway", async () => {
    for (const code of ["recovery_session", "billing_past_due", "billing_paused", "membership_inactive", "nope"]) {
      if (root) act(() => root!.unmount());
      container?.remove();
      root = null;
      container = null;
      const view = await renderAt(`?code=${code}`);
      const gateway = view.querySelector('[data-testid="link-access-state-gateway"]') as HTMLAnchorElement;
      expect(gateway?.getAttribute("href")).toBe("/research");
    }
  });

  it("announces the denial assertively: every screen is a role=alert region", async () => {
    for (const [code, testid] of [
      ["recovery_session", "access-state-recovery_session"],
      ["billing_past_due", "access-state-billing_past_due"],
      ["membership_inactive", "access-state-membership_inactive"],
    ] as const) {
      if (root) act(() => root!.unmount());
      container?.remove();
      root = null;
      container = null;
      const view = await renderAt(`?code=${code}`);
      const screen = view.querySelector(`[data-testid="${testid}"]`);
      expect(screen?.getAttribute("role")).toBe("alert");
    }
  });
});

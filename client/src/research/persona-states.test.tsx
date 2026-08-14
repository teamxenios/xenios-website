// @vitest-environment jsdom
// Member-persona route-gate states. RequireMember is presentation only (the
// server enforces authorization on every API call), but the client gate must
// still route each persona honestly: a signed-out visitor goes to sign-in, a
// pending-activation member goes to the activation flow, and only an active
// member sees member content. The fixture context values flow through the
// exported ResearchContext from core, which exists for development and test
// rendering only.

import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { ResearchContext, type ResearchContextValue, type MemberInfo } from "./core";
import { RequireMember } from "./pages/MemberArea";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

// Only the fields RequireMember reads need real values; the rest of the
// provider surface is irrelevant to the gate and stays absent (test-only cast).
function fixtureContext(member: MemberInfo | null, memberChecking = false): ResearchContextValue {
  return {
    gate: "open",
    member,
    memberToken: member ? "member-jwt" : null,
    memberChecking,
    recovery: "none",
  } as ResearchContextValue;
}

function renderGate(value: ResearchContextValue, path = "/research/member") {
  window.history.replaceState(null, "", path);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root!.render(
      <ResearchContext.Provider value={value}>
        <RequireMember>
          <div data-testid="member-content">private member content</div>
        </RequireMember>
      </ResearchContext.Provider>,
    ),
  );
  return container;
}

describe("member persona states (RequireMember)", () => {
  it("redirects a signed-out visitor to sign-in and renders no member content", () => {
    const view = renderGate(fixtureContext(null));
    expect(window.location.pathname).toBe("/research/sign-in");
    expect(new URLSearchParams(window.location.search).get("returnTo")).toBe("/research/member");
    expect(view.querySelector('[data-testid="member-content"]')).toBeNull();
  });

  it("preserves a safe protected deep link through sign-in", () => {
    renderGate(fixtureContext(null), "/research/member/security?from=expired-session");
    expect(window.location.pathname).toBe("/research/sign-in");
    expect(new URLSearchParams(window.location.search).get("returnTo"))
      .toBe("/research/member/security?from=expired-session");
  });

  it("redirects a pending_activation member to the activation flow", () => {
    const view = renderGate(
      fixtureContext({ firstName: "Sam", status: "pending_activation", applicationStatus: "approved" }),
    );
    expect(window.location.pathname).toBe("/research/activate");
    expect(view.querySelector('[data-testid="member-content"]')).toBeNull();
  });

  it("renders children for an active member without redirecting", () => {
    const view = renderGate(fixtureContext({ firstName: "Sam", status: "active", applicationStatus: null }));
    expect(window.location.pathname).toBe("/research/member");
    expect(view.querySelector('[data-testid="member-content"]')).toBeTruthy();
    expect(view.textContent).toContain("private member content");
  });

  // Ordinary member content redirects each non-active status to ITS screen,
  // mirroring the server guard's classification (member-auth.ts): past_due is
  // a billing state, paused/closed are inactive membership. The privacy-rights
  // surface stays reachable for all of them so consent can be withdrawn.
  it.each([
    ["paused", "membership_inactive"],
    ["past_due", "billing_past_due"],
    ["closed", "membership_inactive"],
  ])(
    "allows a %s subject to reach only the privacy-rights surface, and routes ordinary content to the %s screen",
    (status, expectedCode) => {
      const privacy = renderGate(
        fixtureContext({ firstName: "Sam", status, applicationStatus: null }),
        "/research/member/privacy",
      );
      expect(window.location.pathname).toBe("/research/member/privacy");
      expect(privacy.querySelector('[data-testid="member-content"]')).toBeTruthy();

      act(() => root!.unmount());
      container?.remove();
      root = null;
      container = null;

      const ordinary = renderGate(
        fixtureContext({ firstName: "Sam", status, applicationStatus: null }),
        "/research/member",
      );
      expect(window.location.pathname).toBe("/research/access-state");
      expect(new URLSearchParams(window.location.search).get("code")).toBe(expectedCode);
      expect(ordinary.querySelector('[data-testid="member-content"]')).toBeNull();
    },
  );

  it("shows the quiet checking state (no redirect, no content) while the session is verified", () => {
    const view = renderGate(fixtureContext(null, true));
    expect(window.location.pathname).toBe("/research/member");
    expect(view.querySelector('[data-testid="member-content"]')).toBeNull();
    expect(view.textContent).toContain("xenios research");
  });
});

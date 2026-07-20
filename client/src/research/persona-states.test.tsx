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

function renderGate(value: ResearchContextValue) {
  window.history.replaceState(null, "", "/research/member");
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
    expect(view.querySelector('[data-testid="member-content"]')).toBeNull();
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

  it("shows the quiet checking state (no redirect, no content) while the session is verified", () => {
    const view = renderGate(fixtureContext(null, true));
    expect(window.location.pathname).toBe("/research/member");
    expect(view.querySelector('[data-testid="member-content"]')).toBeNull();
    expect(view.textContent).toContain("xenios research");
  });
});

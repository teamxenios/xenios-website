// @vitest-environment jsdom
// The account-portal gate exemption (release integration, 2026-08-27).
//
// The six registered portal routes render bare through ResearchLayout even
// while the shared review gate is locked, because RequireMember + the Bearer
// API boundary are the real protection there — the review password would only
// LOCK OUT a signed-out customer before the sign-in redirect could capture
// their exact returnTo. The exemption is the registered set, never a prefix:
// a parked sibling under /research/account still meets the review gate.

import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import ResearchLayout from "../layout";
import { ResearchContext, type ResearchContextValue } from "../core";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

// Only the fields ResearchLayout reads need real values (test-only cast).
function lockedContext(): ResearchContextValue {
  return {
    gate: "locked",
    member: null,
    memberToken: null,
    memberChecking: false,
    recovery: "none",
    submitPassword: async () => null,
  } as unknown as ResearchContextValue;
}

function renderLayout(path: string) {
  window.history.replaceState(null, "", path);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root!.render(
      <ResearchContext.Provider value={lockedContext()}>
        <ResearchLayout>
          <div data-testid="route-content">route content</div>
        </ResearchLayout>
      </ResearchContext.Provider>,
    ),
  );
  return container;
}

describe("account portal review-gate exemption", () => {
  it("renders every registered portal route bare while the review gate is locked", () => {
    for (const path of [
      "/research/account",
      "/research/account/orders",
      "/research/account/subscription",
      "/research/account/care",
      "/research/account/documents",
      "/research/account/support",
    ]) {
      const view = renderLayout(path);
      expect(view.querySelector('[data-testid="route-content"]'), path).not.toBeNull();
      expect(view.textContent, path).not.toContain("This area is under review.");
      act(() => root!.unmount());
      container?.remove();
      root = null;
      container = null;
    }
  });

  it("keeps an unregistered sibling under /research/account behind the review gate", () => {
    for (const path of ["/research/account/sign-in", "/research/account/anything-else"]) {
      const view = renderLayout(path);
      expect(view.querySelector('[data-testid="route-content"]'), path).toBeNull();
      expect(view.textContent, path).toContain("This area is under review.");
      act(() => root!.unmount());
      container?.remove();
      root = null;
      container = null;
    }
  });
});

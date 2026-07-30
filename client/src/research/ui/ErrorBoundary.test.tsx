// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import ResearchErrorBoundary from "./ErrorBoundary";

/**
 * Before this boundary existed there was NO error boundary anywhere in the app
 * (verified: zero getDerivedStateFromError / componentDidCatch under
 * client/src), so one uncaught render error unmounted the whole tree and every
 * /research route went blank white. These tests pin the two behaviours that
 * matter: it catches, and it lets the visitor out again.
 *
 * Rendering follows the section's existing convention (react-dom/client plus
 * act), not @testing-library, which is not a dependency of this repo.
 */

function Boom({ explode }: { explode: boolean }) {
  if (explode) throw new Error("kaboom");
  return <p>the real page</p>;
}

let host: HTMLDivElement;
let root: Root;

function mount(node: React.ReactNode) {
  act(() => {
    root.render(node);
  });
}

describe("ResearchErrorBoundary", () => {
  beforeEach(() => {
    // React logs caught render errors to console.error by design. Silence it so
    // the suite output stays readable, but still assert our own log fires.
    vi.spyOn(console, "error").mockImplementation(() => {});
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it("renders children when nothing throws", () => {
    mount(
      <ResearchErrorBoundary>
        <Boom explode={false} />
      </ResearchErrorBoundary>,
    );
    expect(host.textContent).toContain("the real page");
  });

  it("catches a render error instead of blanking the page", () => {
    mount(
      <ResearchErrorBoundary>
        <Boom explode />
      </ResearchErrorBoundary>,
    );
    // The whole point: something useful is on screen, not an empty document.
    expect(host.textContent).toContain("This page did not load.");
    expect((host.textContent ?? "").trim().length).toBeGreaterThan(0);
  });

  it("offers both recovery routes, reload and a way back to the gateway", () => {
    mount(
      <ResearchErrorBoundary>
        <Boom explode />
      </ResearchErrorBoundary>,
    );
    expect(host.querySelector('[data-testid="button-research-error-reload"]')).toBeTruthy();
    const home = host.querySelector('[data-testid="link-research-error-home"]');
    expect(home?.getAttribute("href")).toBe("/research");
  });

  it("tells the member their data is unaffected rather than implying loss", () => {
    mount(
      <ResearchErrorBoundary>
        <Boom explode />
      </ResearchErrorBoundary>,
    );
    expect(host.textContent).toContain("nothing you submitted was lost");
  });

  it("resets when the location changes, so the visitor is not trapped", () => {
    // The failure mode this guards: React keeps a fallback mounted until the
    // boundary is reset, so without resetKey a visitor who navigates away from
    // the broken page still sees the error screen on the working one.
    function Harness() {
      const [loc, setLoc] = useState("/research/broken");
      return (
        <>
          <button type="button" data-testid="nav" onClick={() => setLoc("/research/works")}>
            navigate
          </button>
          <ResearchErrorBoundary resetKey={loc}>
            <Boom explode={loc === "/research/broken"} />
          </ResearchErrorBoundary>
        </>
      );
    }
    mount(<Harness />);
    expect(host.textContent).toContain("This page did not load.");

    const nav = host.querySelector('[data-testid="nav"]') as HTMLButtonElement;
    act(() => {
      nav.click();
    });

    expect(host.textContent).not.toContain("This page did not load.");
    expect(host.textContent).toContain("the real page");
  });

  it("logs the error message without logging component props", () => {
    mount(
      <ResearchErrorBoundary>
        <Boom explode />
      </ResearchErrorBoundary>,
    );
    const calls = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const ours = calls.find((c) => String(c[0]).includes("[research] render error:"));
    expect(ours).toBeTruthy();
    // A research page's props can carry member data, so the boundary must never
    // widen its logging to props or state.
    expect(String(ours?.[1])).toContain("kaboom");
  });
});

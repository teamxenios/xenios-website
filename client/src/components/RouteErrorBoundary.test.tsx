// @vitest-environment jsdom
// The defect this guards (audit GAP-009): no error boundary existed anywhere in
// the SPA, so any throw inside a routed page — most realistically a failed lazy
// chunk fetch after a deploy replaced the hashed asset mid-session — unmounted
// the tree and left a blank document with nothing to click.
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function Boom(): never {
  throw new Error("chunk load failed");
}

function render(children: ReactNode, onReload?: () => void): HTMLDivElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<RouteErrorBoundary onReload={onReload}>{children}</RouteErrorBoundary>);
  });
  return host;
}

beforeAll(() => {
  // React logs a caught boundary error; silence it so a passing run is quiet.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("route error boundary", () => {
  it("renders children untouched when nothing throws", () => {
    const view = render(<p data-testid="page">the real page</p>);
    expect(view.querySelector('[data-testid="page"]')).toBeTruthy();
    expect(view.querySelector('[data-testid="route-error-boundary"]')).toBeNull();
  });

  it("renders a recovery screen instead of a blank document when a page throws", () => {
    const view = render(<Boom />);
    expect(view.querySelector('[data-testid="route-error-boundary"]')).toBeTruthy();
    expect(view.textContent).toContain("This page did not finish loading.");
    // The load-bearing assertion: the visitor has something to act on.
    expect(view.querySelector('[data-testid="button-error-reload"]')).toBeTruthy();
    expect(view.querySelector('[data-testid="link-error-home"]')).toBeTruthy();
    expect((view.textContent ?? "").trim().length).toBeGreaterThan(40);
  });

  it("offers reload as the recovery, because a stale chunk needs a fresh document", () => {
    const onReload = vi.fn();
    const view = render(<Boom />, onReload);
    const button = view.querySelector<HTMLButtonElement>('[data-testid="button-error-reload"]')!;
    act(() => {
      button.click();
    });
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("exposes exactly one main landmark and one h1 in the failed state", () => {
    const view = render(<Boom />);
    expect(view.querySelectorAll("main").length).toBe(1);
    expect(view.querySelectorAll("h1").length).toBe(1);
  });

  it("never puts the thrown error text on the page", () => {
    const view = render(<Boom />);
    expect(view.textContent).not.toContain("chunk load failed");
    expect(view.textContent).not.toMatch(/stack|at Object|Error:/i);
  });
});

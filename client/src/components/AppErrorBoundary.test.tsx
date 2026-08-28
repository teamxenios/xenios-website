// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppErrorBoundary, { markFailedDocumentNoIndex } from "./AppErrorBoundary";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
  document.head.querySelectorAll('meta[name="robots"], link[rel="canonical"], link[rel="alternate"]').forEach((node) => node.remove());
});

describe("markFailedDocumentNoIndex", () => {
  it("fails closed without leaving canonical or alternate claims", () => {
    document.head.innerHTML = [
      '<meta name="robots" content="index, follow">',
      '<link rel="canonical" href="https://xeniostechnology.com/product">',
      '<link rel="alternate" href="https://xeniostechnology.com/es/product">',
    ].join("");

    markFailedDocumentNoIndex(document);

    expect(document.title).toBe("Page unavailable, xenios");
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
      "noindex, nofollow",
    );
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.head.querySelector('link[rel="alternate"]')).toBeNull();
  });
});

describe("AppErrorBoundary", () => {
  it("renders a focused, actionable fallback without exposing exception text", () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    function BrokenPage(): never {
      throw new Error("PRIVATE_RUNTIME_MARKER");
    }

    act(() => {
      root.render(
        <AppErrorBoundary>
          <BrokenPage />
        </AppErrorBoundary>,
      );
    });

    const fallback = host.querySelector<HTMLElement>('[data-testid="app-error-boundary"]');
    expect(fallback).not.toBeNull();
    expect(fallback?.textContent).toContain("Reload page");
    expect(fallback?.textContent).toContain("Return home");
    expect(fallback?.textContent).not.toContain("PRIVATE_RUNTIME_MARKER");
    expect(document.activeElement).toBe(fallback);
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
      "noindex, nofollow",
    );

    act(() => root.unmount());
    errorLog.mockRestore();
  });
});

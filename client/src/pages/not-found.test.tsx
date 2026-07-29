// @vitest-environment jsdom
// The 404 page currently returns HTTP 200 (client-side routing soft-404), so
// it must tell search engines not to index it via a robots meta tag.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  globalThis.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) })) as any;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  document.head.querySelectorAll('meta[name="robots"], link[rel="canonical"], link[rel="alternate"]').forEach((el) => el.remove());
  vi.restoreAllMocks();
});

describe("NotFound page", () => {
  it("renders a noindex, nofollow robots meta and no canonical", async () => {
    const { default: NotFound } = await import("./not-found");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(<NotFound />));

    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, nofollow");
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
  });
});

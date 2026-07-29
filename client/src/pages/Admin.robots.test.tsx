// @vitest-environment jsdom
// The Supabase admin login surface must never be indexed: it is not public
// content and, previously, shipped with a self-canonical alongside no robots
// directive at all. This proves the noindex meta renders and the canonical
// is neutralized (unset), independent of Supabase configuration state.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/supabaseBrowser", () => ({
  getSupabaseBrowser: async () => null,
}));

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

async function flush(rounds = 3) {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

describe("Admin page", () => {
  it("renders a noindex, nofollow robots meta and no canonical", async () => {
    const { default: Admin } = await import("./Admin");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(<Admin />));
    await flush();

    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, nofollow");
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
  });
});

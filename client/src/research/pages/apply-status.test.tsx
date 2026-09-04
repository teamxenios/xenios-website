// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ApplyStatus from "./ApplyStatus";
import { researchAuthPath } from "@shared/research/auth-return-to";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("application claim destination", () => {
  it.each(["/research/account/orders", "https://outside.invalid", "/research/account?token=SECRET"])("scrubs claim credentials but preserves only safe destination %s", async (requested) => {
    window.history.replaceState(null, "", `/research/apply/status?token=demo-claim&returnTo=${encodeURIComponent(requested)}`);
    vi.stubGlobal("fetch", vi.fn(async (input) => ({
      ok: true,
      json: async () => String(input).startsWith("/api/research/applications/status")
        ? { ok: true, application: { firstName: "Fixture", status: "approved_sponsored_b2b" } }
        : { ok: true },
    })));
    const container = document.createElement("div");
    document.body.replaceChildren(container);
    root = createRoot(container);
    await act(async () => root!.render(<ApplyStatus />));
    expect(window.location.search).not.toContain("demo-claim");
    expect(window.location.search).not.toContain("SECRET");
    expect(window.location.search).not.toContain("outside");
    await act(async () => {
      for (const id of ["ca-password", "ca-confirm"]) {
        const input = container.querySelector(`#${id}`)!;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "demo-password");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(container.querySelector('[data-testid="card-claim-success"] a')?.getAttribute("href")).toBe(researchAuthPath("/research/sign-in", requested));
    expect(document.activeElement).toBe(container.querySelector('[data-testid="card-claim-success"]'));
    const claim = vi.mocked(fetch).mock.calls.find(([url]) => url === "/api/research/member/claim");
    expect(JSON.parse(claim![1]!.body as string)).toEqual({ token: "demo-claim", password: "demo-password" });
  });
});

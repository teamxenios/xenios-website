// @vitest-environment jsdom
// The ROUTED member home (/research/member renders pages/member/Dashboard)
// routes an active member into the Early Access catalog/cart surface: the
// "Products and orders" group links the registered /research/early-access
// route. Navigation only - that surface runs its own server-authoritative
// session gate; the browser decides no eligibility.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { ResearchContext, type ResearchContextValue } from "../core";
import MemberDashboard from "./member/Dashboard";
import { ACCESS_ROUTES } from "../lib/routes";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
  };
}

describe("the routed member home Early Access entry", () => {
  it("links the active member into the registered early-access surface", async () => {
    // Overview/capabilities endpoints answer unavailable; the dashboard still
    // renders its area groups with the honest default next step.
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(404, { ok: false })));
    window.history.replaceState(null, "", "/research/member");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <ResearchContext.Provider
          value={{
            gate: "open",
            member: { firstName: "Sam", status: "active", applicationStatus: null },
            memberToken: "member-jwt",
            memberChecking: false,
            memberSessionStatus: "authenticated",
            recovery: "none",
          } as ResearchContextValue}
        >
          <MemberDashboard />
        </ResearchContext.Provider>,
      );
    });
    for (let i = 0; i < 6; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
    const links = Array.from(container!.querySelectorAll("a"));
    const ea = links.find((a) => a.getAttribute("href") === ACCESS_ROUTES.earlyAccess);
    expect(ea).toBeTruthy();
    expect(ea!.textContent).toContain("Early Access");
  });
});

// @vitest-environment jsdom
// The billing-enforcement member journey, on a WIRED surface: a member whose
// status is active but whose billing_state is not (the server's
// requireActiveMember emits dynamic billing_* codes on every content API for
// them) must see the billing-family denial copy in place - not the generic
// fallback, not the raw code, not the server message. This proves the
// lib/denials billing family mapping is reachable through a real routed page
// (Orders), not just by rendering copy in isolation.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { ResearchContext, type ResearchContextValue } from "../core";
import Orders from "./member/Orders";

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

async function renderOrdersWithDenial(code: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: any) => {
      const url = String(typeof input === "string" ? input : input?.url ?? input);
      const path = url.split("?")[0];
      if (path === "/api/research/orders") {
        return jsonResponse(403, { ok: false, code, message: "raw server billing text" });
      }
      if (path === "/api/research/capabilities") {
        return jsonResponse(404, { ok: false });
      }
      return jsonResponse(404, { ok: false });
    }),
  );
  window.history.replaceState(null, "", "/research/member/orders");
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
        <Orders />
      </ResearchContext.Provider>,
    );
  });
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return container!;
}

describe("billing-family denial on the wired Orders surface", () => {
  it.each(["billing_paused", "billing_delinquent"])(
    "renders the billing-attention copy for a %s API refusal, never the raw code or server text",
    async (code) => {
      const view = await renderOrdersWithDenial(code);
      const notice = view.querySelector('[data-testid="ra-denial"]');
      expect(notice).not.toBeNull();
      expect(notice!.textContent).toContain("Billing needs attention.");
      expect(notice!.textContent).not.toContain(code);
      expect(notice!.textContent).not.toContain("raw server billing text");
      // Distinct from the generic fallback: the family mapping engaged.
      expect(notice!.textContent).not.toContain("This is not available right now.");
    },
  );

  it("keeps billing_past_due on its dedicated past-due copy through the same surface", async () => {
    const view = await renderOrdersWithDenial("billing_past_due");
    const notice = view.querySelector('[data-testid="ra-denial"]');
    expect(notice).not.toBeNull();
    expect(notice!.textContent).toContain("past due");
  });
});

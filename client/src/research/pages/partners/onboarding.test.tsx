// @vitest-environment jsdom
// The onboarding page's live "Where you stand" section against the LIVE
// endpoint (GET /api/research/partner/me, served by the commerce lane).
// Pins: the lifecycle position renders from server facts; a member with no
// partner record gets the honest no-record card with the apply path (the
// server's coded 404 arrives as unavailable through the client envelope);
// nothing about the richer portal-onboarding section changes while that
// endpoint stays unpublished.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { ResearchContext, type ResearchContextValue } from "../../core";
import Onboarding from "./Onboarding";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

const CONTEXT = {
  gate: "open",
  member: { firstName: "Avery", status: "active", applicationStatus: null },
  memberToken: "member-jwt",
  memberChecking: false,
  recovery: "none",
} as unknown as ResearchContextValue;

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
  };
}

function stubFetch(me: { status: number; body: unknown }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = String(url);
      if (path === "/api/research/partner/me") return jsonResponse(me.body, me.status);
      if (path === "/api/research/capabilities") return jsonResponse({ ok: true, capabilities: {} });
      // The portal onboarding endpoint is unpublished at this base.
      return jsonResponse({}, 404);
    }),
  );
}

async function renderOnboarding(): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <ResearchContext.Provider value={CONTEXT}>
        <Onboarding />
      </ResearchContext.Provider>,
    );
  });
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return container!;
}

describe("partner onboarding: where you stand", () => {
  it("renders the live lifecycle position from /partner/me", async () => {
    stubFetch({
      status: 200,
      body: {
        ok: true,
        partner: {
          partnerId: "prt_1",
          role: "research_rep",
          state: "agreement_pending",
          certified: false,
          active: false,
          training: [],
          agreements: [],
        },
      },
    });
    const view = await renderOnboarding();

    expect(view.textContent).toContain("Where you stand");
    const current = view.querySelector('[aria-current="step"]');
    expect(current?.textContent).toContain("Partner agreement");
    expect(current?.textContent).toContain("In progress");
    expect(view.querySelector('[data-testid="po-no-application"]')).toBeNull();
  });

  it("offers the apply path when no partner record exists (the coded 404 arrives as unavailable)", async () => {
    stubFetch({ status: 404, body: { ok: false, code: "partner_not_found" } });
    const view = await renderOnboarding();

    const card = view.querySelector('[data-testid="po-no-application"]');
    expect(card?.textContent).toContain("No partner record on file");
    const apply = Array.from(view.querySelectorAll("a")).find((a) => a.textContent?.includes("Apply to become a rep"));
    expect(apply?.getAttribute("href")).toBe("/research/partners/apply");
    // No fabricated position on the path.
    expect(view.querySelector('[data-testid="plc-steps"]')).toBeNull();
  });

  it("says certified-awaiting-activation truthfully for a certified partner", async () => {
    stubFetch({
      status: 200,
      body: {
        ok: true,
        partner: {
          partnerId: "prt_1",
          role: "research_rep",
          state: "certification_pending",
          certified: true,
          active: false,
          training: [{ moduleKey: "compliance_core", moduleVersion: "1.0.0", completedAt: "2026-08-03T10:00:00Z" }],
          agreements: [],
        },
      },
    });
    const view = await renderOnboarding();

    expect(view.textContent).toContain("Certified — awaiting activation");
    expect(view.textContent).not.toContain("No partner record on file");
  });
});

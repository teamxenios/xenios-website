// @vitest-environment jsdom
// The partner dashboard against the LIVE endpoints (GET /partner/dashboard,
// GET /partner/links). Pins: the rep's link and code render with working copy
// actions when the server issues them; no link is ever fabricated; a partner
// who is not yet active is pointed at onboarding; and the unpublished state
// stays the honest pending presentation.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { ResearchContext, type ResearchContextValue } from "../../core";
import Dashboard from "./Dashboard";

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

const ACTIVE_PARTNER = {
  partnerId: "prt_1",
  role: "research_rep",
  state: "active",
  leadCount: 12,
  conversionCount: 3,
  totalCommissionCents: 45_00,
  payableCents: 12_00,
  conversions: [{ attributedAt: "2026-08-01", eligibleNetCents: 50_00, commissionCents: 10_00, state: "payable" }],
  outstandingTraining: [],
};

const LINK = {
  code: "XR-AVERY",
  url: "https://research.example/r/XR-AVERY",
  channel: "signed_link",
  campaign: null,
  qrSvgPath: null,
};

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
  };
}

function stubFetch(routes: Record<string, { status: number; body: unknown }>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const hit = routes[String(url)];
      if (!hit) return jsonResponse({}, 404);
      return jsonResponse(hit.body, hit.status);
    }),
  );
}

function stubClipboard(): { writeText: ReturnType<typeof vi.fn> } {
  const clipboard = { writeText: vi.fn(async () => {}) };
  Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
  return clipboard;
}

async function renderDashboard(): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <ResearchContext.Provider value={CONTEXT}>
        <Dashboard />
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

describe("partner dashboard: link and code", () => {
  it("shows the issued link and code with working copy actions", async () => {
    const clipboard = stubClipboard();
    stubFetch({
      "/api/research/partner/dashboard": { status: 200, body: { ok: true, partner: ACTIVE_PARTNER } },
      "/api/research/partner/links": { status: 200, body: { ok: true, links: [LINK] } },
    });
    const view = await renderDashboard();

    const card = view.querySelector('[data-testid="pd-link-card"]');
    expect(card?.textContent).toContain("XR-AVERY");
    expect(card?.textContent).toContain("https://research.example/r/XR-AVERY");

    const copyLink = Array.from(card!.querySelectorAll("button")).find((b) => b.textContent === "Copy link");
    await act(async () => {
      copyLink!.click();
    });
    expect(clipboard.writeText).toHaveBeenCalledWith("https://research.example/r/XR-AVERY");
    expect(card?.textContent).toContain("Copied");

    // An active partner is not pointed at onboarding.
    expect(view.querySelector('[data-testid="pd-not-active"]')).toBeNull();
  });

  it("renders the honest issued-after-certification card when the server has issued no link", async () => {
    stubFetch({
      "/api/research/partner/dashboard": { status: 200, body: { ok: true, partner: ACTIVE_PARTNER } },
      "/api/research/partner/links": { status: 200, body: { ok: true, links: [] } },
    });
    const view = await renderDashboard();

    const panel = view.querySelector('[data-testid="pd-link-panel"]');
    expect(panel?.textContent).toContain("Issued after certification");
    expect(view.querySelector('[data-testid="pd-link-card"]')).toBeNull();
  });

  it("points a not-yet-active partner at onboarding", async () => {
    stubFetch({
      "/api/research/partner/dashboard": {
        status: 200,
        body: { ok: true, partner: { ...ACTIVE_PARTNER, state: "application", conversions: [] } },
      },
      "/api/research/partner/links": { status: 200, body: { ok: true, links: [] } },
    });
    const view = await renderDashboard();

    const notice = view.querySelector('[data-testid="pd-not-active"]');
    expect(notice?.textContent).toContain("not active yet");
    const link = Array.from(notice!.querySelectorAll("a")).find((a) => a.textContent?.includes("See where you stand"));
    expect(link?.getAttribute("href")).toBe("/research/partners/onboarding");
  });

  it("stays the honest pending presentation while the platform is unpublished", async () => {
    stubFetch({});
    const view = await renderDashboard();

    expect(view.textContent).toContain("The partner platform is being prepared.");
    expect(view.textContent).toContain("Issued after certification");
    // Nothing fabricated: no link card, no dollar figures.
    expect(view.querySelector('[data-testid="pd-link-card"]')).toBeNull();
    expect(view.textContent).not.toMatch(/\$\d/);
  });
});

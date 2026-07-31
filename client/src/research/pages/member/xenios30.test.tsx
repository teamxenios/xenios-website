// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResearchContext, type ResearchContextValue } from "../../core";
import Xenios30 from "./Xenios30";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

type Route = { status: number; body: unknown };
type Call = { url: string; method: string; body?: unknown };

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllGlobals();
});

const context = () => ({
  gate: "open",
  member: { firstName: "M", status: "active", applicationStatus: null },
  memberToken: "raw-token",
  memberChecking: false,
  recovery: "none",
}) as ResearchContextValue;

const plan = {
  planId: "plan/id",
  monthLabel: "2026-07",
  state: "published",
  version: 2,
  fitnessDocumentId: "fitness-doc",
  nutritionDocumentId: null,
  blueprintActions: ["Keep the published Blueprint action"],
  supplementFoundation: [{
    id: "rec-1",
    kind: "supplement_foundation",
    title: "Published foundation",
    disposition: "included",
    explanation: "Published explanation.",
    sourceSignals: ["assessment"],
  }],
  productGuidance: [],
  adherenceTargets: [{ key: "sessions", label: "Sessions", target: "12" }],
  trackerMetricKeys: ["plan_adherence"],
  checkInDueAt: "2026-08-03T00:00:00.000Z",
  reviewedBy: "Reviewer",
  publishedAt: "2026-07-31T04:00:00.000Z",
  memberAcknowledgedAt: null,
};

const canonical = {
  ok: true,
  current: plan,
  history: [
    { planId: "plan/id", monthLabel: "2026-07", state: "published" },
    { planId: "older", monthLabel: "2026-06", state: "superseded" },
  ],
};

async function render(routes: Record<string, Route>) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });
    const route = routes[`${method} ${url}`];
    if (!route) throw new Error(`unstubbed ${method} ${url}`);
    return new Response(JSON.stringify(route.body), {
      status: route.status,
      headers: { "Content-Type": "application/json" },
    });
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<ResearchContext.Provider value={context()}><Xenios30 /></ResearchContext.Provider>);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { view: host, calls };
}

describe("Xenios30", () => {
  it("loads the canonical path and preserves current plan and history fields", async () => {
    const { view, calls } = await render({
      "GET /api/research/plans/xenios30": { status: 200, body: canonical },
    });

    expect(calls).toEqual([{
      url: "/api/research/plans/xenios30",
      method: "GET",
      body: undefined,
    }]);
    expect(view.textContent).toContain("Keep the published Blueprint action");
    expect(view.textContent).toContain("Published foundation");
    expect(view.textContent).toContain("2026-06");
    expect(view.textContent).toContain("superseded");
    expect(calls.every((call) => !call.url.includes("/member/plans/xenios-30"))).toBe(true);
  });

  it("acknowledges the exact encoded current plan id with an empty body", async () => {
    const { view, calls } = await render({
      "GET /api/research/plans/xenios30": { status: 200, body: canonical },
      "POST /api/research/plans/xenios30/plan%2Fid/acknowledge": {
        status: 200,
        body: { ok: true, acknowledgedAt: "2026-07-31T05:00:00.000Z" },
      },
    });
    const button = Array.from(view.querySelectorAll("button"))
      .find((item) => item.textContent === "I have read this plan");

    await act(async () => {
      button!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(calls[1]).toEqual({
      url: "/api/research/plans/xenios30/plan%2Fid/acknowledge",
      method: "POST",
      body: {},
    });
    expect(view.textContent).toContain("Acknowledged");
    expect(calls.every((call) => !call.url.includes("/member/plans/xenios-30"))).toBe(true);
  });

  it("renders an honest empty current state while preserving published history", async () => {
    const { view } = await render({
      "GET /api/research/plans/xenios30": {
        status: 200,
        body: {
          ok: true,
          current: null,
          history: [{ planId: "older", monthLabel: "2026-06", state: "superseded" }],
        },
      },
    });

    expect(view.textContent).toContain("No published Xenios 30 plan");
    expect(view.textContent).toContain("2026-06");
    expect(view.textContent).not.toContain("Sample");
  });

  it.each([
    ["legacy envelope", { ok: true, plan: { version: "2026-07", fitness: ["PRIVATE_LEGACY"] } }],
    ["private draft", { ...canonical, current: { ...plan, state: "draft", blueprintActions: ["PRIVATE_DRAFT"] } }],
    ["extra private field", { ...canonical, current: { ...plan, privateNotes: "PRIVATE_NOTE" } }],
    ["malformed recommendation", {
      ...canonical,
      current: {
        ...plan,
        supplementFoundation: [{ ...plan.supplementFoundation[0], sourceSignals: [{ private: "PRIVATE_SIGNAL" }] }],
      },
    }],
  ])("fails closed for a %s payload", async (_name, body) => {
    const { view, calls } = await render({
      "GET /api/research/plans/xenios30": { status: 200, body },
    });

    expect(view.textContent).toContain("Something went wrong");
    expect(view.textContent).not.toContain("PRIVATE_");
    expect(calls.every((call) => !call.url.includes("/member/plans/xenios-30"))).toBe(true);
  });
});

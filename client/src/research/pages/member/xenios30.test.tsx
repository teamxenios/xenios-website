// @vitest-environment jsdom
// The member Xenios 30 page (/research/member/xenios-30) against the REAL
// server envelope from GET /api/research/plans/xenios30
// (server/research/plans.ts:621):
//   { ok: true, current: current ? toXenios30Plan(current) : null, history }
// with history = [{ planId, monthLabel, state }].
//
// Covered:
//   1. A published plan renders populated: month, version, reviewer, the
//      blueprint actions, the recommendation items with their dispositions,
//      the adherence targets with their targets, and the tracker metric KEYS
//      rendered as their labels. The fitness plan is a document reference, so
//      it points at the documents area; nutrition has no document, so it says
//      so honestly instead of implying an empty plan.
//   2. Acknowledgment posts to the plan's own id path, which is what the
//      server reads (plans.ts:639 reads req.params.planId).
//   3. current: null still renders the honest pending state, never a crash and
//      never an invented plan.
// The plan fixture is typed with the SHARED Xenios30Plan, so a drift in the
// server contract breaks this test at compile time.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import type { Xenios30Plan } from "@shared/research/member-platform";
import { ResearchContext, type ResearchContextValue } from "../../core";
import { __resetCapabilitiesCache } from "../../lib/capabilities";
import Xenios30Page from "./Xenios30";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  __resetCapabilitiesCache();
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
  __resetCapabilitiesCache();
});

function fixtureContext(): ResearchContextValue {
  return {
    gate: "open",
    member: { firstName: "Sam", status: "active", applicationStatus: null },
    memberToken: "member-jwt",
    memberChecking: false,
    recovery: "none",
  } as ResearchContextValue;
}

type StubRoute = { method: string; path: string; status: number; body: unknown };

const CAPABILITIES_PATH = "/api/research/capabilities";
const PLAN_PATH = "/api/research/plans/xenios30";

const calls: Array<{ method: string; url: string }> = [];

function stubFetch(routes: StubRoute[]) {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ method, url });
      const route = routes.find((r) => r.method === method && r.path === url);
      if (!route) throw new TypeError(`unstubbed fetch: ${method} ${url}`);
      return {
        status: route.status,
        ok: route.status >= 200 && route.status < 300,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => route.body,
      };
    }),
  );
}

async function settle() {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function renderPage(node: ReactNode): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<ResearchContext.Provider value={fixtureContext()}>{node}</ResearchContext.Provider>);
  });
  await settle();
  return container!;
}

function byTestId<T extends HTMLElement>(view: HTMLElement, id: string): T {
  const el = view.querySelector(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing [data-testid="${id}"]`);
  return el as T;
}

// ---------------------------------------------------------------------------
// The exact shape toXenios30Plan (server/research/plans.ts:111) serializes.
// ---------------------------------------------------------------------------

const PLAN_ID = "11111111-2222-4333-8444-555555555555";

const PUBLISHED_PLAN: Xenios30Plan = {
  planId: PLAN_ID,
  monthLabel: "2026-08",
  state: "published",
  version: 3,
  fitnessDocumentId: "doc-fitness-1",
  nutritionDocumentId: null,
  blueprintActions: [
    "Four strength sessions each week: upper and lower split.",
    "Protein anchor at every meal.",
  ],
  supplementFoundation: [
    {
      id: "sf-creatine",
      kind: "supplement_foundation",
      title: "Creatine",
      disposition: "recommended",
      explanation: "A daily foundation category carried over from your Blueprint.",
      sourceSignals: ["training frequency"],
    },
  ],
  productGuidance: [
    {
      id: "pg-foundation",
      kind: "product_option",
      title: "Foundation pathway items",
      disposition: "optional",
      explanation: "No new additions until this month's tracker data is reviewed.",
      sourceSignals: ["blueprint pathway"],
    },
  ],
  adherenceTargets: [
    { key: "training_days", label: "Training days", target: "4 per week" },
    { key: "logged_days", label: "Days logged", target: "25 this month" },
  ],
  trackerMetricKeys: ["plan_adherence", "sleep_and_recovery"],
  checkInDueAt: "2026-08-28T12:00:00.000Z",
  reviewedBy: "Samuel Boadu",
  publishedAt: "2026-08-01T12:00:00.000Z",
  memberAcknowledgedAt: null,
};

const HISTORY = [
  { planId: PLAN_ID, monthLabel: "2026-08", state: "published" },
  { planId: "prior-plan-id", monthLabel: "2026-07", state: "superseded" },
];

const PUBLISHED_ENVELOPE = { ok: true, current: PUBLISHED_PLAN, history: HISTORY };

const CAPABILITIES_OFF = { ok: true, capabilities: {} };

// ---------------------------------------------------------------------------

describe("Member Xenios 30", () => {
  it("renders the real server envelope: current plan plus history", async () => {
    stubFetch([
      { method: "GET", path: CAPABILITIES_PATH, status: 200, body: CAPABILITIES_OFF },
      { method: "GET", path: PLAN_PATH, status: 200, body: PUBLISHED_ENVELOPE },
    ]);
    const view = await renderPage(<Xenios30Page />);

    // The plan is found at `current`, so the pending copy is gone.
    expect(view.textContent).not.toContain("Your Xenios 30 plan is prepared after your Blueprint.");

    // Identity: the YYYY-MM month label, the numeric version, the reviewer and
    // the real publish date.
    expect(view.textContent).toContain("August 2026");
    const chips = byTestId(view, "x30-chips");
    expect(chips.textContent).toContain("Version 3");
    expect(chips.textContent).toContain("Reviewed by Samuel Boadu");
    expect(chips.textContent).toContain("Published Aug 1, 2026");
    expect(chips.textContent).toContain("Check-in Aug 28, 2026");

    // blueprintActions is a real string list on the server and renders whole.
    const actions = byTestId(view, "x30-actions");
    expect(actions.textContent).toContain("Four strength sessions each week: upper and lower split.");
    expect(actions.textContent).toContain("Protein anchor at every meal.");

    // Recommendation items render title, disposition and explanation.
    const supplements = byTestId(view, "x30-supplements");
    expect(supplements.textContent).toContain("Creatine");
    expect(supplements.textContent).toContain("Recommended");
    expect(supplements.textContent).toContain("A daily foundation category carried over from your Blueprint.");
    const products = byTestId(view, "x30-products");
    expect(products.textContent).toContain("Foundation pathway items");
    expect(products.textContent).toContain("Optional");

    // Adherence targets are { key, label, target }, so both parts render.
    const adherence = byTestId(view, "x30-adherence");
    expect(adherence.textContent).toContain("Training days");
    expect(adherence.textContent).toContain("4 per week");
    expect(adherence.textContent).toContain("Days logged");
    expect(adherence.textContent).toContain("25 this month");

    // Tracker metric KEYS render as their labels, never as raw keys.
    const tracker = byTestId(view, "x30-tracker");
    expect(tracker.textContent).toContain("Plan adherence");
    expect(tracker.textContent).toContain("Sleep and recovery");
    expect(view.textContent).not.toContain("plan_adherence");

    // The fitness plan is a document reference: point at the documents area,
    // never print the internal id.
    const fitness = byTestId(view, "x30-fitness");
    expect(fitness.textContent).toContain("published as a document");
    expect(fitness.querySelector('a[href="/research/member/documents"]')).not.toBeNull();
    expect(view.textContent).not.toContain("doc-fitness-1");

    // Nutrition has no document on this plan: honest absence, not a blank list.
    const nutrition = byTestId(view, "x30-nutrition");
    expect(nutrition.textContent).toContain("Prepared after your assessment.");

    // History lists earlier heads only; the current month is not repeated.
    const history = byTestId(view, "x30-history");
    expect(history.textContent).toContain("July 2026");
    expect(history.textContent).toContain("Superseded");
    expect(history.querySelectorAll("tbody tr").length).toBe(1);

    // The old envelope keys are not what the page reads.
    expect(calls.some((c) => c.method === "GET" && c.url === PLAN_PATH)).toBe(true);
  });

  it("acknowledges using the plan id the server reads from the path", async () => {
    const ackPath = `${PLAN_PATH}/${PLAN_ID}/acknowledge`;
    stubFetch([
      { method: "GET", path: CAPABILITIES_PATH, status: 200, body: CAPABILITIES_OFF },
      { method: "GET", path: PLAN_PATH, status: 200, body: PUBLISHED_ENVELOPE },
      {
        method: "POST",
        path: ackPath,
        status: 200,
        body: { ok: true, acknowledgedAt: "2026-08-05T12:00:00.000Z" },
      },
    ]);
    const view = await renderPage(<Xenios30Page />);

    const button = byTestId<HTMLButtonElement>(view, "x30-acknowledge-button");
    await act(async () => {
      button.click();
    });
    await settle();

    expect(calls).toContainEqual({ method: "POST", url: ackPath });
    expect(byTestId(view, "x30-acknowledge").textContent).toContain("Recorded. Thank you.");
    expect(byTestId(view, "x30-acknowledge").textContent).toContain("Acknowledged");
  });

  it("keeps the honest pending state when no plan is published yet", async () => {
    stubFetch([
      { method: "GET", path: CAPABILITIES_PATH, status: 200, body: CAPABILITIES_OFF },
      { method: "GET", path: PLAN_PATH, status: 200, body: { ok: true, current: null, history: [] } },
    ]);
    const view = await renderPage(<Xenios30Page />);

    // No plan sections, no invented content, no error.
    expect(view.querySelector('[data-testid="x30-actions"]')).toBeNull();
    expect(view.querySelector('[data-testid="x30-history"]')).toBeNull();
    expect(view.querySelector('[role="alert"]')).toBeNull();
    expect(view.textContent).not.toContain("Something went wrong");
    // The Blueprint capability is not enabled here, so the calm capability
    // panel carries the pending message.
    expect(byTestId(view, "ra-capability-blueprint").textContent).toContain(
      "Your Blueprint is prepared after the assessment.",
    );
  });

  it("renders the pending state when the blueprint capability is enabled and nothing is published", async () => {
    stubFetch([
      {
        method: "GET",
        path: CAPABILITIES_PATH,
        status: 200,
        body: { ok: true, capabilities: { blueprint: { enabled: true } } },
      },
      { method: "GET", path: PLAN_PATH, status: 200, body: { ok: true, current: null, history: [] } },
    ]);
    const view = await renderPage(<Xenios30Page />);
    expect(view.textContent).toContain("Your Xenios 30 plan is prepared after your Blueprint.");
  });
});

// @vitest-environment jsdom
// Xenios 90 (/research/member/xenios-90) against the REAL server envelope.
//
// The page's client adapter used to call an unregistered URL, so every load
// returned "unavailable" and the page rendered a permanent pending state.
// With the adapter fixed the request now reaches
// GET /api/research/plans/xenios90 (server/research/plans.ts:686), which
// answers { ok, plan, review } where plan is the shared Xenios90Plan:
// { planId, state, version (number), currentPhase, phaseGoals, milestones,
//   monthlyVersions, publishedAt }. There is no months array and no
// horizonLabel, so a normalizer that expects them renders three empty month
// cards forever.
//
// These tests pin the exact server shape: the SERVER_ENVELOPE fixture is
// copied from server/research/plans.test.ts (X90_CONTENT + toXenios90Plan) so
// the page cannot silently regress to the pending state again.
//
// fetch is stubbed with json content-type headers, matching the api lib.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { ResearchContext, type ResearchContextValue } from "../../core";
import { __resetCapabilitiesCache } from "../../lib/capabilities";
import Xenios90Page from "./Xenios90";

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
});

// Only the fields the page reads need real values (test-only cast, same
// pattern as subscriptions.test.tsx).
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

const PLAN_PATH = "/api/research/plans/xenios90";
const CAPABILITIES_ROUTE: StubRoute = {
  method: "GET",
  path: "/api/research/capabilities",
  status: 200,
  body: { ok: true, capabilities: {} },
};

function stubFetch(routes: StubRoute[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
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

async function renderPage(node: ReactNode): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<ResearchContext.Provider value={fixtureContext()}>{node}</ResearchContext.Provider>);
  });
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return container!;
}

function byTestId<T extends HTMLElement>(view: HTMLElement, id: string): T {
  const el = view.querySelector(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing [data-testid="${id}"]`);
  return el as T;
}

// ---------------------------------------------------------------------------
// The exact envelope GET /api/research/plans/xenios90 returns for a member
// with a published arc. Content values mirror X90_CONTENT in
// server/research/plans.test.ts; the column-owned fields (planId, state,
// version, currentPhase, publishedAt) are what toXenios90Plan serializes.
// ---------------------------------------------------------------------------

const SERVER_ENVELOPE = {
  ok: true,
  plan: {
    planId: "b0f0b0c6-2f1c-4a2a-9a1e-2b6f3a1d0e77",
    state: "published",
    version: 2,
    currentPhase: "progression",
    phaseGoals: {
      foundation: ["Build the base routine"],
      progression: ["Add challenge gradually"],
      consolidation: ["Make it a lifestyle"],
    },
    milestones: [
      { id: "m1", label: "Four steady weeks", targetMonth: 1, done: true },
      { id: "m2", label: "Weekly conditioning session added", targetMonth: 2, done: false },
    ],
    monthlyVersions: [{ monthLabel: "2026-07", xenios30PlanId: "plan-ref-1" }],
    publishedAt: "2026-07-01T00:00:00.000Z",
  },
  // monthlyReviewStateFor: reviewWeekStart is midnight UTC on a Monday and
  // slaDeadline stays null in this wave.
  review: {
    reviewWeekStart: "2026-08-03T00:00:00.000Z",
    checkInStatus: "due",
    earlyChangeUsedThisMonth: false,
    slaDeadline: null,
  },
};

// The same envelope with nothing published yet: plan is null, review is still
// sent. This is the state that must keep the honest pending presentation.
const UNPUBLISHED_ENVELOPE = {
  ok: true,
  plan: null,
  review: {
    reviewWeekStart: null,
    checkInStatus: "not_due",
    earlyChangeUsedThisMonth: false,
    slaDeadline: null,
  },
};

describe("Member Xenios 90 against the real server envelope", () => {
  it("renders the three month cards from phaseGoals and milestones, not the pending state", async () => {
    stubFetch([CAPABILITIES_ROUTE, { method: "GET", path: PLAN_PATH, status: 200, body: SERVER_ENVELOPE }]);
    const view = await renderPage(<Xenios90Page />);

    // Month 1: the foundation phase goal and the milestone that targets it,
    // with the milestone's real done state.
    const month1 = byTestId(view, "x90-month-1");
    expect(month1.textContent).toContain("Build the base routine");
    expect(month1.textContent).toContain("Four steady weeks");
    expect(month1.textContent).toContain("Done");
    expect(month1.textContent).not.toContain("Prepared after");
    expect(month1.textContent).not.toContain("Add challenge gradually");

    // Month 2: the progression goal, an incomplete milestone shown as
    // incomplete, and the server's currentPhase marked as current.
    const month2 = byTestId(view, "x90-month-2");
    expect(month2.textContent).toContain("Add challenge gradually");
    expect(month2.textContent).toContain("Weekly conditioning session added");
    expect(month2.textContent).toContain("Not done yet");
    expect(month2.textContent).toContain("Current phase");
    expect(month2.textContent).not.toContain("Prepared after");

    // Month 3: the consolidation goal. It is not the current phase and it has
    // no milestone, so no milestone section is invented for it.
    const month3 = byTestId(view, "x90-month-3");
    expect(month3.textContent).toContain("Make it a lifestyle");
    expect(month3.textContent).not.toContain("Prepared after");
    expect(month3.textContent).not.toContain("Current phase");
    expect(view.querySelector('[data-testid="x90-month-3-milestones"]')).toBeNull();

    // The three month cards are all present and none of them is empty.
    expect(view.querySelectorAll('[data-testid^="x90-month-"]').length).toBeGreaterThanOrEqual(3);
    expect(view.textContent).not.toContain("Your Xenios 90 arc is prepared after your Blueprint.");

    // Column-owned identity: version is a NUMBER on the wire, publishedAt an
    // ISO instant rendered as its UTC calendar date.
    expect(byTestId(view, "x90-version").textContent).toContain("Version 2");
    expect(byTestId(view, "x90-published").textContent).toContain("Published Jul 1, 2026");

    // monthlyVersions is surfaced by its member-visible monthLabel only; the
    // internal plan id is never rendered.
    expect(byTestId(view, "x90-monthly-versions").textContent).toContain("2026-07");
    expect(view.textContent).not.toContain("plan-ref-1");
    expect(view.textContent).not.toContain("b0f0b0c6");

    // The review half of the envelope renders instead of being dropped.
    const review = byTestId(view, "x90-review");
    expect(review.textContent).toContain("Due now");
    expect(review.textContent).toContain("Review Week starts Aug 3, 2026");
    expect(review.textContent).toContain("early plan change is still available");
    // slaDeadline is null in this wave, so no deadline is invented.
    expect(review.textContent).not.toContain("published by");
  });

  it("keeps the honest pending state when a phase carries no goals and no milestone", async () => {
    const partial = {
      ...SERVER_ENVELOPE,
      plan: {
        ...SERVER_ENVELOPE.plan,
        phaseGoals: { ...SERVER_ENVELOPE.plan.phaseGoals, consolidation: [] },
      },
    };
    stubFetch([CAPABILITIES_ROUTE, { method: "GET", path: PLAN_PATH, status: 200, body: partial }]);
    const view = await renderPage(<Xenios90Page />);

    expect(byTestId(view, "x90-month-1").textContent).toContain("Build the base routine");
    const month3 = byTestId(view, "x90-month-3");
    expect(month3.textContent).toContain("Prepared after assessment");
    expect(month3.textContent).toContain("Prepared after your assessment.");
  });

  it("keeps the Blueprint capability pending panel when the member has no published arc", async () => {
    stubFetch([CAPABILITIES_ROUTE, { method: "GET", path: PLAN_PATH, status: 200, body: UNPUBLISHED_ENVELOPE }]);
    const view = await renderPage(<Xenios90Page />);

    // plan: null with the blueprint capability not enabled keeps the existing
    // capability pending panel, never a crash and never an empty arc.
    expect(byTestId(view, "ra-capability-blueprint").textContent).toContain(
      "Your Blueprint is prepared after the assessment.",
    );
    expect(view.querySelector('[data-testid="x90-month-1"]')).toBeNull();
    expect(view.querySelector('[data-testid="x90-review"]')).toBeNull();
  });

  it("keeps the Blueprint empty state when the capability is enabled and nothing is published", async () => {
    stubFetch([
      {
        method: "GET",
        path: "/api/research/capabilities",
        status: 200,
        body: { ok: true, capabilities: { blueprint: { enabled: true } } },
      },
      { method: "GET", path: PLAN_PATH, status: 200, body: UNPUBLISHED_ENVELOPE },
    ]);
    const view = await renderPage(<Xenios90Page />);

    expect(view.textContent).toContain("Your Xenios 90 arc is prepared after your Blueprint.");
    expect(view.querySelector('[data-testid="x90-month-1"]')).toBeNull();
    expect(view.querySelector('[data-testid="x90-review"]')).toBeNull();
  });

  it("renders the sign in state when the session has ended", async () => {
    stubFetch([CAPABILITIES_ROUTE, { method: "GET", path: PLAN_PATH, status: 401, body: { ok: false } }]);
    const view = await renderPage(<Xenios90Page />);

    expect(view.textContent).toContain("Please sign in.");
    expect(view.querySelector('[data-testid="x90-month-1"]')).toBeNull();
  });

  it("renders the error state with a retry when the route fails", async () => {
    stubFetch([
      CAPABILITIES_ROUTE,
      { method: "GET", path: PLAN_PATH, status: 500, body: { ok: false, message: "The plan could not be loaded." } },
    ]);
    const view = await renderPage(<Xenios90Page />);

    expect(view.textContent).toContain("The plan could not be loaded.");
    expect(view.querySelector('[data-testid="x90-month-1"]')).toBeNull();
  });
});

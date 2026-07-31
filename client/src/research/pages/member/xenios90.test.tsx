// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResearchContext, type ResearchContextValue } from "../../core";
import Xenios90 from "./Xenios90";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => { if (root) act(() => root!.unmount()); host?.remove(); root = null; host = null; vi.unstubAllGlobals(); });
const context = () => ({ gate: "open", member: { firstName: "M", status: "active", applicationStatus: null }, memberToken: "raw-token", memberChecking: false, recovery: "none" }) as ResearchContextValue;
async function render(body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => { root!.render(<ResearchContext.Provider value={context()}><Xenios90 /></ResearchContext.Provider>); await new Promise((resolve) => setTimeout(resolve, 0)); });
  return host;
}

describe("Xenios90", () => {
  it("renders the exact phase-goal and milestone DTO", async () => {
    const view = await render({ ok: true, plan: {
      planId: "p1", state: "published", version: 3, currentPhase: "foundation",
      phaseGoals: { foundation: ["Foundation goal"], progression: ["Progression goal"], consolidation: [] },
      milestones: [{ id: "m1", label: "First milestone", targetMonth: 1, done: false }],
      monthlyVersions: [], publishedAt: "2026-07-30T12:00:00.000Z",
    }, review: { reviewWeekStart: null, checkInStatus: "not_due", earlyChangeUsedThisMonth: false, slaDeadline: null } });
    expect(view.textContent).toContain("Foundation goal");
    expect(view.textContent).toContain("First milestone");
    expect(view.textContent).toContain("Version 3");
  });

  it("uses an honest empty state and never fabricates a plan", async () => {
    const view = await render({ ok: true, plan: null, review: { reviewWeekStart: null, checkInStatus: "not_due", earlyChangeUsedThisMonth: false, slaDeadline: null } });
    expect(view.textContent).toContain("No published Xenios 90 plan");
    expect(view.textContent).not.toContain("Sample");
  });

  it("fails closed for the former invented months envelope", async () => {
    const view = await render({ ok: true, plan: { months: [{ title: "FAKE_MONTH" }] }, review: { checkInStatus: "not_due", earlyChangeUsedThisMonth: false } });
    expect(view.textContent).toContain("Something went wrong");
    expect(view.textContent).not.toContain("FAKE_MONTH");
  });

  it.each(["draft", "samuel_review", "superseded", "archived"])(
    "rejects a %s plan and hides all goals and milestones",
    async (state) => {
      const view = await render({ ok: true, plan: {
        planId: `plan-${state}`, state, version: 1, currentPhase: "foundation",
        phaseGoals: {
          foundation: [`HOSTILE_GOAL_${state}`],
          progression: ["HOSTILE_PROGRESSION"],
          consolidation: [],
        },
        milestones: [{ id: "hostile", label: `HOSTILE_MILESTONE_${state}`, targetMonth: 1, done: false }],
        monthlyVersions: [], publishedAt: null,
      }, review: { reviewWeekStart: null, checkInStatus: "not_due", earlyChangeUsedThisMonth: false, slaDeadline: null } });
      expect(view.textContent).toContain("Something went wrong");
      expect(view.textContent).not.toContain(`HOSTILE_GOAL_${state}`);
      expect(view.textContent).not.toContain(`HOSTILE_MILESTONE_${state}`);
      expect(view.textContent).not.toContain("HOSTILE_PROGRESSION");
    },
  );

  it("rejects non-string phase goals", async () => {
    const view = await render({ ok: true, plan: {
      planId: "p-invalid", state: "published", version: 1, currentPhase: "foundation",
      phaseGoals: { foundation: ["valid", 42], progression: [], consolidation: [] },
      milestones: [], monthlyVersions: [], publishedAt: null,
    }, review: { reviewWeekStart: null, checkInStatus: "not_due", earlyChangeUsedThisMonth: false, slaDeadline: null } });
    expect(view.textContent).toContain("Something went wrong");
    expect(view.textContent).not.toContain("valid");
  });
});

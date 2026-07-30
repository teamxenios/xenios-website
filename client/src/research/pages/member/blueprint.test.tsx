// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResearchContext, type ResearchContextValue } from "../../core";
import Blueprint from "./Blueprint";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => { if (root) act(() => root!.unmount()); host?.remove(); root = null; host = null; vi.unstubAllGlobals(); });
const context = () => ({ gate: "open", member: { firstName: "M", status: "active", applicationStatus: null }, memberToken: "raw-token", memberChecking: false, recovery: "none" }) as ResearchContextValue;

async function render(body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => { root!.render(<ResearchContext.Provider value={context()}><Blueprint /></ResearchContext.Provider>); await new Promise((resolve) => setTimeout(resolve, 0)); });
  return host;
}

describe("Blueprint", () => {
  it("shows review state without draft recommendation data", async () => {
    const view = await render({ ok: true, blueprint: null, state: "samuel_review", memberVisibleMessage: "Review is underway.", recommendations: [{ title: "SECRET_DRAFT" }] });
    expect(view.textContent).toContain("Review is underway");
    expect(view.textContent).not.toContain("SECRET_DRAFT");
  });

  it("renders only a complete published BlueprintView", async () => {
    const view = await render({ ok: true, state: "published", blueprint: {
      blueprintId: "b1", state: "published", version: 2, primaryGoal: "Build consistency", secondaryGoals: [],
      topPriorities: ["Sleep", "Movement", "Meals"], recommendations: [{ id: "r1", kind: "lifestyle", title: "Morning walk", disposition: "recommended", explanation: "Supports consistency.", sourceSignals: ["goals"] }],
      questionsForReview: [], confidence: "medium", reviewedBy: "Reviewer", publishedAt: "2026-07-30T12:00:00.000Z", supersededByVersion: null, memberAcknowledgedAt: null,
    } });
    expect(view.textContent).toContain("Build consistency");
    expect(view.textContent).toContain("Morning walk");
    expect(view.textContent).toContain("Version 2");
  });

  it("fails closed for a published state without a published view", async () => {
    const view = await render({ ok: true, blueprint: null, state: "published" });
    expect(view.textContent).toContain("Something went wrong");
  });

  it("rejects an outer published state with an embedded review-state Blueprint and hides every draft marker", async () => {
    const view = await render({ ok: true, state: "published", blueprint: {
      blueprintId: "b-hostile", state: "samuel_review", version: 1,
      primaryGoal: "HOSTILE_DRAFT_GOAL", secondaryGoals: ["HOSTILE_SECONDARY"],
      topPriorities: ["HOSTILE_PRIORITY"], recommendations: [{
        id: "r-hostile", kind: "lifestyle", title: "HOSTILE_RECOMMENDATION",
        disposition: "needs_samuel_review", explanation: "HOSTILE_EXPLANATION",
        sourceSignals: ["HOSTILE_SIGNAL"],
      }],
      questionsForReview: ["HOSTILE_QUESTION"], confidence: "low", reviewedBy: null,
      publishedAt: null, supersededByVersion: null, memberAcknowledgedAt: null,
    } });
    expect(view.textContent).toContain("Something went wrong");
    for (const marker of [
      "HOSTILE_DRAFT_GOAL", "HOSTILE_SECONDARY", "HOSTILE_PRIORITY",
      "HOSTILE_RECOMMENDATION", "HOSTILE_EXPLANATION", "HOSTILE_SIGNAL", "HOSTILE_QUESTION",
    ]) expect(view.textContent).not.toContain(marker);
  });

  it("rejects every non-string published array field and hides all published and hostile markers", async () => {
    const view = await render({ ok: true, state: "published", blueprint: {
      blueprintId: "b-invalid", state: "published", version: 1, primaryGoal: "HOSTILE_PUBLISHED_GOAL",
      secondaryGoals: ["HOSTILE_SECONDARY", 1],
      topPriorities: ["HOSTILE_PRIORITY", false],
      recommendations: [{
        id: "r-invalid", kind: "lifestyle", title: "HOSTILE_RECOMMENDATION",
        disposition: "recommended", explanation: "HOSTILE_EXPLANATION",
        sourceSignals: ["HOSTILE_SIGNAL", { marker: "HOSTILE_SIGNAL_OBJECT" }],
      }],
      questionsForReview: ["HOSTILE_QUESTION", 2],
      unansweredImportantFields: ["HOSTILE_UNANSWERED", true],
      safetyFlags: ["HOSTILE_SAFETY", { marker: "HOSTILE_SAFETY_OBJECT" }],
      confidence: "low", reviewedBy: null, publishedAt: null,
      supersededByVersion: null, memberAcknowledgedAt: null,
    } });
    expect(view.textContent).toContain("Something went wrong");
    for (const marker of [
      "HOSTILE_PUBLISHED_GOAL", "HOSTILE_SECONDARY", "HOSTILE_PRIORITY",
      "HOSTILE_RECOMMENDATION", "HOSTILE_EXPLANATION", "HOSTILE_SIGNAL",
      "HOSTILE_SIGNAL_OBJECT", "HOSTILE_QUESTION", "HOSTILE_UNANSWERED",
      "HOSTILE_SAFETY", "HOSTILE_SAFETY_OBJECT",
    ]) expect(view.textContent).not.toContain(marker);
  });
});

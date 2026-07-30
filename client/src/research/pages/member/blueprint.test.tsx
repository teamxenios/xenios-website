// @vitest-environment jsdom
// The member Blueprint page (/research/member/blueprint) against the REAL
// response of GET /api/research/blueprint (server/research/blueprint.ts:447).
// Covered:
//   1. A published BlueprintView renders the contract's own recommendations[]
//      grouped by kind and disposition, with goals, priorities and the review
//      history built from real timestamps. There is no fitnessPlan or
//      nutritionPlan field in the contract and none is invented.
//   2. Every state past the assessment (assessment_submitted, samuel_review,
//      more_information_needed, published) hides the "Start your assessment"
//      call to action, so this page can never contradict the dashboard card
//      that linked the member here.
//   3. assessment_due still shows the call to action, which is what makes the
//      negative assertions above meaningful: the capability is enabled in
//      every stub, so the button is genuinely available when it should be.
//   4. A published v1 with a v2 in Samuel's review (blueprint non-null AND a
//      review state) keeps the published content and adds the revision notice.
// fetch is stubbed with json content-type headers, matching the api lib.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
import type { BlueprintView } from "@shared/research/member-platform";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { ResearchContext, type ResearchContextValue } from "../../core";
import { __resetCapabilitiesCache } from "../../lib/capabilities";
import Blueprint from "./Blueprint";

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

// Only the fields the page reads need real values (test-only cast, same
// pattern as document-center.test.tsx).
function fixtureContext(): ResearchContextValue {
  return {
    gate: "open",
    member: { firstName: "Sam", status: "active", applicationStatus: null },
    memberToken: "member-jwt",
    memberChecking: false,
    recovery: "none",
  } as ResearchContextValue;
}

const BLUEPRINT_PATH = "/api/research/blueprint";
const CAPABILITIES_PATH = "/api/research/capabilities";

// The blueprint capability is ENABLED in every stub so that the assessment
// call to action is never hidden by the capability boundary. An absent button
// then means the state handling suppressed it, which is the point.
function stubFetch(blueprintBody: unknown, blueprintStatus = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === CAPABILITIES_PATH) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ ok: true, capabilities: { blueprint: { enabled: true } } }),
        };
      }
      if (url === BLUEPRINT_PATH) {
        return {
          status: blueprintStatus,
          ok: blueprintStatus >= 200 && blueprintStatus < 300,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => blueprintBody,
        };
      }
      throw new TypeError(`unstubbed fetch: ${url}`);
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

function text(view: HTMLElement): string {
  return view.textContent ?? "";
}

// ---------------------------------------------------------------------------
// The exact BlueprintView the server builds in toBlueprintView
// (server/research/blueprint.ts:242), with recommendation items in the shape
// the transparent engine emits (server/research/recommendation.ts).
// ---------------------------------------------------------------------------

const PUBLISHED_VIEW: BlueprintView = {
  blueprintId: "bp-1",
  state: "published",
  version: 2,
  primaryGoal: "Body recomposition",
  secondaryGoals: ["Sleep quality", "Everyday energy"],
  topPriorities: [
    "Rebuild a consistent sleep routine",
    "Establish a keepable training rhythm",
    "Progress toward body recomposition",
  ],
  recommendations: [
    {
      id: "lifestyle_sleep_routine",
      kind: "lifestyle",
      title: "A consistent wind-down and sleep window",
      disposition: "recommended",
      explanation: "Your sleep answers point to short or unrefreshing nights.",
      sourceSignals: ["sleep_hours", "sleep_quality"],
    },
    {
      id: "fitness_program",
      kind: "fitness_program",
      title: "Strength Builder 4-Day",
      disposition: "recommended",
      explanation: "This program shape fits your current training frequency and your goal.",
      sourceSignals: ["training_frequency", "primary_goal"],
    },
    {
      id: "nutrition_program",
      kind: "nutrition_program",
      title: "Recomposition Nutrition Framework",
      disposition: "needs_samuel_review",
      explanation: "You flagged pregnancy or nursing, so Samuel reviews the nutrition approach with you first.",
      sourceSignals: ["eating_pattern", "pregnancy_flag"],
    },
    {
      id: "supplement_multivitamin",
      kind: "supplement_foundation",
      title: "A foundation multivitamin",
      disposition: "duplicate_warning",
      explanation: "You listed something in this category already.",
      sourceSignals: ["eating_pattern", "current_supplements"],
    },
    {
      id: "exclusions_allergies",
      kind: "supplement_foundation",
      title: "Exclusions from your allergy and avoid list",
      disposition: "excluded",
      explanation: "Anything that conflicts with the allergies you listed is excluded up front.",
      sourceSignals: ["has_allergies"],
    },
    {
      id: "product_options_goal_fit",
      kind: "product_option",
      title: "Product options aligned with your primary goal",
      disposition: "possible_research_pathway",
      explanation: "This marks goal fit only; it is not a claim that any product works for you.",
      sourceSignals: ["primary_goal", "monthly_budget"],
    },
  ],
  questionsForReview: ["The allergy and intolerance list needs a label-by-label cross-check."],
  unansweredImportantFields: ["stress_sources"],
  safetyFlags: ["allergy_or_intolerance"],
  confidence: "medium",
  reviewedBy: "Samuel",
  publishedAt: "2026-07-14T00:00:00.000Z",
  supersededByVersion: null,
  memberAcknowledgedAt: null,
};

const START_ASSESSMENT = "Start your assessment";

describe("Member Blueprint page", () => {
  it("renders the published server envelope: real recommendations, dispositions and goals", async () => {
    // The exact published body: { ok, blueprint: BlueprintView, state }.
    stubFetch({ ok: true, blueprint: PUBLISHED_VIEW, state: "published" });
    const view = await renderPage(<Blueprint />);
    const body = text(view);

    // The member is NOT sent back to the assessment they already finished.
    expect(body).not.toContain(START_ASSESSMENT);

    // Header facts, all real contract fields.
    expect(body).toContain("Version 2");
    expect(body).toContain("Reviewed by Samuel");
    expect(body).toContain("Confidence: medium");

    // Goals and priorities.
    expect(body).toContain("Body recomposition");
    expect(body).toContain("Sleep quality");
    expect(body).toContain("Rebuild a consistent sleep routine");

    // recommendations[] rendered by kind, each item present by its own id.
    expect(view.querySelector('[data-testid="blueprint-item-lifestyle_sleep_routine"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="blueprint-item-fitness_program"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="blueprint-item-nutrition_program"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="blueprint-item-product_options_goal_fit"]')).not.toBeNull();
    expect(body).toContain("Strength Builder 4-Day");
    expect(body).toContain("Recomposition Nutrition Framework");
    expect(body).toContain("Product options aligned with your primary goal");

    // Disposition is the contract's only availability vocabulary and is shown.
    expect(body).toContain("Needs Samuel's review");
    expect(body).toContain("Possible research pathway");

    // Excluded and duplicate items are pulled into their own sections.
    const excluded = view.querySelector('[data-testid="blueprint-item-exclusions_allergies"]');
    expect(excluded?.closest("section")?.getAttribute("aria-label")).toBe("Exclusions");
    const duplicate = view.querySelector('[data-testid="blueprint-item-supplement_multivitamin"]');
    expect(duplicate?.closest("section")?.getAttribute("aria-label")).toBe("Duplicate warnings");

    // Machine keys are humanized, never renamed.
    expect(body).toContain("allergy or intolerance");
    expect(body).toContain("stress sources");

    // Flagged-for-review items ship inside the member view and are shown.
    expect(body).toContain("label-by-label cross-check");

    // Review history is built only from timestamps the contract carries.
    expect(view.querySelector('[data-testid="ra-timeline"]')).not.toBeNull();
    expect(body).toContain("Published, version 2");

    // Nothing from the old, never-sent contract survives.
    expect(body).not.toContain("Fitness plan");
    expect(body).not.toContain("Nutrition plan");
    expect(body).not.toContain("Prepared after your assessment.");
  });

  it("a blueprint in Samuel's review shows the server message, never the assessment call to action", async () => {
    // The review body: content is withheld, state and message only.
    stubFetch({
      ok: true,
      blueprint: null,
      state: "samuel_review",
      memberVisibleMessage:
        "Your Whole-Life Blueprint is with Samuel for personal review. You will be notified when it is published.",
    });
    const view = await renderPage(<Blueprint />);
    const body = text(view);

    expect(body).not.toContain(START_ASSESSMENT);
    expect(view.querySelector('[data-testid="blueprint-state-card"]')).not.toBeNull();
    expect(body).toContain("Samuel's review");
    expect(body).toContain("with Samuel for personal review");
  });

  it("assessment_submitted says the assessment is received, not due", async () => {
    stubFetch({ ok: true, blueprint: null, state: "assessment_submitted" });
    const view = await renderPage(<Blueprint />);
    const body = text(view);

    expect(body).not.toContain(START_ASSESSMENT);
    expect(body).toContain("Assessment received");
    expect(body).toContain("Your assessment is in.");
  });

  it("more_information_needed shows Samuel's own message and routes to questions", async () => {
    stubFetch({
      ok: true,
      blueprint: null,
      state: "more_information_needed",
      memberVisibleMessage: "Could you say more about your training history?",
    });
    const view = await renderPage(<Blueprint />);
    const body = text(view);

    expect(body).not.toContain(START_ASSESSMENT);
    expect(body).toContain("Could you say more about your training history?");
    expect(body).toContain("Answer the open questions");
  });

  it("assessment_due still offers the assessment, so the absences above are real", async () => {
    stubFetch({ ok: true, blueprint: null, state: "assessment_due" });
    const view = await renderPage(<Blueprint />);

    expect(text(view)).toContain(START_ASSESSMENT);
  });

  it("a published version with a revision in review keeps the published content and says so", async () => {
    // The head row is the v3 in review; the blueprint payload is still the
    // published v2 (server/research/blueprint.ts:460 to 470).
    stubFetch({
      ok: true,
      blueprint: PUBLISHED_VIEW,
      state: "samuel_review",
      memberVisibleMessage: "Your Whole-Life Blueprint is with Samuel for personal review.",
    });
    const view = await renderPage(<Blueprint />);
    const body = text(view);

    expect(body).not.toContain(START_ASSESSMENT);
    expect(view.querySelector('[data-testid="blueprint-revision-notice"]')).not.toBeNull();
    expect(body).toContain("A revision is in review");
    expect(body).toContain("Strength Builder 4-Day");
    expect(body).toContain("Version 2");
  });

  it("keeps the honest pending state when the payload carries no usable state", async () => {
    stubFetch({ ok: true });
    const view = await renderPage(<Blueprint />);

    expect(text(view)).toContain(START_ASSESSMENT);
  });
});

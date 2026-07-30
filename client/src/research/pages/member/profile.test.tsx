// @vitest-environment jsdom
// The member profile (/research/member/profile). Covered:
//   1. The REAL server envelope renders. GET /api/research/profile returns
//      { ok, profile: { sections: [{ key, schemaVersion, data, updatedAt }],
//      completeness } } and GET /api/research/profile/sensitive returns
//      { ok, sections: [...] }; the page must show those answers under the
//      server's own section keys, label the enum values, keep the honest
//      empty state ONLY for sections the server did not send, and no longer
//      claim that editing is unbuilt.
//   2. Editing PUTs exactly one section in the server's envelope
//      ({ section, schemaVersion, data }), then re-reads and renders the
//      stored answer.
//   3. A 429 rate_limited denial renders a calm message and never pretends
//      the save succeeded.
//   4. When the sensitive route fails, those cards say so instead of
//      claiming nothing is on file, and their Edit stays off so an unread
//      section cannot be overwritten.
// fetch is stubbed with json content-type headers, matching the api lib.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { ResearchContext, type ResearchContextValue } from "../../core";
import Profile from "./Profile";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
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

const PROFILE_PATH = "/api/research/profile";
const SENSITIVE_PATH = "/api/research/profile/sensitive";

type Reply = { status: number; body: unknown };
type Handler = (init?: RequestInit) => Reply;

interface Recorded {
  method: string;
  url: string;
  body: unknown;
}

function stubFetch(routes: Record<string, Handler>): Recorded[] {
  const calls: Recorded[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({
        method,
        url,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      });
      const handler = routes[`${method} ${url}`];
      if (!handler) throw new TypeError(`unstubbed fetch: ${method} ${url}`);
      const reply = handler(init);
      return {
        status: reply.status,
        ok: reply.status >= 200 && reply.status < 300,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => reply.body,
      };
    }),
  );
  return calls;
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

async function settle() {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function byTestId<T extends HTMLElement>(view: HTMLElement, id: string): T {
  const el = view.querySelector(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing [data-testid="${id}"]`);
  return el as T;
}

// ---------------------------------------------------------------------------
// Fixtures: the server's own shapes, field for field with
// PROFILE_SECTION_REGISTRY in server/research/profile.ts.
// ---------------------------------------------------------------------------

const AT = "2026-07-20T12:00:00.000Z";

interface SectionFixture {
  key: string;
  schemaVersion: number;
  data: Record<string, unknown>;
  updatedAt: string;
}

function openSections(): SectionFixture[] {
  return [
    {
      key: "basic_information",
      schemaVersion: 1,
      data: { preferredName: "Sam", country: "United States", timezone: "America/Chicago" },
      updatedAt: AT,
    },
    {
      key: "goals",
      schemaVersion: 1,
      data: {
        primaryGoal: "Body recomposition",
        secondaryGoals: ["Better sleep", "More consistent energy"],
        motivation: "Show up fully for work and family.",
      },
      updatedAt: AT,
    },
    {
      key: "fitness",
      schemaVersion: 1,
      data: {
        trainingExperience: "intermediate",
        trainingStyles: ["Strength", "Conditioning"],
        sessionsPerWeek: 4,
        equipmentAccess: "commercial_gym",
      },
      updatedAt: AT,
    },
    { key: "budget", schemaVersion: 1, data: { monthlyBudgetRange: "100_250" }, updatedAt: AT },
    {
      key: "format_preferences",
      schemaVersion: 1,
      data: { preferredFormats: ["pdf", "video"], wantsPrintable: true },
      updatedAt: AT,
    },
  ];
}

function sensitiveSections(): SectionFixture[] {
  return [
    {
      key: "sleep",
      schemaVersion: 1,
      data: { averageHoursPerNight: 6.5, bedtimeConsistency: "varies", wakeRested: "sometimes" },
      updatedAt: AT,
    },
    {
      key: "current_products",
      schemaVersion: 1,
      data: { products: [{ name: "Creatine", purpose: "Strength" }, { name: "Whey protein" }] },
      updatedAt: AT,
    },
    {
      key: "allergies_and_restrictions",
      schemaVersion: 1,
      data: { allergies: [], restrictions: ["No pork"], noPork: true },
      updatedAt: AT,
    },
  ];
}

function profileEnvelope(sections: unknown[]) {
  return {
    ok: true,
    profile: {
      memberId: "member-1",
      sections,
      completeness: { completedSections: 8, totalSections: 17 },
    },
  };
}

// ---------------------------------------------------------------------------

describe("Member profile", () => {
  it("renders the real server envelope under the server's section keys", async () => {
    stubFetch({
      [`GET ${PROFILE_PATH}`]: () => ({ status: 200, body: profileEnvelope(openSections()) }),
      [`GET ${SENSITIVE_PATH}`]: () => ({ status: 200, body: { ok: true, sections: sensitiveSections() } }),
    });
    const view = await renderPage(<Profile />);

    // Non-sensitive answers from GET /api/research/profile.
    expect(byTestId(view, "profile-value-basic_information-preferredName").textContent).toBe("Sam");
    expect(byTestId(view, "profile-value-goals-primaryGoal").textContent).toBe("Body recomposition");
    expect(byTestId(view, "profile-value-goals-secondaryGoals").textContent).toBe(
      "Better sleep, More consistent energy",
    );
    // Enum values render as their labels, numbers as themselves.
    expect(byTestId(view, "profile-value-fitness-trainingExperience").textContent).toBe("Intermediate");
    expect(byTestId(view, "profile-value-fitness-equipmentAccess").textContent).toBe("Commercial gym");
    expect(byTestId(view, "profile-value-fitness-sessionsPerWeek").textContent).toBe("4");
    expect(byTestId(view, "profile-value-budget-monthlyBudgetRange").textContent).toBe("$100 to $250");
    expect(byTestId(view, "profile-value-format_preferences-preferredFormats").textContent).toBe("PDF, Video");
    expect(byTestId(view, "profile-value-format_preferences-wantsPrintable").textContent).toBe("Yes");

    // Sensitive answers come from the separate route and still render.
    expect(byTestId(view, "profile-value-sleep-averageHoursPerNight").textContent).toBe("6.5");
    expect(byTestId(view, "profile-value-sleep-bedtimeConsistency").textContent).toBe("Varies");
    expect(byTestId(view, "profile-value-current_products-products").textContent).toBe(
      "Creatine (Strength), Whey protein",
    );
    // An empty list on file is an honest absence, not a fabricated value.
    expect(byTestId(view, "profile-card-allergies_and_restrictions").textContent).toContain("No pork");
    expect(view.querySelector('[data-testid="profile-value-allergies_and_restrictions-allergies"]')).toBeNull();

    // The server's own completeness, not a computed guess.
    expect(byTestId(view, "profile-completeness").textContent).toBe("8 of 17 sections complete");

    // A section the server did not send keeps the honest empty state.
    expect(byTestId(view, "profile-card-nutrition").textContent).toContain("Nothing on file for this section yet.");
    // A section that DID come back never shows it.
    expect(byTestId(view, "profile-card-goals").textContent).not.toContain("Nothing on file");

    // The false "editing is not built" copy is gone and Edit is live.
    expect(view.textContent).not.toContain("Editing opens with the member platform update");
    expect(byTestId<HTMLButtonElement>(view, "profile-edit-goals").disabled).toBe(false);
    expect(byTestId<HTMLButtonElement>(view, "profile-edit-sleep").disabled).toBe(false);
  });

  it("saves one section through PUT /api/research/profile and re-reads it", async () => {
    let stored = openSections();
    const calls = stubFetch({
      [`GET ${PROFILE_PATH}`]: () => ({ status: 200, body: profileEnvelope(stored) }),
      [`GET ${SENSITIVE_PATH}`]: () => ({ status: 200, body: { ok: true, sections: sensitiveSections() } }),
      [`PUT ${PROFILE_PATH}`]: (init) => {
        const body = JSON.parse(String(init?.body)) as { section: string; data: Record<string, unknown> };
        stored = stored.map((row) =>
          row.key === body.section ? { ...row, data: body.data, updatedAt: "2026-07-21T09:00:00.000Z" } : row,
        );
        return {
          status: 200,
          body: {
            ok: true,
            section: { key: body.section, schemaVersion: 1, data: body.data, updatedAt: "2026-07-21T09:00:00.000Z" },
          },
        };
      },
    });
    const view = await renderPage(<Profile />);

    await act(async () => {
      byTestId<HTMLButtonElement>(view, "profile-edit-goals").click();
    });

    const input = byTestId<HTMLInputElement>(view, "profile-input-goals-primaryGoal");
    expect(input.value).toBe("Body recomposition");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "Strength with a lean bodyweight");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      byTestId<HTMLFormElement>(view, "profile-form-goals").dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await settle();

    // ONE section, in the server's envelope, at the schema version the server
    // reported for that section.
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.url).toBe(PROFILE_PATH);
    expect(put?.body).toEqual({
      section: "goals",
      schemaVersion: 1,
      data: {
        primaryGoal: "Strength with a lean bodyweight",
        secondaryGoals: ["Better sleep", "More consistent energy"],
        motivation: "Show up fully for work and family.",
      },
    });

    // The form closed and the stored answer is what renders.
    expect(view.querySelector('[data-testid="profile-form-goals"]')).toBeNull();
    expect(byTestId(view, "profile-value-goals-primaryGoal").textContent).toBe("Strength with a lean bodyweight");
    // The re-read happened: two GETs of the profile, before and after saving.
    expect(calls.filter((c) => c.method === "GET" && c.url === PROFILE_PATH)).toHaveLength(2);
  });

  it("handles a 429 rate_limited save without claiming success", async () => {
    stubFetch({
      [`GET ${PROFILE_PATH}`]: () => ({ status: 200, body: profileEnvelope(openSections()) }),
      [`GET ${SENSITIVE_PATH}`]: () => ({ status: 200, body: { ok: true, sections: sensitiveSections() } }),
      [`PUT ${PROFILE_PATH}`]: () => ({
        status: 429,
        body: { ok: false, code: "rate_limited", message: "Too many profile updates. Please wait a moment." },
      }),
    });
    const view = await renderPage(<Profile />);

    await act(async () => {
      byTestId<HTMLButtonElement>(view, "profile-edit-basic_information").click();
    });
    await act(async () => {
      byTestId<HTMLFormElement>(view, "profile-form-basic_information").dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await settle();

    const error = byTestId(view, "profile-save-error-basic_information");
    expect(error.textContent).toContain("Too many profile updates just now");
    expect(error.textContent).toContain("Nothing you typed was lost");
    // Still editing, and the stored answer is untouched.
    expect(view.querySelector('[data-testid="profile-form-basic_information"]')).not.toBeNull();
    expect(byTestId<HTMLInputElement>(view, "profile-input-basic_information-preferredName").value).toBe("Sam");
  });

  it("does not claim a sensitive section is empty when it could not be read", async () => {
    stubFetch({
      [`GET ${PROFILE_PATH}`]: () => ({ status: 200, body: profileEnvelope(openSections()) }),
      [`GET ${SENSITIVE_PATH}`]: () => ({ status: 500, body: { message: "The profile could not be loaded." } }),
    });
    const view = await renderPage(<Profile />);

    const sleep = byTestId(view, "profile-card-sleep");
    expect(sleep.textContent).toContain("could not be read just now");
    expect(sleep.textContent).not.toContain("Nothing on file for this section yet.");
    // An unread section cannot be overwritten.
    expect(byTestId<HTMLButtonElement>(view, "profile-edit-sleep").disabled).toBe(true);
    // The non-sensitive half still rendered.
    expect(byTestId(view, "profile-value-goals-primaryGoal").textContent).toBe("Body recomposition");
  });
});

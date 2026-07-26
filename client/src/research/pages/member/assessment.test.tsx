// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResearchContextValue } from "../../core";
import { ResearchContext } from "../../core";
import Assessment, { payloadWithRemovedAnswerTombstones } from "./Assessment";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const DEFINITION = {
  definitionId: "initial-v2",
  version: 2,
  mode: "initial",
  targetMinutes: 8,
  sections: [
    {
      id: "direction",
      title: "Your direction",
      description: "Set the outcome first.",
      order: 1,
      questions: [
        {
          id: "primary_goal",
          sectionId: "direction",
          kind: "single_choice",
          prompt: "What is your primary goal right now?",
          required: true,
          options: [
            { value: "strength", label: "Strength" },
            { value: "energy", label: "Everyday energy" },
          ],
        },
      ],
    },
  ],
} as const;

function envelope(consent = true, status: "in_progress" | "submitted" = "in_progress") {
  return {
    ok: true,
    definition: DEFINITION,
    response: {
      responseId: "response-1",
      definitionId: "initial-v2",
      definitionVersion: 2,
      mode: "initial",
      cycleKey: "initial",
      status,
      revision: 0,
      answers: [],
      startedAt: "2026-07-25T00:00:00.000Z",
      lastSavedAt: null,
      submittedAt: status === "submitted" ? "2026-07-25T01:00:00.000Z" : null,
    },
    status: {
      required: true,
      status,
      dueAt: "2026-07-28T00:00:00.000Z",
      overdue: false,
      remindersSent: 0,
    },
    consent: { key: "XR-MEM-012", accepted: consent },
  };
}

function context(): ResearchContextValue {
  return {
    gate: "open",
    member: { firstName: "Sam", status: "active", applicationStatus: null },
    memberToken: "member-token",
    memberChecking: false,
    recovery: "none",
  } as ResearchContextValue;
}

async function renderPage(): Promise<HTMLDivElement> {
  window.history.replaceState({}, "", "/research/member/assessment");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <ResearchContext.Provider value={context()}>
        <Assessment />
      </ResearchContext.Provider>,
    );
  });
  for (let index = 0; index < 5; index += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return container;
}

function response(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
  };
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("member assessment page", () => {
  it("sends tombstones when a previously saved conditional answer becomes hidden", () => {
    expect(
      payloadWithRemovedAnswerTombstones(
        { has_injuries: "no" },
        JSON.stringify({ has_injuries: "yes", injury_details: "Private prior detail" }),
      ),
    ).toEqual([
      { questionId: "has_injuries", value: "no" },
      { questionId: "injury_details", value: null },
    ]);
  });

  it("renders the server-published definition without a capability Coming Soon gate", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/research/assessment?mode=initial") return response(200, envelope());
      throw new Error(`unexpected request: ${url}`);
    }));
    const view = await renderPage();
    expect(view.textContent).toContain("Your direction");
    expect(view.textContent).toContain("What is your primary goal right now?");
    expect(view.textContent).not.toContain("Coming soon");
  });

  it("records XR-MEM-012 separately before showing questions", async () => {
    let assessmentLoads = 0;
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (url === "/api/research/assessment?mode=initial") {
        assessmentLoads += 1;
        return response(200, envelope(assessmentLoads > 1));
      }
      if (url === "/api/research/agreements" && (init?.method ?? "GET") === "GET") {
        return response(200, {
          ok: true,
          agreements: [{
            key: "XR-MEM-012",
            version: "draft-2026-07-18",
            title: "Sensitive Health Data Consent",
            status: "published",
            effectiveDate: "2026-07-18",
            content: "I authorize Xenios to collect the assessment information described here.",
            contentHash: "published-content-hash",
            acceptedVersion: null,
            reacceptanceNeeded: false,
          }],
        });
      }
      if (url === "/api/research/agreements" && init?.method === "POST") {
        return response(200, { ok: true, agreements: [] });
      }
      throw new Error(`unexpected request: ${init?.method ?? "GET"} ${url}`);
    }));

    const view = await renderPage();
    expect(view.textContent).toContain("Sensitive health data consent");
    const checkbox = view.querySelector('input[type="checkbox"]') as HTMLInputElement;
    const button = Array.from(view.querySelectorAll("button")).find((item) => item.textContent?.includes("Accept and begin"))!;
    await act(async () => {
      checkbox.click();
    });
    await act(async () => {
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const acceptance = calls.find((call) =>
      call.url === "/api/research/agreements" &&
      (call.body as any)?.decisions?.[0]?.decision === "accepted"
    );
    expect(acceptance?.body).toEqual({
      decisions: [{
        key: "XR-MEM-012",
        version: "draft-2026-07-18",
        decision: "accepted",
        contentHash: "published-content-hash",
      }],
    });
  });

  it("shows the locked human-review state after submission", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/research/assessment?mode=initial") return response(200, envelope(true, "submitted"));
      throw new Error(`unexpected request: ${url}`);
    }));
    const view = await renderPage();
    expect(view.textContent).toContain("Your assessment is with the review team.");
    expect(view.textContent).toContain("Submitted answers cannot be edited.");
    expect(view.textContent).toContain("Locked");
  });

  it("flushes the latest in-memory answer before submit and never writes health answers to browser storage", async () => {
    let submitted = false;
    const calls: Array<{ url: string; body: any }> = [];
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url, body });
      if (url === "/api/research/assessment?mode=initial") {
        return response(200, envelope(true, submitted ? "submitted" : "in_progress"));
      }
      if (url === "/api/research/assessment/responses" && init?.method === "POST") {
        expect(body.answers).toEqual([{ questionId: "primary_goal", value: "strength" }]);
        expect(body.expectedCycleKey).toBe("initial");
        return response(200, {
          ok: true,
          revision: 1,
          lastSavedAt: "2026-07-25T00:01:00.000Z",
        });
      }
      if (url === "/api/research/assessment/submit" && init?.method === "POST") {
        expect(body.expectedRevision).toBe(1);
        submitted = true;
        return response(200, { ok: true, blueprintState: "samuel_review" });
      }
      throw new Error(`unexpected request: ${init?.method ?? "GET"} ${url}`);
    }));

    const view = await renderPage();
    const strength = Array.from(view.querySelectorAll("button")).find((button) => button.textContent?.includes("Strength"))!;
    await act(async () => {
      strength.click();
    });
    const continueButton = Array.from(view.querySelectorAll("button")).find((button) => button.textContent?.includes("Review answers"))!;
    await act(async () => {
      continueButton.click();
    });
    const submitButton = Array.from(view.querySelectorAll("button")).find((button) => button.textContent?.includes("Submit assessment"))!;
    await act(async () => {
      submitButton.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(calls.some((call) => call.url === "/api/research/assessment/responses")).toBe(true);
    expect(calls.some((call) => call.url === "/api/research/assessment/submit")).toBe(true);
    expect(storageWrite).not.toHaveBeenCalled();
  });

  it("renders an actionable unavailable state without inventing assessment data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(503, { ok: false })));
    const view = await renderPage();
    expect(view.textContent).toContain("Assessment is temporarily unavailable.");
    expect(view.textContent).toContain("No answers were collected.");
  });
});

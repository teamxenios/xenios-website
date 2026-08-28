// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Route, Router } from "wouter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CARE_CLINICIAN_REVIEW_ACTIONS } from "@shared/care/clinician-review";
import { careApiFetch } from "./api";
import CareClinicianReviewQueuePage, {
  CARE_CLINICIAN_REVIEW_PATH,
} from "./CareClinicianReviewQueuePage";
import CareSection from "./section";

vi.mock("./api", () => ({ careApiFetch: vi.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const careApiFetchMock = vi.mocked(careApiFetch);
const pageSource = readFileSync(
  resolve(__dirname, "./CareClinicianReviewQueuePage.tsx"),
  "utf8",
);
const sectionSource = readFileSync(resolve(__dirname, "./section.tsx"), "utf8");

const REVIEW_ID = "44444444-4444-4444-8444-444444444444";
const SECOND_REVIEW_ID = "4b4b4b4b-4b4b-4b4b-8b4b-4b4b4b4b4b4b";

function queueItem(overrides: Record<string, unknown> = {}) {
  return {
    reviewId: REVIEW_ID,
    status: "assigned",
    decision: null,
    appointmentStatus: "scheduled",
    intakeState: "submitted",
    consentComplete: true,
    version: 0,
    updatedAt: "2026-07-25T20:00:00.000Z",
    ...overrides,
  };
}

function detailBody(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    detail: {
      ...queueItem(),
      decisionSource: null,
      appointment: {
        status: "scheduled",
        scheduled: true,
        completed: false,
        telehealthReady: true,
      },
      intake: {
        state: "submitted",
        definitionVersion: "2026.07",
        submittedAt: "2026-07-25T21:00:00.000Z",
      },
      consent: [
        { kind: "telehealth", satisfied: true, reason: "active" },
        { kind: "privacy_notice", satisfied: false, reason: "not_granted" },
      ],
      ...overrides,
    },
    actions: CARE_CLINICIAN_REVIEW_ACTIONS.map((action) => ({
      action,
      label: `Do ${action}`,
      capability: "provider_actions",
      enabled: false,
      blockedReason: "capability_disabled",
      explanation: "Provider actions are turned off.",
    })),
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  careApiFetchMock.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(Page: () => React.JSX.Element = CareClinicianReviewQueuePage) {
  const staticLocation = (): [string, (next: string) => void] => [
    CARE_CLINICIAN_REVIEW_PATH,
    () => undefined,
  ];
  await act(async () => {
    root.render(
      <Router
        hook={staticLocation}
        searchHook={() => ""}
        ssrPath={CARE_CLINICIAN_REVIEW_PATH}
      >
        <Route path={CARE_CLINICIAN_REVIEW_PATH}>
          <Page />
        </Route>
      </Router>,
    );
  });
  await act(async () => {
    await new Promise((done) => setTimeout(done, 0));
  });
  return container;
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await act(async () => {
    await new Promise((done) => setTimeout(done, 0));
  });
}

describe("Care clinician review queue, role boundary", () => {
  it("shows a sign-in requirement to an anonymous visitor and no queue", async () => {
    careApiFetchMock.mockResolvedValue(
      json({ ok: false, code: "care_auth_required" }, 401),
    );
    const text = (await render()).textContent ?? "";
    expect(text).toContain("Sign in is required.");
    expect(text).toContain("No review action is available here.");
    expect(text).not.toContain("Your assigned reviews");
    expect(container.querySelectorAll("[data-care-action-enabled]")).toHaveLength(0);
  });

  it("shows a plain refusal to a signed-in member and no queue", async () => {
    careApiFetchMock.mockResolvedValue(
      json({ ok: false, code: "care_forbidden" }, 403),
    );
    const text = (await render()).textContent ?? "";
    expect(text).toContain("This area is limited to assigned clinicians.");
    expect(text).toContain("does not hold the assigned clinician permission");
    expect(text).not.toContain("Your assigned reviews");
    const reviewSection = container.querySelector("[data-care-review-read-only]");
    expect(reviewSection?.querySelectorAll("button")).toHaveLength(0);
  });

  it("never reads a review detail for a caller the queue refused", async () => {
    careApiFetchMock.mockResolvedValue(
      json({ ok: false, code: "care_forbidden" }, 403),
    );
    await render();
    expect(careApiFetchMock).toHaveBeenCalledTimes(1);
    expect(careApiFetchMock).toHaveBeenCalledWith("/api/care/reviews/queue");
  });

  it("stays truthful when Care is disabled", async () => {
    careApiFetchMock.mockResolvedValue(
      json(
        { ok: false, code: "care_disabled", message: "Care is being prepared." },
        503,
      ),
    );
    const text = (await render()).textContent ?? "";
    expect(text).toContain("Clinical review is not available yet.");
    expect(text).toContain("Care is being prepared.");
  });

  it("offers a retry when the queue read fails", async () => {
    careApiFetchMock.mockResolvedValue(json({ ok: false }, 500));
    const text = (await render()).textContent ?? "";
    expect(text).toContain("The review queue is temporarily unavailable.");
    expect(text).toContain("Nothing was changed.");
  });
});

describe("Care clinician review queue, states", () => {
  it("renders an honest empty queue", async () => {
    careApiFetchMock.mockResolvedValue(
      json({ ok: true, queue: [], summary: { total: 0, openWithClinician: 0, waitingOnSomeoneElse: 0, decided: 0 } }),
    );
    const text = (await render()).textContent ?? "";
    expect(text).toContain("No review is assigned to you.");
    expect(text).toContain("this page never invents a queue entry");
  });

  it("renders assigned reviews by position and never by patient identity", async () => {
    careApiFetchMock.mockResolvedValue(
      json({
        ok: true,
        queue: [
          queueItem(),
          queueItem({
            reviewId: SECOND_REVIEW_ID,
            status: "awaiting_labs",
            appointmentStatus: null,
            intakeState: "missing",
            consentComplete: false,
          }),
        ],
        summary: {
          total: 2,
          openWithClinician: 1,
          waitingOnSomeoneElse: 1,
          decided: 0,
        },
      }),
    );
    const text = (await render()).textContent ?? "";
    expect(text).toContain("Review 01");
    expect(text).toContain("Review 02");
    expect(text).toContain("Waiting on labs");
    expect(text).toContain("Appointment: None recorded");
    expect(text).toContain("Intake: Not started");
    expect(text).toContain("Consent: Incomplete");
    expect(text).not.toContain(REVIEW_ID);
    expect(text).not.toContain(SECOND_REVIEW_ID);
  });

  it("opens a review and shows intake, appointment, consent, and review status", async () => {
    careApiFetchMock.mockImplementation(async (path: string) =>
      path.endsWith("/queue")
        ? json({
            ok: true,
            queue: [queueItem()],
            summary: { total: 1, openWithClinician: 1, waitingOnSomeoneElse: 0, decided: 0 },
          })
        : json(detailBody()),
    );
    await render();
    const open = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Open review 01"),
    );
    expect(open).toBeDefined();
    await click(open as Element);

    const text = container.textContent ?? "";
    expect(text).toContain("REVIEW DETAIL");
    expect(text).toContain("No decision recorded");
    expect(text).toContain("TELEHEALTH SESSION");
    expect(text).toContain("Not satisfied, Not granted");
    expect(text).toContain("Intake answers are not displayed here.");
    expect(careApiFetchMock).toHaveBeenLastCalledWith(
      `/api/care/reviews/${REVIEW_ID}`,
    );
  });

  it("reports a review that is not the clinician's own as unavailable", async () => {
    careApiFetchMock.mockImplementation(async (path: string) =>
      path.endsWith("/queue")
        ? json({
            ok: true,
            queue: [queueItem()],
            summary: { total: 1, openWithClinician: 1, waitingOnSomeoneElse: 0, decided: 0 },
          })
        : json({ ok: false, code: "care_review_not_found" }, 404),
    );
    await render();
    const open = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Open review 01"),
    );
    await click(open as Element);
    expect(container.textContent).toContain("This review is not available to you.");
  });
});

describe("Care clinician review, clinical action controls", () => {
  async function openDetail(body = detailBody()) {
    careApiFetchMock.mockImplementation(async (path: string) =>
      path.endsWith("/queue")
        ? json({
            ok: true,
            queue: [queueItem()],
            summary: { total: 1, openWithClinician: 1, waitingOnSomeoneElse: 0, decided: 0 },
          })
        : json(body),
    );
    await render();
    const open = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Open review 01"),
    );
    await click(open as Element);
  }

  it("renders every clinical action visibly disabled with an explanation", async () => {
    await openDetail();
    const controls = Array.from(
      container.querySelectorAll("[data-care-action-enabled]"),
    ) as HTMLButtonElement[];
    expect(controls).toHaveLength(CARE_CLINICIAN_REVIEW_ACTIONS.length);
    for (const control of controls) {
      expect(control.disabled).toBe(true);
      expect(control.getAttribute("aria-disabled")).toBe("true");
      expect(control.getAttribute("data-care-action-enabled")).toBe("false");
      const explanationId = control.getAttribute("aria-describedby") ?? "";
      const explanation = container.querySelector(
        `[id="${explanationId}"]`,
      );
      expect(explanation?.textContent ?? "").not.toHaveLength(0);
    }
    expect(container.textContent).toContain("UNAVAILABLE");
  });

  it("cannot fire an action while the capability flag is false", async () => {
    await openDetail();
    const callsAfterOpen = careApiFetchMock.mock.calls.length;
    const controls = Array.from(
      container.querySelectorAll("[data-care-action-enabled]"),
    ) as HTMLButtonElement[];
    for (const control of controls) await click(control);
    expect(careApiFetchMock.mock.calls.length).toBe(callsAfterOpen);
    for (const call of careApiFetchMock.mock.calls) {
      expect(call[1]?.method ?? "GET").toBe("GET");
      expect(String(call[0])).not.toContain("/action");
    }
  });

  it("keeps a control disabled even if the server reports it as enabled", async () => {
    const body = detailBody();
    body.actions = body.actions.map((action) => ({
      ...action,
      enabled: true,
      blockedReason: "",
      explanation: "",
    }));
    await openDetail(body);
    const controls = Array.from(
      container.querySelectorAll("[data-care-action-enabled]"),
    ) as HTMLButtonElement[];
    expect(controls).toHaveLength(CARE_CLINICIAN_REVIEW_ACTIONS.length);
    for (const control of controls) expect(control.disabled).toBe(true);
    expect(container.textContent).toContain(
      "This release has no path from this screen to a clinical record",
    );
  });

  it("contains no write request, action endpoint, or invented clinician identity", () => {
    expect(pageSource).not.toMatch(/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
    expect(pageSource).not.toContain("/action");
    expect(pageSource).not.toMatch(/\b(?:Dr\.|MD|NP|PA-C)\b/);
    expect(pageSource).not.toMatch(/detail\.(?:patientId|assignedClinicianUserId|patientStateCode)/);
    expect(pageSource).toContain('data-care-review-read-only="true"');
    expect(pageSource).toContain("disabled");
  });
});

describe("Care clinician review, page shell", () => {
  it("keeps one main, one H1, and the in-page focus target", () => {
    const markup = renderToStaticMarkup(
      <Router ssrPath={CARE_CLINICIAN_REVIEW_PATH}>
        <Route path={CARE_CLINICIAN_REVIEW_PATH}>
          <CareClinicianReviewQueuePage />
        </Route>
      </Router>,
    );
    expect(markup.match(/<main(?:\s|>)/g)).toHaveLength(1);
    expect(markup.match(/<h1(?:\s|>)/g)).toHaveLength(1);
    expect(markup).toContain('id="main-content"');
  });

  it("reflows without a fixed minimum width or horizontal scroll", () => {
    expect(pageSource).toContain("container-x");
    expect(pageSource).not.toMatch(/\bmin-w-\[(?:[1-9]\d*)px\]/);
    expect(pageSource).not.toContain("overflow-x-auto");
  });

  it("is reached from the Care surface without changing the application router", async () => {
    careApiFetchMock.mockResolvedValue(
      json({ ok: false, code: "care_auth_required" }, 401),
    );
    const text = (await render(CareSection)).textContent ?? "";
    expect(text).toContain("CARE · CLINICIAN REVIEW");
    expect(sectionSource).toContain("CARE_CLINICIAN_REVIEW_PATH");
    expect(sectionSource).toContain("case CARE_CLINICIAN_REVIEW_PATH:");
    expect(sectionSource).toContain("return <CareClinicianReviewQueuePage />;");
    expect(sectionSource).toContain("return <CareNotFoundPage />;");
  });
});

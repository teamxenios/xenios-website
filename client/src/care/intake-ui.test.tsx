// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Route, Router } from "wouter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CareRecordId } from "@shared/care/contracts";
import type { CareIntakeDefinition } from "@shared/care/intake";
import { careApiFetch } from "./api";
import CareIntakePage from "./CareIntakePage";

vi.mock("./api", () => ({ careApiFetch: vi.fn() }));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const page = readFileSync(resolve(__dirname, "./CareIntakePage.tsx"), "utf8");
const section = readFileSync(resolve(__dirname, "./section.tsx"), "utf8");
const careApiFetchMock = vi.mocked(careApiFetch);

const ROUTE = "/care/intake";

// A synthetic questionnaire shape. Not an approved questionnaire, not a real
// person, and carrying no clinical value of any kind.
const SYNTHETIC_DEFINITION: CareIntakeDefinition = {
  id: "synthetic-definition" as CareRecordId,
  version: "synthetic-v1",
  status: "approved",
  schemaHash: "sha256:synthetic",
  fields: [
    {
      key: "identity_synthetic_short_answer",
      kind: "text",
      required: true,
      options: [],
    },
    {
      key: "goals_synthetic_choice",
      kind: "single_select",
      required: false,
      options: ["synthetic option one", "synthetic option two"],
    },
  ],
  approvedAt: "2026-07-25T18:00:00.000Z",
};

const SYNTHETIC_DRAFT = {
  id: "synthetic-intake" as CareRecordId,
  patientId: "synthetic-patient" as CareRecordId,
  definitionId: SYNTHETIC_DEFINITION.id,
  definitionVersion: SYNTHETIC_DEFINITION.version,
  telehealthConsentEventId: "synthetic-telehealth-event" as CareRecordId,
  privacyConsentEventId: "synthetic-privacy-event" as CareRecordId,
  status: "draft" as const,
  version: 0,
  createdAt: "2026-07-26T10:00:00.000Z",
  submittedAt: null,
};

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

async function flush() {
  await act(async () => {
    await new Promise((done) => setTimeout(done, 0));
  });
}

async function mountPage() {
  const staticLocation = (): [string, (next: string) => void] => [
    ROUTE,
    () => undefined,
  ];
  await act(async () => {
    root.render(
      <Router hook={staticLocation} searchHook={() => ""} ssrPath={ROUTE}>
        <Route path={ROUTE}>
          <CareIntakePage />
        </Route>
      </Router>,
    );
  });
  await flush();
  return () => container.textContent ?? "";
}

function byText(selector: string, text: string): HTMLElement | undefined {
  return Array.from(container.querySelectorAll<HTMLElement>(selector)).find(
    (element) => (element.textContent ?? "").trim().includes(text),
  );
}

function click(element: HTMLElement | undefined) {
  if (!element) throw new Error("control_not_found");
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("Care intake surface, structure and Xenios shell", () => {
  it("reuses the Xenios shell with one main landmark and one H1", () => {
    const html = renderToStaticMarkup(
      <Router ssrPath={ROUTE}>
        <Route path={ROUTE}>
          <CareIntakePage />
        </Route>
      </Router>,
    );
    expect(html.match(/<main(?:\s|>)/g)).toHaveLength(1);
    expect(html.match(/<h1(?:\s|>)/g)).toHaveLength(1);
    expect(html).toContain('id="main-content"');
    expect(page).toContain("<PageShell>");
    expect(page).toContain("container-x");
    expect(page).not.toContain("<main");
    expect(page).not.toMatch(/gradient|Georgia|--care-|care-wordmark/i);
  });

  it("reflows at 320, 375, 768, and 1440 without a fixed minimum width", () => {
    expect(page).not.toMatch(/\bmin-w-\[(?:[1-9]\d*)px\]/);
    expect(page).not.toContain("overflow-x-auto");
    expect(page).toContain("flex flex-wrap");
    expect(page).toContain("grid grid-cols-1 md:grid-cols-2");
    expect(page).toContain("break-words");
  });

  it("is mounted by the Care section router at /care/intake", () => {
    expect(section).toContain('<Route path="/care/intake">');
    expect(section).toContain('lazy(() => import("./CareIntakePage"))');
  });

  it("makes no availability, provider, price, or launch claim", () => {
    expect(page).not.toMatch(/\$\d/);
    expect(page).not.toMatch(
      /available nationwide|all 50 states|our clinicians|our pharmacy|launches? on/i,
    );
    expect(page).not.toContain("—");
  });

  it("invents no clinical question, option, or reading", () => {
    // Every question, option, and label comes from the approved definition the
    // server returns. The page hardcodes none of them.
    expect(page).toContain("fieldLabel(field)");
    expect(page).toContain("field.options.map");
    expect(page).not.toMatch(
      /Do you (?:have|take)|List your (?:medications|allergies)|mg\b/i,
    );
  });
});

describe("Care intake surface, fail-closed states", () => {
  it("renders the loading state and accepts no answer while checking", async () => {
    careApiFetchMock.mockImplementation(() => new Promise(() => {}));
    const text = await mountPage();
    expect(text()).toContain("Checking intake status…");
    expect(text()).toContain(
      "No intake answer is accepted while this check is in progress.",
    );
    expect(container.querySelector("input, textarea, select")).toBeNull();
  });

  it("is truthful and fully disabled when real patient data is not enabled", async () => {
    careApiFetchMock.mockResolvedValue(
      json({ ok: false, code: "care_disabled" }, 503),
    );
    const text = await mountPage();
    expect(text()).toContain(
      "Care intake is not enabled and cannot accept an answer.",
    );
    expect(text()).toContain(
      "Real patient data is not enabled in this environment.",
    );
    // The complete flow is visible, and its action control is truthfully off.
    expect(text()).toContain("The whole flow, none of it live.");
    expect(text()).toContain("Medical history");
    const start = byText("button", "Start my intake");
    expect(start).toBeDefined();
    expect((start as HTMLButtonElement).disabled).toBe(true);
    expect(text()).toContain(
      "This control stays turned off until Care is enabled for real patient records.",
    );
    // Nothing can be typed, so nothing can pretend to have been stored.
    expect(container.querySelector("input, textarea, select")).toBeNull();
  });

  it("does not crash and offers sign in when the account is unauthenticated", async () => {
    careApiFetchMock.mockResolvedValue(
      json({ ok: false, code: "care_auth_required" }, 401),
    );
    const text = await mountPage();
    expect(text()).toContain("Sign in is required.");
    expect(text()).toContain("AUTHORIZATION REQUIRED");
    expect(text()).toContain(
      "Research access does not grant Care authorization.",
    );
    expect(
      container.querySelector('a[href="/research/sign-in"]'),
    ).not.toBeNull();
  });

  it("does not crash on an unknown or forbidden account", async () => {
    careApiFetchMock.mockResolvedValue(
      json({ ok: false, code: "care_forbidden" }, 403),
    );
    const text = await mountPage();
    expect(text()).toContain(
      "This account is not authorized for patient intake.",
    );
    expect(container.querySelector("input, textarea, select")).toBeNull();
  });

  it("does not crash on a malformed body and offers a retry", async () => {
    careApiFetchMock.mockResolvedValue(
      new Response("not json", { status: 200 }),
    );
    const text = await mountPage();
    expect(text()).toContain("Intake status is temporarily unavailable.");
    expect(byText("button", "Try again")).toBeDefined();
  });

  it("states the truth when no approved questionnaire is published", async () => {
    careApiFetchMock.mockResolvedValue(
      json({ ok: true, intake: null, revision: null, definition: null }),
    );
    const text = await mountPage();
    expect(text()).toContain(
      "No approved intake questionnaire is published yet.",
    );
    expect(text()).toContain("No placeholder question is presented as approved.");
  });

  it("reports a submitted intake as awaiting a human clinician", async () => {
    careApiFetchMock.mockResolvedValue(
      json({
        ok: true,
        definition: SYNTHETIC_DEFINITION,
        intake: {
          ...SYNTHETIC_DRAFT,
          status: "submitted",
          submittedAt: "2026-07-26T12:00:00.000Z",
        },
        revision: null,
      }),
    );
    const text = await mountPage();
    expect(text()).toContain("Your intake is waiting for clinician review.");
    expect(text()).toContain("SUBMITTED · AWAITING CLINICIAN REVIEW");
    expect(text()).toContain("There is no automated clinical decision");
    expect(container.querySelector("textarea")).toBeNull();
  });
});

describe("Care intake surface, the multi-step draft", () => {
  function draftResponse(responses: Record<string, unknown> | null = null) {
    return json({
      ok: true,
      definition: SYNTHETIC_DEFINITION,
      intake: SYNTHETIC_DRAFT,
      revision: responses
        ? {
            id: "synthetic-revision" as CareRecordId,
            intakeId: SYNTHETIC_DRAFT.id,
            patientId: SYNTHETIC_DRAFT.patientId,
            version: 1,
            responses,
            idempotencyKey: "synthetic-key-00000001",
            createdAt: "2026-07-26T11:00:00.000Z",
          }
        : null,
    });
  }

  it("renders each step, its progress, and its labelled inputs", async () => {
    careApiFetchMock.mockResolvedValue(draftResponse());
    const text = await mountPage();

    expect(text()).toContain("Your intake is in progress and saved as a draft.");
    expect(text()).toContain("STEP 1 OF 3");
    expect(text()).toContain("0 OF 2 QUESTIONS ANSWERED");

    const input = container.querySelector<HTMLTextAreaElement>(
      "#care-intake-field-identity_synthetic_short_answer",
    );
    expect(input).not.toBeNull();
    const label = container.querySelector<HTMLLabelElement>(
      'label[for="care-intake-field-identity_synthetic_short_answer"]',
    );
    expect(label?.textContent).toContain("Synthetic short answer");
    expect(label?.textContent).toContain("REQUIRED");

    click(byText("button", "Next step"));
    expect(text()).toContain("STEP 2 OF 3");
    const select = container.querySelector<HTMLSelectElement>(
      "#care-intake-field-goals_synthetic_choice",
    );
    expect(select).not.toBeNull();
    expect(
      Array.from(select?.options ?? []).map((option) => option.value),
    ).toEqual([
      "",
      "synthetic option one",
      "synthetic option two",
    ]);

    click(byText("button", "Next step"));
    expect(text()).toContain("STEP 3 OF 3");
    expect(text()).toContain("Review your answers");
    expect(text()).toContain("Not answered");
  });

  it("resumes a saved draft on the first step that still needs an answer", async () => {
    careApiFetchMock.mockResolvedValue(
      draftResponse({ identity_synthetic_short_answer: "synthetic answer" }),
    );
    const text = await mountPage();
    expect(text()).toContain("1 OF 2 QUESTIONS ANSWERED");
    expect(text()).toContain("ALL CHANGES SAVED AS A DRAFT");
    // The only required question is answered, so the resume lands on review.
    expect(text()).toContain("Review your answers");
    expect(text()).toContain("synthetic answer");
  });

  it("autosaves an edited answer to the real autosave endpoint", async () => {
    vi.useFakeTimers();
    try {
      careApiFetchMock.mockResolvedValue(draftResponse());
      const staticLocation = (): [string, (next: string) => void] => [
        ROUTE,
        () => undefined,
      ];
      await act(async () => {
        root.render(
          <Router hook={staticLocation} searchHook={() => ""} ssrPath={ROUTE}>
            <Route path={ROUTE}>
              <CareIntakePage />
            </Route>
          </Router>,
        );
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      const input = container.querySelector<HTMLTextAreaElement>(
        "#care-intake-field-identity_synthetic_short_answer",
      );
      expect(input).not.toBeNull();

      careApiFetchMock.mockResolvedValue(
        json({
          ok: true,
          revision: {
            id: "synthetic-revision" as CareRecordId,
            intakeId: SYNTHETIC_DRAFT.id,
            patientId: SYNTHETIC_DRAFT.patientId,
            version: 1,
            responses: {
              identity_synthetic_short_answer: "synthetic typed answer",
            },
            idempotencyKey: "synthetic-key-00000002",
            createdAt: "2026-07-26T11:05:00.000Z",
          },
        }),
      );

      act(() => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )?.set;
        setter?.call(input, "synthetic typed answer");
        input?.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(container.textContent).toContain("UNSAVED CHANGES");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_500);
      });

      const autosave = careApiFetchMock.mock.calls.find(([path]) =>
        String(path).endsWith("/autosave"),
      );
      expect(autosave).toBeDefined();
      const [autosavePath, autosaveInit] = autosave ?? [];
      expect(autosavePath).toBe(
        "/api/care/intake/synthetic-intake/autosave",
      );
      expect(autosaveInit?.method).toBe("PATCH");
      const body = JSON.parse(String(autosaveInit?.body));
      expect(body.expectedVersion).toBe(0);
      expect(body.responses).toEqual({
        identity_synthetic_short_answer: "synthetic typed answer",
      });
      expect(String(body.idempotencyKey).length).toBeGreaterThanOrEqual(8);
      expect(container.textContent).toContain("ALL CHANGES SAVED AS A DRAFT");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a failed autosave without claiming anything was submitted", async () => {
    careApiFetchMock.mockResolvedValueOnce(draftResponse());
    await mountPage();
    const input = container.querySelector<HTMLTextAreaElement>(
      "#care-intake-field-identity_synthetic_short_answer",
    );
    careApiFetchMock.mockResolvedValue(
      json({ ok: false, code: "care_temporarily_unavailable" }, 503),
    );
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "synthetic typed answer");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      await new Promise((done) => setTimeout(done, 1_500));
    });
    expect(container.textContent).toContain("NOT SAVED");
    expect(container.textContent).toContain("Nothing was submitted.");
    expect(byText("button", "Try saving again")).toBeDefined();
  });

  it("blocks submit while a required answer is missing and calls no endpoint", async () => {
    careApiFetchMock.mockResolvedValueOnce(draftResponse());
    const text = await mountPage();
    click(byText("button", "Review and submit"));
    expect(text()).toContain("1 required question still needs an answer.");

    careApiFetchMock.mockClear();
    click(byText("button", "Submit my intake"));
    await flush();

    expect(
      careApiFetchMock.mock.calls.filter(([path]) =>
        String(path).endsWith("/submit"),
      ),
    ).toHaveLength(0);
    expect(text()).toContain(
      "Some required questions still need an answer. Nothing was submitted.",
    );
    expect(text()).toContain("This question needs an answer before you submit.");
  });

  it("submits a complete draft through the real submit endpoint", async () => {
    careApiFetchMock.mockResolvedValueOnce(
      draftResponse({ identity_synthetic_short_answer: "synthetic answer" }),
    );
    const text = await mountPage();
    expect(text()).toContain("Review your answers");

    careApiFetchMock.mockResolvedValue(
      json({
        ok: true,
        intake: {
          ...SYNTHETIC_DRAFT,
          status: "submitted",
          version: 2,
          submittedAt: "2026-07-26T12:00:00.000Z",
        },
      }),
    );
    click(byText("button", "Submit my intake"));
    await flush();

    const submit = careApiFetchMock.mock.calls.find(([path]) =>
      String(path).endsWith("/submit"),
    );
    expect(submit).toBeDefined();
    expect(submit?.[0]).toBe("/api/care/intake/synthetic-intake/submit");
    expect(submit?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(submit?.[1]?.body)).expectedVersion).toBe(0);
    expect(text()).toContain("Your intake has been submitted.");
    expect(text()).toContain("No clinical decision has been made");
  });

  it("explains a blocked start without inventing a reason", async () => {
    careApiFetchMock.mockResolvedValueOnce(
      json({
        ok: true,
        definition: SYNTHETIC_DEFINITION,
        intake: null,
        revision: null,
      }),
    );
    const text = await mountPage();
    expect(text()).toContain("Your intake has not been started.");
    expect(text()).toContain("APPROVED QUESTIONNAIRE VERSION synthetic-v1");

    careApiFetchMock.mockResolvedValue(
      json({ ok: false, code: "care_intake_telehealth_consent_mismatch" }, 409),
    );
    click(byText("button", "Start my intake"));
    await flush();

    expect(text()).toContain("Your telehealth consent is not current.");
    expect(container.querySelector('a[href="/care/consent"]')).not.toBeNull();
  });
});

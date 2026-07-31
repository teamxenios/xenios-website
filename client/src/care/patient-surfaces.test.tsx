// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Route, Router } from "wouter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CARE_PATIENT_ACTIONS,
  CARE_PATIENT_RECORD_PATH,
  CARE_PATIENT_SURFACES,
  carePatientActionState,
  carePatientActionStates,
  carePatientAvailableSurfaces,
  carePatientPendingSurfaces,
  carePatientSurfaceByPath,
} from "@shared/care/patient-surfaces";
import { careApiFetch } from "./api";
import CarePatientRecordPage from "./CarePatientRecordPage";
import CarePatientSurfacePendingPage from "./CarePatientSurfacePendingPage";

vi.mock("./api", () => ({
  careApiFetch: vi.fn(),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const source = (path: string) => readFileSync(resolve(__dirname, path), "utf8");

const recordPage = source("./CarePatientRecordPage.tsx");
const pendingPage = source("./CarePatientSurfacePendingPage.tsx");
const sectionSource = source("./section.tsx");
const inventory = source("../../../shared/care/patient-surfaces.ts");
const careApiFetchMock = vi.mocked(careApiFetch);

const serverCareSource = [
  "index",
  "appointment-routes",
  "eligibility-routes",
  "intake-routes",
  "prescription-routes",
  "review-routes",
]
  .map((name) => source(`../../../server/care/${name}.ts`))
  .join("\n");

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

function statusResponse(enabled: boolean) {
  return new Response(
    JSON.stringify({
      ok: true,
      capability: {
        rail: "care",
        state: enabled ? "enabled" : "pending_clinicians",
        enabled,
        publicMessage: "Care is being prepared.",
        checkedAt: "2026-01-01T00:00:00.000Z",
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

async function renderRecordPage(response: Response | Error) {
  careApiFetchMock.mockImplementation(async () => {
    if (response instanceof Error) throw response;
    return response.clone();
  });
  const staticLocation = (): [string, (next: string) => void] => [
    CARE_PATIENT_RECORD_PATH,
    () => undefined,
  ];
  await act(async () => {
    root.render(
      <Router
        hook={staticLocation}
        searchHook={() => ""}
        ssrPath={CARE_PATIENT_RECORD_PATH}
      >
        <Route path={CARE_PATIENT_RECORD_PATH}>
          <CarePatientRecordPage />
        </Route>
      </Router>,
    );
  });
  await act(async () => {
    await new Promise((done) => setTimeout(done, 0));
  });
  return container;
}

describe("Care patient surface inventory", () => {
  it("marks a surface available only when server/care registers its contract", () => {
    const contractKeys: Record<string, string> = {
      eligibility: "CARE_ROUTE_CONTRACTS.eligibility",
      consent: "CARE_ROUTE_CONTRACTS.consents",
      appointments: "CARE_ROUTE_CONTRACTS.appointments",
      prescriptions: "CARE_ROUTE_CONTRACTS.prescriptions",
    };
    const available = carePatientAvailableSurfaces();
    expect(available.length).toBeGreaterThan(0);
    for (const surface of available) {
      expect(surface.missingContract).toBeNull();
      expect(surface.reason).toBe("");
      const key = contractKeys[surface.key];
      expect(key, `no contract key mapped for ${surface.key}`).toBeTruthy();
      expect(serverCareSource).toContain(key);
    }
  });

  it("names an exact missing endpoint and a plain reason for every unbuilt surface", () => {
    const pending = carePatientPendingSurfaces();
    expect(pending.length).toBeGreaterThan(0);
    for (const surface of pending) {
      expect(surface.missingContract, surface.key).toBeTruthy();
      expect(surface.missingContract).toMatch(/^(GET|POST|PATCH|DELETE) \//);
      expect(surface.reason.length).toBeGreaterThan(40);
      expect(surface.path).toBe(`/care/${surface.key}`);
    }
  });

  it("claims no state for the labs or adverse-event surfaces owned elsewhere", () => {
    const keys = CARE_PATIENT_SURFACES.map((surface) => surface.key);
    expect(keys).not.toContain("labs");
    expect(keys).not.toContain("adverse-events");
    expect(inventory).not.toMatch(/path:\s*"\/care\/labs"/);
    expect(inventory).not.toMatch(/path:\s*"\/care\/adverse/);
  });

  it("resolves a surface from its path and ignores an unknown path", () => {
    expect(carePatientSurfaceByPath("/care/messages")?.key).toBe("messages");
    expect(carePatientSurfaceByPath("/care/MESSAGES/")?.key).toBe("messages");
    expect(carePatientSurfaceByPath("/care/not-a-surface")).toBeNull();
    expect(carePatientSurfaceByPath("/research/messages")).toBeNull();
  });

  it("routes the record page and every unbuilt surface inside the Care module", () => {
    expect(sectionSource).toContain("CARE_PATIENT_RECORD_PATH");
    expect(sectionSource).toContain("carePatientSurfaceByPath");
    expect(sectionSource).toContain("CarePatientSurfacePendingPage");
    // The protected application router is not part of this seam.
    expect(sectionSource).not.toContain("client/src/App.tsx");
  });
});

describe("Care patient actions cannot fire", () => {
  it("never reports an action as enabled, even when Care reports itself active", () => {
    for (const careEnabled of [false, true]) {
      for (const action of CARE_PATIENT_ACTIONS) {
        const state = carePatientActionState({ action, careEnabled });
        expect(state.enabled, `${action}/${String(careEnabled)}`).toBe(false);
        expect(state.explanation.length).toBeGreaterThan(20);
      }
    }
    expect(carePatientActionStates(true).every((a) => !a.enabled)).toBe(true);
  });

  it("explains a missing contract differently from an inactive Care rail", () => {
    expect(
      carePatientActionState({ action: "request_refill", careEnabled: true })
        .blockedReason,
    ).toBe("no_patient_contract");
    expect(
      carePatientActionState({
        action: "request_appointment",
        careEnabled: false,
      }).blockedReason,
    ).toBe("care_not_active");
    expect(
      carePatientActionState({
        action: "request_appointment",
        careEnabled: true,
      }).blockedReason,
    ).toBe("no_write_path");
  });

  it("renders every control disabled and clicking one sends no request", async () => {
    const node = await renderRecordPage(statusResponse(true));
    const buttons = Array.from(
      node.querySelectorAll<HTMLButtonElement>(
        '[data-care-action-enabled="false"]',
      ),
    );
    expect(buttons).toHaveLength(CARE_PATIENT_ACTIONS.length);

    const callsAfterLoad = careApiFetchMock.mock.calls.length;
    for (const button of buttons) {
      expect(button.disabled).toBe(true);
      expect(button.getAttribute("aria-disabled")).toBe("true");
      const describedBy = button.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      expect(node.querySelector(`#${describedBy}`)?.textContent ?? "").not.toBe(
        "",
      );
      await act(async () => {
        button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }
    expect(careApiFetchMock.mock.calls.length).toBe(callsAfterLoad);
  });

  it("contains no patient write path in either new screen", () => {
    const both = [recordPage, pendingPage].join("\n");
    expect(both).not.toMatch(/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
    expect(both).not.toContain("<input");
    expect(both).not.toContain("<form");
    // The pending screen has no endpoint to call, so it calls nothing at all.
    expect(pendingPage).not.toContain("careApiFetch");
    expect(pendingPage).not.toContain("fetch(");
  });
});

describe("Care patient record page states", () => {
  it("announces the loading state before the status read resolves", async () => {
    careApiFetchMock.mockImplementation(
      () => new Promise<Response>(() => undefined),
    );
    const staticLocation = (): [string, (next: string) => void] => [
      CARE_PATIENT_RECORD_PATH,
      () => undefined,
    ];
    await act(async () => {
      root.render(
        <Router
          hook={staticLocation}
          searchHook={() => ""}
          ssrPath={CARE_PATIENT_RECORD_PATH}
        >
          <Route path={CARE_PATIENT_RECORD_PATH}>
            <CarePatientRecordPage />
          </Route>
        </Router>,
      );
    });
    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.getAttribute("aria-busy")).toBe("true");
    expect(container.textContent).toContain("Checking Care status");
  });

  it("offers a retry and keeps Care unavailable when the status read fails", async () => {
    const node = await renderRecordPage(new Error("network"));
    expect(node.textContent).toContain(
      "Care status is temporarily unavailable.",
    );
    expect(node.textContent).toContain("Nothing was changed.");
    const retry = Array.from(node.querySelectorAll("button")).find(
      (button) => button.textContent === "Try again",
    );
    expect(retry?.disabled).toBe(false);
  });

  it("treats a refused status read as an authorization state, not an empty record", async () => {
    const node = await renderRecordPage(
      new Response(JSON.stringify({ ok: false }), { status: 401 }),
    );
    expect(node.textContent).toContain("Sign in is required.");
    expect(node.textContent).toContain(
      "describes what exists, not what you have",
    );
  });

  it("lists the unbuilt surfaces with the endpoint that does not exist", async () => {
    const node = await renderRecordPage(statusResponse(false));
    const text = node.textContent ?? "";
    expect(text).toContain("These have no record behind them.");
    for (const surface of carePatientPendingSurfaces()) {
      expect(text, surface.key).toContain(surface.title);
      expect(text, surface.key).toContain(surface.missingContract ?? "");
    }
    for (const surface of carePatientAvailableSurfaces()) {
      const link = node.querySelector(`a[href="${surface.path}"]`);
      expect(link, surface.key).toBeTruthy();
    }
  });

  it("fabricates no record content and shows no currency or count", async () => {
    const node = await renderRecordPage(statusResponse(false));
    const text = node.textContent ?? "";
    expect(text).not.toContain("$");
    expect(text).not.toMatch(/\b\d+\s+(?:result|record|message|order)s?\b/i);
  });
});

describe("Care patient screens are reachable and responsive", () => {
  it("keeps one main and one H1 with an in-page focus target", () => {
    const pages = [
      renderToStaticMarkup(
        <Router ssrPath={CARE_PATIENT_RECORD_PATH}>
          <Route path={CARE_PATIENT_RECORD_PATH}>
            <CarePatientRecordPage />
          </Route>
        </Router>,
      ),
      ...carePatientPendingSurfaces().map((surface) =>
        renderToStaticMarkup(
          <Router ssrPath={surface.path}>
            <Route path={surface.path}>
              <CarePatientSurfacePendingPage surface={surface} />
            </Route>
          </Router>,
        ),
      ),
    ];
    for (const html of pages) {
      expect(html.match(/<main(?:\s|>)/g)).toHaveLength(1);
      expect(html.match(/<h1(?:\s|>)/g)).toHaveLength(1);
      expect(html).toContain('id="main-content"');
    }
  });

  it("names the missing contract and the emergency boundary on a pending surface", () => {
    const surface = carePatientSurfaceByPath("/care/telehealth");
    expect(surface).toBeTruthy();
    const html = renderToStaticMarkup(
      <Router ssrPath={surface!.path}>
        <Route path={surface!.path}>
          <CarePatientSurfacePendingPage surface={surface!} />
        </Route>
      </Router>,
    );
    expect(html).toContain("Telehealth waiting room is not available.");
    expect(html).toContain("MISSING CONTRACT");
    expect(html).toContain("telehealth-session");
    expect(html).toContain("This site is not emergency care.");
    expect(html).toContain('href="/care"');
  });

  it.each(["1440", "768", "375", "320", "200%"])(
    "uses a wrapping shell at the %s review target",
    () => {
      for (const page of [recordPage, pendingPage]) {
        expect(page).toContain("container-x");
        expect(page).not.toMatch(/\bmin-w-\[(?:[1-9]\d*)px\]/);
        expect(page).not.toContain("overflow-x-auto");
        expect(page).toContain("break-words");
      }
    },
  );

  it("keeps both screens out of search results", () => {
    for (const page of [recordPage, pendingPage]) {
      expect(page).toContain('robots="noindex, nofollow"');
    }
  });
});

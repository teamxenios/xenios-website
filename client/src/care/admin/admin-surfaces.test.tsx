// @vitest-environment jsdom

// The Care admin surfaces themselves: complete states, no fabricated records,
// and clinical controls that are visibly closed and cannot fire.

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Router } from "wouter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { careApiFetch } from "../api";
import CareAdminRoutes from "./router";
import {
  CARE_ADMIN_AREAS,
  CARE_CLINICAL_GATE_NAMES,
  pendingCareAdminAreas,
  wiredCareAdminAreas,
} from "./contracts";

vi.mock("../api", () => ({ careApiFetch: vi.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const fetchMock = vi.mocked(careApiFetch);

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  fetchMock.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const READINESS_BODY = {
  ok: true,
  readiness: {
    softwareReady: true,
    operationalReady: false,
    publicReady: false,
    requiredInputs: [
      "MEDICAL GROUP REQUIRED",
      "LICENSED CLINICIAN RECORD REQUIRED",
      "CLINICIAN LICENSE REQUIRED",
      "CLINICIAN CREDENTIAL VERIFICATION REQUIRED",
      "CLINICIAN COVERAGE REQUIRED",
      "SUPPORTED STATE REQUIRED",
      "CARE ACTIVATION APPROVAL REQUIRED",
    ],
  },
};

const CAPABILITY_BODY = {
  ok: true,
  capability: {
    rail: "care",
    state: "pending_clinicians",
    enabled: false,
    publicMessage: "Clinician coverage is being prepared.",
    checkedAt: "2026-07-31T00:00:00.000Z",
  },
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** An authorized Care administrator: every read succeeds. */
function authorizedServer() {
  fetchMock.mockImplementation(async (path: string) => {
    if (path.startsWith("/api/care/status")) return json(200, CAPABILITY_BODY);
    if (path.startsWith("/api/care/audit/access")) return json(200, { ok: true });
    if (path.includes("/admin/readiness")) return json(200, READINESS_BODY);
    return json(503, { ok: false, code: "care_temporarily_unavailable" });
  });
}

async function renderAt(path: string) {
  await act(async () => {
    root.render(
      <Router hook={() => [path, () => undefined]} ssrPath={path}>
        <CareAdminRoutes />
      </Router>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return container;
}

describe("Care admin surfaces", () => {
  it("routes every declared area to a rendered surface", async () => {
    authorizedServer();
    for (const area of CARE_ADMIN_AREAS) {
      const element = await renderAt(area.path);
      expect(element.querySelector("h1")?.textContent).toBe(area.label);
      expect(element.querySelectorAll("main")).toHaveLength(1);
      expect(element.querySelectorAll("h1")).toHaveLength(1);
      expect(element.querySelector("#main-content")).not.toBeNull();
    }
  });

  it("names the exact missing contract on every area with no endpoint", async () => {
    authorizedServer();
    for (const area of pendingCareAdminAreas()) {
      const element = await renderAt(area.path);
      const text = element.textContent ?? "";
      expect(
        element.querySelector('[data-care-admin-state="pending_contract"]'),
      ).not.toBeNull();
      for (const gap of area.missing) expect(text).toContain(gap);
      // A pending area must show no record surface of any kind.
      expect(element.querySelector("table")).toBeNull();
    }
  });

  it("renders every clinical control visibly disabled, and it cannot fire", async () => {
    authorizedServer();
    const withActions = CARE_ADMIN_AREAS.filter((area) => area.actions.length > 0);
    expect(withActions.length).toBeGreaterThan(0);

    for (const area of withActions) {
      const element = await renderAt(area.path);
      expect(element.querySelector("[data-care-admin-authorization]")).toBeNull();
      const controls = Array.from(
        element.querySelectorAll<HTMLElement>("[data-care-clinical-action]"),
      );
      expect(controls).toHaveLength(area.actions.length);

      for (const control of controls) {
        const button = control.querySelector("button");
        expect(button).not.toBeNull();
        expect(button?.disabled).toBe(true);
        expect(button?.getAttribute("aria-disabled")).toBe("true");
        expect(control.textContent).toContain(
          area.actions.find((action) => action.label === button?.textContent)
            ?.blockedBecause ?? "",
        );
      }

      const before = fetchMock.mock.calls.length;
      await act(async () => {
        for (const control of controls) control.querySelector("button")?.click();
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(fetchMock.mock.calls.length).toBe(before);
    }
  });

  it("never issues a write from any Care admin surface", () => {
    const directory = resolve(__dirname);
    const files = readdirSync(directory).filter(
      (file) => /\.tsx?$/.test(file) && !file.includes(".test."),
    );
    for (const file of files) {
      const source = readFileSync(resolve(directory, file), "utf8");
      // Every Care call goes through careApiFetch, and every one of those is a
      // bare single-argument GET. There is no init object to carry a method.
      for (const call of source.match(/careApiFetch\([^)]*\)/g) ?? []) {
        expect(call).not.toContain(",");
      }
      // No other transport is used, so no write can slip past that rule. The
      // POST paths in contracts.ts are declarations of blocked contracts, and
      // no code path calls them.
      expect(source).not.toMatch(/(?<!careApi)\bfetch\s*\(/);
      expect(source).not.toMatch(/XMLHttpRequest|sendBeacon|navigator\.send/);
    }
  });

  it("shows the real capability read-only and offers no way to flip a clinical gate", async () => {
    authorizedServer();
    const element = await renderAt("/care/admin/flags");
    const text = element.textContent ?? "";
    expect(text).toContain("pending clinicians");
    expect(text).toContain("Clinician coverage is being prepared.");
    for (const gate of CARE_CLINICAL_GATE_NAMES) {
      expect(text).toContain(`${gate} · no server contract`);
    }
    // Read-only means no control of any kind that could set a value.
    expect(element.querySelector("form")).toBeNull();
    expect(element.querySelector("input")).toBeNull();
    expect(element.querySelector("select")).toBeNull();
    for (const button of Array.from(element.querySelectorAll("button"))) {
      expect(button.textContent).not.toMatch(/enable|disable|turn on|turn off/i);
    }
  });

  it.each([
    ["unauthorized", 403, { ok: false, code: "care_forbidden" }],
    ["care_disabled", 503, { ok: false, code: "care_disabled", message: "Care is being prepared." }],
    ["error", 500, {}],
  ] as const)(
    "renders the %s state on a wired surface without inventing a record",
    async (expected, status, body) => {
      // Authorized for the guard probe, refused for the surface's own read.
      fetchMock.mockImplementation(async (path: string) => {
        if (path.startsWith("/api/care/appointments/admin/readiness")) {
          return json(200, READINESS_BODY);
        }
        return json(status, body);
      });
      const element = await renderAt("/care/admin/pharmacy");
      expect(
        element.querySelector(`[data-care-admin-state="${expected}"]`),
      ).not.toBeNull();
      expect(element.querySelector('[data-care-admin-state="ready"]')).toBeNull();
    },
  );

  it("shows a loading state before any read resolves", async () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    await act(async () => {
      root.render(
        <Router hook={() => ["/care/admin/scheduling", () => undefined]} ssrPath="/care/admin/scheduling">
          <CareAdminRoutes />
        </Router>,
      );
    });
    expect(
      container.querySelector('[data-care-admin-authorization="checking"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-care-admin-state="ready"]')).toBeNull();
  });

  it("shows only the labels the server returned, never a roster or record", async () => {
    authorizedServer();
    const element = await renderAt("/care/admin/providers");
    const text = element.textContent ?? "";
    expect(text).toContain("LICENSED CLINICIAN RECORD REQUIRED");
    expect(text).toContain("CLINICIAN COVERAGE REQUIRED");
    // The providers surface filters to clinician labels: unrelated labels and
    // any hint of an actual roster stay out.
    expect(text).not.toContain("SUPPORTED STATE REQUIRED");
    expect(element.querySelector("table")).toBeNull();
    expect(text).toContain("No admin endpoint lists clinicians");
  });

  it("issues no Care read at all for a visitor the server refused", async () => {
    fetchMock.mockImplementation(async () =>
      json(403, { ok: false, code: "care_forbidden" }),
    );
    const element = await renderAt("/care/admin/scheduling");
    expect(
      element.querySelector('[data-care-admin-authorization="forbidden"]'),
    ).not.toBeNull();
    // Exactly one call: the authorization probe. No surface read follows it.
    expect(fetchMock.mock.calls).toHaveLength(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/care/appointments/admin/readiness",
    );
  });

  it("keeps every wired area pointed at a contract it actually reads", () => {
    for (const area of wiredCareAdminAreas()) {
      expect(area.reads.length).toBeGreaterThan(0);
      for (const contract of area.reads) {
        expect(contract.path.startsWith("/api/care/")).toBe(true);
      }
    }
  });
});

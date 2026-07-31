// @vitest-environment jsdom

// The role guard, proved negatively. A member, a provider, and an anonymous
// visitor must never reach a Care admin surface, and neither may a caller
// whose authorization simply could not be confirmed.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Router } from "wouter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { careApiFetch } from "../api";
import {
  CARE_ADMIN_PROBE_PATH,
  CareAdminAuthorizationProvider,
  CareAdminGuard,
  isCareAdminAuthorized,
  probeCareAdminAuthorization,
} from "./authorization";

vi.mock("../api", () => ({ careApiFetch: vi.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const fetchMock = vi.mocked(careApiFetch);
const SECRET = "CARE_ADMIN_ONLY_PAYLOAD";

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

function respond(status: number, body: Record<string, unknown>) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

async function renderGuard() {
  await act(async () => {
    root.render(
      <Router ssrPath="/care/admin">
        <CareAdminAuthorizationProvider>
          <CareAdminGuard>
            <p>{SECRET}</p>
          </CareAdminGuard>
        </CareAdminAuthorizationProvider>
      </Router>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return container;
}

describe("Care admin role guard", () => {
  it("probes a real care:administer contract", () => {
    expect(CARE_ADMIN_PROBE_PATH).toBe("/api/care/appointments/admin/readiness");
  });

  it.each([
    ["an anonymous visitor", 401, { ok: false, code: "care_auth_required" }, "unauthenticated"],
    ["a member", 403, { ok: false, code: "care_forbidden" }, "forbidden"],
    ["a provider", 403, { ok: false, code: "care_forbidden" }, "forbidden"],
  ] as const)(
    "never renders Care admin content for %s",
    async (_who, status, body, expected) => {
      respond(status, body);
      const element = await renderGuard();
      expect(element.textContent).not.toContain(SECRET);
      expect(
        element.querySelector("[data-care-admin-authorization]")?.getAttribute(
          "data-care-admin-authorization",
        ),
      ).toBe(expected);
    },
  );

  it("never renders Care admin content while Care is disabled", async () => {
    respond(503, {
      ok: false,
      code: "care_disabled",
      message: "Care is being prepared.",
    });
    const element = await renderGuard();
    expect(element.textContent).not.toContain(SECRET);
    expect(element.textContent).toContain("Care is being prepared.");
    expect(
      element.querySelector('[data-care-admin-authorization="care_disabled"]'),
    ).not.toBeNull();
  });

  it("never renders Care admin content when the probe fails", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    const element = await renderGuard();
    expect(element.textContent).not.toContain(SECRET);
    expect(
      element.querySelector('[data-care-admin-authorization="unavailable"]'),
    ).not.toBeNull();
  });

  it("never renders Care admin content on a 200 that is not ok", async () => {
    respond(200, { ok: false });
    const element = await renderGuard();
    expect(element.textContent).not.toContain(SECRET);
    expect(
      element.querySelector('[data-care-admin-authorization="unavailable"]'),
    ).not.toBeNull();
  });

  it("renders Care admin content only for an authorized administrator", async () => {
    respond(200, {
      ok: true,
      readiness: {
        softwareReady: true,
        operationalReady: false,
        publicReady: false,
        requiredInputs: [],
      },
    });
    const element = await renderGuard();
    expect(element.textContent).toContain(SECRET);
    expect(element.querySelector("[data-care-admin-authorization]")).toBeNull();
  });

  it("treats every non-authorized outcome as unauthorized", async () => {
    for (const [status, body] of [
      [401, { ok: false }],
      [403, { ok: false }],
      [503, { ok: false, code: "care_disabled", message: "off" }],
      [503, { ok: false, code: "care_temporarily_unavailable" }],
      [500, {}],
    ] as const) {
      respond(status, body);
      expect(isCareAdminAuthorized(await probeCareAdminAuthorization())).toBe(false);
    }
  });
});

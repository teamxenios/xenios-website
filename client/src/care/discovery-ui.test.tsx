// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Router } from "wouter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CARE_DISCOVERY_NEXT_PATH } from "@shared/care/contracts";
import CareDiscoveryPage, { CARE_DISCOVERY_PATH } from "./CareDiscoveryPage";
import { requestCareDiscovery } from "./discovery-api";
import CareSection from "./section";

vi.mock("./discovery-api", async () => {
  const actual = await vi.importActual<typeof import("./discovery-api")>(
    "./discovery-api",
  );
  return { ...actual, requestCareDiscovery: vi.fn() };
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const requestCareDiscoveryMock = vi.mocked(requestCareDiscovery);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const successfulHandoff = {
  ok: true,
  discovery: {
    sourceRail: "research",
    destinationRail: "care",
    intent: "learn_about_care",
    subjectId: "subject-1",
    consentedAt: "2026-08-20T18:00:00.000Z",
  },
  nextPath: CARE_DISCOVERY_NEXT_PATH,
};

let container: HTMLDivElement;
let root: Root;
let navigated: string[];

beforeEach(() => {
  requestCareDiscoveryMock.mockReset();
  requestCareDiscoveryMock.mockResolvedValue(json(successfulHandoff));
  navigated = [];
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const staticSearch = () => "";
const staticLocation = (): [string, (nextPath: string) => void] => [
  CARE_DISCOVERY_PATH,
  (nextPath) => navigated.push(nextPath),
];

async function settle() {
  await act(async () => {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
  });
}

async function render(Page: () => React.JSX.Element = CareDiscoveryPage) {
  await act(async () => {
    root.render(
      <Router
        hook={staticLocation}
        searchHook={staticSearch}
        ssrPath={CARE_DISCOVERY_PATH}
      >
        <Page />
      </Router>,
    );
  });
  await settle();
  return container;
}

async function checkConsent() {
  const checkbox = container.querySelector<HTMLInputElement>(
    "#care-discovery-consent",
  );
  if (!checkbox) throw new Error("consent checkbox did not render");
  await act(async () => checkbox.click());
  return checkbox;
}

async function submit() {
  const form = container.querySelector("form");
  if (!form) throw new Error("discovery form did not render");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await settle();
}

describe("Care discovery route and boundary copy", () => {
  it("is selected inside CareSection and does not send on page load", async () => {
    const text = (await render(CareSection)).textContent ?? "";
    expect(text).toContain("CARE · DISCOVERY");
    expect(text).toContain("Research products, pricing, requests, and orders stay");
    expect(text).toContain("No SKU, product, order, price");
    expect(text).toContain("does not start treatment, confirm availability");
    expect(requestCareDiscoveryMock).not.toHaveBeenCalled();
  });

  it("requires an explicit checkbox choice before POST", async () => {
    await render();
    const button = container.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    expect(button?.disabled).toBe(true);

    await submit();
    expect(requestCareDiscoveryMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      "Choose the consent checkbox before continuing.",
    );

    const checkbox = await checkConsent();
    expect(checkbox.checked).toBe(true);
    expect(button?.disabled).toBe(false);
  });
});

describe("Care discovery response states", () => {
  it("sends consent and follows only the fixed eligibility path on success", async () => {
    await render();
    await checkConsent();
    await submit();

    expect(requestCareDiscoveryMock).toHaveBeenCalledTimes(1);
    expect(requestCareDiscoveryMock).toHaveBeenCalledWith(true);
    expect(navigated).toEqual([CARE_DISCOVERY_NEXT_PATH]);
  });

  it("handles 401 with a sign-in action and no redirect claim", async () => {
    requestCareDiscoveryMock.mockResolvedValue(
      json({ ok: false, code: "care_auth_required" }, 401),
    );
    await render();
    await checkConsent();
    await submit();

    expect(container.textContent).toContain("Sign in before sending this handoff.");
    expect(
      container.querySelector<HTMLAnchorElement>('a[href="/research/sign-in"]')
        ?.textContent,
    ).toContain("Sign in securely");
    expect(navigated).toEqual([]);
  });

  it("reports a 503 without claiming Care availability or completion", async () => {
    requestCareDiscoveryMock.mockResolvedValue(
      json({ ok: false, code: "care_disabled" }, 503),
    );
    await render();
    await checkConsent();
    await submit();

    expect(container.textContent).toContain(
      "The Care handoff is not available right now.",
    );
    expect(container.textContent).toContain("We cannot confirm a handoff.");
    expect(container.textContent).toContain("no Care availability is promised");
    expect(navigated).toEqual([]);
  });

  it("keeps an invalid or failed response truthful and retryable", async () => {
    requestCareDiscoveryMock.mockResolvedValue(json({ ok: true }, 200));
    await render();
    await checkConsent();
    await submit();

    expect(container.textContent).toContain("We could not confirm the Care handoff.");
    expect(container.textContent).toContain(
      "does not claim that a handoff was stored",
    );
    expect(navigated).toEqual([]);

    requestCareDiscoveryMock.mockRejectedValueOnce(new Error("network"));
    await submit();
    expect(requestCareDiscoveryMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("You can try again.");
  });
});

// @vitest-environment jsdom
// Subscriptions page behavior against the FROZEN commerce contract:
// SubscriptionDto fields rendered exactly (state vocabulary, frequency in
// days, next charge and next shipment with honest copy for a null date), a
// pause action posting the exact SubscriptionActionRequest body, a denial
// routed on the MACHINE CODE to the canonical calm copy with no error
// styling, and an unpublished endpoint rendering the designed pending state
// rather than an error. fetch is stubbed with json content-type headers,
// matching the api lib's envelope parsing.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { ResearchContext, type ResearchContextValue } from "../../core";
import SubscriptionsPage from "./SubscriptionsPage";
import type { SubscriptionDto } from "@shared/research/commerce-api";

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
// pattern as cart-checkout.test.tsx).
function fixtureContext(): ResearchContextValue {
  return {
    gate: "open",
    member: { firstName: "Sam", status: "active", applicationStatus: null },
    memberToken: "member-jwt",
    memberChecking: false,
    recovery: "none",
  } as ResearchContextValue;
}

type StubRoute = {
  method: string;
  path: string;
  status: number;
  body: unknown;
};

type RecordedCall = { url: string; init: RequestInit | undefined };

// product_commerce is reported enabled so the controls are live. The
// capabilities module caches for 60s, so every test in this file stubs the
// same answer and the cache stays consistent.
const CAPABILITIES_ROUTE: StubRoute = {
  method: "GET",
  path: "/api/research/capabilities",
  status: 200,
  body: { ok: true, capabilities: { product_commerce: { enabled: true } } },
};

function stubFetch(routes: StubRoute[]): RecordedCall[] {
  const calls: RecordedCall[] = [];
  const all = [CAPABILITIES_ROUTE, ...routes];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const method = (init?.method ?? "GET").toUpperCase();
      const route = all.find((r) => r.method === method && r.path === url);
      if (!route) throw new TypeError(`unstubbed fetch: ${method} ${url}`);
      return {
        status: route.status,
        ok: route.status >= 200 && route.status < 300,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => route.body,
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
  // One more flush so the load effect's fetch promises settle into state.
  await act(async () => {});
  return container!;
}

function byTestId<T extends HTMLElement>(view: HTMLElement, id: string): T {
  const el = view.querySelector(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing [data-testid="${id}"]`);
  return el as T;
}

// ---------------------------------------------------------------------------
// Fixtures: exactly the frozen SubscriptionDto shape.
// ---------------------------------------------------------------------------

const activeSubscription: SubscriptionDto = {
  subscriptionId: "sub-1",
  sku: "XN-01",
  displayName: "Recovery Stack",
  state: "active",
  frequencyDays: 30,
  quantity: 2,
  // Midday UTC so the rendered local day is stable across test timezones
  // (formatDate is locale-aware, and a UTC-midnight instant lands on the
  // previous day in western offsets).
  nextChargeAt: "2026-08-05T12:00:00Z",
  nextShipmentAt: "2026-08-07T12:00:00Z",
};

const pausedSubscription: SubscriptionDto = {
  subscriptionId: "sub-2",
  sku: "XN-02",
  displayName: "Baseline Panel Kit",
  state: "paused",
  frequencyDays: 90,
  quantity: 1,
  nextChargeAt: null,
  nextShipmentAt: null,
};

function subscriptionsRoute(status: number, body: unknown): StubRoute {
  return { method: "GET", path: "/api/research/subscriptions", status, body };
}

const OK_LIST = subscriptionsRoute(200, {
  ok: true,
  subscriptions: [activeSubscription, pausedSubscription],
});

// ---------------------------------------------------------------------------

describe("Subscriptions page", () => {
  it("renders each SubscriptionDto with its state, frequency, and next dates", async () => {
    stubFetch([OK_LIST]);
    const view = await renderPage(<SubscriptionsPage />);

    // Names and skus come straight from the contract fields.
    expect(view.textContent).toContain("Recovery Stack");
    expect(view.textContent).toContain("XN-01");
    expect(view.textContent).toContain("Baseline Panel Kit");

    // The state vocabulary renders through the shared presentation meta, so
    // a raw machine state never reaches the member.
    expect(view.textContent).toContain("Active");
    expect(view.textContent).toContain("Paused");
    expect(view.textContent).not.toContain("skip_scheduled");

    // frequencyDays renders in days, per the frozen 30/60/90 union.
    expect(view.textContent).toContain("Every 30 days");
    expect(view.textContent).toContain("Every 90 days");

    // Real dates are formatted; a null date says so honestly instead of
    // borrowing a date that does not exist.
    expect(view.textContent).toContain("Aug 5, 2026");
    expect(view.textContent).toContain("Aug 7, 2026");
    expect(view.textContent).toContain("Not scheduled yet");

    // A paused subscription offers Resume, not Pause.
    expect(view.querySelector('[data-testid="sub-resume-sub-2"]')).toBeTruthy();
    expect(view.querySelector('[data-testid="sub-pause-sub-2"]')).toBeNull();

    // SubscriptionDto carries no price, so no money is invented here.
    expect(view.textContent).not.toContain("$0.00");
  });

  it("posts the exact SubscriptionActionRequest body for a pause", async () => {
    const calls = stubFetch([
      OK_LIST,
      {
        method: "POST",
        path: "/api/research/subscriptions/sub-1",
        status: 200,
        body: { ok: true, subscription: { ...activeSubscription, state: "paused" } },
      },
    ]);
    const view = await renderPage(<SubscriptionsPage />);

    await act(async () => {
      byTestId<HTMLButtonElement>(view, "sub-pause-sub-1").click();
    });
    await act(async () => {
      byTestId<HTMLButtonElement>(view, "ra-confirm").click();
    });
    await act(async () => {});

    const posts = calls.filter((c) => c.url === "/api/research/subscriptions/sub-1");
    expect(posts).toHaveLength(1);
    expect(posts[0].init?.method).toBe("POST");
    expect(JSON.parse(String(posts[0].init?.body))).toEqual({ action: "pause" });

    // The member is told plainly what happened.
    expect(view.textContent).toContain("Subscription paused. Resume it any time.");
  });

  it("routes a denied action on its machine code to the canonical copy, with no error styling", async () => {
    stubFetch([
      OK_LIST,
      {
        method: "POST",
        path: "/api/research/subscriptions/sub-1",
        status: 200,
        body: { ok: false, code: "commerce_disabled", message: "server text that must not lead" },
      },
    ]);
    const view = await renderPage(<SubscriptionsPage />);

    await act(async () => {
      byTestId<HTMLButtonElement>(view, "sub-pause-sub-1").click();
    });
    await act(async () => {
      byTestId<HTMLButtonElement>(view, "ra-confirm").click();
    });
    await act(async () => {});

    // Our copy, per code, calm and pending. The server message never leads.
    expect(view.textContent).toContain("Ordering is not open yet.");
    expect(view.textContent).toContain(
      "Nothing you entered was lost. Ordering opens once commerce is switched on, and this exact flow will work unchanged.",
    );
    expect(view.textContent).not.toContain("server text that must not lead");
    expect(view.textContent).not.toContain("commerce_disabled");

    // A pending denial is a status, never an alert, and never error styling.
    const denial = byTestId(view, "ra-denial");
    expect(denial.getAttribute("role")).toBe("status");
    expect(view.querySelector('[role="alert"]')).toBeNull();
  });

  it("renders a denied list read through the designed copy", async () => {
    stubFetch([subscriptionsRoute(403, { ok: false, code: "membership_inactive" })]);
    const view = await renderPage(<SubscriptionsPage />);
    expect(view.textContent).toContain("Membership is not active.");
    expect(view.textContent).not.toContain("membership_inactive");
  });

  it("renders the designed pending state when the endpoint is not published yet", async () => {
    stubFetch([subscriptionsRoute(404, { ok: false })]);
    const view = await renderPage(<SubscriptionsPage />);

    expect(view.textContent).toContain("Product subscriptions have not opened yet.");
    expect(view.textContent).toContain(
      "When ordering opens you will be able to put products on a schedule and manage everything here. Nothing is wrong with your account.",
    );

    // Pending, never an error.
    expect(view.querySelector('[role="alert"]')).toBeNull();
    expect(view.textContent).not.toContain("Something went wrong");
  });

  it("reports an unpublished action endpoint honestly and changes nothing", async () => {
    stubFetch([
      OK_LIST,
      { method: "POST", path: "/api/research/subscriptions/sub-1", status: 404, body: { ok: false } },
    ]);
    const view = await renderPage(<SubscriptionsPage />);

    await act(async () => {
      byTestId<HTMLButtonElement>(view, "sub-pause-sub-1").click();
    });
    await act(async () => {
      byTestId<HTMLButtonElement>(view, "ra-confirm").click();
    });
    await act(async () => {});

    expect(byTestId(view, "sub-unavailable-sub-1").textContent).toContain(
      "This change is not available yet. The subscription service has not opened, and nothing was changed.",
    );
    expect(view.querySelector('[role="alert"]')).toBeNull();
  });

  it("posts a reschedule with the chosen date and a frequency change from the frozen union", async () => {
    const calls = stubFetch([
      OK_LIST,
      {
        method: "POST",
        path: "/api/research/subscriptions/sub-1",
        status: 200,
        body: { ok: true, subscription: activeSubscription },
      },
    ]);
    const view = await renderPage(<SubscriptionsPage />);

    // Reschedule: a dated request.
    await act(async () => {
      byTestId<HTMLButtonElement>(view, "sub-reschedule-sub-1").click();
    });
    await act(async () => {
      const input = byTestId<HTMLInputElement>(view, "ra-reschedule-date");
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "2026-09-01");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      byTestId<HTMLButtonElement>(view, "ra-reschedule-submit").click();
    });
    await act(async () => {});

    // Frequency: one of 30, 60, 90 only.
    await act(async () => {
      const select = byTestId<HTMLSelectElement>(view, "sub-frequency-sub-1");
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")!.set!;
      setter.call(select, "60");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      byTestId<HTMLButtonElement>(view, "sub-frequency-submit-sub-1").click();
    });
    await act(async () => {});

    const bodies = calls
      .filter((c) => c.url === "/api/research/subscriptions/sub-1")
      .map((c) => JSON.parse(String(c.init?.body)) as Record<string, unknown>);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toEqual({ action: "reschedule", rescheduleTo: "2026-09-01" });
    expect(bodies[1]).toEqual({ action: "reschedule", frequencyDays: 60 });
  });
});

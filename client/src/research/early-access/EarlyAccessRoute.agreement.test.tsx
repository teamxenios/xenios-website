// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import EarlyAccessRoute from "./EarlyAccessRoute";

/**
 * The mounted Private Early Access route, at the point where the agreement
 * meets the order journey.
 *
 * The property under test is the one that matters commercially: the checkout
 * continuation (the selection bar's Review order) is not usable until the
 * SERVER says this customer has agreed, and browsing the catalogue is not
 * gated behind that. A customer may read the whole shelf; they may not
 * proceed to an order the server would refuse.
 */

let container: HTMLElement | null = null;
let root: Root | null = null;

const POLICIES = {
  "research-use": {
    title: "Research Use Policy",
    updated: "July 2026",
    sections: [
      {
        heading: "Purpose",
        paragraphs: [
          "Research materials listed through xenios are offered solely for legitimate nonclinical research, analytical, laboratory, or product-development purposes. They are not offered for human or veterinary use.",
        ],
      },
    ],
  },
  terms: { title: "Terms of Service", updated: "July 2026", sections: [] },
  privacy: { title: "Privacy Policy", updated: "July 2026", sections: [] },
};

/** Two live units, so a product can actually be selected in these tests. */
const UNITS = [
  {
    productId: "prod-1",
    variantId: "var-1",
    displayName: "Unit One",
    strength: "10 mg",
    priceCents: 5_600,
    currency: "USD",
    description: "",
    availability: "AVAILABLE",
    purchasable: true,
    quantityLimit: 20,
  },
  {
    productId: "prod-2",
    variantId: "var-2",
    displayName: "Unit Two",
    strength: "5 mg",
    priceCents: null,
    currency: "USD",
    description: "",
    availability: "TEMPORARILY_HELD",
    purchasable: false,
    quantityLimit: null,
  },
];

type Answers = { accepted: boolean; identity?: boolean };

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    json: async () => body,
  } as unknown as Response;
}

/** Every call the route and its children make, answered in one place. */
function stubFetch(answers: Answers) {
  const posted: Array<{ path: string; body: unknown }> = [];
  const stub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (init?.method === "POST") {
      posted.push({ path, body: init.body === undefined ? null : JSON.parse(String(init.body)) });
      if (path.endsWith("/agreements/accept")) {
        answers.accepted = true;
        return jsonResponse({ ok: true, kind: "early_access_terms", version: "v1", alreadyAccepted: false });
      }
      return jsonResponse({ ok: true });
    }
    if (path.endsWith("/early-access/session")) {
      return jsonResponse({ authenticated: true, expiresAt: null });
    }
    if (path.endsWith("/research/policies")) {
      return jsonResponse({ policies: POLICIES });
    }
    if (path.endsWith("/early-access/agreements")) {
      if (answers.identity === false) {
        return jsonResponse({ ok: false, code: "IDENTITY_REQUIRED" }, 403);
      }
      return jsonResponse({ ok: true, required: [{ kind: "early_access_terms", version: "v1" }], accepted: answers.accepted });
    }
    if (path.endsWith("/early-access/catalog")) {
      return jsonResponse({ ok: true, units: UNITS });
    }
    // The multi-product cart is OFF in these cases. The route unmounts the
    // capability route entirely while the flag is false, so 404 is the
    // truthful disabled answer and the single-product surface below is what
    // the customer gets. Answering 200 here would read as a MISCONFIGURED
    // cart, which deliberately does not fall back.
    if (path.endsWith("/early-access/cart/capability")) {
      return jsonResponse({ ok: false, code: "NOT_FOUND" }, 404);
    }
    return jsonResponse({ ok: true });
  });
  vi.stubGlobal("fetch", stub);
  return { posted };
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  window.sessionStorage.clear();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function mountRoute(): Promise<HTMLElement> {
  act(() => {
    root?.render(<EarlyAccessRoute />);
  });
  await settle();
  if (container === null) throw new Error("no container");
  return container;
}

/** Select the one available unit, so the selection bar exists to inspect. */
function selectFirstUnit(host: HTMLElement): void {
  const action = host.querySelector<HTMLButtonElement>(
    "[data-testid='early-access-catalog-card-var-1-action']",
  );
  if (action === null) throw new Error("no selectable card rendered");
  act(() => {
    action.click();
  });
}

function reviewButton(host: HTMLElement): HTMLButtonElement {
  const found = host.querySelector<HTMLButtonElement>(
    "[data-testid='early-access-catalog-section-selection-review']",
  );
  if (found === null) throw new Error("no selection bar rendered");
  return found;
}

describe("the checkout continuation is gated on the server's answer", () => {
  it("is unusable before the customer has agreed, and says why", async () => {
    stubFetch({ accepted: false });
    const host = await mountRoute();

    selectFirstUnit(host);
    const review = reviewButton(host);
    expect(review.disabled).toBe(true);
    expect(review.textContent).toContain("Accept policy to continue");
    // No checkout surface exists yet.
    expect(host.querySelector("[data-testid='early-access-checkout-mount']")).toBeNull();
  });

  it("becomes usable once the acceptance is recorded, posts only the pair, and opens checkout", async () => {
    const { posted } = stubFetch({ accepted: false });
    const host = await mountRoute();

    const box = host.querySelector<HTMLInputElement>(
      '[data-testid="early-access-agreement-checkbox"]',
    );
    act(() => {
      box?.click();
    });
    const submit = host.querySelector<HTMLButtonElement>(
      '[data-testid="early-access-agreement-submit"]',
    );
    act(() => {
      submit?.click();
    });
    await settle();

    const acceptCall = posted.find((call) => call.path.endsWith("/agreements/accept"));
    expect(acceptCall?.body).toEqual({ kind: "early_access_terms", version: "v1" });

    selectFirstUnit(host);
    const review = reviewButton(host);
    expect(review.disabled).toBe(false);
    expect(review.textContent).toContain("Review order");
    act(() => {
      review.click();
    });
    await settle();

    // The checkout journey mounts, on its details step; nothing was ordered.
    expect(host.querySelector("[data-testid='early-access-checkout-mount']")).not.toBeNull();
    expect(
      host.querySelector("[data-testid='early-access-checkout']")?.getAttribute("data-phase"),
    ).toBe("details");
  });

  it("is usable on a fresh load when the server already has the acceptance", async () => {
    // This is what a refresh looks like: a brand-new mount, told by the server
    // that the row is on file. Nothing was carried across in the browser.
    stubFetch({ accepted: true });
    const host = await mountRoute();

    expect(host.querySelector('[data-testid="early-access-agreement-accepted"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="early-access-agreement-checkbox"]')).toBeNull();

    selectFirstUnit(host);
    expect(reviewButton(host).disabled).toBe(false);
  });

  it("does not gate browsing the catalogue behind the agreement", async () => {
    stubFetch({ accepted: false });
    const host = await mountRoute();

    expect(host.querySelector('[data-testid="early-access-catalog-mount"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="early-access-agreement-mount"]')).not.toBeNull();
    // Both units render, the held one without any purchase surface.
    expect(host.querySelectorAll("article")).toHaveLength(2);
    const held = host.querySelector("[data-testid='early-access-catalog-card-var-2']");
    expect(held?.querySelectorAll("button")).toHaveLength(0);
  });

  it("shows the research-use policy, not a draft document", async () => {
    stubFetch({ accepted: false });
    const host = await mountRoute();

    expect(host.textContent).toContain("Research Use Policy");
    expect(host.textContent).toContain("I have read and agree to the Research Use Policy.");
    expect(host.textContent).not.toContain("Terms of Service");
    expect(host.textContent).not.toContain("Privacy Policy");
  });
});

describe("signed in, but the session is not bound to an approved customer", () => {
  it("does not tell the customer their session ended, and does not blame the policy", async () => {
    stubFetch({ accepted: false, identity: false });
    const host = await mountRoute();

    expect(host.textContent).not.toContain("Your private session has ended");
    expect(host.querySelector('[data-testid="early-access-agreement-unverified"]')).not.toBeNull();
  });

  it("keeps ordering closed and offers nothing to tick", async () => {
    stubFetch({ accepted: false, identity: false });
    const host = await mountRoute();

    expect(host.querySelector('[data-testid="early-access-agreement-checkbox"]')).toBeNull();
    expect(host.querySelector('[data-testid="early-access-agreement-submit"]')).toBeNull();
    selectFirstUnit(host);
    expect(reviewButton(host).disabled).toBe(true);
  });

  it("still lets the customer browse the catalogue", async () => {
    stubFetch({ accepted: false, identity: false });
    const host = await mountRoute();

    expect(host.querySelector('[data-testid="early-access-catalog-mount"]')).not.toBeNull();
    expect(host.querySelectorAll("article")).toHaveLength(2);
  });
});

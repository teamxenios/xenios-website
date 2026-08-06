// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import EarlyAccessRoute from "./EarlyAccessRoute";

/**
 * The mounted Private Early Access route, at the point where the agreement
 * meets the order journey.
 *
 * The property under test is the one that matters commercially: the order
 * continuation is not offered until the SERVER says this customer has agreed,
 * and browsing the catalogue is not gated behind that. A customer may read the
 * whole shelf; they may not proceed to an order the server would refuse.
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

type Answers = { accepted: boolean };

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
        // Whatever this test's server says. The first is a fresh acceptance;
        // a repeat would answer alreadyAccepted true, and both are 200.
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
      return jsonResponse({ ok: true, required: [{ kind: "early_access_terms", version: "v1" }], accepted: answers.accepted });
    }
    // The catalogue answers for itself elsewhere; this route test only asserts
    // that its mount is present and untouched by the agreement.
    return jsonResponse({ ok: true, products: [], received: 0, dropped: 0 });
  });
  vi.stubGlobal("fetch", stub);
  return { posted };
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
  vi.unstubAllGlobals();
});

async function settle(): Promise<void> {
  // Session, then policy and agreement standing, then the catalogue.
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

function continueButton(host: HTMLElement): HTMLButtonElement {
  const found = host.querySelector<HTMLButtonElement>('[data-testid="early-access-continue"]');
  if (found === null) throw new Error("no continuation rendered");
  return found;
}

describe("the order continuation is gated on the server's answer", () => {
  it("is unavailable before the customer has agreed", async () => {
    stubFetch({ accepted: false });
    const host = await mountRoute();

    expect(continueButton(host).disabled).toBe(true);
    expect(host.querySelector('[data-testid="early-access-continue-blocked"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="early-access-continue-available"]')).toBeNull();
  });

  it("becomes available once the acceptance is recorded, and posts only the pair", async () => {
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

    expect(continueButton(host).disabled).toBe(false);
    expect(host.querySelector('[data-testid="early-access-continue-available"]')).not.toBeNull();
    const acceptCall = posted.find((call) => call.path.endsWith("/agreements/accept"));
    expect(acceptCall?.body).toEqual({ kind: "early_access_terms", version: "v1" });
  });

  it("is available on a fresh load when the server already has the acceptance", async () => {
    // This is what a refresh looks like: a brand-new mount, told by the server
    // that the row is on file. Nothing was carried across in the browser.
    stubFetch({ accepted: true });
    const host = await mountRoute();

    expect(continueButton(host).disabled).toBe(false);
    expect(host.querySelector('[data-testid="early-access-agreement-accepted"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="early-access-agreement-checkbox"]')).toBeNull();
  });

  it("does not gate browsing the catalogue behind the agreement", async () => {
    // The catalogue mounts either way. The agreement stands in front of
    // ORDERING, not in front of looking, and its presence must not change what
    // the catalogue shows.
    stubFetch({ accepted: false });
    const host = await mountRoute();

    expect(host.querySelector('[data-testid="early-access-catalog-mount"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="early-access-agreement-mount"]')).not.toBeNull();
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

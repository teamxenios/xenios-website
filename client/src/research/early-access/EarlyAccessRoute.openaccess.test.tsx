// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import EarlyAccessRoute from "./EarlyAccessRoute";

/**
 * NO CUSTOMER-FACING PASSWORD (founder decision, 2026-08-20).
 *
 * The customer opens /research/early-access and lands in the ordering journey.
 * They are never shown a password prompt, and never shown one they could not
 * satisfy — which is the failure mode worth guarding: if the browser kept
 * rendering the old gate while the server stopped requiring one, the surface
 * would look shut to every visitor and nothing on the server would report a
 * problem.
 *
 * The session has NOT gone away with the password. It is the anonymous identity
 * that decides which order this browser may read back, so the journey still
 * obtains one — it just no longer asks a human for anything to get it.
 */

let container: HTMLElement;
let root: Root;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    json: async () => body,
  } as unknown as Response;
}

/** Records what the journey asked the server for, in order. */
function stubOpenAccess(): { calls: string[]; unlockBodies: string[] } {
  const calls: string[] = [];
  const unlockBodies: string[] = [];
  let unlocked = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      calls.push(`${init?.method ?? "GET"} ${path}`);
      if (path.endsWith("/early-access/unlock")) {
        unlockBodies.push(String(init?.body ?? ""));
        unlocked = true;
        return jsonResponse({ ok: true });
      }
      if (path.endsWith("/early-access/session")) {
        return unlocked
          ? jsonResponse({ authenticated: true, openAccess: true, expiresAt: null })
          : jsonResponse({ authenticated: false, openAccess: true });
      }
      if (path.endsWith("/early-access/cart/capability")) {
        return jsonResponse({ enabled: false });
      }
      if (path.endsWith("/early-access/agreements")) {
        return jsonResponse({ accepted: false });
      }
      return jsonResponse({ ok: true });
    }),
  );
  return { calls, unlockBodies };
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the Early Access route with no password", () => {
  it("never renders a password prompt", async () => {
    stubOpenAccess();
    await act(async () => {
      root.render(<EarlyAccessRoute />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const html = container.innerHTML;
    expect(html).not.toMatch(/type="password"/i);
    expect(container.querySelector('input[type="password"]')).toBeNull();
    // The old copy asked for "the access password you were given". None of that
    // language may survive, or the customer is told to find something that no
    // longer exists.
    expect(html).not.toMatch(/access password/i);
    expect(html).not.toMatch(/enter the password/i);
  });

  it("obtains a session by itself, sending no password", async () => {
    const { calls, unlockBodies } = stubOpenAccess();
    await act(async () => {
      root.render(<EarlyAccessRoute />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(calls.some((call) => call.startsWith("POST") && call.includes("/early-access/unlock")))
      .toBe(true);
    // Whatever it sends, it must not be carrying a credential.
    for (const body of unlockBodies) {
      expect(body).not.toMatch(/password/i);
    }
  });

  it("re-reads the session rather than trusting the unlock response", async () => {
    // The cookie the browser actually kept is what decides the journey. Trusting
    // the unlock body would let a browser that silently dropped the cookie
    // proceed as if it held a session, and every later ownership check would
    // then refuse in a way that looks like a broken site.
    const { calls } = stubOpenAccess();
    await act(async () => {
      root.render(<EarlyAccessRoute />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const unlockAt = calls.findIndex((call) => call.includes("/early-access/unlock"));
    const sessionAfter = calls
      .slice(unlockAt + 1)
      .findIndex((call) => call.includes("/early-access/session"));
    expect(unlockAt).toBeGreaterThanOrEqual(0);
    expect(sessionAfter).toBeGreaterThanOrEqual(0);
  });

  it("still shows the prompt when the deployment DOES have a password", async () => {
    // The removal is a deployment decision, not a deletion of the mechanism.
    // A deployment that still runs the gate must still be able to ask.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path.endsWith("/early-access/session")) {
          return jsonResponse({ authenticated: false, openAccess: false });
        }
        return jsonResponse({ ok: true });
      }),
    );
    await act(async () => {
      root.render(<EarlyAccessRoute />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
  });
});

// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import EarlyAccessRoute from "./EarlyAccessRoute";
import { LAST_ORDER_STORAGE_KEY, PENDING_ORDER_STORAGE_KEY } from "./pendingOrderStore";
import {
  CART_ATTEMPT_STORAGE_KEY,
  LAST_CART_CHECKOUT_STORAGE_KEY,
} from "./cart/cartAttemptStore";
import {
  ASSISTED_ORDER_STORAGE_PREFIX,
  assistedOrderReceiptKey,
  assistedOrderTokenKey,
} from "../assisted-order/storage";
import { ASSISTED_ORDER_DRAFT_KEY } from "../assisted-order/draft-store";

/**
 * F6 I: SIGNING OUT FORGETS EVERYTHING THIS BROWSER REMEMBERED.
 *
 * Early Access runs on shared and borrowed machines. Every recovery pointer
 * the pilot keeps is scoped to one session by design, so signing out has to
 * take ALL of them, not most of them.
 *
 * This test exists because it caught a real gap. Sign-out cleared the browser
 * cart, the single-product pending attempt and the last order number, but the
 * cart's own attempt key and last cart checkout number were private constants
 * inside the journey component, so nothing outside it could reach them. The
 * next person to unlock inherited the previous purchaser's checkout pointer.
 * The server would still have refused to show them the checkout, but a
 * signed-out browser should not be holding the pointer at all.
 */

const CART_KEY = "xenios.research.earlyAccess.cart.v1";
const ASSISTED_ORDER_REFERENCE = "XRR-20260821-DEADBEEF01";

/** Every key the Early Access path is allowed to write. */
const EVERY_RECOVERY_KEY = [
  CART_KEY,
  CART_ATTEMPT_STORAGE_KEY,
  LAST_CART_CHECKOUT_STORAGE_KEY,
  PENDING_ORDER_STORAGE_KEY,
  LAST_ORDER_STORAGE_KEY,
];

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

function stubFetch(pendingLogout?: Promise<Response>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/early-access/session")) {
        return jsonResponse({ authenticated: true, expiresAt: null });
      }
      if (path.endsWith("/early-access/logout") && pendingLogout) {
        return pendingLogout;
      }
      if (path.endsWith("/early-access/cart/capability")) {
        // Cart flag OFF, so the existing single-product surface renders and
        // its sign-out button is the one under test.
        return jsonResponse({ ok: false, code: "NOT_FOUND" }, 404);
      }
      if (path.endsWith("/research/policies")) {
        return jsonResponse({
          policies: {
            "research-use": { title: "Research Use Policy", updated: "July 2026", sections: [] },
            terms: { title: "Terms of Service", updated: "July 2026", sections: [] },
            privacy: { title: "Privacy Policy", updated: "July 2026", sections: [] },
          },
        });
      }
      if (path.endsWith("/early-access/agreements")) {
        return jsonResponse({ ok: true, required: [], accepted: true });
      }
      if (path.endsWith("/early-access/catalog")) {
        return jsonResponse({ ok: true, units: [] });
      }
      return jsonResponse({ ok: true });
    }),
  );
}

async function settle(): Promise<void> {
  for (let pass = 0; pass < 12; pass += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  window.sessionStorage.clear();
  window.scrollTo = (() => {}) as typeof window.scrollTo;
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe("F6 I: sign-out clears every browser recovery pointer", () => {
  it("clears the cart, the cart attempt, the last cart checkout, the pending order and the last order", async () => {
    stubFetch();
    // Everything a finished or interrupted session could have left behind.
    window.sessionStorage.setItem(
      CART_KEY,
      JSON.stringify({ version: 1, items: [{ productId: "p", variantId: "v", quantity: 2 }] }),
    );
    window.sessionStorage.setItem(CART_ATTEMPT_STORAGE_KEY, `xeac_${"a".repeat(36)}`);
    window.sessionStorage.setItem(LAST_CART_CHECKOUT_STORAGE_KEY, "XEC-0123456789ABCDEF0123");
    window.sessionStorage.setItem(
      PENDING_ORDER_STORAGE_KEY,
      JSON.stringify({
        idempotencyKey: `xea_${"b".repeat(32)}`,
        productId: "p",
        variantId: "v",
        quantity: 1,
        fingerprint: "c".repeat(16),
      }),
    );
    window.sessionStorage.setItem(LAST_ORDER_STORAGE_KEY, "XEA-000123");

    for (const key of EVERY_RECOVERY_KEY) {
      expect(window.sessionStorage.getItem(key)).not.toBeNull();
    }

    await act(async () => {
      root.render(<EarlyAccessRoute />);
    });
    await settle();

    const signOut = container.querySelector(
      '[data-testid="early-access-signout"]',
    ) as HTMLButtonElement | null;
    expect(signOut).not.toBeNull();
    await act(async () => {
      signOut!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();

    for (const key of EVERY_RECOVERY_KEY) {
      expect(window.sessionStorage.getItem(key)).toBeNull();
    }
    // And the customer is back at the password screen, not inside a session.
    expect(container.textContent).toContain("Private Early Access");

    const password = container.querySelector(
      '[data-testid="early-access-unlock-form-password"]',
    ) as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    act(() => {
      valueSetter?.call(password, "next-customer");
      password.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
    const unlock = container.querySelector(
      '[data-testid="early-access-unlock-form-submit"]',
    ) as HTMLButtonElement;
    expect(unlock.disabled).toBe(false);
    act(() => unlock.click());
    await settle();

    // Same React mount, freshly authenticated customer: the previous order
    // context must not return from the state captured before sign-out.
    expect(container.querySelector('[data-testid="early-access-signout"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="early-access-order-recovery"]')).toBeNull();
    expect(container.textContent).not.toContain("XEA-000123");
    expect(window.sessionStorage.getItem(LAST_ORDER_STORAGE_KEY)).toBeNull();
  });

  it("leaves storage belonging to no one behind: nothing else is written on sign-out", async () => {
    stubFetch();
    await act(async () => {
      root.render(<EarlyAccessRoute />);
    });
    await settle();
    const signOut = container.querySelector(
      '[data-testid="early-access-signout"]',
    ) as HTMLButtonElement;
    await act(async () => {
      signOut.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    expect(window.sessionStorage.length).toBe(0);
  });
});

describe("sign-out clears the entire assisted-order storage family", () => {
  it("removes bearer tokens, receipt/reference state, drafts and future prefixed artifacts", async () => {
    window.sessionStorage.setItem(
      assistedOrderTokenKey(ASSISTED_ORDER_REFERENCE),
      "secret-status-token",
    );
    window.sessionStorage.setItem(
      assistedOrderReceiptKey(ASSISTED_ORDER_REFERENCE),
      JSON.stringify({ publicReference: ASSISTED_ORDER_REFERENCE, lines: [] }),
    );
    window.sessionStorage.setItem(
      ASSISTED_ORDER_DRAFT_KEY,
      JSON.stringify({ idempotencyKey: "k", step: "products", selections: [] }),
    );
    window.sessionStorage.setItem(`${ASSISTED_ORDER_STORAGE_PREFIX}future-artifact`, "private");
    window.sessionStorage.setItem("unrelated.session.key", "keep");

    stubFetch();
    await act(async () => {
      root.render(<EarlyAccessRoute />);
    });
    await settle();

    const signOut = container.querySelector(
      '[data-testid="early-access-signout"]',
    ) as HTMLButtonElement | null;
    expect(signOut).not.toBeNull();
    await act(async () => {
      signOut!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();

    const assistedOrderSurvivors = Array.from(
      { length: window.sessionStorage.length },
      (_, index) => window.sessionStorage.key(index),
    ).filter((key): key is string =>
      key !== null && key.startsWith(ASSISTED_ORDER_STORAGE_PREFIX),
    );
    expect(assistedOrderSurvivors).toEqual([]);
    expect(window.sessionStorage.getItem("unrelated.session.key")).toBe("keep");
  });

  it("clears credentials synchronously even while the server logout is still pending", async () => {
    let finishLogout: ((response: Response) => void) | undefined;
    let logoutSettled = false;
    const pendingLogout = new Promise<Response>((resolve) => {
      finishLogout = (response) => {
        logoutSettled = true;
        resolve(response);
      };
    });
    window.sessionStorage.setItem(
      assistedOrderTokenKey(ASSISTED_ORDER_REFERENCE),
      "secret-status-token",
    );
    window.sessionStorage.setItem(ASSISTED_ORDER_DRAFT_KEY, "private-draft");

    stubFetch(pendingLogout);
    await act(async () => {
      root.render(<EarlyAccessRoute />);
    });
    await settle();

    const signOut = container.querySelector(
      '[data-testid="early-access-signout"]',
    ) as HTMLButtonElement;
    act(() => {
      signOut.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(logoutSettled).toBe(false);
    expect(window.sessionStorage.getItem(assistedOrderTokenKey(ASSISTED_ORDER_REFERENCE))).toBeNull();
    expect(window.sessionStorage.getItem(ASSISTED_ORDER_DRAFT_KEY)).toBeNull();
    expect(container.textContent).toContain("Private Early Access");

    finishLogout?.(jsonResponse({ ok: true }));
    await settle();
  });
});

// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EarlyAccessCheckoutJourney } from "./EarlyAccessCheckoutJourney";
import type { EarlyAccessCatalogSelection } from "./EarlyAccessCatalogSection";
import {
  PENDING_ORDER_STORAGE_KEY,
  intentFingerprint,
  readLastOrderNumber,
  readPendingAttempt,
} from "./pendingOrderStore";

/** The exact intent fillValidDetails() types, for seeding matching attempts. */
function filledIntentFingerprint(): string {
  return intentFingerprint({
    productId: "prod-1",
    variantId: "var-1",
    quantity: 2,
    email: "buyer@example.com",
    phone: "+1 512 555 0100",
    recipientName: "Alpha Buyer",
    line1: "1 Test Street",
    line2: null,
    city: "Houston",
    region: "TX",
    postalCode: "77002",
    country: "US",
  });
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The one-product checkout: details → TRUE review → confirm → payment.
 *
 * The properties under test are the expensive ones: no durable write before
 * the explicit confirmation, one idempotency key per attempt surviving
 * double-clicks and retries, refusals answered in the customer's terms, and
 * no client-computed money anywhere.
 */

const SELECTION: EarlyAccessCatalogSelection = Object.freeze({
  product: Object.freeze({
    productId: "prod-1",
    variantId: "var-1",
    name: "Unit One",
    strength: "10 mg",
    unitPriceCents: 10_075,
    currency: "USD",
    description: "",
    availability: "AVAILABLE" as const,
    quantityLimit: 20,
  }),
  quantity: 2,
});

const ORDER_RESPONSE = Object.freeze({
  ok: true,
  replayed: false,
  order: {
    orderNumber: "XEA-0000000000000042",
    placedAt: "2026-08-06T12:00:00.000Z",
    paymentState: "awaiting_payment",
    unit: { sku: "CLEAN-10", quantity: 2 },
    money: {
      currency: "USD",
      unitPriceCents: 10_075,
      subtotalCents: 20_150,
      discountCents: 0,
      discountLabel: null,
      payableTotalCents: 20_150,
    },
    invoice: {
      invoiceNumber: "INV-42",
      paymentReference: "XEA-REF-42",
      issuedAt: "2026-08-06T12:00:00.000Z",
    },
    contact: { email: "buyer@example.com", phone: "+1 512 555 0100" },
    shipTo: {
      recipientName: "Alpha Buyer",
      line1: "1 Test Street",
      line2: null,
      city: "Houston",
      region: "TX",
      postalCode: "77002",
      country: "US",
    },
  },
});

let container: HTMLElement | null = null;
let root: Root | null = null;

function render(element: ReactElement): HTMLElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(element);
  });
  return container;
}

beforeEach(() => {
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
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

function jsonResponse(body: unknown, status = 201): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    json: async () => body,
  } as unknown as Response;
}

type FetchLog = Array<{ path: string; body: Record<string, unknown> }>;

function stubOrders(
  answer: (attempt: number) => Response | Promise<Response>,
): { calls: FetchLog } {
  const calls: FetchLog = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (init?.method === "POST" && path.endsWith("/orders")) {
        calls.push({ path, body: JSON.parse(String(init.body)) });
        return answer(calls.length);
      }
      // Invoice and status reads after a successful placement.
      return jsonResponse({ ok: true, order: ORDER_RESPONSE.order, payment: { state: "awaiting_payment", paid: false }, receipt: null, fulfilment: { released: false, tracking: [], shippedAt: null } }, 200);
    }),
  );
  return { calls };
}

function setInput(host: HTMLElement, testid: string, value: string): void {
  const input = host.querySelector<HTMLInputElement>(`[data-testid='${testid}']`);
  if (input === null) throw new Error(`no input ${testid}`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function fillValidDetails(host: HTMLElement): void {
  setInput(host, "early-access-checkout-contact-email", "buyer@example.com");
  setInput(host, "early-access-checkout-contact-phone", "+1 512 555 0100");
  setInput(host, "early-access-checkout-ship-recipient", "Alpha Buyer");
  setInput(host, "early-access-checkout-ship-line1", "1 Test Street");
  setInput(host, "early-access-checkout-ship-city", "Houston");
  setInput(host, "early-access-checkout-ship-region", "TX");
  setInput(host, "early-access-checkout-ship-postal", "77002");
  setInput(host, "early-access-checkout-ship-country", "US");
}

function press(host: HTMLElement, testid: string): void {
  const button = host.querySelector<HTMLButtonElement>(`[data-testid='${testid}']`);
  if (button === null) throw new Error(`nothing to press at ${testid}`);
  act(() => {
    button.click();
  });
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function mountJourney(extra: Partial<Parameters<typeof EarlyAccessCheckoutJourney>[0]> = {}) {
  return render(
    <EarlyAccessCheckoutJourney
      selection={SELECTION}
      onBack={() => {}}
      onPriceChanged={() => {}}
      {...extra}
    />,
  );
}

describe("details, then a TRUE review, then one explicit confirmation", () => {
  it("refuses to leave details with an invalid contact, naming the problems", () => {
    const { calls } = stubOrders(() => jsonResponse(ORDER_RESPONSE));
    const host = mountJourney();
    fillValidDetails(host);
    setInput(host, "early-access-checkout-contact-email", "not-an-email");
    press(host, "early-access-checkout-to-review");

    expect(
      host.querySelector("[data-testid='early-access-checkout']")?.getAttribute("data-phase"),
    ).toBe("details");
    expect(host.textContent).toContain("valid email address");
    expect(calls).toHaveLength(0);
  });

  it("shows everything on review and writes NOTHING durable before the confirm press", () => {
    const { calls } = stubOrders(() => jsonResponse(ORDER_RESPONSE));
    const host = mountJourney();
    fillValidDetails(host);
    press(host, "early-access-checkout-to-review");

    const journey = host.querySelector("[data-testid='early-access-checkout']");
    expect(journey?.getAttribute("data-phase")).toBe("review");
    expect(host.textContent).toContain("Unit One");
    expect(host.textContent).toContain("10 mg");
    expect(host.textContent).toContain("buyer@example.com");
    expect(host.textContent).toContain("1 Test Street");
    expect(host.textContent).toContain("$100.75 per unit");
    // The money rule, stated to the customer, and no client total anywhere:
    // 2 x 10,075 = 20,150 must NOT be computed here.
    expect(host.textContent).toContain("computed and confirmed by Xenios");
    expect(host.textContent).toContain("does not charge you");
    expect(host.textContent).not.toContain("201.50");

    // The review existed; the order does not.
    expect(calls).toHaveLength(0);
    expect(readPendingAttempt()).toBeNull();
  });

  it("places exactly one order on confirm, with the contact and one well-shaped key", async () => {
    const { calls } = stubOrders(() => jsonResponse(ORDER_RESPONSE));
    const host = mountJourney();
    fillValidDetails(host);
    press(host, "early-access-checkout-to-review");
    press(host, "early-access-checkout-confirm");
    await settle();

    expect(calls).toHaveLength(1);
    const body = calls[0].body;
    expect(body.idempotencyKey).toMatch(/^xea_[a-f0-9]{32}$/);
    expect(body.contact).toEqual({ email: "buyer@example.com", phone: "+1 512 555 0100" });
    expect(body.quantity).toBe(2);
    expect(body.expectedUnitPriceCents).toBe(10_075);
    // No client-computed money key travels.
    expect(body.totalCents).toBeUndefined();
    expect(body.subtotalCents).toBeUndefined();

    // Success: payment phase, order number visible and copyable, recovery
    // memory holds ONLY the order number, the pending attempt is gone.
    expect(
      host.querySelector("[data-testid='early-access-checkout-order-number']")?.textContent,
    ).toBe("XEA-0000000000000042");
    expect(host.querySelector("[data-testid='early-access-checkout-copy-order-number']")).not.toBeNull();
    expect(readLastOrderNumber()).toBe("XEA-0000000000000042");
    expect(readPendingAttempt()).toBeNull();
    expect(host.textContent).toContain("Nothing is marked paid automatically");
  });

  it("cannot double-click its way into two orders", async () => {
    const { calls } = stubOrders(() => jsonResponse(ORDER_RESPONSE));
    const host = mountJourney();
    fillValidDetails(host);
    press(host, "early-access-checkout-to-review");

    const confirm = host.querySelector<HTMLButtonElement>(
      "[data-testid='early-access-checkout-confirm']",
    );
    act(() => {
      confirm?.click();
      confirm?.click();
      confirm?.click();
    });
    await settle();

    expect(calls).toHaveLength(1);
  });
});

describe("uncertain outcomes retry under the SAME key", () => {
  it("keeps the key and the pending record through a connection failure, then replays it", async () => {
    let failFirst = true;
    const { calls } = stubOrders(() => {
      if (failFirst) {
        failFirst = false;
        throw new Error("connection reset");
      }
      return jsonResponse({ ...ORDER_RESPONSE, replayed: true }, 200);
    });
    const host = mountJourney();
    fillValidDetails(host);
    press(host, "early-access-checkout-to-review");
    press(host, "early-access-checkout-confirm");
    await settle();

    // The uncertain outcome: still on review, told plainly, with the pending
    // attempt still remembered for the retry.
    expect(
      host.querySelector("[data-testid='early-access-checkout']")?.getAttribute("data-phase"),
    ).toBe("review");
    expect(host.textContent).toContain("may or may not have been created");
    const pending = readPendingAttempt();
    expect(pending).not.toBeNull();

    press(host, "early-access-checkout-retry");
    await settle();

    expect(calls).toHaveLength(2);
    expect(calls[1].body.idempotencyKey).toBe(calls[0].body.idempotencyKey);
    expect(calls[1].body.idempotencyKey).toBe(pending?.idempotencyKey);
    // The replayed order is announced as the SAME order, not a new one.
    expect(host.textContent).toContain("Nothing was duplicated");
    expect(readPendingAttempt()).toBeNull();
  });

  it("resumes a matching pending attempt after a refresh with the SAME key", async () => {
    const storedKey = `xea_${"d".repeat(32)}`;
    window.sessionStorage.setItem(
      PENDING_ORDER_STORAGE_KEY,
      JSON.stringify({
        idempotencyKey: storedKey,
        productId: SELECTION.product.productId,
        variantId: SELECTION.product.variantId,
        quantity: SELECTION.quantity,
        fingerprint: filledIntentFingerprint(),
      }),
    );
    const { calls } = stubOrders(() => jsonResponse({ ...ORDER_RESPONSE, replayed: true }, 200));
    const host = mountJourney();
    fillValidDetails(host);
    press(host, "early-access-checkout-to-review");
    press(host, "early-access-checkout-confirm");
    await settle();

    expect(calls).toHaveLength(1);
    expect(calls[0].body.idempotencyKey).toBe(storedKey);
  });

  it("blocks a NEW order while a different product's attempt is stranded, until it is discarded", async () => {
    window.sessionStorage.setItem(
      PENDING_ORDER_STORAGE_KEY,
      JSON.stringify({
        idempotencyKey: `xea_${"e".repeat(32)}`,
        productId: "prod-other",
        variantId: "var-other",
        quantity: 1,
        fingerprint: "a".repeat(16),
      }),
    );
    const { calls } = stubOrders(() => jsonResponse(ORDER_RESPONSE));
    const host = mountJourney();

    expect(host.querySelector("[data-testid='early-access-checkout-stranded']")).not.toBeNull();
    fillValidDetails(host);
    press(host, "early-access-checkout-to-review");
    press(host, "early-access-checkout-confirm");
    await settle();
    expect(calls).toHaveLength(0);

    press(host, "early-access-checkout-edit-details");
    press(host, "early-access-checkout-discard-stranded");
    expect(readPendingAttempt()).toBeNull();
    press(host, "early-access-checkout-to-review");
    press(host, "early-access-checkout-confirm");
    await settle();
    expect(calls).toHaveLength(1);
  });
});

describe("an edited intent never silently reuses the old attempt", () => {
  it("blocks the confirm, then RESTORE resubmits the original details under the original key", async () => {
    let failFirst = true;
    const { calls } = stubOrders(() => {
      if (failFirst) {
        failFirst = false;
        throw new Error("connection reset");
      }
      return jsonResponse({ ...ORDER_RESPONSE, replayed: true }, 200);
    });
    const host = mountJourney();
    fillValidDetails(host);
    press(host, "early-access-checkout-to-review");
    press(host, "early-access-checkout-confirm");
    await settle();
    expect(calls).toHaveLength(1);

    // The customer edits the street after the uncertain failure, then tries
    // to retry. Nothing may be submitted until they choose.
    press(host, "early-access-checkout-edit-details");
    setInput(host, "early-access-checkout-ship-line1", "2 Corrected Street");
    press(host, "early-access-checkout-to-review");
    press(host, "early-access-checkout-retry");
    await settle();
    expect(calls).toHaveLength(1);
    expect(host.querySelector("[data-testid='early-access-checkout-intent-changed']")).not.toBeNull();

    // RESTORE puts the original street back on screen; the customer confirms
    // what they can SEE, and the same key replays the same order.
    press(host, "early-access-checkout-restore-original");
    expect(
      host.querySelector<HTMLElement>("[data-testid='early-access-checkout-review-line1']")?.textContent,
    ).toBe("1 Test Street");
    press(host, "early-access-checkout-retry");
    await settle();

    expect(calls).toHaveLength(2);
    expect(calls[1].body.idempotencyKey).toBe(calls[0].body.idempotencyKey);
    expect((calls[1].body.shipTo as Record<string, unknown>).line1).toBe("1 Test Street");
  });

  it("DISCARD places the edited order under a brand-new key", async () => {
    let failFirst = true;
    const { calls } = stubOrders(() => {
      if (failFirst) {
        failFirst = false;
        throw new Error("connection reset");
      }
      return jsonResponse(ORDER_RESPONSE);
    });
    const host = mountJourney();
    fillValidDetails(host);
    press(host, "early-access-checkout-to-review");
    press(host, "early-access-checkout-confirm");
    await settle();
    expect(calls).toHaveLength(1);

    press(host, "early-access-checkout-edit-details");
    setInput(host, "early-access-checkout-ship-line1", "2 Corrected Street");
    press(host, "early-access-checkout-to-review");
    press(host, "early-access-checkout-retry");
    await settle();
    expect(calls).toHaveLength(1);

    press(host, "early-access-checkout-discard-original");
    press(host, "early-access-checkout-confirm");
    await settle();

    expect(calls).toHaveLength(2);
    expect(calls[1].body.idempotencyKey).not.toBe(calls[0].body.idempotencyKey);
    expect(calls[1].body.idempotencyKey).toMatch(/^xea_[a-f0-9]{32}$/);
    expect((calls[1].body.shipTo as Record<string, unknown>).line1).toBe("2 Corrected Street");
  });

  it("shows the order's OWN shipping address and contact on the payment screen", async () => {
    stubOrders(() => jsonResponse(ORDER_RESPONSE));
    const host = mountJourney();
    fillValidDetails(host);
    press(host, "early-access-checkout-to-review");
    press(host, "early-access-checkout-confirm");
    await settle();

    const shipsTo = host.querySelector("[data-testid='early-access-checkout-ships-to']");
    expect(shipsTo?.textContent).toContain("Alpha Buyer");
    expect(shipsTo?.textContent).toContain("1 Test Street");
    expect(shipsTo?.textContent).toContain("Houston");
    expect(shipsTo?.textContent).toContain("77002");
    expect(
      host.querySelector("[data-testid='early-access-checkout-order-contact']")?.textContent,
    ).toContain("buyer@example.com");
  });
});

describe("refusals, in the customer's terms", () => {
  it("hands PRICE_CHANGED to the route for a fresh catalogue, ending the attempt", async () => {
    const onPriceChanged = vi.fn();
    stubOrders(() => jsonResponse({ ok: false, code: "PRICE_CHANGED" }, 409));
    const host = mountJourney({ onPriceChanged });
    fillValidDetails(host);
    press(host, "early-access-checkout-to-review");
    press(host, "early-access-checkout-confirm");
    await settle();

    expect(onPriceChanged).toHaveBeenCalledTimes(1);
    expect(readPendingAttempt()).toBeNull();
  });

  it("says what a definitive refusal means and ends the attempt", async () => {
    stubOrders(() => jsonResponse({ ok: false, code: "PRODUCT_HELD" }, 409));
    const host = mountJourney();
    fillValidDetails(host);
    press(host, "early-access-checkout-to-review");
    press(host, "early-access-checkout-confirm");
    await settle();

    expect(host.textContent).toContain("currently held and cannot be ordered");
    expect(readPendingAttempt()).toBeNull();
    expect(host.querySelector("[data-testid='early-access-checkout-retry']")).toBeNull();
  });

  it("describes the canonical Q50 boundary without overriding lower Product Control limits", async () => {
    stubOrders(() => jsonResponse({ ok: false, code: "QUANTITY_EXCEEDED" }, 409));
    const host = mountJourney();
    fillValidDetails(host);
    press(host, "early-access-checkout-to-review");
    press(host, "early-access-checkout-confirm");
    await settle();

    expect(host.textContent).toContain("permitted quantity from 1 to 50");
    expect(host.textContent).toContain("lower Product Control limit");
  });

  it("treats an idempotency conflict as surrendered to support, never as a retry", async () => {
    stubOrders(() => jsonResponse({ ok: false, code: "IDEMPOTENCY_CONFLICT" }, 409));
    const host = mountJourney();
    fillValidDetails(host);
    press(host, "early-access-checkout-to-review");
    press(host, "early-access-checkout-confirm");
    await settle();

    expect(host.textContent).toContain("already created an order");
    expect(host.querySelector("[data-testid='early-access-checkout-retry']")).toBeNull();
    expect(readPendingAttempt()).toBeNull();
  });
});

// @vitest-environment jsdom
// The founder commerce queues page against the FROZEN G10 admin contract
// (GET /api/admin/research/commerce/queues -> AdminCommerceQueuesDto).
// Covered: a full six-queue fixture renders every queue's items, empty arrays
// render their own honest empty states rather than blank space, a denial
// routes through the denial notice on the machine CODE, and an unpublished
// endpoint renders the designed pending state rather than an error. fetch is
// stubbed with json content-type headers, matching the api lib's envelope
// parsing (without them the lib maps every response to unavailable).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// A ready admin session, so the page renders its body rather than the sign-in
// gate. Authority still belongs to the server on every API call.
const supa = vi.hoisted(() => ({
  auth: {
    getSession: async () => ({ data: { session: { access_token: "admin-token" } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signOut: async () => {},
  },
}));

vi.mock("@/lib/supabaseBrowser", () => ({
  getSupabaseBrowser: async () => ({ auth: supa.auth }),
}));

import CommerceQueues from "./CommerceQueues";
import type { AdminCommerceQueuesDto } from "@shared/research/commerce-api";

const QUEUES_PATH = "/api/admin/research/commerce/queues";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  window.history.pushState({}, "", "/admin/research/commerce-queues");
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

// The queues endpoint is the only response a test varies. /api/admin/me is a
// display-only identity read the session hook makes; it never grants anything.
// Claim action tests add POST routes (method + path) and read back the calls.
type ActionRoute = { method: string; path: string; status: number; body: unknown };
type RecordedCall = { url: string; method: string; body: string | undefined };

function stubFetch(
  status: number,
  body: unknown,
  contentType = "application/json",
  actions: ActionRoute[] = [],
): RecordedCall[] {
  const calls: RecordedCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url: String(url), method, body: typeof init?.body === "string" ? init.body : undefined });
      if (String(url).startsWith("/api/admin/me")) {
        return {
          status: 200,
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ success: true, email: "founder@xeniostechnology.com" }),
        };
      }
      const action = actions.find((r) => r.method === method && r.path === String(url));
      if (action) {
        return {
          status: action.status,
          ok: action.status >= 200 && action.status < 300,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => action.body,
        };
      }
      if (String(url) === QUEUES_PATH) {
        return {
          status,
          ok: status >= 200 && status < 300,
          headers: new Headers({ "content-type": contentType }),
          json: async () => body,
        };
      }
      throw new TypeError(`unstubbed fetch: ${url}`);
    }),
  );
  return calls;
}

async function renderPage(node: ReactNode): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(node);
  });
  // Flush the session resolution and the resource load effect it unblocks.
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return container!;
}

function text(view: HTMLElement): string {
  return view.textContent ?? "";
}

function byTestId<T extends HTMLElement>(view: HTMLElement, id: string): T {
  const el = view.querySelector(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing [data-testid="${id}"]`);
  return el as T;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const emptyQueues: AdminCommerceQueuesDto = {
  largeOrderReview: [],
  claims: [],
  supplierFactBlocks: [],
  quarantinedLots: [],
  partnerReview: [],
  commissionDisputes: [],
};

const fullQueues: AdminCommerceQueuesDto = {
  largeOrderReview: [
    {
      orderId: "ord_1001",
      totalCents: 248000,
      triggers: ["order_total_threshold", "first_order_for_member"],
      heldSince: "2026-07-18T14:05:00.000Z",
    },
  ],
  claims: [
    { claimId: "clm_77", orderId: "ord_900", reason: "damaged", submittedAt: "2026-07-17T09:30:00.000Z" },
    { claimId: "clm_78", orderId: "ord_901", reason: "temperature_concern", submittedAt: "2026-07-18T11:00:00.000Z" },
  ],
  supplierFactBlocks: [
    { sku: "XN-14", unconfirmedFacts: ["purity_percent", "storage_temperature"], disputed: true },
    { sku: "XN-22", unconfirmedFacts: ["lot_origin"], disputed: false },
  ],
  quarantinedLots: [{ lotId: "LOT-3391", sku: "XN-14", blockReasons: ["coa_missing", "temperature_excursion"] }],
  partnerReview: [
    { partnerId: "prt_12", state: "certification_pending" },
    { partnerId: "prt_19", state: "quality_review" },
  ],
  commissionDisputes: [{ ledgerId: "led_501", partnerId: "prt_12", amountCents: 45250 }],
};

// ---------------------------------------------------------------------------

describe("CommerceQueues", () => {
  it("renders every queue's items from a full six-queue fixture", async () => {
    stubFetch(200, { ok: true, queues: fullQueues });
    const view = await renderPage(<CommerceQueues />);
    const body = text(view);

    // 1. Large order review: id, money, every trigger, and the held time.
    expect(byTestId(view, "link-held-order-ord_1001").textContent).toBe("ord_1001");
    expect(byTestId<HTMLAnchorElement>(view, "link-held-order-ord_1001").getAttribute("href")).toBe(
      "/admin/research/orders/ord_1001",
    );
    expect(body).toContain("$2,480.00");
    expect(body).toContain("order_total_threshold");
    expect(body).toContain("first_order_for_member");

    // 2. Claims: both rows, with reason copy rather than the machine code.
    expect(body).toContain("clm_77");
    expect(body).toContain("clm_78");
    expect(body).toContain("Arrived damaged");
    expect(body).toContain("Temperature concern");
    expect(body).not.toContain("temperature_concern");

    // 3. Supplier fact blocks: the withheld facts and the dispute flag.
    expect(body).toContain("XN-14");
    expect(body).toContain("purity_percent");
    expect(body).toContain("storage_temperature");
    expect(byTestId(view, "fact-dispute-XN-14").textContent).toContain("Disputed");
    expect(byTestId(view, "fact-dispute-XN-22").textContent).toContain("Not disputed");

    // 4. Quarantined lots.
    expect(body).toContain("LOT-3391");
    expect(body).toContain("coa_missing");
    expect(body).toContain("temperature_excursion");

    // 5. Partner review, with plain-English state copy.
    expect(body).toContain("prt_19");
    expect(body).toContain("Certification pending");
    expect(body).toContain("Quality review");

    // 6. Commission disputes.
    expect(body).toContain("led_501");
    expect(body).toContain("$452.50");

    // The triage summary counts all nine waiting items across the six queues.
    expect(byTestId(view, "text-queues-total").textContent).toContain("9 items across six queues");
    expect(byTestId(view, "count-large-order-review").textContent).toContain("1 waiting");
    expect(byTestId(view, "count-claims").textContent).toContain("2 waiting");
  });

  it("labels the large order queue as the founder's action queue with the two hour target", async () => {
    stubFetch(200, { ok: true, queues: fullQueues });
    const view = await renderPage(<CommerceQueues />);
    const held = text(byTestId(view, "section-large-order-review"));
    expect(held).toContain("founder action queue");
    expect(held).toContain("about two hours");
  });

  it("names the supplier fact worklist as facts currently withheld from members", async () => {
    stubFetch(200, { ok: true, queues: fullQueues });
    const view = await renderPage(<CommerceQueues />);
    const blocks = text(byTestId(view, "section-supplier-fact-blocks"));
    expect(blocks).toContain("reconciliation");
    expect(blocks).toContain("never serialized to a member");
    expect(blocks).toContain("withheld");
  });

  it("renders a per-queue empty state, not blank space, when every array is empty", async () => {
    stubFetch(200, { ok: true, queues: emptyQueues });
    const view = await renderPage(<CommerceQueues />);

    // All six sections are present and each says what an empty queue means.
    for (const id of [
      "large-order-review",
      "claims",
      "supplier-fact-blocks",
      "quarantined-lots",
      "partner-review",
      "commission-disputes",
    ]) {
      const section = byTestId(view, `section-${id}`);
      expect(section.querySelector('[data-testid="ra-empty"]')).not.toBeNull();
      expect(text(section).trim().length).toBeGreaterThan(40);
      expect(text(section)).toContain("0 waiting");
    }

    expect(byTestId(view, "text-queues-total").textContent).toContain("Nothing is waiting");
    // An empty queue is not an error and not a pending surface.
    expect(view.querySelector('[data-testid="ra-denial"]')).toBeNull();
  });

  it("routes a denial through the denial notice on the machine code", async () => {
    stubFetch(403, { ok: false, code: "commerce_disabled", message: "raw server text" });
    const view = await renderPage(<CommerceQueues />);

    const notice = byTestId(view, "ra-denial");
    // Copy comes from the code's own presentation, never from the message.
    expect(notice.textContent).toContain("Ordering is not open yet.");
    expect(text(view)).not.toContain("raw server text");
    // No queue tables render behind a denial.
    expect(view.querySelector('[data-testid="section-claims"]')).toBeNull();
  });

  it("renders the designed pending state, not an error, when the endpoint is not published", async () => {
    // The SPA catch-all answers an unpublished API path with HTML at 200.
    stubFetch(200, {}, "text/html");
    const view = await renderPage(<CommerceQueues />);

    const empty = byTestId(view, "ra-empty");
    expect(empty.textContent).toContain("publish with the commerce backend");
    expect(text(view)).not.toContain("Something went wrong");
    expect(view.querySelector('[data-testid="section-queue-summary"]')).toBeNull();
  });

  it("renders the same pending state for a 404 from the queues endpoint", async () => {
    stubFetch(404, { ok: false });
    const view = await renderPage(<CommerceQueues />);
    expect(byTestId(view, "ra-empty").textContent).toContain("publish with the commerce backend");
  });
});

// ---------------------------------------------------------------------------
// Claim actions: the admin refund workflow against the live endpoints.
// ---------------------------------------------------------------------------

describe("CommerceQueues claim actions", () => {
  it("approve posts the review decision and reloads the queues", async () => {
    const calls = stubFetch(200, { ok: true, queues: fullQueues }, "application/json", [
      { method: "POST", path: "/api/admin/research/claims/clm_77/review", status: 200, body: { ok: true } },
    ]);
    const view = await renderPage(<CommerceQueues />);

    await act(async () => {
      byTestId<HTMLButtonElement>(view, "claim-approve-clm_77").click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const post = calls.find((c) => c.method === "POST");
    expect(post?.url).toBe("/api/admin/research/claims/clm_77/review");
    expect(JSON.parse(post?.body ?? "{}")).toEqual({ decision: "approved" });
    // The confirmation survives the reload (it lives above the boundary).
    expect(byTestId(view, "claims-action-notice").textContent).toContain("clm_77: Claim approved");
    // The queues reloaded after the change (a second GET of the queues path).
    expect(calls.filter((c) => c.method === "GET" && c.url === QUEUES_PATH).length).toBeGreaterThanOrEqual(2);
  });

  it("deny posts the declined decision", async () => {
    const calls = stubFetch(200, { ok: true, queues: fullQueues }, "application/json", [
      { method: "POST", path: "/api/admin/research/claims/clm_78/review", status: 200, body: { ok: true } },
    ]);
    const view = await renderPage(<CommerceQueues />);

    await act(async () => {
      byTestId<HTMLButtonElement>(view, "claim-deny-clm_78").click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const post = calls.find((c) => c.method === "POST");
    expect(post?.url).toBe("/api/admin/research/claims/clm_78/review");
    expect(JSON.parse(post?.body ?? "{}")).toEqual({ decision: "declined" });
    expect(byTestId(view, "claims-action-notice").textContent).toContain("clm_78: Claim declined");
  });

  it("refund posts integer cents plus an idempotency key, and a retry after failure reuses the same key", async () => {
    // The refund route is dynamic: the first attempt fails (500), the second
    // succeeds, so the retry-key discipline is observable.
    let refundStatus = 500;
    const dynamicCalls = stubFetch(200, { ok: true, queues: fullQueues }, "application/json", [
      {
        method: "POST",
        path: "/api/admin/research/claims/clm_77/refund",
        get status() {
          return refundStatus;
        },
        get body() {
          return refundStatus === 200 ? { ok: true } : { message: "provider down" };
        },
      } as unknown as ActionRoute,
    ]);
    const view = await renderPage(<CommerceQueues />);

    await act(async () => {
      byTestId<HTMLButtonElement>(view, "claim-refund-open-clm_77").click();
    });
    const amount = byTestId<HTMLInputElement>(view, "claim-refund-amount-clm_77");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(amount, "45.25");
      amount.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // First attempt fails (500): an error renders, nothing pretends success.
    await act(async () => {
      byTestId<HTMLButtonElement>(view, "claim-refund-submit-clm_77").click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(byTestId(view, "claim-error-clm_77").textContent).toContain("provider down");

    // Second attempt succeeds and must carry the SAME idempotency key.
    refundStatus = 200;
    await act(async () => {
      byTestId<HTMLButtonElement>(view, "claim-refund-submit-clm_77").click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const posts = dynamicCalls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(2);
    const first = JSON.parse(posts[0].body ?? "{}");
    const second = JSON.parse(posts[1].body ?? "{}");
    expect(first.amountCents).toBe(4525);
    expect(Number.isInteger(first.amountCents)).toBe(true);
    expect(typeof first.idempotencyKey).toBe("string");
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(byTestId(view, "claims-action-notice").textContent).toContain("Refund of $45.25 issued.");
  });

  it("replacement posts the replacement path, and an out-of-order action renders the designed denial copy", async () => {
    const calls = stubFetch(200, { ok: true, queues: fullQueues }, "application/json", [
      {
        method: "POST",
        path: "/api/admin/research/claims/clm_78/replacement",
        status: 400,
        body: { ok: false, code: "order_state_invalid", message: "raw server text" },
      },
    ]);
    const view = await renderPage(<CommerceQueues />);

    await act(async () => {
      byTestId<HTMLButtonElement>(view, "claim-replacement-clm_78").click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const post = calls.find((c) => c.method === "POST");
    expect(post?.url).toBe("/api/admin/research/claims/clm_78/replacement");
    // Designed copy on the machine code, never the raw server message.
    const denied = byTestId(view, "claim-denied-clm_78");
    expect(denied.textContent).toContain("That change is not available for this order.");
    expect(denied.textContent).not.toContain("raw server text");
  });

  it("refuses a non-positive refund amount before any request is made", async () => {
    const calls = stubFetch(200, { ok: true, queues: fullQueues });
    const view = await renderPage(<CommerceQueues />);

    await act(async () => {
      byTestId<HTMLButtonElement>(view, "claim-refund-open-clm_77").click();
    });
    await act(async () => {
      byTestId<HTMLButtonElement>(view, "claim-refund-submit-clm_77").click();
    });

    expect(byTestId(view, "claim-error-clm_77").textContent).toContain("greater than zero");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });
});

// @vitest-environment jsdom
// The commerce queues page against the CANONICAL ten-kind admin contract
// (GET /api/admin/research/commerce/queues -> AdminCommerceQueuesDto).
//
// This test used to stub a six-array payload of its own invention, which is
// exactly why nobody noticed that no server code produced that shape. The
// fixtures below are now built from the shared contract the handler returns,
// and the load-bearing case is the one this page exists to get right: a queue
// whose source could not be read must never render as a queue with nothing in
// it. fetch is stubbed with json content-type headers, matching the api lib's
// envelope parsing.

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
import {
  COMMERCE_QUEUE_KINDS,
  type AdminCommerceQueueDto,
  type AdminCommerceQueueItemDto,
  type AdminCommerceQueuesDto,
  type CommerceQueueKind,
} from "@shared/research/commerce-api";

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
// Fixtures, built from the canonical contract
// ---------------------------------------------------------------------------

function available(
  kind: CommerceQueueKind,
  items: AdminCommerceQueueItemDto[] = [],
): AdminCommerceQueueDto {
  return { kind, availability: { status: "available" }, openCount: items.length, items };
}

function unavailable(
  kind: CommerceQueueKind,
  code: "source_unavailable" | "source_malformed" = "source_unavailable",
): AdminCommerceQueueDto {
  return { kind, availability: { status: "unavailable", code }, openCount: null, items: null };
}

const heldOrder: AdminCommerceQueueItemDto = {
  kind: "large_order_review",
  source: "derived",
  sourceRef: "order:ord_1001",
  openedAt: "2026-07-18T14:05:00.000Z",
  summary: "Order held for review at gross value 248000 cents (before store credit).",
  detail: {
    orderId: "ord_1001",
    grossValueCents: 248000,
    storeCreditAppliedCents: 0,
    reviewTriggers: ["order_total_threshold", "first_order_for_member"],
  },
};

const refundClaimItem: AdminCommerceQueueItemDto = {
  kind: "refund_review",
  source: "derived",
  sourceRef: "claim:clm_77",
  openedAt: "2026-07-17T09:30:00.000Z",
  summary: "Claim (damaged) dispositioned refund, approved.",
  detail: {
    claimId: "clm_77",
    orderId: "ord_900",
    sku: "XN-14",
    reason: "damaged",
    state: "approved",
    resolution: "refund",
  },
};

/** Every kind answers, and two of them carry work. */
function healthyView(): AdminCommerceQueuesDto {
  return {
    provisioned: true,
    degraded: false,
    queues: COMMERCE_QUEUE_KINDS.map((kind) => {
      if (kind === "large_order_review") return available(kind, [heldOrder]);
      if (kind === "refund_review") return available(kind, [refundClaimItem]);
      return available(kind);
    }),
  };
}

/** Every kind answers and every one of them is genuinely empty. */
function emptyView(): AdminCommerceQueuesDto {
  return {
    provisioned: true,
    degraded: false,
    queues: COMMERCE_QUEUE_KINDS.map((kind) => available(kind)),
  };
}

/** One source is down; the rest still answer. */
function degradedView(): AdminCommerceQueuesDto {
  return {
    provisioned: true,
    degraded: true,
    queues: COMMERCE_QUEUE_KINDS.map((kind) =>
      kind === "inventory_release" ? unavailable(kind) : available(kind, kind === "large_order_review" ? [heldOrder] : []),
    ),
  };
}

// ---------------------------------------------------------------------------

describe("CommerceQueues renders the canonical ten kinds", () => {
  it("renders a section for every kind, with plain operator language", async () => {
    stubFetch(200, { ok: true, queues: healthyView() });
    const view = await renderPage(<CommerceQueues />);

    for (const kind of COMMERCE_QUEUE_KINDS) {
      expect(byTestId(view, `section-${kind}`)).toBeTruthy();
    }
    // The machine vocabulary is confined to the opaque source reference; no
    // kind identifier leaks into a heading or a count.
    const body = text(view);
    for (const kind of COMMERCE_QUEUE_KINDS) {
      expect(body).not.toContain(`${kind} waiting`);
    }
    expect(body).toContain("Held orders");
    expect(body).toContain("Recalls to acknowledge");
  });

  it("shows the work in a queue that has some, and links it to its order", async () => {
    stubFetch(200, { ok: true, queues: healthyView() });
    const view = await renderPage(<CommerceQueues />);

    expect(text(byTestId(view, "count-large_order_review"))).toBe("1 waiting");
    const body = text(view);
    expect(body).toContain("order:ord_1001");
    expect(body).toContain("$2,480.00");
    const link = view.querySelector('a[href="/admin/research/orders/ord_1001"]');
    expect(link).toBeTruthy();
  });

  it("counts a healthy empty queue as zero, because zero is what it read", async () => {
    stubFetch(200, { ok: true, queues: emptyView() });
    const view = await renderPage(<CommerceQueues />);

    expect(text(byTestId(view, "count-fraud_review"))).toBe("0 waiting");
    expect(text(byTestId(view, "text-queues-total"))).toContain("Nothing is waiting across the 10");
    expect(view.querySelector('[data-testid="queues-degraded"]')).toBeNull();
  });

  it("never renders an unavailable queue as zero", async () => {
    stubFetch(200, { ok: true, queues: degradedView() });
    const view = await renderPage(<CommerceQueues />);

    // The count, the card and the section body all refuse to say zero.
    expect(text(byTestId(view, "count-inventory_release"))).toBe("Unavailable");
    expect(text(byTestId(view, "count-inventory_release"))).not.toContain("0");
    const section = byTestId(view, "section-inventory_release");
    expect(text(section)).toContain("could not be read");
    expect(byTestId(view, "unavailable-inventory_release").getAttribute("role")).toBe("alert");
  });

  it("keeps the healthy queues usable while one source is down, and says how many are down", async () => {
    stubFetch(200, { ok: true, queues: degradedView() });
    const view = await renderPage(<CommerceQueues />);

    expect(text(byTestId(view, "count-large_order_review"))).toBe("1 waiting");
    const degraded = byTestId(view, "queues-degraded");
    expect(degraded.getAttribute("role")).toBe("alert");
    expect(text(degraded)).toContain("1 source is unavailable");
    // The total is over the queues that answered, never over all ten.
    expect(text(byTestId(view, "text-queues-total"))).toContain("9 queues that answered");
  });

  it("says nothing at all about what is waiting when storage is not provisioned", async () => {
    const view0: AdminCommerceQueuesDto = {
      provisioned: false,
      degraded: true,
      queues: COMMERCE_QUEUE_KINDS.map((kind) => unavailable(kind)),
    };
    stubFetch(200, { ok: true, queues: view0 });
    const view = await renderPage(<CommerceQueues />);

    expect(text(byTestId(view, "queues-unprovisioned"))).toContain("not provisioned");
    expect(text(byTestId(view, "text-queues-total"))).toBe("No queue could be read.");
    for (const kind of COMMERCE_QUEUE_KINDS) {
      expect(text(byTestId(view, `count-${kind}`))).toBe("Unavailable");
    }
  });

  it("offers claim actions only where a claim is actually the subject", async () => {
    stubFetch(200, { ok: true, queues: healthyView() });
    const view = await renderPage(<CommerceQueues />);

    // The refund queue carries a claim, so its resolution controls are present.
    expect(view.querySelector('[data-testid="claim-actions-clm_77"]')).toBeTruthy();
    expect(view.querySelector('[data-testid="claim-approve-clm_77"]')).toBeTruthy();
    // The held order carries no claim, so it offers no claim control at all.
    expect(view.querySelector('[data-testid="claim-actions-ord_1001"]')).toBeNull();
    // The held order has no claim, so it gets its order destination instead.
    expect(view.querySelector('[data-testid="no-destination-large_order_review"]')).toBeNull();
  });
});

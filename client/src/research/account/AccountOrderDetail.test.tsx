// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerOrdersDto, OrderSummaryDto } from "@shared/research/customer-account/contract";
import { FIXTURE_CUSTOMER_ORDERS } from "@shared/research/customer-account/fixtures";

const session = vi.hoisted(() => ({
  token: null as string | null,
  checking: false,
  reference: "",
}));
vi.mock("../core", () => ({
  useResearch: () => ({ memberToken: session.token, memberChecking: session.checking }),
}));
vi.mock("../account-portal/AccountPortalShell", () => ({
  AccountPortalShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("wouter", async (importOriginal) => ({
  ...await importOriginal<typeof import("wouter")>(),
  useParams: () => ({ reference: session.reference }),
}));

import AccountOrderDetail from "./AccountOrderDetail";

const ORDERS_PATH = "/api/research/customer-account/orders";
// Persona names label acceptance cases only. The synthetic server selects the
// returned row from the bearer; no browser role grants access to another row.
const personas = ["customer-a", "partner-a", "partner-b", "organization-a"] as const;
type Persona = typeof personas[number];
const tokenOf = (persona: Persona) => `synthetic-order-${persona}`;
const recordOf = (persona: Persona): OrderSummaryDto => ({
  ...FIXTURE_CUSTOMER_ORDERS.research[0]!,
  reference: `XO-SYNTHETIC-${persona}`,
  recordKind: "order",
  itemLabel: `${persona} private synthetic line`,
  variantLabel: `${persona} synthetic variant`,
  quantity: 2,
  trackingUrl: null,
});
function ordersOf(persona: Persona, partial = false): CustomerOrdersDto {
  return {
    ...FIXTURE_CUSTOMER_ORDERS,
    research: [recordOf(persona)],
    carePharmacy: [],
    carePharmacyHistory: { availability: "available", authoritativeRecordCount: 0 },
    history: partial ? {
      ...FIXTURE_CUSTOMER_ORDERS.history,
      availability: "partial",
      authoritativeRecordCount: null,
    } : {
      availability: "complete",
      authoritativeRecordCount: 1,
      sources: {
        commerce: { connected: true, complete: true },
        xea: { connected: true, complete: true },
        xec: { connected: true, complete: true },
        xrr: { connected: true, complete: true },
      },
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
type Pending = ReturnType<typeof deferred<Response>> & {
  path: string;
  init: RequestInit;
  data: CustomerOrdersDto | null;
  visibleAtRead: string;
};
let root: Root | null;
let host: HTMLDivElement;
let pending: Pending[];
let serverSessions: Map<string, Persona>;
let fetchMock: ReturnType<typeof vi.fn>;

async function render(persona: Persona | null, options: { checking?: boolean; reference?: string; token?: string } = {}) {
  session.token = persona ? options.token ?? tokenOf(persona) : null;
  session.checking = options.checking ?? false;
  session.reference = options.reference ?? (persona ? recordOf(persona).reference : session.reference);
  await act(async () => root!.render(<AccountOrderDetail />));
}
async function respond(request: Pending, data = request.data!) {
  await act(async () => {
    request.resolve(new Response(JSON.stringify({ kind: "ok", data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    await request.promise;
  });
}
function expectOnlyRecord(persona: Persona) {
  const row = recordOf(persona);
  expect(host.querySelector("#commerce-record-heading")?.textContent).toBe(row.reference);
  expect(host.textContent).toContain(row.itemLabel);
  for (const other of personas.filter((value) => value !== persona)) {
    expect(host.textContent).not.toContain(recordOf(other).reference);
    expect(host.textContent).not.toContain(recordOf(other).itemLabel);
  }
  for (const bearer of serverSessions.keys()) expect(host.innerHTML).not.toContain(bearer);
}
function expectNoPrivateRecord() {
  expect(host.querySelector("#commerce-record-heading")).toBeNull();
  for (const persona of personas) {
    expect(host.textContent).not.toContain(recordOf(persona).itemLabel);
    expect(host.textContent).not.toContain(recordOf(persona).variantLabel);
  }
  expect(host.querySelector('[aria-label="Commerce record status"]')).toBeNull();
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  session.token = null;
  session.checking = false;
  session.reference = "";
  pending = [];
  serverSessions = new Map(personas.map((persona) => [tokenOf(persona), persona]));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  fetchMock = vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = String(input);
    if (path !== ORDERS_PATH) throw new Error("Unexpected synthetic account request");
    const authorization = new Headers(init.headers).get("Authorization");
    const persona = authorization?.startsWith("Bearer ")
      ? serverSessions.get(authorization.slice("Bearer ".length)) : undefined;
    const request = {
      ...deferred<Response>(), path, init,
      data: persona ? ordersOf(persona) : null,
      visibleAtRead: host.textContent ?? "",
    };
    // Replies intentionally remain completable after a session transition.
    // The real resource hook must ignore a stale completion on its own.
    pending.push(request);
    return request.promise;
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  // This route may only read the existing account projection. Any attempted
  // new detail endpoint or mutation fails independently of API error handling.
  for (const [input, init = {}] of fetchMock.mock.calls as [RequestInfo | URL, RequestInit?][]) {
    expect(String(input)).toBe(ORDERS_PATH);
    expect(init.method ?? "GET").toBe("GET");
    expect(init.body).toBeUndefined();
  }
});

describe("account order detail uses the existing member-scoped read", () => {
  it.each(personas)("%s receives only its exact fixture-authorized record", async (persona) => {
    await render(persona);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = pending[0]!;
    expect(request.init).toMatchObject({ cache: "no-store", credentials: "same-origin" });
    expect(new Headers(request.init.headers).get("Accept")).toBe("application/json");
    expect(new Headers(request.init.headers).get("Authorization")).toBe(`Bearer ${tokenOf(persona)}`);
    expectNoPrivateRecord();
    await respond(request);
    expectOnlyRecord(persona);
  });

  it.each(personas)("%s cannot resolve a different persona's exact reference", async (persona) => {
    const other = personas[(personas.indexOf(persona) + 1) % personas.length]!;
    await render(persona, { reference: recordOf(other).reference });
    await respond(pending[0]!);
    expectNoPrivateRecord();
    expect(host.textContent).toContain("No commerce record with this exact reference is attached to this account");
    expect(host.textContent).not.toContain("different account");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps a missing reference inconclusive when the member's history is partial", async () => {
    await render("customer-a", { reference: recordOf("partner-a").reference });
    await respond(pending[0]!, ordersOf("customer-a", true));
    expectNoPrivateRecord();
    expect(host.textContent).toContain("not currently visible");
    expect(host.textContent).toContain("not a definitive not-found result");
    expect(host.textContent).not.toContain("No commerce record with this exact reference");
  });

  it.each([
    recordOf("customer-a").reference.toUpperCase(),
    recordOf("customer-a").reference.slice(0, -1),
    `${recordOf("customer-a").reference}-extra`,
  ])("does not broaden the exact reference match for %s", async (reference) => {
    await render("customer-a", { reference });
    await respond(pending[0]!);
    expectNoPrivateRecord();
    expect(host.textContent).toContain("No commerce record with this exact reference");
  });

  it("refuses ambiguous duplicate references without revealing either matched row", async () => {
    const first = recordOf("customer-a");
    const second = { ...first, itemLabel: "Second private duplicate line", trackingUrl: "https://tracking.example.invalid/second-private-record" };
    const data: CustomerOrdersDto = {
      ...ordersOf("customer-a"),
      research: [first, second],
      history: { ...ordersOf("customer-a").history, availability: "complete", authoritativeRecordCount: 2 },
    };
    await render("customer-a");
    await respond(pending[0]!, data);
    expect(host.textContent?.toLowerCase()).toContain("ambiguous");
    expectNoPrivateRecord();
    expect(host.textContent).not.toContain(second.itemLabel);
    expect(host.innerHTML).not.toContain(second.trackingUrl);
  });
});

describe("account order detail session transitions", () => {
  it.each([
    ["customer-a", "partner-a"], ["partner-a", "partner-b"],
    ["partner-b", "organization-a"], ["organization-a", "customer-a"],
  ] as const)("%s to %s drops the old record before the new read begins", async (from, to) => {
    await render(from);
    await respond(pending[0]!);
    expectOnlyRecord(from);
    await render(to);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(pending[1]!.visibleAtRead).not.toContain(recordOf(from).reference);
    expect(pending[1]!.visibleAtRead).not.toContain(recordOf(from).itemLabel);
    expectNoPrivateRecord();
    expect(host.querySelector('[data-testid="account-loading"]')).not.toBeNull();
    await respond(pending[1]!);
    expectOnlyRecord(to);
  });

  it("ignores a late A completion after B's private record has loaded", async () => {
    await render("partner-a");
    const old = pending[0]!;
    await render("partner-b");
    await respond(pending[1]!);
    expectOnlyRecord("partner-b");
    const before = host.innerHTML;
    await respond(old);
    expect(host.innerHTML).toBe(before);
    expectOnlyRecord("partner-b");
  });

  it("discards ready data while a refreshed bearer is being reread", async () => {
    const refreshed = "synthetic-order-customer-a-refreshed";
    serverSessions.set(refreshed, "customer-a");
    await render("customer-a");
    await respond(pending[0]!);
    expectOnlyRecord("customer-a");
    await render("customer-a", { token: refreshed });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Headers(pending[1]!.init.headers).get("Authorization")).toBe(`Bearer ${refreshed}`);
    expect(pending[1]!.visibleAtRead).not.toContain(recordOf("customer-a").itemLabel);
    expectNoPrivateRecord();
    await respond(pending[1]!);
    expectOnlyRecord("customer-a");
  });

  it.each(personas)("%s logout removes ready detail without another private GET", async (persona) => {
    await render(persona);
    await respond(pending[0]!);
    expectOnlyRecord(persona);
    await render(null);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expectNoPrivateRecord();
    expect(host.querySelector('[data-testid="account-denied"]')).not.toBeNull();
  });

  it("signed out makes no private request, including after a late reply", async () => {
    await render(null);
    expect(fetchMock).not.toHaveBeenCalled();
    expectNoPrivateRecord();
    await render("customer-a");
    const old = pending[0]!;
    await render(null);
    await respond(old);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expectNoPrivateRecord();
    expect(host.textContent).toContain("Account access is required");
  });

  it.each(personas)("%s checking with a token makes no private GET and renders no detail", async (persona) => {
    await render(persona, { checking: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expectNoPrivateRecord();
    expect(host.querySelector('[data-testid="account-loading"]')).not.toBeNull();
    await render(persona);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await respond(pending[0]!);
    expectOnlyRecord(persona);
  });

  it("a new identity check hides ready detail and requires another read even with the same token", async () => {
    await render("customer-a");
    await respond(pending[0]!);
    expectOnlyRecord("customer-a");
    await render("customer-a", { checking: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expectNoPrivateRecord();
    expect(host.querySelector('[data-testid="account-loading"]')).not.toBeNull();
    await render("customer-a");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expectNoPrivateRecord();
    await respond(pending[1]!);
    expectOnlyRecord("customer-a");
  });

  it("a pending reply cannot populate the page during a new identity check", async () => {
    await render("customer-a");
    const old = pending[0]!;
    await render("customer-a", { checking: true });
    await respond(old);
    expectNoPrivateRecord();
    expect(host.querySelector('[data-testid="account-loading"]')).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await render("customer-a");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expectNoPrivateRecord();
    await respond(pending[1]!);
    expectOnlyRecord("customer-a");
  });

  it("unmount prevents a pending account reply from rendering private detail", async () => {
    await render("organization-a");
    const old = pending[0]!;
    await act(async () => root!.unmount());
    root = null;
    await respond(old);
    expect(host.innerHTML).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { assistedOrderTokenKey } from "@/research/assisted-order/storage";
import { StatusPage } from "./pages";

vi.mock("@/lib/supabaseBrowser", () => ({ getSupabaseBrowser: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORDER_REFERENCE = "XRR-20260926-ABCDEF1234";
const RECOVERY_TOKEN = "R".repeat(43);
let root: Root | null = null;
let host: HTMLDivElement | null = null;

function response(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  });
}

async function settle(turns = 3): Promise<void> {
  for (let index = 0; index < turns; index += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

beforeEach(() => {
  vi.mocked(getSupabaseBrowser).mockResolvedValue(null);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === "/api/research/status") return response(401, { ok: false });
    return response(202, { ok: true });
  }));
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/status");
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function renderPage(path = "/status"): Promise<HTMLDivElement> {
  window.history.replaceState({}, "", path);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root?.render(<StatusPage />));
  await settle();
  return host;
}

async function submit(view: HTMLElement, reference: string, email = "person@example.invalid"): Promise<void> {
  const referenceInput = view.querySelector<HTMLInputElement>('input[name="reference"]')!;
  const emailInput = view.querySelector<HTMLInputElement>('input[name="email"]')!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(referenceInput, reference);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(emailInput, email);
  await act(async () => {
    view.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await settle();
}

function requestCalls(): Array<[RequestInfo | URL, RequestInit | undefined]> {
  return vi.mocked(fetch).mock.calls as Array<[RequestInfo | URL, RequestInit | undefined]>;
}

describe("public status credential boundary", () => {
  it.each(["CARE-123E4567", "CARE-UNKNOWN000", "CARE-not-a-valid-reference"])(
    "routes the Care-format input %s to the same non-enumerating Care guidance without requesting Research recovery",
    async (reference) => {
      const view = await renderPage();
      await submit(view, reference);

      const guidance = view.querySelector('[role="status"]');
      expect(guidance?.textContent).toContain("Care requests are handled by the Care team");
      expect(guidance?.textContent).toContain("cannot confirm whether a Care request exists");
      expect(guidance?.textContent).not.toContain("Check your email");
      expect(guidance?.textContent).not.toContain("status of a Care request");
      expect(view.querySelector('a[href="/care/support"]')).not.toBeNull();
      expect(requestCalls().some(([url]) => String(url) === "/api/research/status-recovery/request")).toBe(false);
    },
  );

  it("uses the neutral Research recovery flow for an XRR reference", async () => {
    const view = await renderPage();
    await submit(view, ORDER_REFERENCE);

    expect(view.querySelector('[role="status"]')?.textContent).toContain("Check your email");
    expect(requestCalls().some(([url]) => String(url) === "/api/research/status-recovery/request")).toBe(true);
  });

  it("continues only the exact XRR subject already authorized in this browser", async () => {
    sessionStorage.setItem(assistedOrderTokenKey(ORDER_REFERENCE), "synthetic-status-secret");
    const view = await renderPage();
    await submit(view, `  ${ORDER_REFERENCE.toLowerCase()}  `);

    expect(window.location.pathname).toBe(`/research/early-access/order-request/${ORDER_REFERENCE}`);
    expect(requestCalls().some(([url]) => String(url) === "/api/research/status-recovery/request")).toBe(false);
  });

  it("shows account orders only after the server confirms an active member authority", async () => {
    vi.mocked(getSupabaseBrowser).mockResolvedValue({
      auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "member-jwt" } } })) },
    } as never);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/research/member/me") {
        expect(init?.headers).toEqual({ Authorization: "Bearer member-jwt" });
        return response(200, { ok: true, member: { status: "active" } });
      }
      return response(401, { ok: false });
    }));

    const view = await renderPage();
    const accountOrders = view.querySelector<HTMLAnchorElement>('a[href="/research/account/orders"]');
    expect(accountOrders?.textContent).toBe("View account orders");
  });

  it.each([401, 403])("does not show account orders when server confirmation returns %s", async (status) => {
    vi.mocked(getSupabaseBrowser).mockResolvedValue({
      auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "unverified-jwt" } } })) },
    } as never);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) =>
      String(input) === "/api/research/member/me" ? response(status, { ok: false }) : response(401, { ok: false }),
    ));

    const view = await renderPage();
    expect(view.querySelector('a[href="/research/account/orders"]')).toBeNull();
  });

  it("removes the account shortcut immediately when the verified auth session signs out", async () => {
    let authChanged: ((event: string, session: { access_token: string } | null) => void) | null = null;
    vi.mocked(getSupabaseBrowser).mockResolvedValue({
      auth: {
        getSession: vi.fn(async () => ({ data: { session: { access_token: "member-jwt" } } })),
        onAuthStateChange: vi.fn((callback) => {
          authChanged = callback;
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        }),
      },
    } as never);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) =>
      String(input) === "/api/research/member/me"
        ? response(200, { ok: true, member: { status: "active" } })
        : response(401, { ok: false }),
    ));

    const view = await renderPage();
    expect(view.querySelector('a[href="/research/account/orders"]')).not.toBeNull();
    await act(async () => { authChanged?.("SIGNED_OUT", null); });
    await settle();
    expect(view.querySelector('a[href="/research/account/orders"]')).toBeNull();
  });

  it("captures and scrubs a recovery fragment delivered by same-tab hashchange before explicit exchange", async () => {
    const view = await renderPage();
    expect(view.textContent).toContain("Send secure status link");

    await act(async () => {
      window.history.pushState({}, "", `/status#recovery=${RECOVERY_TOKEN}`);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await settle();

    expect(window.location.href).not.toContain(RECOVERY_TOKEN);
    expect(window.location.hash).toBe("");
    expect(view.textContent).toContain("Secure status link ready");
    expect(view.textContent).toContain("View status");
    expect(requestCalls().some(([url]) => String(url) === "/api/research/status-recovery/exchange")).toBe(false);
    expect(document.documentElement.outerHTML).not.toContain(RECOVERY_TOKEN);
    expect(JSON.stringify(window.history.state)).not.toContain(RECOVERY_TOKEN);
    expect(Object.values(localStorage)).not.toContain(RECOVERY_TOKEN);
    expect(Object.values(sessionStorage)).not.toContain(RECOVERY_TOKEN);
  });

  it("preserves explicit POST exchange after same-tab fragment capture", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/research/status-recovery/exchange") {
        expect(init?.method).toBe("POST");
        expect(init?.body).toBe(JSON.stringify({ token: RECOVERY_TOKEN }));
        return response(204);
      }
      if (String(input) === "/api/research/status") {
        return response(200, {
          reference: ORDER_REFERENCE,
          statusLabel: "Received",
          whatHappened: "Your request was received.",
          nextStep: "We are reviewing it.",
          nextStepOwner: "xenios",
          returnPath: "/status",
          supportPath: "/support",
          timeline: [],
          updatedAt: "2026-09-28T00:00:00.000Z",
        });
      }
      return response(401, { ok: false });
    }));
    const view = await renderPage();
    await act(async () => {
      window.history.pushState({}, "", `/status#recovery=${RECOVERY_TOKEN}`);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await settle();
    await act(async () => {
      Array.from(view.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent === "View status")
        ?.click();
    });
    await settle(5);

    expect(view.textContent).toContain(ORDER_REFERENCE);
    expect(view.textContent).toContain("Received");
    expect(window.location.href).not.toContain(RECOVERY_TOKEN);
  });

  it("replaces an unconsumed same-tab token with the newest fragment and scrubs malformed fragments", async () => {
    const secondToken = "S".repeat(43);
    let exchangedBody = "";
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/research/status-recovery/exchange") {
        exchangedBody = String(init?.body ?? "");
        return response(401, { ok: false });
      }
      return response(401, { ok: false });
    }));
    const view = await renderPage();

    await act(async () => {
      window.history.pushState({}, "", `/status#recovery=${RECOVERY_TOKEN}`);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      window.history.pushState({}, "", `/status#recovery=${secondToken}`);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await settle();
    await act(async () => {
      Array.from(view.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent === "View status")
        ?.click();
    });
    await settle(5);

    expect(exchangedBody).toBe(JSON.stringify({ token: secondToken }));
    expect(window.location.hash).toBe("");
    expect(document.activeElement?.getAttribute("role")).toBe("alert");

    await act(async () => {
      window.history.pushState({}, "", "/status#recovery=malformed");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await settle();
    expect(window.location.hash).toBe("");
    expect(view.textContent).toContain("Send secure status link");
    expect(view.textContent).not.toContain("Secure status link ready");
  });
});

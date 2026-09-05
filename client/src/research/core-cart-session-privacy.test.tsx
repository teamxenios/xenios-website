// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@shared/research/types";
import {
  LEGACY_RESEARCH_CART_STORAGE_KEY,
  RESEARCH_CART_SESSION_KEY,
  writeResearchCartForScope,
} from "./cart-session";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const MEMBER_A = "a".repeat(64);
const MEMBER_B = "b".repeat(64);

const supa = vi.hoisted(() => {
  const state = { session: null as null | { access_token: string } };
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: state.session } })),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    })),
    signOut: vi.fn(async () => {
      state.session = null;
      return { error: null };
    }),
  };
  return { state, auth };
});

vi.mock("@/lib/supabaseBrowser", () => ({
  getSupabaseBrowser: async () => ({ auth: supa.auth }),
  clearPersistedRecoverySession: vi.fn(() => true),
  revokeRecoverySession: vi.fn(async () => undefined),
  isRecoveryAccessToken: () => false,
}));

import { ResearchProvider, useResearch } from "./core";

const PRODUCT: Product = {
  slug: "research-item",
  name: "Research item",
  category: "peptides",
  lane: "research",
  status: "live",
  priceCents: 100,
  eyebrow: "Research",
  summary: "Synthetic fixture.",
  description: [],
  highlights: [],
  tags: [],
};

const api: {
  current: null | Pick<
    ReturnType<typeof useResearch>,
    "addItem" | "establishMemberSession" | "signOutMember"
  >;
} = { current: null };

function Probe() {
  const context = useResearch();
  api.current = context;
  return <output data-testid="cart" data-items={JSON.stringify(context.items)}
    data-member={context.member?.firstName ?? ""} data-token={context.memberToken ?? ""}
    data-products={context.products.length} data-session={context.memberSessionStatus} />;
}

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function bearer(init: RequestInit | undefined): string {
  const value = (init?.headers as Record<string, string> | undefined)?.Authorization ?? "";
  return value.replace(/^Bearer /, "");
}

async function flush(rounds = 8) {
  for (let index = 0; index < rounds; index += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount(): Promise<{ root: Root; host: HTMLDivElement }> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<ResearchProvider><Probe /></ResearchProvider>));
  await flush();
  return { root, host };
}

function items(host: HTMLElement): unknown[] {
  const raw = host.querySelector('[data-testid="cart"]')?.getAttribute("data-items") ?? "[]";
  return JSON.parse(raw) as unknown[];
}

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
  localStorage.clear();
  supa.state.session = null;
  api.current = null;
  vi.clearAllMocks();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).split("?")[0];
    if (path === "/api/research/me") {
      return jsonResponse({ configured: true, authed: Boolean(supa.state.session) });
    }
    if (path === "/api/research/member/me") {
      const token = bearer(init);
      const scope = token === "member-a-token" ? MEMBER_A : token === "member-b-token" ? MEMBER_B : null;
      return scope
        ? jsonResponse({
            ok: true,
            member: {
              firstName: token === "member-a-token" ? "Member A" : "Member B",
              status: "active",
              applicationStatus: "active",
              cartScope: scope,
            },
          })
        : jsonResponse({ ok: false }, 401);
    }
    if (path === "/api/research/catalog") {
      return jsonResponse({
        products: [PRODUCT],
        commerce: { research: true, consumer: false },
        email: "research@example.invalid",
      });
    }
    if (path === "/api/research/logout") return jsonResponse({ ok: true });
    return jsonResponse({ ok: true });
  }) as typeof fetch;
});

describe("ResearchProvider cart identity isolation", () => {
  it("restores the exact member and drops it on a direct account switch", async () => {
    writeResearchCartForScope(
      sessionStorage,
      MEMBER_A,
      [{ slug: PRODUCT.slug, quantity: 2 }],
      localStorage,
    );
    supa.state.session = { access_token: "member-a-token" };
    const view = await mount();
    expect(items(view.host)).toEqual([{ slug: PRODUCT.slug, quantity: 2 }]);

    await act(async () => {
      await api.current!.establishMemberSession("member-b-token");
    });
    await flush();
    expect(items(view.host)).toEqual([]);
    expect(sessionStorage.getItem(RESEARCH_CART_SESSION_KEY)).toContain(MEMBER_B);
    expect(sessionStorage.getItem(RESEARCH_CART_SESSION_KEY)).not.toContain(MEMBER_A);
    act(() => view.root.unmount());
  });

  it("clears member and legacy cart state on sign-out", async () => {
    supa.state.session = { access_token: "member-a-token" };
    const view = await mount();
    act(() => api.current!.addItem(PRODUCT));
    await flush();
    localStorage.setItem(LEGACY_RESEARCH_CART_STORAGE_KEY, "legacy-private-cart");
    expect(sessionStorage.getItem(RESEARCH_CART_SESSION_KEY)).toContain(PRODUCT.slug);

    await act(async () => {
      await api.current!.signOutMember();
    });
    await flush();
    expect(items(view.host)).toEqual([]);
    expect(sessionStorage.getItem(RESEARCH_CART_SESSION_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_RESEARCH_CART_STORAGE_KEY)).toBeNull();
    expect(supa.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    act(() => view.root.unmount());
  });

  it("never adopts the legacy global cart for a newly verified member", async () => {
    localStorage.setItem(
      LEGACY_RESEARCH_CART_STORAGE_KEY,
      JSON.stringify([{ slug: "other-member-item", quantity: 1 }]),
    );
    supa.state.session = { access_token: "member-b-token" };
    const view = await mount();
    expect(items(view.host)).toEqual([]);
    expect(localStorage.getItem(LEGACY_RESEARCH_CART_STORAGE_KEY)).toBeNull();
    act(() => view.root.unmount());
  });

  it("retains Auth-only sign-in without hydrating private customer, catalog or cart state", async () => {
    supa.state.session = { access_token: "auth-only-token" };
    writeResearchCartForScope(sessionStorage, MEMBER_A, [{ slug: PRODUCT.slug, quantity: 2 }], localStorage);
    const previousFetch = globalThis.fetch;
    globalThis.fetch = vi.fn((input, init) => String(input).split("?")[0] === "/api/research/member/me"
      ? Promise.resolve(jsonResponse({ ok: false, code: "account_access_required" }, 403))
      : previousFetch(input, init));
    const view = await mount();
    const probe = view.host.querySelector("output")!;
    expect(probe.getAttribute("data-member")).toBe("");
    expect(probe.getAttribute("data-token")).toBe("");
    expect(probe.getAttribute("data-products")).toBe("0");
    expect(items(view.host)).toEqual([]);
    expect(sessionStorage.getItem(RESEARCH_CART_SESSION_KEY)).toBeNull();
    expect(supa.state.session?.access_token).toBe("auth-only-token");
    expect(supa.auth.signOut).not.toHaveBeenCalled();
    expect(vi.mocked(globalThis.fetch).mock.calls.some(([url]) => String(url).startsWith("/api/research/catalog"))).toBe(false);
    act(() => view.root.unmount());
  });

  it("hides account A immediately while an Auth-only principal is still being verified", async () => {
    supa.state.session = { access_token: "member-a-token" };
    const view = await mount();
    act(() => api.current!.addItem(PRODUCT));
    await flush();
    expect(view.host.querySelector("output")!.getAttribute("data-member")).toBe("Member A");
    let resolve!: (value: Response) => void;
    const pending = new Promise<Response>(done => { resolve = done; });
    const previousFetch = globalThis.fetch;
    globalThis.fetch = vi.fn((input, init) => bearer(init) === "auth-only-b"
      ? pending : previousFetch(input, init));
    let verification!: ReturnType<NonNullable<typeof api.current>["establishMemberSession"]>;
    act(() => { verification = api.current!.establishMemberSession("auth-only-b"); });
    const probe = view.host.querySelector("output")!;
    expect(probe.getAttribute("data-session")).toBe("checking");
    expect(probe.getAttribute("data-member")).toBe("");
    expect(probe.getAttribute("data-token")).toBe("");
    expect(probe.getAttribute("data-products")).toBe("0");
    expect(items(view.host)).toEqual([]);
    await act(async () => { resolve(jsonResponse({ ok: false, code: "account_access_required" }, 403)); await verification; });
    expect(items(view.host)).toEqual([]);
    expect(probe.getAttribute("data-member")).toBe("");
    expect(sessionStorage.getItem(RESEARCH_CART_SESSION_KEY)).toBeNull();
    expect(supa.auth.signOut).not.toHaveBeenCalled();
    act(() => view.root.unmount());
  });

  it("restores a refreshed principal's cart only after its opaque scope is verified again", async () => {
    supa.state.session = { access_token: "member-a-token" };
    const view = await mount();
    act(() => api.current!.addItem(PRODUCT));
    await flush();
    let resolve!: (value: Response) => void;
    const pending = new Promise<Response>(done => { resolve = done; });
    const previousFetch = globalThis.fetch;
    globalThis.fetch = vi.fn((input, init) => String(input).split("?")[0] === "/api/research/member/me" && bearer(init) === "refreshed-a"
      ? pending : previousFetch(input, init));
    let verification!: ReturnType<NonNullable<typeof api.current>["establishMemberSession"]>;
    act(() => { verification = api.current!.establishMemberSession("refreshed-a"); });
    expect(items(view.host)).toEqual([]);
    expect(view.host.querySelector("output")!.getAttribute("data-member")).toBe("");
    await act(async () => {
      resolve(jsonResponse({ ok: true, member: { firstName: "Member A", status: "active", applicationStatus: "active", cartScope: MEMBER_A } }));
      await verification;
    });
    expect(items(view.host)).toEqual([{ slug: PRODUCT.slug, quantity: 1 }]);
    expect(view.host.querySelector("output")!.getAttribute("data-token")).toBe("refreshed-a");
    act(() => view.root.unmount());
  });
});

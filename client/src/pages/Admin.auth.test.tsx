// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const authMock = vi.hoisted(() => {
  let listener: ((event: string, session: any) => void) | null = null;
  const session = { access_token: "server-checked-admin-token", user: { id: "admin-user" } };
  return {
    session,
    setListener(value: typeof listener) { listener = value; },
    emit(event: string, value: any) { listener?.(event, value); },
    signInWithPassword: vi.fn(async () => {
      listener?.("SIGNED_IN", session);
      return { data: { session }, error: null };
    }),
    signOut: vi.fn(async () => ({ error: null })),
  };
});

const client = {
  auth: {
    getSession: vi.fn(async () => ({ data: { session: null } })),
    onAuthStateChange: vi.fn((callback: (event: string, session: any) => void) => {
      authMock.setListener(callback);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    signInWithPassword: authMock.signInWithPassword,
    signOut: authMock.signOut,
    resetPasswordForEmail: vi.fn(async () => ({ error: null })),
    updateUser: vi.fn(async () => ({ error: null })),
  },
};

vi.mock("@/lib/supabaseBrowser", () => ({
  getSupabaseBrowser: async () => client,
}));

import Admin from "./Admin";

let host: HTMLDivElement;
let root: Root;

async function flush(rounds = 5) {
  for (let index = 0; index < rounds; index += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
}

function type(selector: string, value: string) {
  const input = host.querySelector(selector) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(async () => {
  window.history.replaceState(null, "", "/admin");
  vi.clearAllMocks();
  client.auth.getSession.mockResolvedValue({ data: { session: null } });
  authMock.setListener(null);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("canonical admin entry", () => {
  it("lands a newly signed-in identity on the founder command center only after server confirmation", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/admin/me") return new Response(JSON.stringify({ success: true, email: "samuel@xeniostechnology.com" }), { status: 200, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ success: true, data: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => { root.render(<Admin />); });
    await flush();
    type("#admin-email", "founder@example.test");
    type("#admin-password", "correct-password");
    const form = host.querySelector('[data-testid="form-admin-login"]')!;
    act(() => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await flush();

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/me", {
      headers: { Authorization: "Bearer server-checked-admin-token" },
      cache: "no-store",
    });
    expect(window.location.pathname).toBe("/admin/research/command-center");
  });

  it("shows no admin data when the server denies an existing Supabase session", async () => {
    client.auth.getSession.mockResolvedValueOnce({ data: { session: authMock.session } } as any);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 403, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => { root.render(<Admin />); });
    await flush();

    expect(host.textContent).toContain("Admin access denied");
    expect(host.textContent).not.toContain("Waitlist");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/me", expect.any(Object));
  });
});

// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RECOVERY_MARKER_KEY } from "@shared/research/recovery";

// Client recovery isolation (PR #25 correction pass, blocker 2): while a
// recovery is pending the provider loads NO member state and NO catalog; an
// abandoned reset signs the recovery session out; a successful reset signs
// out and requires a fresh normal sign-in.

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const supa = vi.hoisted(() => {
  const state = { session: null as any };
  const listener = { current: null as null | ((event: string, session: any) => void) };
  const recovery = {
    hashToken: null as string | null,
    clearPersisted: vi.fn(() => true),
    revoke: vi.fn(async () => {}),
  };
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: state.session } })),
    onAuthStateChange: vi.fn((callback: (event: string, session: any) => void) => {
      listener.current = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    signOut: vi.fn(async () => {
      state.session = null;
      return { error: null };
    }),
    updateUser: vi.fn(async () => ({ data: { user: {} }, error: null })),
  };
  return { state, auth, recovery, listener };
});

vi.mock("@/lib/supabaseBrowser", () => ({
  getSupabaseBrowser: async () => ({ auth: supa.auth }),
  clearPersistedRecoverySession: supa.recovery.clearPersisted,
  revokeRecoverySession: supa.recovery.revoke,
  recoveryAccessTokenFromHash: () => supa.recovery.hashToken,
  isRecoveryAccessToken: (token: string) => token.includes("recovery"),
}));

const net = vi.hoisted(() => ({ urls: [] as string[] }));

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

import { ResearchProvider, useResearch } from "./core";
import ResetPassword from "./pages/ResetPassword";

function MemberProbe() {
  const { member, memberToken, memberSessionStatus } = useResearch();
  return (
    <output
      data-testid="member-probe"
      data-member={member?.firstName ?? ""}
      data-token={memberToken ?? ""}
      data-status={memberSessionStatus}
    />
  );
}

async function flush(rounds = 6) {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function mountedRoot(children: React.ReactNode): { root: Root; container: HTMLElement } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<ResearchProvider>{children}</ResearchProvider>);
  });
  return { root, container };
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/research/reset-password");
  document.body.innerHTML = "";
  net.urls.length = 0;
  supa.state.session = null;
  supa.listener.current = null;
  supa.recovery.hashToken = null;
  vi.clearAllMocks();
  globalThis.fetch = vi.fn(async (input: any) => {
    const url = String(typeof input === "string" ? input : input?.url ?? input);
    net.urls.push(url);
    const path = url.split("?")[0];
    if (path === "/api/research/me") {
      return jsonResponse({ configured: true, authed: false, publicMode: false });
    }
    if (path === "/api/research/member/me") {
      return jsonResponse({ ok: true, member: { firstName: "Avery", status: "active", applicationStatus: "active", memberSince: "2026-01-01" } });
    }
    if (path === "/api/research/catalog" || path === "/api/research/member/catalog") {
      return jsonResponse({ products: [], commerce: { research: false, consumer: false }, email: "research@xeniostechnology.com" });
    }
    if (path === "/api/research/member/forgot-password") {
      return jsonResponse({ ok: true, message: "generic" });
    }
    return jsonResponse({ ok: true });
  }) as any;
});

describe("provider recovery isolation", () => {
  it("recovery pending + a valid active-member session fetches NO member data and NO catalog", async () => {
    window.sessionStorage.setItem(RECOVERY_MARKER_KEY, "1");
    supa.state.session = { access_token: "active-member-token" };
    const { root } = mountedRoot(null);
    await flush();
    expect(net.urls.some((u) => u.includes("/api/research/me"))).toBe(true);
    expect(net.urls.some((u) => u.includes("/api/research/member/me"))).toBe(false);
    expect(net.urls.some((u) => u.includes("/api/research/catalog"))).toBe(false);
    expect(net.urls.some((u) => u.includes("/api/research/member/catalog"))).toBe(false);
    expect(net.urls.some((u) => u.includes("/api/research/orders"))).toBe(false);
    act(() => root.unmount());
  });

  it("positive control: WITHOUT a pending recovery, the same session loads member state and the catalog", async () => {
    supa.state.session = { access_token: "active-member-token" };
    window.history.replaceState(null, "", "/research");
    const { root } = mountedRoot(null);
    await flush();
    expect(net.urls.some((u) => u.includes("/api/research/member/me"))).toBe(true);
    expect(net.urls.some((u) => u.includes("/api/research/catalog"))).toBe(true);
    act(() => root.unmount());
  });

  it("restores a verified member from an existing password session after a page refresh", async () => {
    supa.state.session = { access_token: "existing-password-token" };
    window.history.replaceState(null, "", "/research/activate");
    const { root, container } = mountedRoot(<MemberProbe />);
    await flush();
    const probe = container.querySelector('[data-testid="member-probe"]') as HTMLOutputElement;
    expect(probe.dataset.member).toBe("Avery");
    expect(probe.dataset.token).toBe("existing-password-token");
    expect(probe.dataset.status).toBe("authenticated");
    act(() => root.unmount());
  });

  it("reverifies TOKEN_REFRESHED and replaces the usable member JWT", async () => {
    supa.state.session = { access_token: "initial-password-token" };
    const { root, container } = mountedRoot(<MemberProbe />);
    await flush();
    act(() => {
      supa.listener.current?.("TOKEN_REFRESHED", { access_token: "refreshed-password-token" });
    });
    await flush();
    const probe = container.querySelector('[data-testid="member-probe"]') as HTMLOutputElement;
    expect(probe.dataset.token).toBe("refreshed-password-token");
    expect(net.urls.filter((u) => u.includes("/api/research/member/me"))).toHaveLength(2);
    act(() => root.unmount());
  });

  it("hydrates a normal SIGNED_IN session through server verification", async () => {
    const { root, container } = mountedRoot(<MemberProbe />);
    await flush();
    act(() => {
      supa.listener.current?.("SIGNED_IN", { access_token: "new-password-token" });
    });
    await flush();
    const probe = container.querySelector('[data-testid="member-probe"]') as HTMLOutputElement;
    expect(probe.dataset.member).toBe("Avery");
    expect(probe.dataset.token).toBe("new-password-token");
    expect(probe.dataset.status).toBe("authenticated");
    act(() => root.unmount());
  });

  it("reverifies USER_UPDATED even when Supabase keeps the same access token", async () => {
    supa.state.session = { access_token: "existing-password-token" };
    const { root } = mountedRoot(<MemberProbe />);
    await flush();
    const before = net.urls.filter((u) => u.includes("/api/research/member/me")).length;
    act(() => {
      supa.listener.current?.("USER_UPDATED", { access_token: "existing-password-token" });
    });
    await flush();
    expect(net.urls.filter((u) => u.includes("/api/research/member/me"))).toHaveLength(before + 1);
    act(() => root.unmount());
  });

  it("SIGNED_OUT clears verified member state and the member token", async () => {
    supa.state.session = { access_token: "existing-password-token" };
    const { root, container } = mountedRoot(<MemberProbe />);
    await flush();
    act(() => {
      supa.listener.current?.("SIGNED_OUT", null);
    });
    await flush();
    const probe = container.querySelector('[data-testid="member-probe"]') as HTMLOutputElement;
    expect(probe.dataset.member).toBe("");
    expect(probe.dataset.token).toBe("");
    expect(probe.dataset.status).toBe("signed_out");
    act(() => root.unmount());
  });

  it("never hydrates a recovery-purpose token delivered by a normal auth event", async () => {
    const { root } = mountedRoot(<MemberProbe />);
    await flush();
    net.urls.length = 0;
    act(() => {
      supa.listener.current?.("SIGNED_IN", { access_token: "recovery-purpose-token" });
    });
    await flush();
    expect(net.urls.some((u) => u.includes("/api/research/member/me"))).toBe(false);
    expect(net.urls.some((u) => u.includes("/api/research/catalog"))).toBe(false);
    act(() => root.unmount());
  });
});

describe("reset page session hygiene", () => {
  it("abandoning the reset page signs the recovery session out and clears the marker", async () => {
    window.sessionStorage.setItem(RECOVERY_MARKER_KEY, "1");
    supa.state.session = { access_token: "recovery-token" };
    const { root } = mountedRoot(<ResetPassword />);
    await flush();
    expect(supa.recovery.revoke).not.toHaveBeenCalled();
    act(() => root.unmount());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(supa.recovery.clearPersisted).toHaveBeenCalledWith("recovery-token");
    expect(supa.recovery.revoke).toHaveBeenCalledTimes(1);
    expect(supa.recovery.revoke).toHaveBeenCalledWith("recovery-token");
    expect(supa.auth.signOut).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(RECOVERY_MARKER_KEY)).toBeNull();
  });

  it("pagehide clears the recovery session once before unmount can double-fire", async () => {
    window.sessionStorage.setItem(RECOVERY_MARKER_KEY, "1");
    supa.state.session = { access_token: "recovery-token" };
    const { root } = mountedRoot(<ResetPassword />);
    await flush();
    window.dispatchEvent(new Event("pagehide"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(supa.recovery.clearPersisted).toHaveBeenCalledWith("recovery-token");
    expect(supa.recovery.revoke).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(supa.recovery.revoke).toHaveBeenCalledTimes(1);
  });

  it("very-fast pagehide uses the synchronously captured provider token before async session lookup finishes", async () => {
    window.sessionStorage.setItem(RECOVERY_MARKER_KEY, "1");
    supa.recovery.hashToken = "hash-recovery-token";
    supa.auth.getSession.mockImplementationOnce(() => new Promise(() => {}));
    const { root } = mountedRoot(<ResetPassword />);
    window.dispatchEvent(new Event("pagehide"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(supa.recovery.clearPersisted).toHaveBeenCalledWith("hash-recovery-token");
    expect(supa.recovery.revoke).toHaveBeenCalledWith("hash-recovery-token");
    act(() => root.unmount());
  });

  it("successful reset signs out via the canonical provider action, redirects to sign-in, and the cleanup does not double-fire", async () => {
    window.sessionStorage.setItem(RECOVERY_MARKER_KEY, "1");
    supa.state.session = { access_token: "recovery-token" };
    const { root, container } = mountedRoot(<ResetPassword />);
    await flush();

    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    const type = (selector: string, value: string) => {
      const el = container.querySelector(selector) as HTMLInputElement;
      expect(el).toBeTruthy();
      nativeSetter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    await act(async () => {
      type("#rp-password", "a-brand-new-password");
      type("#rp-confirm", "a-brand-new-password");
    });
    const form = container.querySelector('[data-testid="form-reset-password"]') as HTMLFormElement;
    expect(form).toBeTruthy();
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await flush();

    expect(supa.auth.updateUser).toHaveBeenCalledWith({ password: "a-brand-new-password" });
    expect(supa.recovery.revoke).toHaveBeenCalledTimes(1);
    expect(supa.recovery.revoke).toHaveBeenCalledWith("recovery-token");
    expect(supa.auth.signOut).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(RECOVERY_MARKER_KEY)).toBeNull();
    expect(window.location.pathname).toBe("/research/sign-in");

    // Unmount after completion must NOT sign out again (no race with a
    // subsequent normal sign-in); the cleanup is idempotent.
    act(() => root.unmount());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(supa.recovery.revoke).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const supa = vi.hoisted(() => {
  const state = { currentToken: "password-session-token" as string | null, currentUserId: "auth-a" };
  const auth = {
    signInWithPassword: vi.fn(async () => {
      state.currentToken = "password-session-token";
      state.currentUserId = "auth-a";
      return {
        data: { session: { access_token: "password-session-token", user: { id: "auth-a" } } },
        error: null,
      };
    }),
    getSession: vi.fn(async () => ({
      data: { session: state.currentToken ? { access_token: state.currentToken, user: { id: state.currentUserId } } : null },
    })),
    signOut: vi.fn(async () => {
      state.currentToken = null;
      return { error: null };
    }),
  };
  return { state, auth };
});

vi.mock("@/lib/supabaseBrowser", () => ({
  getSupabaseBrowser: async () => ({ auth: supa.auth }),
  isRecoveryAccessToken: (token: string) => token.includes("recovery"),
}));

import { ResearchContext, type MemberInfo, type ResearchContextValue } from "../core";
import SignIn from "./SignIn";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function context(
  establishMemberSession: (token: string) => Promise<MemberInfo | null>,
  peekMemberDenial: () => { code: string; message?: string } | null = () => null,
  recovery: ResearchContextValue["recovery"] = "none",
): ResearchContextValue {
  return {
    gate: "locked",
    member: null,
    memberToken: null,
    memberChecking: false,
    memberSessionStatus: "signed_out",
    recovery,
    establishMemberSession,
    peekMemberDenial,
  } as ResearchContextValue;
}

async function flush(rounds = 4) {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function type(selector: string, value: string) {
  const input = container!.querySelector(selector) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function renderSignIn(
  establishMemberSession: (token: string) => Promise<MemberInfo | null>,
  search = "",
  peekMemberDenial?: () => { code: string; message?: string } | null,
  recovery: ResearchContextValue["recovery"] = "none",
) {
  window.history.replaceState(null, "", `/research/sign-in${search}`);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <ResearchContext.Provider value={context(establishMemberSession, peekMemberDenial, recovery)}>
        <SignIn />
      </ResearchContext.Provider>,
    );
  });
  await act(async () => {
    type("#ms-email", "MEMBER@EXAMPLE.COM");
    type("#ms-password", "correct-password");
  });
}

function submit() {
  const form = container!.querySelector('[data-testid="form-member-signin"]') as HTMLFormElement;
  act(() => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  supa.state.currentToken = "password-session-token";
  supa.state.currentUserId = "auth-a";
  sessionStorage.clear();
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("member sign-in", () => {
  it("hydrates the provider with the returned token before routing a pending member to activation", async () => {
    let resolveMember!: (member: MemberInfo) => void;
    const pending = new Promise<MemberInfo>((resolve) => {
      resolveMember = resolve;
    });
    const establish = vi.fn(() => pending);
    await renderSignIn(establish, "?returnTo=/research/activate");
    submit();
    await flush(1);

    expect(establish).toHaveBeenCalledWith("password-session-token");
    expect(window.location.pathname).toBe("/research/sign-in");

    await act(async () => {
      resolveMember({ firstName: "Avery", status: "pending_activation", applicationStatus: "approved" });
      await pending;
    });
    await flush();
    expect(window.location.pathname).toBe("/research/activate");
  });

  it("routes an active account to the canonical account page after deterministic verification", async () => {
    const establish = vi.fn(async () => ({
      firstName: "Avery",
      status: "active",
      applicationStatus: "active",
    }));
    await renderSignIn(establish);
    submit();
    await flush();
    expect(window.location.pathname).toBe("/research/account");
  });

  it("retains and verifies a newer refreshed token when the submitted token becomes stale", async () => {
    let resolveSubmitted!: (member: MemberInfo | null) => void;
    const submitted = new Promise<MemberInfo | null>((resolve) => {
      resolveSubmitted = resolve;
    });
    const establish = vi.fn((token: string) => {
      if (token === "password-session-token") return submitted;
      return Promise.resolve({
        firstName: "Avery",
        status: "active",
        applicationStatus: "active",
      });
    });
    await renderSignIn(establish);
    submit();
    await flush(1);

    supa.state.currentToken = "refreshed-password-token";
    await act(async () => {
      resolveSubmitted(null);
      await submitted;
    });
    await flush();

    expect(establish).toHaveBeenNthCalledWith(1, "password-session-token");
    expect(establish).toHaveBeenNthCalledWith(2, "refreshed-password-token");
    expect(supa.auth.signOut).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/research/account");
  });

  it("does not let an external returnTo override the server-authoritative member destination", async () => {
    const establish = vi.fn(async () => ({
      firstName: "Avery",
      status: "pending_activation",
      applicationStatus: "approved",
    }));
    await renderSignIn(establish, "?returnTo=https%3A%2F%2Fevil.example");
    submit();
    await flush();
    expect(window.location.pathname).toBe("/research/activate");
    expect(window.location.host).not.toBe("evil.example");
  });

  it("returns an active member to the exact account-portal route they asked for", async () => {
    const establish = vi.fn(async () => ({
      firstName: "Avery",
      status: "active",
      applicationStatus: "approved",
    }));
    await renderSignIn(establish, "?returnTo=%2Fresearch%2Faccount%2Forders");
    submit();
    await flush();
    expect(window.location.pathname).toBe("/research/account/orders");
  });

  it("routes a coded server refusal to its distinct screen without signing the session out", async () => {
    // The provider records the guard's machine-readable code (e.g. a
    // recovery-purpose session refused by /member/me); sign-in routes on it.
    const establish = vi.fn(async () => null);
    await renderSignIn(establish, "", () => ({ code: "recovery_session" }));
    submit();
    await flush();
    expect(window.location.pathname).toBe("/research/access-state");
    expect(new URLSearchParams(window.location.search).get("code")).toBe("recovery_session");
    // The session survives: its remedy (finishing the reset) still needs it.
    expect(supa.auth.signOut).not.toHaveBeenCalled();
  });

  it("routes a past_due member to the billing screen after verification", async () => {
    const establish = vi.fn(async () => ({
      firstName: "Avery",
      status: "past_due",
      applicationStatus: null,
    }));
    await renderSignIn(establish);
    submit();
    await flush();
    expect(window.location.pathname).toBe("/research/access-state");
    expect(new URLSearchParams(window.location.search).get("code")).toBe("billing_past_due");
  });

  it("keeps an uncoded verification failure inline without signing the Auth session out", async () => {
    const establish = vi.fn(async () => null);
    await renderSignIn(establish, "", () => null);
    submit();
    await flush();
    expect(window.location.pathname).toBe("/research/sign-in");
    expect(container!.querySelector('[data-testid="text-signin-error"]')?.textContent)
      .toContain("Your sign-in was retained, but customer access could not be verified.");
    expect(supa.auth.signOut).not.toHaveBeenCalled();
  });

  it("separates ordinary password sign-in from approved account setup", async () => {
    await renderSignIn(vi.fn(async () => null));
    expect(container!.textContent).toContain(
      "An approval link connects approved customer access to your account; it does not replace your password.",
    );
    expect(container!.textContent).toContain("Returning customers can sign in normally.");
  });
});

describe("Auth-only approved-customer claim continuity", () => {
  const claimSearch = "?returnTo=%2Fresearch%2Fapply%2Fstatus";

  it("resumes only the exact claim status page with its ephemeral link marker, retaining Auth", async () => {
    sessionStorage.setItem("xr-application-token", "synthetic-claim-secret");
    const establish = vi.fn(async () => null);
    await renderSignIn(establish, claimSearch);
    submit();
    await flush();
    expect(window.location.pathname).toBe("/research/apply/status");
    expect(window.location.search).toBe("");
    expect(window.location.href).not.toContain("synthetic-claim-secret");
    expect(sessionStorage.getItem("xr-application-token")).toBe("synthetic-claim-secret");
    expect(supa.auth.signOut).not.toHaveBeenCalled();
    expect(establish).toHaveBeenCalledWith("password-session-token");
  });

  it.each([null, "", "   "])("does not resume a claim without an ephemeral marker (%s)", async marker => {
    if (marker !== null) sessionStorage.setItem("xr-application-token", marker);
    await renderSignIn(vi.fn(async () => null), claimSearch);
    submit();
    await flush();
    expect(window.location.pathname).toBe("/research/sign-in");
    expect(supa.auth.signOut).not.toHaveBeenCalled();
  });

  it.each(["https://evil.example/research/apply/status", "/research/account", "/research/partners/dashboard", "/research/apply/status/extra", "/research/apply/status?from=account"])("does not treat %s as Auth-only customer access", async path => {
    sessionStorage.setItem("xr-application-token", "synthetic-link");
    await renderSignIn(vi.fn(async () => null), `?returnTo=${encodeURIComponent(path)}`);
    submit();
    await flush();
    expect(window.location.pathname).toBe("/research/sign-in");
    expect(supa.auth.signOut).not.toHaveBeenCalled();
  });

  it.each(["recovery_session", "membership_inactive", "account_closed", "unknown_refusal"])("never lets claim context bypass server denial %s", async code => {
    sessionStorage.setItem("xr-application-token", "synthetic-link");
    await renderSignIn(vi.fn(async () => null), claimSearch, () => ({ code }));
    submit();
    await flush();
    expect(window.location.pathname).toBe("/research/access-state");
    expect(new URLSearchParams(window.location.search).get("code")).toBe(code);
    expect(supa.auth.signOut).not.toHaveBeenCalled();
  });

  it("resumes the explicit absent-customer denial only with its ephemeral claim context", async () => {
    sessionStorage.setItem("xr-application-token", "synthetic-link");
    await renderSignIn(vi.fn(async () => null), claimSearch, () => ({ code: "account_access_required" }));
    submit();
    await flush();
    expect(window.location.pathname).toBe("/research/apply/status");
    expect(supa.auth.signOut).not.toHaveBeenCalled();
  });

  it("does not treat the explicit absent-customer denial as arbitrary private access", async () => {
    sessionStorage.setItem("xr-application-token", "synthetic-link");
    await renderSignIn(vi.fn(async () => null), "?returnTo=%2Fresearch%2Faccount", () => ({ code: "account_access_required" }));
    submit();
    await flush();
    expect(window.location.pathname).toBe("/research/access-state");
    expect(new URLSearchParams(window.location.search).get("code")).toBe("account_access_required");
  });

  it("retains and verifies a same-principal refreshed Auth-only session before claim resume", async () => {
    sessionStorage.setItem("xr-application-token", "synthetic-link");
    const establish = vi.fn(async (token: string) => {
      if (token === "password-session-token") supa.state.currentToken = "refreshed-auth-only";
      return null;
    });
    await renderSignIn(establish, claimSearch);
    submit();
    await flush();
    expect(establish.mock.calls.map(([token]) => token)).toEqual(["password-session-token", "refreshed-auth-only"]);
    expect(window.location.pathname).toBe("/research/apply/status");
    expect(supa.auth.signOut).not.toHaveBeenCalled();
  });

  it.each([null, { firstName: "Account A", status: "active", applicationStatus: "active" }])("does not navigate an old principal's completion: %j", async result => {
    sessionStorage.setItem("xr-application-token", "synthetic-link");
    const establish = vi.fn(async () => {
      supa.state.currentToken = "account-b-token";
      supa.state.currentUserId = "auth-b";
      return result;
    });
    await renderSignIn(establish, claimSearch);
    submit();
    await flush();
    expect(establish).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe("/research/sign-in");
    expect(container!.textContent).toContain("Your session changed while signing in.");
    expect(supa.auth.signOut).not.toHaveBeenCalled();
  });

  it("does not resume after the provider signs out during verification", async () => {
    sessionStorage.setItem("xr-application-token", "synthetic-link");
    await renderSignIn(vi.fn(async () => { supa.state.currentToken = null; return null; }), claimSearch);
    submit();
    await flush();
    expect(window.location.pathname).toBe("/research/sign-in");
    expect(supa.auth.signOut).not.toHaveBeenCalled();
  });

  it("never completes navigation after the sign-in form unmounts", async () => {
    let resolve!: (value: MemberInfo | null) => void;
    const pending = new Promise<MemberInfo | null>(done => { resolve = done; });
    await renderSignIn(vi.fn(() => pending));
    submit();
    await flush(1);
    act(() => root!.unmount());
    root = null;
    await act(async () => { resolve({ firstName: "Account A", status: "active", applicationStatus: "active" }); await pending; });
    expect(window.location.pathname).toBe("/research/sign-in");
    expect(supa.auth.signOut).not.toHaveBeenCalled();
  });

  it("does not replace or verify a password-recovery session to resume a claim", async () => {
    sessionStorage.setItem("xr-application-token", "synthetic-link");
    const establish = vi.fn(async () => null);
    await renderSignIn(establish, claimSearch, undefined, "pending");
    submit();
    await flush();
    expect(supa.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(establish).not.toHaveBeenCalled();
    expect(new URLSearchParams(window.location.search).get("code")).toBe("recovery_session");
  });

  it("rejects a recovery-grade provider token even without a recovery context marker", async () => {
    sessionStorage.setItem("xr-application-token", "synthetic-link");
    supa.auth.getSession.mockResolvedValueOnce({ data: { session: { access_token: "recovery-session", user: { id: "auth-a" } } } });
    const establish = vi.fn(async () => null);
    await renderSignIn(establish, claimSearch);
    submit();
    await flush();
    expect(establish).not.toHaveBeenCalled();
    expect(new URLSearchParams(window.location.search).get("code")).toBe("recovery_session");
    expect(supa.auth.signOut).not.toHaveBeenCalled();
  });
});

describe("SEN-0025: sign in is not a dead end", () => {
  // Before this, sign in was the ONLY /research page with no route away from
  // it, and the only credential-collecting page with no link to the Privacy
  // Policy or Terms it collects under. Every sibling already had an exit: the
  // gateway has a footer, Apply and the policy pages carry "Back to gateway"
  // plus a footer, Reset password links Member Login and Support.
  //
  // Anti-vacuity: each assertion reads the href, not just presence, so a link
  // that renders with the wrong destination still fails.

  it("offers a route back to the gateway", async () => {
    await renderSignIn(async () => null);
    const link = container!.querySelector('[data-testid="link-signin-gateway"]') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute("href")).toBe("/research");
  });

  it("offers the apply route for someone who is not a member yet", async () => {
    await renderSignIn(async () => null);
    const link = container!.querySelector('[data-testid="link-signin-apply"]') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute("href")).toBe("/research/apply");
  });

  it("links the policies it is collecting credentials under", async () => {
    await renderSignIn(async () => null);
    const privacy = container!.querySelector('[data-testid="link-signin-privacy"]') as HTMLAnchorElement;
    const terms = container!.querySelector('[data-testid="link-signin-terms"]') as HTMLAnchorElement;
    const support = container!.querySelector('[data-testid="link-signin-support"]') as HTMLAnchorElement;
    expect(privacy?.getAttribute("href")).toBe("/research/policies/privacy");
    expect(terms?.getAttribute("href")).toBe("/research/policies/terms");
    expect(support?.getAttribute("href")).toBe("mailto:team@xeniostechnology.com");
  });

  it("keeps the existing forgot-password route intact", async () => {
    await renderSignIn(async () => null);
    const link = container!.querySelector('[data-testid="link-forgot-password"]') as HTMLAnchorElement;
    expect(link?.getAttribute("href")).toBe("/research/reset-password");
  });

  it("keeps the destination through forgot-password while stripping secrets", async () => {
    await renderSignIn(async () => null, `?returnTo=${encodeURIComponent("/research/account/orders/XRR-Fixture_01?tab=payment&token=SECRET")}`);
    const link = container!.querySelector('[data-testid="link-forgot-password"]') as HTMLAnchorElement;
    expect(new URL(link.href).searchParams.get("returnTo")).toBe("/research/account/orders/XRR-Fixture_01?tab=payment");
    expect(link.href).not.toContain("SECRET");
  });

  it("offers an accessible password-visibility control without changing the password", async () => {
    await renderSignIn(async () => null);
    const toggle = container!.querySelector('button[aria-controls="ms-password"]') as HTMLButtonElement;
    expect(toggle.getAttribute("aria-label")).toBe("Show password");
    await act(async () => toggle.click());
    const input = container!.querySelector("#ms-password") as HTMLInputElement;
    expect(input.type).toBe("text");
    expect(input.value).toBe("correct-password");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    await act(async () => toggle.click());
    expect(input.type).toBe("password");
  });
});

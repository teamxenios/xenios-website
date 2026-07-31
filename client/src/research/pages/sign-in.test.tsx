// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const supa = vi.hoisted(() => {
  const state = { currentToken: "password-session-token" as string | null };
  const auth = {
    signInWithPassword: vi.fn(async () => {
      state.currentToken = "password-session-token";
      return {
        data: { session: { access_token: "password-session-token" } },
        error: null,
      };
    }),
    getSession: vi.fn(async () => ({
      data: { session: state.currentToken ? { access_token: state.currentToken } : null },
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
}));

import { ResearchContext, type MemberInfo, type ResearchContextValue } from "../core";
import SignIn from "./SignIn";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function context(establishMemberSession: (token: string) => Promise<MemberInfo | null>): ResearchContextValue {
  return {
    gate: "locked",
    member: null,
    memberToken: null,
    memberChecking: false,
    memberSessionStatus: "signed_out",
    recovery: "none",
    establishMemberSession,
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
) {
  window.history.replaceState(null, "", `/research/sign-in${search}`);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <ResearchContext.Provider value={context(establishMemberSession)}>
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

  it("routes an active member to the member website after deterministic verification", async () => {
    const establish = vi.fn(async () => ({
      firstName: "Avery",
      status: "active",
      applicationStatus: "active",
    }));
    await renderSignIn(establish);
    submit();
    await flush();
    expect(window.location.pathname).toBe("/research/member");
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
    expect(window.location.pathname).toBe("/research/member");
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

  it("explains that approval links are one-time account-claim links", async () => {
    await renderSignIn(vi.fn(async () => null));
    expect(container!.textContent).toContain(
      "Your approval link is only used once when you first create your account.",
    );
    expect(container!.textContent).toContain("Returning members do not need another approval email.");
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
    expect(support?.getAttribute("href")).toBe("mailto:research@xeniostechnology.com");
  });

  it("keeps the existing forgot-password route intact", async () => {
    await renderSignIn(async () => null);
    const link = container!.querySelector('[data-testid="link-forgot-password"]') as HTMLAnchorElement;
    expect(link?.getAttribute("href")).toBe("/research/reset-password");
  });
});

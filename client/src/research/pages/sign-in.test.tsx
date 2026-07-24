// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(async () => ({
    data: { session: { access_token: "password-session-token" } },
    error: null,
  })),
  signOut: vi.fn(async () => ({ error: null })),
}));

vi.mock("@/lib/supabaseBrowser", () => ({
  getSupabaseBrowser: async () => ({ auth }),
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

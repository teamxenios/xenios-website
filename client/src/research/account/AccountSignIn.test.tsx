// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { AccountContextDto } from "@shared/research/account-identity";
import AccountSignIn from "./AccountSignIn";
import { getAccountContext } from "./api";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

vi.mock("./api", () => ({ getAccountContext: vi.fn() }));
vi.mock("@/lib/supabaseBrowser", () => ({ getSupabaseBrowser: vi.fn() }));

function authenticatedContext(passwordChangeRequired = false): { kind: "ok"; data: AccountContextDto } {
  return {
    kind: "ok" as const,
    data: {
      auth: { userId: "auth-1", email: "buyer@example.com", emailVerified: true },
      personal: null,
      organizations: [{
        id: "e26bc7de-86df-4e70-8e82-964e3671d71c",
        slug: "roman-digital",
        legalName: "Roman Digital",
        displayName: "Roman Digital",
        status: "active" as const,
        roles: ["organization_owner" as const, "business_buyer" as const],
        passwordChangeRequired,
      }],
      security: { passwordChangeRequired, mfaAvailable: false, passkeyAvailable: false },
    },
  };
}

async function mountAndSubmit() {
  const memory = memoryLocation({ path: "/research/account/sign-in", record: true });
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(<Router hook={memory.hook}><AccountSignIn /></Router>));
  const email = container.querySelector("#account-email") as HTMLInputElement;
  const password = container.querySelector("#account-password") as HTMLInputElement;
  await act(async () => {
    const emailSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    emailSetter?.call(email, " Buyer@Example.com ");
    email.dispatchEvent(new Event("input", { bubbles: true }));
    const passwordSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    passwordSetter?.call(password, "not-stored-password");
    password.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const form = container.querySelector("form") as HTMLFormElement;
  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  return { container, memory, root };
}

afterEach(() => vi.clearAllMocks());

describe("Pack 02 account sign-in", () => {
  it("uses the existing Supabase password session and routes an organization buyer without creating auth", async () => {
    const signInWithPassword = vi.fn(async () => ({ data: { session: { access_token: "signed-session" } }, error: null }));
    const signOut = vi.fn();
    vi.mocked(getSupabaseBrowser).mockResolvedValue({ auth: { signInWithPassword, signOut } } as never);
    vi.mocked(getAccountContext).mockResolvedValue(authenticatedContext());
    const reactEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    const { memory, root } = await mountAndSubmit();
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "buyer@example.com", password: "not-stored-password" });
    // Never guess a role: even an organization-carrying identity lands on
    // the account home, which is the canonical workspace selector.
    expect(memory.history?.at(-1)).toBe("/research/account");
    expect(signOut).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    delete reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
  });

  it("enforces the existing initial-password-change flag before organization data opens", async () => {
    vi.mocked(getSupabaseBrowser).mockResolvedValue({
      auth: {
        signInWithPassword: vi.fn(async () => ({ data: { session: { access_token: "signed-session" } }, error: null })),
        signOut: vi.fn(),
      },
    } as never);
    vi.mocked(getAccountContext).mockResolvedValue(authenticatedContext(true));
    const reactEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    const { memory, root } = await mountAndSubmit();
    expect(memory.history?.at(-1)).toBe("/research/account/security/initial-password");
    await act(async () => root.unmount());
    delete reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
  });

  it("clears the local session when post-auth account verification fails", async () => {
    const signOut = vi.fn(async () => ({ error: null }));
    vi.mocked(getSupabaseBrowser).mockResolvedValue({
      auth: {
        signInWithPassword: vi.fn(async () => ({ data: { session: { access_token: "signed-session" } }, error: null })),
        signOut,
      },
    } as never);
    vi.mocked(getAccountContext).mockResolvedValue({ kind: "denied", code: "EMAIL_VERIFICATION_REQUIRED", message: "Verify your email." });
    const reactEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    const { container, root } = await mountAndSubmit();
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(container.textContent).toContain("Verify your email.");
    await act(async () => root.unmount());
    delete reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
  });
});

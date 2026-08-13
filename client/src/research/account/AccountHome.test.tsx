// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { AccountContextDto, OrganizationSummary } from "@shared/research/account-identity";
import AccountHome from "./AccountHome";
import { getAccountContext } from "./api";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

vi.mock("./api", () => ({ getAccountContext: vi.fn() }));
vi.mock("@/lib/supabaseBrowser", () => ({ getSupabaseBrowser: vi.fn() }));

const organization: OrganizationSummary = {
  id: "e26bc7de-86df-4e70-8e82-964e3671d71c",
  slug: "roman-digital",
  legalName: "Roman Digital",
  displayName: "Roman Digital",
  status: "active" as const,
  roles: ["organization_owner", "business_buyer"],
  passwordChangeRequired: false,
};

function context(personal: AccountContextDto["personal"]): AccountContextDto {
  return {
    auth: { userId: "user-1", email: "buyer@example.com", emailVerified: true },
    personal,
    organizations: [organization],
    security: { passwordChangeRequired: false, mfaAvailable: false, passkeyAvailable: false },
  };
}

afterEach(() => vi.clearAllMocks());

describe("Pack 02 account home", () => {
  it("composes the existing member catalog, cart, request, and order routes for a personal buyer", async () => {
    vi.mocked(getAccountContext).mockResolvedValue({
      kind: "ok",
      data: context({ memberId: "member-1", status: "active", firstName: "Buyer", lastName: "Example" }),
    });
    const reactEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    const memory = memoryLocation({ path: "/research/account", static: true });
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<Router hook={memory.hook}><AccountHome /></Router>));
    const hrefs = Array.from(container.querySelectorAll("a")).map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining([
      "/research/member/products",
      "/research/member/cart",
      "/research/member/product-requests",
      "/research/member/orders",
      `/research/account/organizations/${organization.id}`,
    ]));
    expect(container.textContent).toContain("authoritative pricing");
    await act(async () => root.unmount());
    delete reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
  });

  it("does not expose personal member commerce links to an organization-only identity", async () => {
    vi.mocked(getAccountContext).mockResolvedValue({ kind: "ok", data: context(null) });
    const reactEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    const memory = memoryLocation({ path: "/research/account", static: true });
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<Router hook={memory.hook}><AccountHome /></Router>));
    expect(container.querySelector('a[href="/research/member/products"]')).toBeNull();
    expect(container.querySelector(`a[href="/research/account/organizations/${organization.id}"]`)).not.toBeNull();
    await act(async () => root.unmount());
    delete reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
  });

  it("ends only the local Supabase session and returns to the same account sign-in", async () => {
    vi.mocked(getAccountContext).mockResolvedValue({ kind: "ok", data: context(null) });
    const signOut = vi.fn(async () => ({ error: null }));
    vi.mocked(getSupabaseBrowser).mockResolvedValue({ auth: { signOut } } as never);
    const reactEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    const memory = memoryLocation({ path: "/research/account", record: true });
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<Router hook={memory.hook}><AccountHome /></Router>));
    const button = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent === "Sign out");
    await act(async () => button?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(memory.history?.at(-1)).toBe("/research/account/sign-in");
    await act(async () => root.unmount());
    delete reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
  });
});

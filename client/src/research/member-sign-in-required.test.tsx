// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  gate: "locked" as "checking" | "unconfigured" | "locked" | "open",
  member: null as null | { firstName: string; status: string },
  memberChecking: false,
  memberToken: null,
  recovery: "none",
  submitPassword: vi.fn(),
  signOutMember: vi.fn(),
}));
vi.mock("./core", () => ({ useResearch: () => state }));
vi.mock("@/components/Wordmark", () => ({ default: () => <span>xenios</span> }));

import ResearchLayout from "./layout";

let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  document.body.replaceChildren();
  state.gate = "locked";
  state.member = null;
});

// The router hook drives the layout; window.location carries the query, as in
// the browser, because RequireMember and the handoff both read it from there.
function renderAt(url: string) {
  window.history.replaceState(null, "", url);
  const path = url.split("?", 1)[0];
  const location = memoryLocation({ path, record: true });
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(
    <Router hook={location.hook}>
      <ResearchLayout>
        <div data-testid="member-page-content">private member page</div>
      </ResearchLayout>
    </Router>,
  ));
  return { container, location };
}

function signInHref(container: HTMLElement): string | null {
  return container.querySelector('[data-testid="link-member-entry-sign-in"]')?.getAttribute("href") ?? null;
}

describe("signed-out member pages offer member sign in, not the reviewer password", () => {
  it.each([
    ["/research/member/products", "/research/member/products"],
    ["/research/member/documents", "/research/member/documents"],
    ["/research/member/guides/reading-a-coa", "/research/member/guides/reading-a-coa"],
    ["/research/member/orders/", "/research/member/orders"],
    ["/research/products", "/research/member/products"],
    ["/research/guides", "/research/member/guides"],
    ["/research/learn", "/research/member/guides"],
    ["/research/products/bpc-157-10mg", "/research/member/products/bpc-157-10mg"],
    ["/research/member/checkout?variant=v.fixture-1&qty=2&intent=buy_now&utm_source=x", "/research/member/checkout?variant=v.fixture-1&qty=2&intent=buy_now"],
  ])("%s keeps the page closed and hands off to sign in for %s", (url, returnTo) => {
    const { container } = renderAt(url);
    expect(container.querySelector('[data-testid="member-page-content"]')).toBeNull();
    expect(container.querySelector('[data-testid="form-research-access"]')).toBeNull();
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(container.querySelector('[data-testid="member-sign-in-required"]')).not.toBeNull();
    expect(signInHref(container)).toBe(`/research/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
    expect(container.textContent).toContain("Signing in brings you back here.");
    expect(container.textContent).not.toMatch(/ordering is not open/i);
  });

  it("uses plain sign in when the path has no safe return destination", () => {
    const { container } = renderAt("/research/member/welcome");
    expect(container.querySelector('[data-testid="member-page-content"]')).toBeNull();
    expect(signInHref(container)).toBe("/research/sign-in");
    expect(container.textContent).not.toContain("Signing in brings you back here.");
  });

  it("renders one main landmark, one h1 and the public way forward", () => {
    const { container } = renderAt("/research/products");
    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    const main = container.querySelector("main")!;
    expect(main.querySelector("h1")?.textContent).toBe("Sign in to open this member page.");
    expect(main.querySelector('[data-testid="member-sign-in-required"]')?.getAttribute("aria-labelledby")).toBe("member-sign-in-required-title");
    const hrefs = Array.from(main.querySelectorAll("a"), (anchor) => anchor.getAttribute("href"));
    expect(hrefs).toEqual([
      "/research/sign-in?returnTo=%2Fresearch%2Fmember%2Fproducts",
      "/research/order",
      "/research/support",
      "/research/apply",
      "/research/early-access",
    ]);
    // The public information chrome stays available: header, nav and footer.
    expect(container.querySelector('nav[aria-label="Research information"]')).not.toBeNull();
    expect(container.querySelector('nav[aria-label="Research public footer"]')).not.toBeNull();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, nofollow");
  });

  it("leads with the sign-in action in keyboard order", () => {
    const { container } = renderAt("/research/member/products");
    const main = container.querySelector("main")!;
    const focusable = Array.from(main.querySelectorAll<HTMLElement>("a[href], button, input, [tabindex]"));
    expect(focusable[0]?.getAttribute("data-testid")).toBe("link-member-entry-sign-in");
    expect(focusable.every((element) => element.tabIndex >= 0)).toBe(true);
  });
});

describe("what does not change", () => {
  it.each([
    "/research/partners/apply",
    "/research/partners/commissions",
    "/research/member/not-a-real-route",
    "/research/member/products/a/extra",
    "/research/products/a/extra",
    "/research/catalog",
    "/research/professionals",
  ])("%s keeps the shared review gate", (path) => {
    const { container } = renderAt(path);
    expect(container.querySelector('[data-testid="member-page-content"]')).toBeNull();
    expect(container.querySelector('[data-testid="member-sign-in-required"]')).toBeNull();
    expect(container.querySelector('[data-testid="form-research-access"]')).not.toBeNull();
  });

  it("referral destinations still mount their own member guard", () => {
    const { container } = renderAt("/research/member/catalog");
    expect(container.querySelector('[data-testid="member-page-content"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="member-sign-in-required"]')).toBeNull();
  });

  it("an open gate renders the member page as before", () => {
    state.gate = "open";
    state.member = { firstName: "Synthetic", status: "active" };
    const { container } = renderAt("/research/member/products");
    expect(container.querySelector('[data-testid="member-page-content"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="member-sign-in-required"]')).toBeNull();
  });

  it("a gate still being checked shows neither the page nor the handoff", () => {
    state.gate = "checking";
    const { container } = renderAt("/research/member/products");
    expect(container.querySelector('[data-testid="member-page-content"]')).toBeNull();
    expect(container.querySelector('[data-testid="member-sign-in-required"]')).toBeNull();
    expect(container.querySelector('[data-testid="form-research-access"]')).toBeNull();
  });

  it("an unconfigured deployment still says so", () => {
    state.gate = "unconfigured";
    const { container } = renderAt("/research/member/products");
    expect(container.querySelector('[data-testid="member-sign-in-required"]')).toBeNull();
    expect(container.textContent).toContain("This area is not available.");
  });
});

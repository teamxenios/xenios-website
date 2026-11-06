// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The shared review gate is LOCKED: a real customer arrives at /earlyaccess
// with no reviewer password, so the request-only page must render anyway.
vi.mock("./core", () => ({
  ResearchProvider: ({ children }: { children: ReactNode }) => children,
  useResearch: () => ({
    gate: "locked",
    member: null,
    memberChecking: false,
    submitPassword: vi.fn(async () => null),
    signOutMember: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/components/Wordmark", () => ({
  default: () => <span>xenios</span>,
}));

import ResearchSection from "./section";

/**
 * /earlyaccess IS THE REQUEST-ONLY ROUTE, NOT A COPY OF IT.
 *
 * The founder's login-free entry must mount the same component with the same
 * props as /research/early-access/order-request, through the real section
 * router, so every privacy, recovery and agreement behaviour stays the one the
 * legacy entry already has. A redirect would drop the customer's address; a
 * second implementation would drift.
 */

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function renderAt(path: string): Promise<HTMLDivElement> {
  window.history.replaceState(null, "", path);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<ResearchSection />);
  });
  // Lazy route chunks resolve over a few macrotasks in jsdom.
  for (
    let attempt = 0;
    attempt < 400 && !host.querySelector('[data-testid="quick-order-request-only"]')
      && !host.querySelector('[data-testid="form-research-access"]')
      && !host.textContent?.includes("That page is not part of the research section.");
    attempt += 1
  ) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
  return host;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllGlobals();
  document.head
    .querySelectorAll('meta[name="robots"], link[rel="canonical"], link[rel="alternate"]')
    .forEach((node) => node.remove());
});

describe("the login-free /earlyaccess entry", () => {
  // The founder named the short address "Early Access"; the legacy address
  // keeps its Quick Order name. Only the visible name and browser title differ.
  it.each([
    ["/research/early-access/order-request", "Quick Order"],
    ["/earlyaccess", "Early Access"],
    ["/earlyaccess/", "Early Access"],
    ["/EarlyAccess", "Early Access"],
    ["/earlyaccess?family=research_vials&slug=synthetic", "Early Access"],
  ])("%s mounts the request-only page while the review gate is locked", async (path, name) => {
    const view = await renderAt(path);

    expect(view.querySelector('[data-testid="quick-order-request-only"]'), path).not.toBeNull();
    expect(view.querySelector("h1")?.textContent, path).toBe(name);
    expect(document.title, path).toBe(`${name}, Xenios Health`);
    expect(view.querySelector('[data-testid="form-research-access"]'), path).toBeNull();
    expect(view.querySelector('input[type="password"]'), path).toBeNull();
    expect(view.textContent, path).not.toContain("That page is not part of the research section.");
    // The section asserts noindex for the whole Research tree.
    expect(
      document.head.querySelector('meta[name="robots"]')?.getAttribute("content"),
      path,
    ).toBe("noindex, nofollow");
    expect(document.head.querySelector('link[rel="canonical"]'), path).toBeNull();
    // The customer stays on the address they opened.
    expect(window.location.pathname, path).toBe(path.split("?", 1)[0]);
  }, 20_000);
});

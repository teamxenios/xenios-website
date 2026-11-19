// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({ gate: "locked" as "locked" | "open" }));

vi.mock("../core", () => ({
  ResearchProvider: ({ children }: { children: ReactNode }) => children,
  useResearch: () => ({
    gate: state.gate,
    member: null,
    memberChecking: false,
    submitPassword: vi.fn(async () => null),
    signOutMember: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/components/Wordmark", () => ({
  default: () => <span>xenios</span>,
}));

import ResearchSection from "../section";

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let fetchSpy: ReturnType<typeof vi.fn>;

async function renderAt(path: string) {
  window.history.replaceState(null, "", path);
  const location = memoryLocation({ path, record: true });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<Router hook={location.hook}><ResearchSection /></Router>);
  });
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(host!.textContent).not.toContain("Loading...");
  }, { timeout: 10_000 });
  return { view: host, location };
}

beforeEach(() => {
  state.gate = "locked";
  fetchSpy = vi.fn(async () => new Response(null, { status: 404 }));
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllGlobals();
  document.head.querySelectorAll('meta[name="robots"], link[rel="canonical"], link[rel="alternate"]').forEach((node) => node.remove());
});

describe("routed B2B protected composition", () => {
  it("resolves Quick Order support publicly while signed out and the shared gate is locked", async () => {
    const { view } = await renderAt("/research/support");
    expect(view.querySelector("h1")?.textContent).toBe("How to reach us");
    expect(view.querySelector('a[href="mailto:team@xeniostechnology.com"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="form-research-access"]')).toBeNull();
    expect(view.querySelector('input[type="password"]')).toBeNull();
    expect(view.textContent).not.toContain("That page is not part of the research section.");
    expect(view.textContent).not.toContain("Member sign in");
    expect(fetchSpy).not.toHaveBeenCalled();
  }, 15_000);

  it("renders the exact public partner root without firing referral capture", async () => {
    const { view } = await renderAt("/research/partners?ref=signed.code");
    expect(view.textContent).toContain("The right relationship starts with the right boundary.");
    expect(view.querySelector('[data-testid="form-research-access"]')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  }, 15_000);

  it("routes signed-out wholesale visitors to business enquiries while the gate stays locked", async () => {
    const { view, location } = await renderAt("/research/wholesale?ref=signed.code");
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(location.history).toEqual(["/research/wholesale?ref=signed.code", "/research/organizations"]);
      expect(view.querySelector("h1")?.textContent).toBe("Structured access for serious business relationships.");
    }, { timeout: 10_000 });
    expect(state.gate).toBe("locked");
    expect(view.textContent).toContain("Online business enquiries are not available in this session.");
    expect(view.querySelector("form")).toBeNull();
    expect(view.querySelector('a[href="/research/support"]')).not.toBeNull();
    expect(view.querySelector('a[href="/earlyaccess"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="form-research-access"]')).toBeNull();
    expect(view.querySelector('input[type="password"]')).toBeNull();
    // The connected destination reads readiness only; no referral capture,
    // enquiry submission or private identity lookup occurs during routing.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith("/api/research/business-inquiries/config", expect.objectContaining({ method: "GET", credentials: "same-origin", cache: "no-store" }));
  }, 15_000);

  it("keeps partner application and portal descendants behind the gate", async () => {
    const { view } = await renderAt("/research/partners/apply");
    expect(view.querySelector('[data-testid="form-research-access"]')).toBeTruthy();
    expect(view.textContent).not.toContain("The right relationship starts with the right boundary.");
  });

  it("renders an in-section not-found result for an open unknown B2B descendant", async () => {
    state.gate = "open";
    const { view } = await renderAt("/research/organizations/private");
    expect(view.textContent).toContain("That page is not part of the research section.");
    expect(view.querySelectorAll("h1")).toHaveLength(1);
  });
});

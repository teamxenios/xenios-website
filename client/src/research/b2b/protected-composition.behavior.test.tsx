// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

async function renderAt(path: string): Promise<HTMLDivElement> {
  window.history.replaceState(null, "", path);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<ResearchSection />);
  });
  for (let attempt = 0; attempt < 100 && host.textContent?.includes("Loading..."); attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
  return host;
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
  it("renders the exact public partner root without firing referral capture", async () => {
    const view = await renderAt("/research/partners?ref=signed.code");
    expect(view.textContent).toContain("The right relationship starts with the right boundary.");
    expect(view.querySelector('[data-testid="form-research-access"]')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps partner application and portal descendants behind the gate", async () => {
    const view = await renderAt("/research/partners/apply");
    expect(view.querySelector('[data-testid="form-research-access"]')).toBeTruthy();
    expect(view.textContent).not.toContain("The right relationship starts with the right boundary.");
  });

  it("renders an in-section not-found result for an open unknown B2B descendant", async () => {
    state.gate = "open";
    const view = await renderAt("/research/organizations/private");
    expect(view.textContent).toContain("That page is not part of the research section.");
    expect(view.querySelectorAll("h1")).toHaveLength(1);
  });
});

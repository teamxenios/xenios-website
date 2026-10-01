// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResearchContextValue } from "./research/core";

const synthetic = vi.hoisted(() => {
  let releaseHub!: () => void;
  const hubReady = new Promise<void>((resolve) => { releaseHub = resolve; });
  return {
    gate: "locked" as "locked" | "checking" | "unconfigured",
    hubRequested: false,
    hubReady,
    releaseHub,
  };
});

// Replace only the network-backed provider with an explicitly signed-out
// context. The real useResearch, App, Wouter, section, layout, public chrome
// and AccessHub all remain mounted. This is not a Supabase/Auth proof.
vi.mock("./research/core", async (importOriginal) => {
  const original = await importOriginal<typeof import("./research/core")>();
  return {
    ...original,
    ResearchProvider: ({ children }: { children: ReactNode }) => {
      const value: ResearchContextValue = {
        gate: synthetic.gate,
        member: null,
        memberToken: null,
        memberChecking: false,
        memberSessionStatus: "signed_out",
        recovery: "none",
        clearRecovery: () => {},
        memberDenial: null,
        peekMemberDenial: () => null,
        establishMemberSession: async () => null,
        refreshMember: async () => {},
        signOutMember: async () => {},
        signOutRecoverySession: async () => {},
        products: [],
        bySlug: new Map(),
        commerce: { research: false, consumer: false },
        email: "",
        submitPassword: async () => "Synthetic refusal",
        logout: async () => {},
        items: [],
        addItem: () => {},
        removeItem: () => {},
        setQuantity: () => {},
        clearLane: () => {},
        count: 0,
        laneItems: () => [],
      };
      return <original.ResearchContext.Provider value={value}>{children}</original.ResearchContext.Provider>;
    },
  };
});

// Delay the actual module, not a replacement component. The first case proves
// that a fragment target can arrive AFTER the outer App's initial animation
// frame. Later cases exercise the same actual component with a warm chunk.
vi.mock("./research/pages/AccessHub", async (importOriginal) => {
  synthetic.hubRequested = true;
  await synthetic.hubReady;
  return importOriginal<typeof import("./research/pages/AccessHub")>();
});

import App from "./App";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HUB_PATH = "/research/access-hub";
const HUB_HEADING = "Choose the path that matches what you need.";
const initialHead = document.head.innerHTML;
let root: Root;
let host: HTMLDivElement;
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
let scrollIntoView: ReturnType<typeof vi.fn>;
let originalScrollIntoView: PropertyDescriptor | undefined;
let fetcher: ReturnType<typeof vi.fn>;

beforeEach(() => {
  synthetic.gate = "locked";
  frames = new Map();
  nextFrame = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = ++nextFrame;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { frames.delete(id); });
  vi.stubGlobal("scrollTo", vi.fn());
  originalScrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
  scrollIntoView = vi.fn();
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
  fetcher = vi.fn(async () => { throw new Error("Unexpected network request in mounted route proof"); });
  vi.stubGlobal("fetch", fetcher);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  // Also release after a failing old-runtime redirect assertion, so an
  // intentionally red reproduction never strands the subsequent cases.
  synthetic.releaseHub();
  await act(async () => { root.unmount(); });
  host.remove();
  frames.clear();
  if (originalScrollIntoView) Object.defineProperty(Element.prototype, "scrollIntoView", originalScrollIntoView);
  else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
  window.sessionStorage.clear();
  window.localStorage.clear();
  document.head.innerHTML = initialHead;
});

async function mountAt(path: string) {
  window.history.replaceState(null, "", path);
  await act(async () => { root.render(<App />); });
}

async function eventually(assertion: () => void) {
  await vi.waitFor(async () => {
    await act(async () => {});
    assertion();
  }, { timeout: 3000, interval: 15 });
}

async function flushFrames() {
  const pending = [...frames.values()];
  frames.clear();
  await act(async () => { for (const callback of pending) callback(0); });
}

function hubTarget(): HTMLElement {
  expect(window.location.pathname).toBe(HUB_PATH);
  expect(host.querySelectorAll("h1")).toHaveLength(1);
  expect(host.querySelector("h1")?.textContent).toBe(HUB_HEADING);
  const target = host.querySelector<HTMLElement>("#account-access");
  expect(target).not.toBeNull();
  return target!;
}

describe("HL-17: the actual App routes into the existing Research access hub", () => {
  // Keep this first: the explicit deferred module is cold exactly once.
  it("reaches and focuses a cold lazy hub fragment after the initial outer-router frame has elapsed", async () => {
    await mountAt(`${HUB_PATH}#account-access`);
    await eventually(() => {
      expect(synthetic.hubRequested || window.location.pathname === "/").toBe(true);
    });
    expect(window.location.pathname).toBe(HUB_PATH);
    expect(synthetic.hubRequested).toBe(true);
    expect(host.querySelector("#account-access")).toBeNull();
    expect(frames.size).toBeGreaterThan(0);
    await flushFrames();
    synthetic.releaseHub();
    await eventually(() => { hubTarget(); });
    await flushFrames();
    const target = hubTarget();
    expect(window.location.hash).toBe("#account-access");
    expect(document.activeElement).toBe(target);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(target.getAttribute("tabindex")).toBe("-1");
    const nextLink = target.querySelector<HTMLAnchorElement>('a[href="/sign-in"]')!;
    nextLink.focus();
    expect(target.hasAttribute("tabindex")).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["locked", "checking", "unconfigured"] as const)(
    "keeps the public hub readable with a signed-out %s Research context, without granting access",
    async (gate) => {
      synthetic.gate = gate;
      await mountAt(HUB_PATH);
      await eventually(() => { hubTarget(); });
      const target = hubTarget();
      for (const href of ["/sign-in", "/activate", "/products", "/care/schedule", "/partners", "/practices", "/suppliers#inquiry"]) {
        expect(target.querySelector(`a[href="${href}"]`), href).not.toBeNull();
      }
      expect(host.querySelector('input[type="password"]')).toBeNull();
      expect(host.textContent).toContain("Each workspace requires its own server authority.");
      expect(host.querySelector('a[href="/research/order"]')).not.toBeNull();
      expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, nofollow");
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("follows the real Research editorial navigation from another mounted Research page", async () => {
    await mountAt("/research/policies");
    await eventually(() => {
      expect(host.querySelector("h1")?.textContent).toBe("Read the document and its status.");
    });
    const link = host.querySelector<HTMLAnchorElement>('nav[aria-label="Research information"] a[href="/research/access-hub"]');
    expect(link?.textContent).toBe("Research");
    await act(async () => { link!.click(); });
    await eventually(() => { hubTarget(); });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("focuses the existing account chooser on same-path Wouter hash navigation, then releases temporary tabindex", async () => {
    await mountAt(HUB_PATH);
    await eventually(() => { hubTarget(); });
    await flushFrames();
    scrollIntoView.mockClear();
    await act(async () => { window.history.pushState(null, "", `${HUB_PATH}#account-access`); });
    await flushFrames();
    const target = hubTarget();
    expect(document.activeElement).toBe(target);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    target.querySelector<HTMLAnchorElement>("a")!.focus();
    expect(target.hasAttribute("tabindex")).toBe(false);
  });

  it("does not steal focus after navigating away while fragment focus is queued", async () => {
    await mountAt(HUB_PATH);
    await eventually(() => { hubTarget(); });
    await act(async () => { window.history.pushState(null, "", `${HUB_PATH}#account-access`); });
    await act(async () => { window.history.pushState(null, "", "/research/policies"); });
    await eventually(() => { expect(host.querySelector("h1")?.textContent).toBe("Read the document and its status."); });
    scrollIntoView.mockClear();
    await flushFrames();
    expect(host.querySelector("#account-access")).toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("cancels the hub's own initial-fragment frame when the warm page unmounts before it runs", async () => {
    await mountAt(`${HUB_PATH}#account-access`);
    await eventually(() => { hubTarget(); });
    const detachedTarget = hubTarget();
    expect(frames.size).toBeGreaterThan(0);
    expect(detachedTarget.hasAttribute("tabindex")).toBe(false);
    // Do not flush: both the outer fragment frame and the page-local mount
    // frame must still be pending when the real router unmounts the hub.
    await act(async () => { window.history.pushState(null, "", "/research/policies"); });
    await eventually(() => { expect(host.querySelector("h1")?.textContent).toBe("Read the document and its status."); });
    const destinationLink = host.querySelector<HTMLAnchorElement>('nav[aria-label="Research information"] a[href="/research/access-hub"]')!;
    destinationLink.focus();
    scrollIntoView.mockClear();
    await flushFrames();
    expect(detachedTarget.isConnected).toBe(false);
    expect(detachedTarget.hasAttribute("tabindex")).toBe(false);
    expect(document.activeElement).toBe(destinationLink);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it.each(["/", "/health"])("preserves the real root page reached from %s", async (path) => {
    await mountAt(path);
    await eventually(() => {
      expect(window.location.pathname).toBe("/");
      expect(host.querySelector("h1")?.textContent).toBe("Care and research products, clearly separated.");
    });
    expect(host.textContent).not.toContain(HUB_HEADING);
  });

  it.each([
    ["/research/partners", "/partners"],
    ["/research/quality", "/quality"],
  ])("preserves the unrelated exact legacy alias %s", async (from, to) => {
    await mountAt(from);
    await eventually(() => {
      expect(window.location.pathname).toBe(to);
      expect(host.querySelectorAll("h1")).toHaveLength(1);
    });
    expect(host.textContent).not.toContain(HUB_HEADING);
  });

  it.each(["/research/member", "/research/access-hub-extra"])(
    "does not broaden the public hub exception to %s",
    async (path) => {
      await mountAt(path);
      await eventually(() => { expect(host.querySelector('[data-testid="form-research-access"]')).not.toBeNull(); });
      expect(window.location.pathname).toBe(path);
      expect(host.textContent).not.toContain(HUB_HEADING);
    },
  );
});

// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Support from "./Support";

const mailto = "mailto:team@xeniostechnology.com?subject=Partner%20support";
const topicLinks = [
  ["Onboarding status", "/research/partners/onboarding"],
  ["Compliance rules", "/research/partners/compliance"],
  ["Commission ledger", "/research/partners/commissions"],
  ["Security basics", "/research/partners/security"],
] as const;
const accountLinks = [["My account", "/research/account"], ["Sign in", "/research/sign-in"]] as const;

let root: Root;
let host: HTMLDivElement;
let blockedEffects: unknown[];
let originalBeacon: PropertyDescriptor | undefined;
const render = () => act(async () => root.render(<Support />));
const text = (element: Element = host) => (element.textContent ?? "").replace(/\s+/g, " ").trim();
const link = (label: string) => Array.from(host.querySelectorAll("a")).find((anchor) => text(anchor) === label)!;
const noEffects = () => { for (const effect of blockedEffects) expect(effect).not.toHaveBeenCalled(); };
const noCollection = () => {
  expect(host.querySelector("form,input,textarea,select,button,[contenteditable='true']")).toBeNull();
  expect(host.querySelector("iframe,script,img[src],video,audio,source,object,embed")).toBeNull();
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState(null, "", "/research/partners/support");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const forbidden = () => { throw new Error("Unexpected side effect from synthetic static Support render"); };
  const fetcher = vi.fn(forbidden);
  const beacon = vi.fn(forbidden);
  vi.stubGlobal("fetch", fetcher);
  originalBeacon = Object.getOwnPropertyDescriptor(navigator, "sendBeacon");
  Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: beacon });
  blockedEffects = [
    fetcher, beacon,
    vi.spyOn(XMLHttpRequest.prototype, "open").mockImplementation(forbidden),
    vi.spyOn(window, "open").mockImplementation(forbidden),
    vi.spyOn(window, "postMessage").mockImplementation(forbidden),
    vi.spyOn(Storage.prototype, "getItem"),
    vi.spyOn(Storage.prototype, "setItem"),
    vi.spyOn(Storage.prototype, "removeItem"),
    vi.spyOn(Storage.prototype, "clear"),
  ];
});

afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  vi.unstubAllGlobals(); vi.restoreAllMocks();
  if (originalBeacon) Object.defineProperty(navigator, "sendBeacon", originalBeacon);
  else Reflect.deleteProperty(navigator, "sendBeacon");
  window.history.replaceState(null, "", "/");
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("static partner support guidance and canonical navigation", () => {
  it("renders the real page and shell with no account read, collection form, network, storage, or communication", async () => {
    await render();
    expect(host.querySelector("h1")?.textContent).toBe("Support");
    expect(host.querySelector('nav[aria-label="Partner areas"]')).not.toBeNull();
    expect(host.querySelector('nav[aria-label="Account help"]')).not.toBeNull();
    noCollection(); noEffects();
  });

  it("offers exactly one fixed mailto recipient and subject, with no body, account email, or draft query", async () => {
    await render();
    const emails = host.querySelectorAll<HTMLAnchorElement>('a[href^="mailto:"]');
    expect(emails).toHaveLength(1);
    expect(emails[0].getAttribute("href")).toBe(mailto);
    expect(text(emails[0])).toBe("Email team@xeniostechnology.com");
    expect(Array.from(new URL(emails[0].href).searchParams.entries())).toEqual([["subject", "Partner support"]]);
    expect(text()).not.toContain("research@xeniostechnology.com");
    expect(host.querySelector("a[ping],a[download]")).toBeNull();
    // Deliberately do not activate mailto: opening an external email handler is outside this test.
    noEffects();
  });

  it.each([...accountLinks, ...topicLinks])("preserves the exact %s destination without embedded private query state", async (label, href) => {
    await render();
    expect(link(label)?.getAttribute("href")).toBe(href);
    expect(link(label).search).toBe(""); expect(link(label).hash).toBe("");
    noEffects();
  });

  it("offers only local research navigation plus the one user-controlled email handoff", async () => {
    await render();
    for (const anchor of host.querySelectorAll<HTMLAnchorElement>("a")) {
      const href = anchor.getAttribute("href")!;
      expect(href === mailto || /^\/research(?:\/[a-z-]+)*$/.test(href)).toBe(true);
    }
    noEffects();
  });

  it.each([...accountLinks, ...topicLinks])("clicking %s performs local navigation only in this isolated Support render", async (label, href) => {
    await render();
    await act(async () => link(label).click());
    expect(window.location.pathname).toBe(href);
    expect(window.location.search).toBe(""); expect(window.location.hash).toBe("");
    noCollection(); noEffects();
    // Destination pages and their authorization checks are not mounted or tested here.
  });

  it("states that navigation grants no account, partner, organization, product, or payout permission", async () => {
    await render();
    expect(text()).toContain("Use your ordinary Xenios sign-in");
    expect(text()).toContain("These links do not approve an account or grant partner, organization, product, or payout access");
    expect(text()).toContain("each destination verifies its own access requirements");
    noEffects();
  });
});

describe("truthful email handoff and sanitized support checklist", () => {
  it("describes an email-app handoff requiring the user's separate review and send action", async () => {
    await render();
    const contact = text(host.querySelector('section[aria-labelledby="ps-contact"]')!);
    expect(contact).toContain("asks your device to open an email app");
    expect(contact).toContain("Review and send your message there if you choose");
    expect(contact).toContain("If no email app opens, copy the address into your usual email service");
    noEffects();
  });

  it("does not claim submission, a ticket, receipt, delivery, a reply, or a response-time commitment", async () => {
    await render();
    expect(text()).toContain("not a support inbox or ticket status");
    expect(text()).toContain("Opening this link does not send a message or create a support ticket");
    expect(text()).toContain("cannot confirm receipt, delivery, a reply, or a response time");
    expect(text()).toContain("Nothing is submitted by this page");
    expect(text()).not.toMatch(/Every message is read|a person reads every message|you will get a real answer|we(?:'|’)ll (?:reply|respond)|within \d+ (?:hours|days)/i);
    expect(host.querySelector('[role="status"],[role="alert"]')).toBeNull();
    noEffects();
  });

  it("asks for a brief issue, expected versus actual behavior, and sanitized references instead of account-email collection", async () => {
    await render();
    const checklist = host.querySelector('section[aria-labelledby="ps-checklist"]')!;
    expect(checklist.querySelectorAll("li")).toHaveLength(4);
    expect(text(checklist)).toContain("Briefly name the topic and the page you were using, what you expected, and what happened instead");
    expect(text(checklist)).toContain("an approximate time and a non-sensitive reference if useful");
    expect(text(checklist)).toContain("Describe the page by name rather than copying a full URL or sign-in link");
    expect(text(checklist)).toContain("Remove other people's information, secret values, and private account details from screenshots or copied error text");
    expect(text(checklist)).toContain("If you cannot safely remove them, describe the issue without attaching them");
    expect(text()).not.toMatch(/Include your partner email|Write from the email on your partner account/i);
    noCollection(); noEffects();
  });

  it.each(["passwords", "sign-in codes", "password-reset links", "access tokens", "customer health information", "bank details", "payout credentials"])("explicitly excludes %s from emailed support material", async (excluded) => {
    await render();
    const warning = Array.from(host.querySelectorAll('section[aria-labelledby="ps-checklist"] li')).find((item) => text(item).startsWith("Do not email"));
    expect(warning).toBeDefined(); expect(text(warning!)).toContain(excluded);
    noEffects();
  });

  it("routes suspicious-message concerns to the static address without forwarding secrets or following message links", async () => {
    await render();
    const notice = text(host.querySelector('[data-testid="ra-secure-notice"]')!);
    expect(notice).toContain("do not reply or follow its links");
    expect(notice).toContain("Contact the team using the address above");
    expect(notice).toContain("without forwarding secret values, account-access links, or private customer information");
    expect(notice).not.toMatch(/forward it to|forward the message|forward suspicious/i);
    noEffects();
  });
});

describe("static rendering without reading synthetic account or logout markers", () => {
  it("remains identical across ordinary rerenders", async () => {
    await render(); const initial = host.innerHTML;
    await render(); await render();
    expect(host.innerHTML).toBe(initial); noCollection(); noEffects();
  });

  it("does not consume or embed synthetic history state, query secrets, or account/logout markers", async () => {
    await render(); const initial = host.innerHTML;
    // These are inert history fixtures, not actual Auth sessions or proof of an Auth account switch.
    for (const marker of ["account-a", "account-b", "logout", "checking", "refreshed-token"]) {
      const state = { marker, email: `PRIVATE-${marker}@fixture.invalid`, token: `PRIVATE-${marker}-not-a-token`, draft: `PRIVATE-${marker}-draft` };
      await act(async () => {
        window.history.replaceState(state, "", `/research/partners/support?email=${encodeURIComponent(state.email)}&token=${state.token}#${state.draft}`);
        window.dispatchEvent(new PopStateEvent("popstate", { state }));
        root.render(<Support />);
      });
      expect(host.innerHTML).toBe(initial);
      expect(host.innerHTML).not.toContain("PRIVATE-");
      expect(host.querySelector('a[href^="mailto:"]')?.getAttribute("href")).toBe(mailto);
      for (const [label, href] of [...accountLinks, ...topicLinks]) expect(link(label).getAttribute("href")).toBe(href);
      noCollection(); noEffects();
    }
  });

  it("survives StrictMode replay, removal, and remount with no reads or automatic communication", async () => {
    await act(async () => root.render(<StrictMode><Support /></StrictMode>));
    const initial = host.innerHTML;
    await act(async () => root.render(null));
    expect(host.textContent).toBe(""); noEffects();
    await act(async () => root.render(<StrictMode><Support /></StrictMode>));
    expect(host.innerHTML).toBe(initial); noCollection(); noEffects();
  });
});

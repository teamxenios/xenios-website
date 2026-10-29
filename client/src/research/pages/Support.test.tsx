// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/SeoHead", () => ({ default: () => null }));
vi.mock("../ui/shells", () => ({
  ResearchPublicShell: ({ title, lead, children }: {
    title: string;
    lead: string;
    children: ReactNode;
  }) => <><h1>{title}</h1><p>{lead}</p>{children}</>,
}));

import Support from "./Support";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.spyOn(window, "open").mockReturnValue(null);
  vi.spyOn(XMLHttpRequest.prototype, "send").mockImplementation(() => {});
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function renderPage(): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(<Support />); });
  return container;
}

describe("Support catalog and ordering help", () => {
  it("renders the approved text contact in a labeled card with wrapping hooks and truthful boundaries", async () => {
    const view = await renderPage();
    const card = view.querySelector('section[aria-labelledby="ra-support-ordering"]');
    expect(card).not.toBeNull();
    expect(card?.querySelector("h2")?.textContent).toBe("Catalog and ordering help");
    const sms = card!.querySelector<HTMLAnchorElement>("a");
    expect(sms?.getAttribute("href")).toBe("sms:+17374186381");
    expect(sms?.textContent?.trim()).toBe("Text 737-418-6381");
    expect(view.querySelectorAll('a[href^="sms:"]')).toHaveLength(1);
    expect(sms?.getAttribute("tabindex")).not.toBe("-1");
    expect(sms?.classList.contains("public-editorial-action")).toBe(true);
    expect(sms?.parentElement?.classList.contains("public-editorial-actions")).toBe(true);
    expect(card?.textContent).toContain("Texting does not submit a request or place an order.");
    expect(card?.textContent).toContain("Do not send medical or payment details by text.");
    expect(card?.textContent).toContain("Texting does not confirm product availability or order approval.");
    expect(card?.textContent).toContain("No response time is promised.");
    expect(card?.querySelector("form, input, textarea")).toBeNull();
  });

  it("preserves email, secure account help, and the Care boundary", async () => {
    const view = await renderPage();
    const links = [...view.querySelectorAll<HTMLAnchorElement>("a")];
    expect(links.find((link) => link.textContent?.trim() === "Email research@xeniostechnology.com")
      ?.getAttribute("href")).toBe("mailto:research@xeniostechnology.com");
    expect(links.find((link) => link.textContent?.trim() === "Application status")
      ?.getAttribute("href")).toBe("/research/application-status");
    expect(links.find((link) => link.textContent?.trim() === "Reset password")
      ?.getAttribute("href")).toBe("/research/reset-password");
    expect(links.find((link) => link.textContent?.trim() === "Open Care")
      ?.getAttribute("href")).toBe("/care");
    const notice = view.querySelector('[data-testid="ra-secure-notice"]')?.textContent;
    expect(notice).toContain("Support will never ask you for your password.");
    expect(notice).toContain("Account help always goes through the secure links we email you.");
    expect(view.textContent).toContain("Research Support does not make clinical decisions.");
    expect(view.textContent).toContain("Use the provider-governed Care path for those questions.");
  });

  it("uses a passive SMS link without network, popup, or storage effects", async () => {
    const initialLocation = window.location.href;
    const expectNoSideEffects = () => {
      expect(fetch).not.toHaveBeenCalled();
      expect(XMLHttpRequest.prototype.send).not.toHaveBeenCalled();
      expect(window.open).not.toHaveBeenCalled();
      expect(Storage.prototype.setItem).not.toHaveBeenCalled();
      expect(window.location.href).toBe(initialLocation);
    };
    const view = await renderPage();
    expectNoSideEffects();
    const sms = view.querySelector<HTMLAnchorElement>('a[href="sms:+17374186381"]')!;
    // Cancel native navigation; exercise React handlers without an SMS app.
    sms.addEventListener("click", (event) => event.preventDefault(), { once: true });
    const activation = new MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => { sms.dispatchEvent(activation); });
    expect(activation.defaultPrevented).toBe(true);
    expectNoSideEffects();
  });
});

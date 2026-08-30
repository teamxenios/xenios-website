// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const CALENDLY_URL = "https://calendly.com/xenios/product-walkthrough";
const CALENDLY_SRC = "https://assets.calendly.com/assets/external/widget.js";

vi.mock("@/components/PageShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/SeoHead", () => ({ default: () => null }));
vi.mock("@/lib/config", () => ({
  getConfig: vi.fn(async () => ({ calendlyUrl: CALENDLY_URL })),
}));
vi.mock("@/lib/calendly-events", () => ({
  isTrustedCalendlyScheduledMessage: vi.fn(() => false),
}));
vi.mock("@/lib/tracking", () => ({ trackSchedule: vi.fn() }));

import Book from "./Book";
import { isTrustedCalendlyScheduledMessage } from "@/lib/calendly-events";
import { getConfig } from "@/lib/config";
import { trackSchedule } from "@/lib/tracking";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  document.querySelectorAll(`script[src="${CALENDLY_SRC}"]`).forEach((script) => script.remove());
  delete (window as any).Calendly;
  host?.remove();
  root = null;
  host = null;
});

async function renderBook(): Promise<HTMLDivElement> {
  await act(async () => {
    root!.render(<Book />);
    await Promise.resolve();
  });
  return host!;
}

describe("Book third-party scheduling boundary", () => {
  it("does not load Calendly or render its embed on passive page load", async () => {
    const view = await renderBook();

    expect(document.querySelector(`script[src="${CALENDLY_SRC}"]`)).toBeNull();
    expect(view.querySelector('[data-testid="embed-calendly"]')).toBeNull();
    expect(view.querySelector('[data-testid="button-load-calendly"]')).not.toBeNull();
    const direct = view.querySelector<HTMLAnchorElement>('[data-testid="link-open-calendly"]');
    expect(direct?.href).toBe(CALENDLY_URL);
    expect(direct?.target).toBe("_blank");
    expect(direct?.rel).toBe("noopener noreferrer");
  });

  it("loads the embed script only after an explicit user click", async () => {
    const view = await renderBook();
    const load = view.querySelector<HTMLButtonElement>('[data-testid="button-load-calendly"]');
    expect(load).not.toBeNull();

    act(() => load!.click());

    expect(document.querySelector(`script[src="${CALENDLY_SRC}"]`)).not.toBeNull();
    expect(view.querySelector('[data-testid="embed-calendly"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="calendar-consent-boundary"]')).toBeNull();
    const pendingDirect = view.querySelector<HTMLAnchorElement>(
      '[data-testid="link-open-calendly-loading"]',
    );
    expect(pendingDirect?.href).toBe(CALENDLY_URL);
    expect(pendingDirect?.target).toBe("_blank");
    expect(pendingDirect?.rel).toBe("noopener noreferrer");
  });

  it("explicitly initializes a remounted host while reusing one widget script", async () => {
    const initInlineWidget = vi.fn();
    let view = await renderBook();
    act(() => {
      view.querySelector<HTMLButtonElement>('[data-testid="button-load-calendly"]')!.click();
    });
    const script = document.querySelector<HTMLScriptElement>(`script[src="${CALENDLY_SRC}"]`)!;
    const firstHost = view.querySelector<HTMLElement>('[data-testid="embed-calendly"]')!;
    (window as any).Calendly = { initInlineWidget };
    await act(async () => {
      script.dispatchEvent(new Event("load"));
      await Promise.resolve();
    });
    expect(initInlineWidget).toHaveBeenLastCalledWith({
      url: CALENDLY_URL,
      parentElement: firstHost,
    });
    expect(view.querySelector('[data-testid="calendar-loading"]')).toBeNull();

    act(() => root!.unmount());
    root = createRoot(host!);
    view = await renderBook();
    await act(async () => {
      view.querySelector<HTMLButtonElement>('[data-testid="button-load-calendly"]')!.click();
      await Promise.resolve();
    });

    expect(document.querySelectorAll(`script[src="${CALENDLY_SRC}"]`)).toHaveLength(1);
    const remountedHost = view.querySelector<HTMLElement>('[data-testid="embed-calendly"]')!;
    expect(remountedHost).not.toBe(firstHost);
    expect(initInlineWidget).toHaveBeenLastCalledWith({
      url: CALENDLY_URL,
      parentElement: remountedHost,
    });
    expect(initInlineWidget).toHaveBeenCalledTimes(2);
  });

  it("shows retry and direct-link fallbacks when the widget script fails", async () => {
    const view = await renderBook();
    act(() => {
      view.querySelector<HTMLButtonElement>('[data-testid="button-load-calendly"]')!.click();
    });
    const script = document.querySelector<HTMLScriptElement>(`script[src="${CALENDLY_SRC}"]`)!;
    await act(async () => {
      script.dispatchEvent(new Event("error"));
      await Promise.resolve();
    });

    expect(script.isConnected).toBe(false);
    expect(view.querySelector('[data-testid="calendar-load-error"]')).not.toBeNull();
    const direct = view.querySelector<HTMLAnchorElement>('[data-testid="link-open-calendly-error"]');
    expect(direct?.href).toBe(CALENDLY_URL);
    expect(direct?.target).toBe("_blank");
    expect(direct?.rel).toBe("noopener noreferrer");

    act(() => {
      view.querySelector<HTMLButtonElement>('[data-testid="button-retry-calendly"]')!.click();
    });
    expect(view.querySelector('[data-testid="calendar-consent-boundary"]')).not.toBeNull();
  });

  it.each([
    "",
    "not a URL",
    "http://calendly.com/insecure",
    "https://example.com/not-calendly",
    "https://calendly.com.evil.test/lookalike",
  ])(
    "fails closed for an unusable scheduling URL: %s",
    async (calendlyUrl) => {
      vi.mocked(getConfig).mockResolvedValueOnce({ calendlyUrl } as any);
      const view = await renderBook();

      expect(view.querySelector('[data-testid="calendar-consent-boundary"]')).toBeNull();
      expect(view.querySelector('[data-testid="embed-calendly"]')).toBeNull();
      expect(document.querySelector(`script[src="${CALENDLY_SRC}"]`)).toBeNull();
      expect(view.querySelector('[data-testid="link-contact-email"]')).not.toBeNull();
    },
  );

  it("records a booking only after a trusted scheduler message", async () => {
    vi.mocked(isTrustedCalendlyScheduledMessage).mockReturnValueOnce(true);
    const view = await renderBook();
    act(() => {
      view.querySelector<HTMLButtonElement>('[data-testid="button-load-calendly"]')!.click();
    });

    act(() => window.dispatchEvent(new MessageEvent("message", {
      origin: "https://calendly.com",
      data: { event: "calendly.event_scheduled" },
    })));

    expect(trackSchedule).toHaveBeenCalledOnce();
    expect(view.querySelector('[data-testid="text-booking-confirmed"]')?.textContent)
      .toBe("Your call is booked.");
  });

  it("ignores an untrusted scheduler message", async () => {
    const view = await renderBook();
    act(() => {
      view.querySelector<HTMLButtonElement>('[data-testid="button-load-calendly"]')!.click();
    });
    act(() => window.dispatchEvent(new MessageEvent("message", {
      origin: "https://calendly.com.evil.test",
      data: { event: "calendly.event_scheduled" },
    })));

    expect(trackSchedule).not.toHaveBeenCalled();
    expect(view.querySelector('[data-testid="text-booking-confirmed"]')).toBeNull();
  });
});

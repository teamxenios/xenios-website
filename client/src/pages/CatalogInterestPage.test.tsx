// @vitest-environment jsdom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/PageShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/SeoHead", () => ({ default: () => null }));
vi.mock("@/components/Turnstile", () => ({
  default: ({ onToken }: { onToken: (token: string) => void }) => (
    <button type="button" data-testid="turnstile-mock" onClick={() => onToken("fresh-token")}>verify</button>
  ),
}));

import CatalogInterestPage, { QUICK_ORDER_URL } from "./CatalogInterestPage";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  sessionStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderPage() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<CatalogInterestPage />));
  return container;
}

function setEmail(value: string) {
  const input = document.getElementById("catalog-interest-email") as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  if (!setter) throw new Error("input value setter unavailable");
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit(view: HTMLElement) {
  await act(async () => {
    view.querySelector("form")!.dispatchEvent(new Event("submit", {
      bubbles: true,
      cancelable: true,
    }));
  });
}

function successfulResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      receipt: "XHC-ABCDEF123456",
      status: "queued",
      catalogRevision: "catalog-2026-10",
      replayed: false,
    }),
  } as Response;
}

function errorResponse(
  status: number,
  code: "verification_failed" | "too_many_requests" | "temporarily_unavailable",
  message: string,
) {
  return {
    ok: false,
    status,
    json: async () => ({ ok: false, code, message }),
  } as Response;
}

describe("CatalogInterestPage", () => {
  it("keeps optional marketing unchecked and Quick Order login-free and separate", () => {
    vi.stubGlobal("fetch", vi.fn());
    const view = renderPage();
    const marketing = document.getElementById("catalog-interest-marketing") as HTMLInputElement;
    const quickOrder = Array.from(view.querySelectorAll("a"))
      .find((element) => element.textContent?.includes("Open Quick Order"));

    expect(marketing.checked).toBe(false);
    expect(view.querySelector("h1")?.textContent).toBe("Request the catalog and pricing.");
    expect(view.textContent).toContain("not required to receive the catalog");
    expect(view.querySelector("textarea")).toBeNull();
    expect(view.textContent).toContain("Do not enter medical information");
    expect(quickOrder?.getAttribute("href")).toBe(QUICK_ORDER_URL);
    expect(quickOrder?.getAttribute("href")).toBe(
      "https://xeniostechnology.com/research/early-access/order-request",
    );
  });

  it("focuses and announces an invalid email", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const view = renderPage();
    setEmail("not-an-email");
    await submit(view);

    expect(document.activeElement?.id).toBe("catalog-interest-email");
    expect(view.querySelector('[data-testid="catalog-interest-validation-summary"]')?.getAttribute("role"))
      .toBe("alert");
    expect(document.getElementById("catalog-interest-email")?.getAttribute("aria-invalid"))
      .toBe("true");
  });

  it("reuses one request ID after an uncertain failure and sends no attribution or medical fields", async () => {
    const payloads: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      payloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (payloads.length === 1) throw new Error("connection lost");
      return successfulResponse();
    });
    vi.stubGlobal("fetch", fetchMock);
    const view = renderPage();
    setEmail("  PERSON@EXAMPLE.COM ");

    await submit(view);
    expect(view.querySelector('[data-testid="catalog-interest-server-error"]')?.textContent)
      .toContain("could not confirm whether your request was saved");
    await submit(view);

    expect(payloads).toHaveLength(2);
    expect(payloads[0].requestId).toBe(payloads[1].requestId);
    expect(payloads[1]).toMatchObject({
      email: "person@example.com",
      marketingConsent: false,
      confirmEmpty: "",
    });
    expect(payloads[1]).not.toHaveProperty("source_page");
    expect(payloads[1]).not.toHaveProperty("referrer_url");
    expect(payloads[1]).not.toHaveProperty("medical");
    expect(view.querySelector('[data-testid="catalog-interest-success"]')?.textContent)
      .toContain("XHC-ABCDEF123456");
  });

  it("bounds a hanging response at 15 seconds and retries the same request ID with a reset challenge", async () => {
    vi.useFakeTimers();
    const payloads: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      payloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (payloads.length === 1) return new Promise<Response>(() => {});
      return Promise.resolve(successfulResponse());
    });
    vi.stubGlobal("fetch", fetchMock);
    const view = renderPage();
    setEmail("person@example.com");
    act(() => (view.querySelector('[data-testid="turnstile-mock"]') as HTMLButtonElement).click());

    await submit(view);
    expect((view.querySelector('[data-testid="catalog-interest-submit"]') as HTMLButtonElement).disabled)
      .toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(14_999);
      await Promise.resolve();
    });
    expect(view.querySelector('[data-testid="catalog-interest-server-error"]')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(view.querySelector('[data-testid="catalog-interest-server-error"]')?.textContent)
      .toContain("could not confirm whether your request was saved");
    expect((view.querySelector('[data-testid="catalog-interest-submit"]') as HTMLButtonElement).disabled)
      .toBe(false);

    await submit(view);
    expect(payloads).toHaveLength(2);
    expect(payloads[1].requestId).toBe(payloads[0].requestId);
    expect(payloads[0].turnstileToken).toBe("fresh-token");
    expect(payloads[1]).not.toHaveProperty("turnstileToken");
    expect(view.querySelector('[data-testid="catalog-interest-success"]')).not.toBeNull();
  });

  it("bounds a hanging body read, aborts its signal, and ignores a late valid receipt", async () => {
    vi.useFakeTimers();
    const payloads: Array<Record<string, unknown>> = [];
    let firstSignal: AbortSignal | null | undefined;
    let resolveBody: ((value: unknown) => void) | undefined;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      payloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (payloads.length === 1) {
        firstSignal = init?.signal;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => new Promise<unknown>((resolve) => {
            resolveBody = resolve;
          }),
        } as Response);
      }
      return Promise.resolve(successfulResponse());
    });
    vi.stubGlobal("fetch", fetchMock);
    const view = renderPage();
    setEmail("person@example.com");

    await submit(view);
    expect(firstSignal?.aborted).toBe(false);
    expect(resolveBody).toBeTypeOf("function");
    await act(async () => {
      vi.advanceTimersByTime(14_999);
      await Promise.resolve();
    });
    expect(firstSignal?.aborted).toBe(false);
    expect(view.querySelector('[data-testid="catalog-interest-server-error"]')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(firstSignal?.aborted).toBe(true);
    expect(view.querySelector('[data-testid="catalog-interest-server-error"]')?.textContent)
      .toContain("could not confirm whether your request was saved");
    expect(view.querySelector('[data-testid="catalog-interest-success"]')).toBeNull();

    await act(async () => {
      resolveBody?.({
        ok: true,
        receipt: "XHC-LATE12345678",
        status: "queued",
        catalogRevision: "catalog-2026-10",
        replayed: false,
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(view.querySelector('[data-testid="catalog-interest-success"]')).toBeNull();
    expect(view.querySelector('[data-testid="catalog-interest-server-error"]')?.textContent)
      .toContain("could not confirm whether your request was saved");

    await submit(view);
    expect(payloads[1].requestId).toBe(payloads[0].requestId);
    expect(view.querySelector('[data-testid="catalog-interest-success"]')).not.toBeNull();
  });

  it.each([408, 502, 504])(
    "treats HTTP %i as unknown and retries with the same request ID after resetting verification",
    async (status) => {
      const payloads: Array<Record<string, unknown>> = [];
      vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        payloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        if (payloads.length === 1) {
          return errorResponse(status, "temporarily_unavailable", "The request was not saved.");
        }
        return successfulResponse();
      }));
      const view = renderPage();
      setEmail("person@example.com");
      act(() => (view.querySelector('[data-testid="turnstile-mock"]') as HTMLButtonElement).click());

      await submit(view);
      const error = view.querySelector('[data-testid="catalog-interest-server-error"]')?.textContent ?? "";
      expect(error).toContain("could not confirm whether your request was saved");
      expect(error).not.toContain("The request was not saved");
      expect(view.querySelector('[data-testid="catalog-interest-success"]')).toBeNull();

      await submit(view);
      expect(payloads[1].requestId).toBe(payloads[0].requestId);
      expect(payloads[0].turnstileToken).toBe("fresh-token");
      expect(payloads[1]).not.toHaveProperty("turnstileToken");
      expect(view.querySelector('[data-testid="catalog-interest-success"]')).not.toBeNull();
    },
  );

  it("treats a malformed 2xx receipt as unknown and retains the request ID", async () => {
    const payloads: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      payloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (payloads.length === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, receipt: "not-a-valid-receipt" }),
        } as Response;
      }
      return successfulResponse();
    }));
    const view = renderPage();
    setEmail("person@example.com");

    await submit(view);
    expect(view.querySelector('[data-testid="catalog-interest-server-error"]')?.textContent)
      .toContain("could not confirm whether your request was saved");
    expect(view.querySelector('[data-testid="catalog-interest-success"]')).toBeNull();

    await submit(view);
    expect(payloads[1].requestId).toBe(payloads[0].requestId);
    expect(view.querySelector('[data-testid="catalog-interest-success"]')).not.toBeNull();
  });

  it.each([
    [400, "verification_failed", "Verification could not be completed. Please try again."],
    [429, "too_many_requests", "Too many requests. Please wait a few minutes and try again."],
  ] as const)("preserves known HTTP %i handling", async (status, code, expectedMessage) => {
    vi.stubGlobal("fetch", vi.fn(async () => errorResponse(status, code, "server fallback")));
    const view = renderPage();
    setEmail("person@example.com");

    await submit(view);
    const error = view.querySelector('[data-testid="catalog-interest-server-error"]')?.textContent ?? "";
    expect(error).toContain(expectedMessage);
    expect(error).not.toContain("could not confirm whether your request was saved");
    expect(view.querySelector('[data-testid="catalog-interest-success"]')).toBeNull();
  });

  it("preserves the request ID when details change after an uncertain failure", async () => {
    const payloads: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      payloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      throw new Error("offline");
    }));
    const view = renderPage();
    setEmail("person@example.com");
    await submit(view);
    act(() => (document.getElementById("catalog-interest-marketing") as HTMLInputElement).click());
    await submit(view);

    expect(payloads).toHaveLength(2);
    expect(payloads[0].requestId).toBe(payloads[1].requestId);
    expect(payloads[1].marketingConsent).toBe(true);
  });

  it("refreshes verification while preserving the request ID after an uncertain failure", async () => {
    const payloads: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      payloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      throw new Error("connection lost");
    }));
    const view = renderPage();
    setEmail("person@example.com");
    act(() => (view.querySelector('[data-testid="turnstile-mock"]') as HTMLButtonElement).click());
    await submit(view);
    await submit(view);
    act(() => (view.querySelector('[data-testid="turnstile-mock"]') as HTMLButtonElement).click());
    await submit(view);

    expect(payloads[0].turnstileToken).toBe("fresh-token");
    expect(payloads[1]).not.toHaveProperty("turnstileToken");
    expect(payloads[2].turnstileToken).toBe("fresh-token");
    expect(new Set(payloads.map((payload) => payload.requestId))).toHaveProperty("size", 1);
  });

  it("persists only an opaque pending ID across a reload-sized remount", async () => {
    const payloads: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      payloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      throw new Error("connection lost");
    }));
    let view = renderPage();
    setEmail("person@example.com");
    await submit(view);
    const savedId = sessionStorage.getItem("xenios.catalogInterest.pendingRequestId");
    expect(savedId).toBe(payloads[0].requestId);
    expect(JSON.stringify(sessionStorage)).not.toContain("person@example.com");

    act(() => root!.unmount());
    container!.remove();
    root = null;
    container = null;
    view = renderPage();
    setEmail("person@example.com");
    await submit(view);
    expect(payloads[1].requestId).toBe(payloads[0].requestId);
  });

  it("recovers from a 409 with a new request ID and never claims the conflict was saved", async () => {
    const payloads: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      payloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (payloads.length === 1) {
        return {
          ok: false,
          status: 409,
          json: async () => ({ ok: false, code: "request_conflict", message: "conflict" }),
        } as Response;
      }
      return successfulResponse();
    }));
    const view = renderPage();
    setEmail("person@example.com");
    await submit(view);

    expect(view.textContent).toContain("saved request reference");
    expect(view.querySelector('[data-testid="catalog-interest-success"]')).toBeNull();
    await submit(view);
    expect(payloads[0].requestId).not.toBe(payloads[1].requestId);
    expect(view.querySelector('[data-testid="catalog-interest-success"]')).not.toBeNull();
  });

  it("reports manual review without claiming delivery was sent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        receipt: "XHC-ABCDEF123456",
        status: "manual_review",
        catalogRevision: "catalog-2026-10",
        replayed: false,
      }),
    } as Response)));
    const view = renderPage();
    setEmail("person@example.com");
    await submit(view);

    const success = view.querySelector('[data-testid="catalog-interest-success"]')?.textContent ?? "";
    expect(success).toContain("delivery has not been sent or confirmed");
    expect(success).not.toContain("Catalog delivery is queued");
  });
});

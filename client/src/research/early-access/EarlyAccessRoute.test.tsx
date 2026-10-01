// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EarlyAccessRoute from "./EarlyAccessRoute";

vi.mock("../assisted-order/AssistedOrderCta", () => ({
  useAssistedOrderBridgeState: () => ({ kind: "disabled" }),
  AssistedOrderCta: () => null,
}));
vi.mock("./cart/EarlyAccessCartMount", () => ({
  EarlyAccessCartMount: () => <div data-testid="authorized-cart-mount" />,
}));
vi.mock("@/components/SeoHead", () => ({ default: () => null }));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;

function json(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function render() {
  await act(async () => { root.render(<EarlyAccessRoute />); });
}

function assertHelp() {
  for (const href of ["/support", "/status", "/products"]) {
    expect(container.querySelector(`a[href="${href}"]`)).not.toBeNull();
  }
}

describe("HL-24: newcomer-safe research entry recovery", () => {
  it.each([500, 503, 429])("treats session HTTP %s as retryable, never a password requirement", async (status) => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({}, status))
      .mockResolvedValueOnce(json({ authenticated: true, openAccess: true }));
    vi.stubGlobal("fetch", fetcher);
    await render();
    expect(container.querySelector('[data-testid="early-access-session-error"]')).not.toBeNull();
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(container.querySelector('[data-testid="authorized-cart-mount"]')).toBeNull();
    assertHelp();
    await act(async () => {
      (container.querySelector('[data-testid="early-access-session-retry"]') as HTMLButtonElement).click();
    });
    expect(container.querySelector('[data-testid="authorized-cart-mount"]')).not.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });

  it.each(["network", "html", "malformed"])("keeps a %s session response distinct from access denial", async (failure) => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      if (failure === "network") throw new Error("synthetic network error");
      if (failure === "html") return { ok: true, status: 200, json: async () => { throw new Error("HTML"); } };
      return json({ openAccess: true });
    }));
    await render();
    expect(container.querySelector('[data-testid="early-access-session-error"]')).not.toBeNull();
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(container.querySelector('[data-testid="authorized-cart-mount"]')).toBeNull();
    assertHelp();
  });

  it("gives visitors without an invitation safe help, status and return links", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ authenticated: false, openAccess: false })));
    await render();
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
    expect(container.textContent).toContain("New here or need help getting access?");
    expect(container.querySelector('[data-testid="authorized-cart-mount"]')).toBeNull();
    assertHelp();
  });

  it("offers recovery when the session endpoint is absent without claiming an invitation is valid", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 404)));
    await render();
    expect(container.querySelector('[data-testid="early-access-unavailable"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="early-access-session-retry"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Nothing is wrong with your invitation");
    assertHelp();
  });

  it("never trusts a failed anonymous unlock or retries it automatically", async () => {
    const fetcher = vi.fn(async (path: string) => path.endsWith("/session")
      ? json({ authenticated: false, openAccess: true }) : json({}, 503));
    vi.stubGlobal("fetch", fetcher);
    await render();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-testid="early-access-session-error"]')).not.toBeNull();
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(container.querySelector('[data-testid="authorized-cart-mount"]')).toBeNull();
  });

  it("keeps a genuine password refusal on the access form", async () => {
    vi.stubGlobal("fetch", vi.fn(async (path: string) => path.endsWith("/session")
      ? json({ authenticated: false, openAccess: false }) : json({ ok: false }, 401)));
    await render();
    await act(async () => {
      const input = container.querySelector('input[type="password"]') as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "synthetic-password");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(container.textContent).toContain("That password was not accepted");
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="authorized-cart-mount"]')).toBeNull();
    assertHelp();
  });
});

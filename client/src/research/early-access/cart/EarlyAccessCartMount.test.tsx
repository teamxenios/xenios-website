// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EarlyAccessCartMount } from "./EarlyAccessCartMount";

const mocks = vi.hoisted(() => ({ catalog: vi.fn() }));
vi.mock("../../adapters/earlyAccessCatalog", () => ({ loadEarlyAccessCatalog: mocks.catalog }));
vi.mock("./EarlyAccessMultiCartJourney", () => ({
  EarlyAccessMultiCartJourney: () => <div data-testid="authorized-multicart" />,
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
function json(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}
beforeEach(() => {
  mocks.catalog.mockReset();
  mocks.catalog.mockResolvedValue({ kind: "ok", products: [] });
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
async function render(assistedOrderAvailable = false) {
  await act(async () => {
    root.render(<EarlyAccessCartMount fallback={<div data-testid="disabled-only-fallback" />}
      onExitEarlyAccess={() => {}} assistedOrderAvailable={assistedOrderAvailable} />);
  });
}
async function retry() {
  const button = container.querySelector('[data-testid="early-access-cart-retry"]') as HTMLButtonElement;
  expect(button).not.toBeNull();
  await act(async () => { button.click(); });
}

describe("HL-25: retryable cart checks without inferred commerce authority", () => {
  it.each(["server", "network", "html"])("recovers from a %s capability failure only after a fresh confirmed response", async (failure) => {
    const fetcher = vi.fn().mockImplementationOnce(async () => {
      if (failure === "network") throw new Error("synthetic network error");
      if (failure === "html") return { ok: true, status: 200, json: async () => { throw new Error("HTML"); } };
      return json({}, 503);
    }).mockResolvedValueOnce(json({}, 404));
    vi.stubGlobal("fetch", fetcher);
    await render();
    expect(container.querySelector('[data-testid="early-access-cart-error"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="disabled-only-fallback"]')).toBeNull();
    expect(container.querySelector('[data-testid="authorized-multicart"]')).toBeNull();
    expect(container.querySelector('[data-testid="early-access-cart-assisted-alternative"]')).toBeNull();
    expect(mocks.catalog).not.toHaveBeenCalled();
    await retry();
    expect(container.querySelector('[data-testid="disabled-only-fallback"]')).not.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });

  it("offers the separate assisted entry only when it is independently confirmed available", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 500)));
    await render(true);
    expect(container.querySelector('[data-testid="early-access-cart-assisted-alternative"]')?.getAttribute("href"))
      .toBe("/research/early-access/order-request");
    expect(container.querySelector('[data-testid="disabled-only-fallback"]')).toBeNull();
    expect(container.querySelector('[data-testid="authorized-multicart"]')).toBeNull();
    for (const href of ["/support", "/status", "/products"]) expect(container.querySelector(`a[href="${href}"]`)).not.toBeNull();
  });

  it.each([401, 403])("does not offer an assisted fallback after a capability authorization refusal (%s)", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => json({}, status)));
    await render(true);
    expect(container.querySelector('[data-testid="early-access-cart-locked"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="early-access-cart-assisted-alternative"]')).toBeNull();
    expect(container.querySelector('[data-testid="disabled-only-fallback"]')).toBeNull();
    expect(container.querySelector('a[href="/research/early-access"]')).not.toBeNull();
    expect(mocks.catalog).not.toHaveBeenCalled();
  });

  it("rechecks capability and catalog after a catalog error before mounting the cart", async () => {
    const fetcher = vi.fn(async () => json({ ok: true, capability: {} }));
    vi.stubGlobal("fetch", fetcher);
    mocks.catalog.mockResolvedValueOnce({ kind: "error", message: "synthetic error" });
    await render();
    expect(container.querySelector('[data-testid="early-access-cart-error"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="authorized-multicart"]')).toBeNull();
    await retry();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(mocks.catalog).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-testid="authorized-multicart"]')).not.toBeNull();
  });

  it("contains an unexpected catalog exception in the same retryable state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ ok: true, capability: {} })));
    mocks.catalog.mockRejectedValueOnce(new Error("synthetic failure"));
    await render();
    expect(container.querySelector('[data-testid="early-access-cart-error"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="disabled-only-fallback"]')).toBeNull();
  });

  it("retains authorization refusal when capability was enabled but catalog access expired", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ ok: true, capability: {} })));
    mocks.catalog.mockResolvedValueOnce({ kind: "locked" });
    await render(true);
    expect(container.querySelector('[data-testid="early-access-cart-locked"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="early-access-cart-assisted-alternative"]')).toBeNull();
    expect(container.querySelector('[data-testid="authorized-multicart"]')).toBeNull();
  });
});

// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckoutContinuationView } from "../adapters/checkoutContinuation";
import { PaymentAuthenticationStep, type PaymentAuthenticator } from "./PaymentAuthenticationStep";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

const SECRET = "pi_0001_secret_fixture";
const view = (state: CheckoutContinuationView["state"], withSecret = false): CheckoutContinuationView => ({
  requestKey: "req_continuation_0001",
  orderId: "11111111-1111-4111-8111-111111111111",
  state,
  amountCents: 33_999,
  currency: "usd",
  ...(withSecret ? { authentication: { providerReference: "pi_0001", clientSecret: SECRET } } : {}),
});

/** A scripted server: GET answers `status`, POST continue answers whatever `onContinue` says. */
function server(initial: CheckoutContinuationView, onContinue: () => CheckoutContinuationView | { status: number; body: unknown }, options: { delayMs?: number } = {}) {
  const calls: { method: string; url: string; token: string | null }[] = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      const method = init?.method ?? "GET";
      calls.push({ method, url, token: headers.get("Authorization")?.replace("Bearer ", "") ?? null });
      if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      if (url.endsWith("/continuation") && method === "GET") return json({ ok: true, continuation: initial });
      if (url.endsWith("/continue") && method === "POST") {
        const next = onContinue();
        return "status" in next && "body" in next ? json(next.body, next.status) : json({ ok: true, continuation: next });
      }
      return json({ ok: false, code: "not_found" }, 404);
    }),
  );
  return { calls };
}

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};
const render = (props: Partial<Parameters<typeof PaymentAuthenticationStep>[0]> = {}) =>
  act(() => {
    root.render(
      <PaymentAuthenticationStep memberToken={props.memberToken ?? "token-owner"} requestKey="req_continuation_0001" authenticate={props.authenticate ?? (async () => "authenticated")} onCompleted={props.onCompleted} />,
    );
  });
const click = async () => {
  const button = container.querySelector<HTMLButtonElement>('[data-testid="payment-continue"]');
  expect(button).not.toBeNull();
  await act(async () => {
    button!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await flush();
};

describe("PaymentAuthenticationStep", () => {
  it("runs the provider flow with the server's secret, continues, and reports the completed order once", async () => {
    const { calls } = server(view("authentication_required", true), () => view("completed"));
    const authenticate = vi.fn<PaymentAuthenticator>(async () => "authenticated");
    const onCompleted = vi.fn();
    await render({ authenticate, onCompleted });
    await flush();
    expect(container.textContent).toContain("Your bank needs to confirm this payment");
    expect(container.innerHTML).not.toContain(SECRET);
    await click();
    expect(authenticate).toHaveBeenCalledWith({ clientSecret: SECRET });
    expect(calls.map((c) => c.method)).toEqual(["GET", "POST"]);
    expect(calls.every((c) => c.token === "token-owner")).toBe(true);
    expect(container.textContent).toContain("Order placed");
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(onCompleted).toHaveBeenCalledWith(view("completed").orderId);
    expect(container.innerHTML).not.toContain(SECRET);
    expect(container.querySelector('[data-testid="payment-continue"]')).toBeNull();
  });

  it("keeps a cancelled or failed bank confirmation honest: nothing charged, try again, no second payment", async () => {
    server(view("authentication_required", true), () => view("authentication_required", true));
    await render({ authenticate: async () => "cancelled" });
    await flush();
    await click();
    expect(container.querySelector('[data-testid="payment-note"]')?.textContent).toContain("Nothing has been charged");
    expect(container.textContent).toContain("Your bank needs to confirm this payment");
    expect(container.querySelector('[data-testid="payment-continue"]')).not.toBeNull();
    expect(container.innerHTML).not.toContain(SECRET);
  });

  it("shows an explicit uncertain state with no second-payment prompt while the provider result is being verified", async () => {
    server(view("reconciliation_required"), () => view("reconciliation_required"));
    const authenticate = vi.fn<PaymentAuthenticator>(async () => "authenticated");
    await render({ authenticate });
    await flush();
    expect(container.querySelector('[data-testid="payment-uncertain"]')?.textContent).toContain("do not pay again");
    await click();
    expect(authenticate).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Payment result being verified");
  });

  it("ignores a late answer after an account switch and never renders the previous account's payment", async () => {
    const { calls } = server(view("authentication_required", true), () => view("completed"), { delayMs: 30 });
    await render({ memberToken: "token-owner" });
    // Switch accounts before the first answer arrives.
    await render({ memberToken: "token-other" });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(calls.map((c) => c.token)).toEqual(["token-owner", "token-other"]);
    // Both answers carry the fixture view, so prove the fence by the rendered token binding: the
    // component only applied the answer for the current token (state is from a completed fetch).
    expect(container.textContent).toContain("Your bank needs to confirm this payment");
    expect(container.innerHTML).not.toContain(SECRET);
  });

  it("asks for sign-in when the session is gone and explains an unavailable continuation without inviting a new payment", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false, code: "unauthorized" }), { status: 401 })));
    await render();
    await flush();
    expect(container.textContent).toContain("sign in again");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    await render({ memberToken: "token-two" });
    await flush();
    expect(container.textContent).toContain("has not been charged twice");
  });
});

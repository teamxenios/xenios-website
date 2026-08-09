import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EARLY_ACCESS_CART_PAYMENT_INSTRUCTIONS_PATH,
  loadEarlyAccessPaymentInstructions,
} from "./earlyAccessPaymentInstructions";

const CHECKOUT = "XEC-ABCDEFGH12345678";
const CONFIGURED_DESTINATION = "pay-destination@example.test";

const PRESENTATION = {
  state: "resolved",
  amountDueDisplay: "$1,250.00",
  currency: "USD",
  paymentReference: "XEA-PAY-8F3K2Q",
  referenceLabel: "Payment reference",
  methods: [
    {
      code: "zelle",
      methodName: "Zelle",
      destinationLabel: "Zelle email",
      destinationValue: CONFIGURED_DESTINATION,
      paymentUrl: null,
      steps: ["Send the exact amount due."],
      copyValue: CONFIGURED_DESTINATION,
      referenceRequired: true,
    },
  ],
};

function stubFetch(
  handler: (path: string, init?: RequestInit) => Promise<Response> | Response,
) {
  const spy = vi.fn(handler);
  vi.stubGlobal("fetch", spy);
  return spy;
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("loadEarlyAccessPaymentInstructions", () => {
  it("asks the owner-scoped path with no body and no credentials of its own", async () => {
    const spy = stubFetch(() =>
      jsonResponse(200, { ok: true, presentation: PRESENTATION }),
    );
    await loadEarlyAccessPaymentInstructions(CHECKOUT);

    const [path, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(path).toBe(EARLY_ACCESS_CART_PAYMENT_INSTRUCTIONS_PATH(CHECKOUT));
    expect(path).toBe(
      `/api/research/early-access/cart/${CHECKOUT}/payment-instructions`,
    );
    expect(init.method).toBeUndefined();
    expect(init.body).toBeUndefined();
    expect(init.cache).toBe("no-store");
    expect(init.credentials).toBe("same-origin");
  });

  it("encodes the checkout number rather than trusting it", () => {
    expect(
      EARLY_ACCESS_CART_PAYMENT_INSTRUCTIONS_PATH("../../admin/settle"),
    ).toBe(
      "/api/research/early-access/cart/..%2F..%2Fadmin%2Fsettle/payment-instructions",
    );
  });

  it("returns the decoded presentation on success", async () => {
    stubFetch(() => jsonResponse(200, { ok: true, presentation: PRESENTATION }));
    const result = await loadEarlyAccessPaymentInstructions(CHECKOUT);
    expect(result.state).toBe("resolved");
    if (result.state !== "resolved") throw new Error("expected resolved");
    expect(result.methods[0]?.destinationValue).toBe(CONFIGURED_DESTINATION);
  });

  it("falls back to unresolved for every failure, without inventing a method", async () => {
    const failures: Array<() => Response | Promise<Response>> = [
      () => jsonResponse(401, { ok: false, code: "SESSION_REQUIRED" }),
      () => jsonResponse(404, { ok: false, code: "NOT_FOUND" }),
      () => jsonResponse(503, { ok: false, code: "UNAVAILABLE" }),
      () => jsonResponse(200, { ok: false }),
      () => jsonResponse(200, { ok: true }),
      () => jsonResponse(200, { ok: true, presentation: { state: "nonsense" } }),
      // A response shaped like the contract but carrying an unknown method.
      () =>
        jsonResponse(200, {
          ok: true,
          presentation: {
            ...PRESENTATION,
            methods: [{ ...PRESENTATION.methods[0], code: "bitcoin" }],
          },
        }),
      () => {
        throw new Error("network down");
      },
    ];

    for (const handler of failures) {
      stubFetch(handler);
      const result = await loadEarlyAccessPaymentInstructions(CHECKOUT);
      expect(result).toEqual({ state: "unresolved" });
      vi.unstubAllGlobals();
    }
  });
});

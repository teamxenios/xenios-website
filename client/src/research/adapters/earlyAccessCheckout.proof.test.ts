import { describe, expect, it, vi } from "vitest";

import {
  EARLY_ACCESS_ORDERS_PATH,
  submitEarlyAccessPaymentProof,
} from "./earlyAccessCheckout";

function response(body: unknown, status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const file = {
  name: "roman-payment.pdf",
  type: "application/pdf",
  size: 4,
  arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
};

describe("legacy single-order payment proof adapter", () => {
  it("records only proof metadata and a SHA-256 digest, then preserves under-review truth", async () => {
    const request = vi.fn(async () =>
      response(
        {
          ok: true,
          payment: { state: "under_review", paid: false, verified: false },
          message: "Recorded for named-admin review.",
        },
        202,
      ),
    );
    const digest = vi.fn(async () => new Uint8Array(32).fill(0xab).buffer);

    const result = await submitEarlyAccessPaymentProof(
      { orderNumber: "XEA/42", file, method: "ach_wire" },
      request as typeof fetch,
      digest,
    );

    expect(result).toEqual({
      ok: true,
      value: {
        orderNumber: "XEA/42",
        payment: { state: "under_review", paid: false, verified: false },
        message: "Recorded for named-admin review.",
      },
    });
    expect(request).toHaveBeenCalledTimes(1);
    const [path, init] = request.mock.calls[0];
    expect(path).toBe(`${EARLY_ACCESS_ORDERS_PATH}/XEA%2F42/payment-proof`);
    expect(JSON.parse(String(init?.body))).toEqual({
      filename: "roman-payment.pdf",
      contentType: "application/pdf",
      byteSize: 4,
      sha256: "ab".repeat(32),
      method: "ach_wire",
    });
    expect(String(init?.body)).not.toContain("1,2,3,4");
  });

  it("does not promote an ambiguous 200 response to accepted proof", async () => {
    const result = await submitEarlyAccessPaymentProof(
      { orderNumber: "XEA-42", file, method: "zelle" },
      vi.fn(async () => response({ ok: true }, 200)) as typeof fetch,
      async () => new Uint8Array(32).buffer,
    );

    expect(result).toMatchObject({ ok: false, status: 200 });
  });
});

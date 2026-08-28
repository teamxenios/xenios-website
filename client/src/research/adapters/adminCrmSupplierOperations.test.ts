import { afterEach, describe, expect, it, vi } from "vitest";
import { adminCrmIdempotencyKey } from "./adminCrmSupplierOperations";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("admin CRM idempotency keys", () => {
  it("stays within the server boundary for a maximum-length legal target", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000000" });
    const key = adminCrmIdempotencyKey("invoice_payment_review", `target_${"a".repeat(193)}`);
    expect(key.length).toBeLessThanOrEqual(200);
    expect(key).toMatch(/^[A-Za-z0-9][A-Za-z0-9:_.\/-]{7,199}$/);
  });

  it("fingerprints the complete target even when the visible prefixes match", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000000" });
    const prefix = "x".repeat(199);
    expect(adminCrmIdempotencyKey("buyer_follow_up", `${prefix}a`))
      .not.toBe(adminCrmIdempotencyKey("buyer_follow_up", `${prefix}b`));
  });
});

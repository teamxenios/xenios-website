// @vitest-environment jsdom
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { afterEach, describe, expect, it } from "vitest";

import {
  LAST_ORDER_STORAGE_KEY,
  PENDING_ORDER_STORAGE_KEY,
  clearLastOrderNumber,
  clearPendingAttempt,
  newIdempotencyKey,
  readLastOrderNumber,
  readPendingAttempt,
  rememberLastOrderNumber,
  rememberPendingAttempt,
} from "./pendingOrderStore";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const ATTEMPT = Object.freeze({
  idempotencyKey: `xea_${"a".repeat(32)}`,
  productId: "prod-1",
  variantId: "var-1",
  quantity: 2,
});

afterEach(() => {
  window.sessionStorage.clear();
});

describe("what the pending-order store keeps, exactly", () => {
  it("stores the attempt under its documented key and round-trips it", () => {
    rememberPendingAttempt(ATTEMPT);
    const raw = window.sessionStorage.getItem(PENDING_ORDER_STORAGE_KEY);
    expect(raw).not.toBeNull();
    // EXACTLY these four fields. No contact, no address, no money, no cookie.
    expect(Object.keys(JSON.parse(raw as string)).sort()).toEqual([
      "idempotencyKey",
      "productId",
      "quantity",
      "variantId",
    ]);
    expect(readPendingAttempt()).toEqual(ATTEMPT);
  });

  it("clears on demand, and treats malformed records as absent AND removes them", () => {
    rememberPendingAttempt(ATTEMPT);
    clearPendingAttempt();
    expect(readPendingAttempt()).toBeNull();

    window.sessionStorage.setItem(PENDING_ORDER_STORAGE_KEY, "{not json");
    expect(readPendingAttempt()).toBeNull();
    expect(window.sessionStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();

    // A record whose key does not match the required shape cannot be retried
    // safely, so it too reads as absent and is forgotten.
    window.sessionStorage.setItem(
      PENDING_ORDER_STORAGE_KEY,
      JSON.stringify({ ...ATTEMPT, idempotencyKey: "math-random-key" }),
    );
    expect(readPendingAttempt()).toBeNull();
  });

  it("keeps only the order number for recovery, shape-checked both ways", () => {
    rememberLastOrderNumber("XEA-0000000000000001");
    expect(window.sessionStorage.getItem(LAST_ORDER_STORAGE_KEY)).toBe("XEA-0000000000000001");
    expect(readLastOrderNumber()).toBe("XEA-0000000000000001");

    clearLastOrderNumber();
    expect(readLastOrderNumber()).toBeNull();

    // Nothing that is not an order number is stored or returned.
    rememberLastOrderNumber("not-an-order-number");
    expect(window.sessionStorage.getItem(LAST_ORDER_STORAGE_KEY)).toBeNull();
    window.sessionStorage.setItem(LAST_ORDER_STORAGE_KEY, "<script>alert(1)</script>");
    expect(readLastOrderNumber()).toBeNull();
  });
});

describe("the idempotency key", () => {
  it("is cryptographically random, well-shaped, and unique per call", () => {
    const first = newIdempotencyKey();
    const second = newIdempotencyKey();
    expect(first).toMatch(/^xea_[a-f0-9]{32}$/);
    expect(second).toMatch(/^xea_[a-f0-9]{32}$/);
    expect(first).not.toBe(second);
  });

  it("has NO Math.random fallback anywhere in the module", () => {
    const source = readFileSync(path.join(HERE, "pendingOrderStore.ts"), "utf8");
    expect(source).not.toContain("Math.random");
    expect(source).not.toContain("Date.now");
  });
});

import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import {
  EARLY_ACCESS_PAYMENT_OPTION_CODES,
  earlyAccessPaymentOptionLabel,
  isEarlyAccessPaymentOptionCode,
  normalizeEarlyAccessPaymentOptionCodes,
} from "./early-access-payment-options";

const HERE = path.dirname(fileURLToPath(import.meta.url));

describe("Early Access payment option presentation contract", () => {
  it("pins the exact closed vocabulary and customer-facing labels", () => {
    expect(EARLY_ACCESS_PAYMENT_OPTION_CODES).toEqual([
      "zelle",
      "venmo",
      "cash_app",
      "paypal",
      "apple_cash",
      "ach_wire",
      "other",
    ]);
    expect(
      EARLY_ACCESS_PAYMENT_OPTION_CODES.map(earlyAccessPaymentOptionLabel),
    ).toEqual([
      "Zelle",
      "Venmo",
      "Cash App",
      "PayPal",
      "Apple Cash",
      "ACH / bank transfer / bank wire",
      "Other manual method",
    ]);
  });

  it("runtime-freezes the exported tuple so a hostile cast cannot expand the guard", () => {
    expect(Object.isFrozen(EARLY_ACCESS_PAYMENT_OPTION_CODES)).toBe(true);
    expect(() =>
      (EARLY_ACCESS_PAYMENT_OPTION_CODES as unknown as string[]).push("card"),
    ).toThrow();
    expect(isEarlyAccessPaymentOptionCode("card")).toBe(false);
    expect(earlyAccessPaymentOptionLabel("card")).toBeNull();
  });

  it("admits every exact code and refuses casing, aliases, cards, raw cash, and objects", () => {
    for (const code of EARLY_ACCESS_PAYMENT_OPTION_CODES) {
      expect(isEarlyAccessPaymentOptionCode(code), code).toBe(true);
    }
    for (const value of [
      "Zelle",
      " zelle",
      "zelle ",
      "venmos",
      "cashapp",
      "ach",
      "wire",
      "apple_pay",
      "google_pay",
      "card",
      "stripe",
      "cash",
      "",
      null,
      undefined,
      { code: "zelle" },
    ]) {
      expect(isEarlyAccessPaymentOptionCode(value), JSON.stringify(value)).toBe(
        false,
      );
      expect(earlyAccessPaymentOptionLabel(value)).toBeNull();
    }
  });

  it("deduplicates, drops hostile values, restores canonical order, and freezes the result", () => {
    const normalized = normalizeEarlyAccessPaymentOptionCodes([
      "other",
      { code: "zelle", label: "HOSTILE-LABEL-CANARY" },
      "paypal",
      "zelle",
      "paypal",
      "apple_pay",
      "cash_app",
    ]);
    expect(normalized).toEqual(["zelle", "cash_app", "paypal", "other"]);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(() => (normalized as string[]).push("venmo")).toThrow();
  });

  it("keeps Apple Cash distinct from Apple Pay and the bank option combined", () => {
    expect(earlyAccessPaymentOptionLabel("apple_cash")).toBe("Apple Cash");
    expect(earlyAccessPaymentOptionLabel("apple_pay")).toBeNull();
    expect(earlyAccessPaymentOptionLabel("ach_wire")).toBe(
      "ACH / bank transfer / bank wire",
    );
  });

  it("matches the server manual-payment allowlist as a set without importing server code", () => {
    const source = readFileSync(
      path.resolve(
        HERE,
        "../../server/research/commerce/manual-order-payments.ts",
      ),
      "utf8",
    );
    const match = source.match(
      /export const MANUAL_ORDER_PAYMENT_METHODS = \[([\s\S]*?)\] as const;/,
    );
    expect(match).not.toBeNull();
    const serverCodes = Array.from(
      (match?.[1] ?? "").matchAll(/"([a-z_]+)"/g),
      (entry) => entry[1],
    );
    expect(new Set(serverCodes)).toEqual(
      new Set(EARLY_ACCESS_PAYMENT_OPTION_CODES),
    );
  });

  it("contains no operational, browser, destination, or secret-bearing seam", () => {
    const source = readFileSync(
      path.join(HERE, "early-access-payment-options.ts"),
      "utf8",
    ).toLowerCase();
    for (const forbidden of [
      "process.env",
      "fetch(",
      "window.",
      "localstorage",
      "sessionstorage",
      "@server",
      "/server/",
      "accountnumber",
      "routingnumber",
      "phone",
      "email",
      "destinationhandle",
      "receivinginstructions",
      "http://",
      "https://",
    ]) {
      expect(source, forbidden).not.toContain(forbidden);
    }

    const labels = EARLY_ACCESS_PAYMENT_OPTION_CODES.map(
      earlyAccessPaymentOptionLabel,
    ).join(" ");
    expect(labels).not.toMatch(/\d/);
    expect(labels).not.toMatch(/apple pay|google pay|stripe|card/i);
  });
});

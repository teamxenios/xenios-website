import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import {
  EARLY_ACCESS_PAYMENT_OPTION_CODES,
  earlyAccessPaymentOptionLabel,
  isEarlyAccessPaymentOptionCode,
  normalizeEarlyAccessPaymentOptionCodes,
  parseEarlyAccessPaymentOptionsPresentation,
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

  it("strictly decodes unresolved and canonical resolved subsets into frozen values", () => {
    const unresolved = parseEarlyAccessPaymentOptionsPresentation({
      state: "unresolved",
    });
    expect(unresolved).toEqual({ state: "unresolved" });
    expect(Object.isFrozen(unresolved)).toBe(true);

    for (const codes of [
      [],
      ["zelle"],
      ["venmo", "apple_cash", "other"],
      [...EARLY_ACCESS_PAYMENT_OPTION_CODES],
    ]) {
      const parsed = parseEarlyAccessPaymentOptionsPresentation({
        state: "resolved",
        codes,
      });
      expect(parsed).toEqual({ state: "resolved", codes });
      expect(Object.isFrozen(parsed)).toBe(true);
      expect(parsed?.state === "resolved" && Object.isFrozen(parsed.codes)).toBe(
        true,
      );
    }
  });

  it("refuses primitives, arrays, null, unknown states, and non-array code fields", () => {
    for (const value of [
      null,
      undefined,
      true,
      1,
      "unresolved",
      [],
      { state: null },
      { state: "pending" },
      { state: "resolved" },
      { state: "resolved", codes: null },
      { state: "resolved", codes: "zelle" },
      { state: "resolved", codes: { 0: "zelle", length: 1 } },
    ]) {
      expect(parseEarlyAccessPaymentOptionsPresentation(value)).toBeNull();
    }
  });

  it("refuses unknown, duplicate, out-of-order, sparse, and accessor-backed codes", () => {
    for (const codes of [
      ["card"],
      ["apple_pay"],
      ["zelle", "zelle"],
      ["venmo", "zelle"],
      ["other", "ach_wire"],
      ["zelle", undefined],
      ["zelle", { code: "venmo" }],
    ]) {
      expect(
        parseEarlyAccessPaymentOptionsPresentation({
          state: "resolved",
          codes,
        }),
      ).toBeNull();
    }

    const sparse = new Array(1);
    expect(
      parseEarlyAccessPaymentOptionsPresentation({
        state: "resolved",
        codes: sparse,
      }),
    ).toBeNull();

    let getterCalls = 0;
    const accessorCodes: unknown[] = [];
    Object.defineProperty(accessorCodes, "0", {
      configurable: true,
      enumerable: true,
      get() {
        getterCalls += 1;
        return "zelle";
      },
    });
    expect(
      parseEarlyAccessPaymentOptionsPresentation({
        state: "resolved",
        codes: accessorCodes,
      }),
    ).toBeNull();
    expect(getterCalls).toBe(0);
  });

  it("refuses extra keys and private or receiving-detail canaries at every level", () => {
    for (const value of [
      { state: "unresolved", destinationHandle: "PRIVATE-HANDLE-CANARY" },
      { state: "unresolved", receivingInstructions: "PRIVATE-INSTRUCTIONS" },
      { state: "resolved", codes: [], accountNumber: "PRIVATE-ACCOUNT" },
      { state: "resolved", codes: [], routingNumber: "PRIVATE-ROUTING" },
      {
        state: "resolved",
        codes: [{ code: "zelle", phone: "PRIVATE-PHONE-CANARY" }],
      },
    ]) {
      expect(parseEarlyAccessPaymentOptionsPresentation(value)).toBeNull();
    }

    const codes = ["zelle"];
    Object.defineProperty(codes, "destinationHandle", {
      value: "PRIVATE-HANDLE-CANARY",
      enumerable: false,
    });
    expect(
      parseEarlyAccessPaymentOptionsPresentation({ state: "resolved", codes }),
    ).toBeNull();
  });

  it("refuses accessors without invoking them and catches throwing objects", () => {
    let getterCalls = 0;
    const getterPresentation = Object.defineProperty({}, "state", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "unresolved";
      },
    });
    expect(
      parseEarlyAccessPaymentOptionsPresentation(getterPresentation),
    ).toBeNull();
    expect(getterCalls).toBe(0);

    const throwing = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("HOSTILE-OWN-KEYS-CANARY");
        },
      },
    );
    expect(parseEarlyAccessPaymentOptionsPresentation(throwing)).toBeNull();

    const revocable = Proxy.revocable({ state: "unresolved" }, {});
    revocable.revoke();
    expect(
      parseEarlyAccessPaymentOptionsPresentation(revocable.proxy),
    ).toBeNull();
  });

  it("refuses transparent proxies, inherited state, custom prototypes, and symbols", () => {
    expect(
      parseEarlyAccessPaymentOptionsPresentation(
        new Proxy({ state: "unresolved" }, {}),
      ),
    ).toBeNull();
    expect(
      parseEarlyAccessPaymentOptionsPresentation(
        Object.create({ state: "unresolved" }),
      ),
    ).toBeNull();

    const customPrototype = Object.create({ hostile: true });
    customPrototype.state = "unresolved";
    expect(
      parseEarlyAccessPaymentOptionsPresentation(customPrototype),
    ).toBeNull();

    const symbolKeyed = { state: "unresolved", [Symbol("private")]: true };
    expect(
      parseEarlyAccessPaymentOptionsPresentation(symbolKeyed),
    ).toBeNull();

    const polluted = JSON.parse(
      '{"state":"unresolved","__proto__":{"approved":true}}',
    );
    expect(parseEarlyAccessPaymentOptionsPresentation(polluted)).toBeNull();
  });

  it("returns a detached snapshot that cannot be rewritten through the input", () => {
    const input = { state: "resolved", codes: ["zelle", "apple_cash"] };
    const parsed = parseEarlyAccessPaymentOptionsPresentation(input);
    expect(parsed).toEqual({
      state: "resolved",
      codes: ["zelle", "apple_cash"],
    });

    input.state = "unresolved";
    input.codes[0] = "card";
    expect(parsed).toEqual({
      state: "resolved",
      codes: ["zelle", "apple_cash"],
    });
    expect(() => {
      if (parsed?.state === "resolved") {
        (parsed.codes as string[])[0] = "venmo";
      }
    }).toThrow();
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

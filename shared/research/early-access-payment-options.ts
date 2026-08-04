/**
 * Closed browser-safe vocabulary for Early Access manual-payment presentation.
 *
 * These codes and labels describe categories only. They do not say that a
 * category is available for an order. A caller must supply a resolved state
 * from the protected server registry before a selector may render a choice.
 * This module intentionally carries no destination, instruction, provider,
 * price, order, or configuration data.
 */

export const EARLY_ACCESS_PAYMENT_OPTION_CODES = Object.freeze([
  "zelle",
  "venmo",
  "cash_app",
  "paypal",
  "apple_cash",
  "ach_wire",
  "other",
] as const);

export type EarlyAccessPaymentOptionCode =
  (typeof EARLY_ACCESS_PAYMENT_OPTION_CODES)[number];

const LABEL_BY_CODE: Readonly<Record<EarlyAccessPaymentOptionCode, string>> =
  Object.freeze({
    zelle: "Zelle",
    venmo: "Venmo",
    cash_app: "Cash App",
    paypal: "PayPal",
    apple_cash: "Apple Cash",
    ach_wire: "ACH / bank transfer / bank wire",
    other: "Other manual method",
  });

/**
 * `unresolved` is the safe initial state. `resolved` is meaningful only when a
 * separately reviewed server adapter created it from the protected registry.
 * Runtime values remain unknown here so malformed wire data fails closed.
 */
export type EarlyAccessPaymentOptionsPresentation =
  | Readonly<{ state: "unresolved" }>
  | Readonly<{ state: "resolved"; codes: readonly unknown[] }>;

export function isEarlyAccessPaymentOptionCode(
  value: unknown,
): value is EarlyAccessPaymentOptionCode {
  return (
    typeof value === "string" &&
    (EARLY_ACCESS_PAYMENT_OPTION_CODES as readonly string[]).includes(value)
  );
}

/** Returns customer-facing copy for a known code and nothing for any other value. */
export function earlyAccessPaymentOptionLabel(value: unknown): string | null {
  return isEarlyAccessPaymentOptionCode(value) ? LABEL_BY_CODE[value] : null;
}

/**
 * Admit known values once and return them in the canonical presentation order.
 * The result is frozen so a rendered server decision cannot be rewritten in
 * place by browser code.
 */
export function normalizeEarlyAccessPaymentOptionCodes(
  values: readonly unknown[],
): readonly EarlyAccessPaymentOptionCode[] {
  const admitted = new Set<EarlyAccessPaymentOptionCode>();
  for (const value of values) {
    if (isEarlyAccessPaymentOptionCode(value)) admitted.add(value);
  }
  return Object.freeze(
    EARLY_ACCESS_PAYMENT_OPTION_CODES.filter((code) => admitted.has(code)),
  );
}

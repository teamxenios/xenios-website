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

const UNRESOLVED_EARLY_ACCESS_PAYMENT_OPTIONS_PRESENTATION = Object.freeze({
  state: "unresolved" as const,
});

function readExactDataProperties(
  value: unknown,
  expectedKeys: readonly string[],
): Readonly<Record<string, PropertyDescriptor>> | null {
  try {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      return null;
    }

    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== expectedKeys.length ||
      ownKeys.some(
        (key) =>
          typeof key !== "string" || !expectedKeys.includes(key),
      )
    ) {
      return null;
    }

    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as
      Record<string, PropertyDescriptor>;
    for (const key of expectedKeys) {
      const descriptor = descriptors[key];
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        descriptor.enumerable !== true
      ) {
        return null;
      }
    }

    return descriptors;
  } catch {
    return null;
  }
}

function readCanonicalCodeArray(
  value: unknown,
): readonly EarlyAccessPaymentOptionCode[] | null {
  try {
    if (
      !Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Array.prototype
    ) {
      return null;
    }

    const ownKeys = Reflect.ownKeys(value);
    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as
      Record<string, PropertyDescriptor>;
    const lengthDescriptor = descriptors.length;
    if (
      lengthDescriptor === undefined ||
      !("value" in lengthDescriptor) ||
      typeof lengthDescriptor.value !== "number" ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0 ||
      lengthDescriptor.value > EARLY_ACCESS_PAYMENT_OPTION_CODES.length ||
      ownKeys.length !== lengthDescriptor.value + 1
    ) {
      return null;
    }

    const codes: EarlyAccessPaymentOptionCode[] = [];
    let priorCanonicalIndex = -1;
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const key = String(index);
      const descriptor = descriptors[key];
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        descriptor.enumerable !== true
      ) {
        return null;
      }
      const code = descriptor.value;
      if (!isEarlyAccessPaymentOptionCode(code)) return null;
      const canonicalIndex = EARLY_ACCESS_PAYMENT_OPTION_CODES.indexOf(code);
      if (canonicalIndex <= priorCanonicalIndex) return null;
      priorCanonicalIndex = canonicalIndex;
      codes.push(code);
    }

    if (
      ownKeys.some(
        (key) =>
          typeof key !== "string" ||
          (key !== "length" && descriptors[key] === undefined),
      )
    ) {
      return null;
    }

    if (typeof structuredClone !== "function") return null;
    structuredClone(value);

    return Object.freeze(codes);
  } catch {
    return null;
  }
}

/**
 * Decode an untrusted browser wire value without repairing it. Only the exact
 * presentation union is accepted; malformed or private-bearing data returns
 * `null` so callers fail closed instead of rendering a partial choice list.
 */
export function parseEarlyAccessPaymentOptionsPresentation(
  value: unknown,
): EarlyAccessPaymentOptionsPresentation | null {
  const unresolved = readExactDataProperties(value, ["state"]);
  if (unresolved !== null) {
    if (unresolved.state?.value !== "unresolved") return null;
    try {
      // A transparent Proxy can imitate ordinary property descriptors.
      // Browser-native structured cloning rejects Proxy objects; accessors
      // have already been refused, so this cannot invoke an input getter.
      if (typeof structuredClone !== "function") return null;
      structuredClone(value);
    } catch {
      return null;
    }
    return UNRESOLVED_EARLY_ACCESS_PAYMENT_OPTIONS_PRESENTATION;
  }

  const resolved = readExactDataProperties(value, ["state", "codes"]);
  if (resolved === null || resolved.state?.value !== "resolved") return null;
  const codes = readCanonicalCodeArray(resolved.codes?.value);
  if (codes === null) return null;
  try {
    // Run this only after the nested array has also passed descriptor checks,
    // preventing a hostile nested accessor from being evaluated by cloning.
    if (typeof structuredClone !== "function") return null;
    structuredClone(value);
  } catch {
    return null;
  }
  return Object.freeze({ state: "resolved" as const, codes });
}

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

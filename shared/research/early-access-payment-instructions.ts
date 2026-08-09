/**
 * Browser-safe contract for the Early Access customer-facing payment screen.
 *
 * `early-access-payment-options.ts` publishes CATEGORY CODES only, on purpose:
 * it answers "which kinds of manual payment exist for this order" and nothing
 * else. That is not enough for a customer to actually pay, so this module adds
 * the second, separately reviewed projection: for each method the server has
 * CONFIGURED, the exact customer-facing values needed to complete a transfer.
 *
 * Every value in this module originates in server-side configuration. This file
 * carries no destination, handle, cashtag, bank detail, URL, price, or order
 * data of its own, and it never derives one. It only decodes a value the server
 * already decided to publish, and it fails closed when that value is malformed.
 *
 * Nothing here settles, submits, verifies, or reports a payment. Rendering this
 * presentation leaves the order exactly where it was: awaiting_payment, pending
 * a named admin's verification.
 */

import {
  EARLY_ACCESS_PAYMENT_OPTION_CODES,
  isEarlyAccessPaymentOptionCode,
  type EarlyAccessPaymentOptionCode,
} from "./early-access-payment-options";

/** Upper bounds the decoder enforces so a hostile payload cannot flood the screen. */
export const EARLY_ACCESS_PAYMENT_INSTRUCTION_LIMITS = Object.freeze({
  methodName: 64,
  destinationLabel: 64,
  destinationValue: 128,
  paymentUrl: 512,
  step: 240,
  steps: 6,
  copyValue: 128,
  amountDueDisplay: 32,
  currency: 3,
  paymentReference: 64,
  referenceLabel: 64,
});

/**
 * One configured method, exactly as a customer sees it.
 *
 * `destinationValue` and `copyValue` are the only fields that can carry a
 * payment destination, and both arrive already chosen by the server. A `null`
 * means the server published no such value, never that the browser should
 * invent one.
 */
export type EarlyAccessPaymentInstruction = Readonly<{
  code: EarlyAccessPaymentOptionCode;
  /** Customer-facing name for this method, e.g. the label shown on the card. */
  methodName: string;
  /** What the destination is called, e.g. "Zelle email". Null when not published. */
  destinationLabel: string | null;
  /** The destination itself. Null when the server publishes no in-page destination. */
  destinationValue: string | null;
  /** An https link the customer may open to pay. Null when there is none. */
  paymentUrl: string | null;
  /** Plain-language steps, in order. May be empty. */
  steps: readonly string[];
  /** The exact string a copy control should place on the clipboard. */
  copyValue: string | null;
  /** True when this method needs the payment reference attached to the transfer. */
  referenceRequired: boolean;
}>;

/**
 * `unresolved` is the safe initial state and the only state a browser may
 * assume. `resolved` is meaningful only when the separately reviewed server
 * adapter built it from configuration plus the order's own invoice.
 *
 * The money and the reference are SERVER STRINGS. The browser renders them
 * verbatim. There is deliberately no cents field here, so no client can be
 * tempted to divide, sum, discount, or re-total anything.
 */
export type EarlyAccessPaymentInstructionsPresentation =
  | Readonly<{ state: "unresolved" }>
  | Readonly<{
      state: "resolved";
      /** Server-formatted amount due, e.g. "$1,250.00". Rendered as given. */
      amountDueDisplay: string;
      /** ISO currency code, for display beside the amount. */
      currency: string;
      /** The order's payment reference, issued by the server. */
      paymentReference: string;
      /** What to call the reference on screen. */
      referenceLabel: string;
      methods: readonly EarlyAccessPaymentInstruction[];
    }>;

const UNRESOLVED: EarlyAccessPaymentInstructionsPresentation = Object.freeze({
  state: "unresolved" as const,
});

export function unresolvedEarlyAccessPaymentInstructions(): EarlyAccessPaymentInstructionsPresentation {
  return UNRESOLVED;
}

const PAYMENT_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9-]{7,63}$/;
const CURRENCY = /^[A-Z]{3}$/;
// Control characters, including the bidirectional overrides that can make a
// destination read as something other than what would be copied.
const UNSAFE_TEXT = /[\u0000-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/;

const INSTRUCTION_KEYS = [
  "code",
  "methodName",
  "destinationLabel",
  "destinationValue",
  "paymentUrl",
  "steps",
  "copyValue",
  "referenceRequired",
] as const;

const RESOLVED_KEYS = [
  "state",
  "amountDueDisplay",
  "currency",
  "paymentReference",
  "referenceLabel",
  "methods",
] as const;

/**
 * Read a plain object's own data properties without ever evaluating a getter.
 * An accessor, a symbol key, an unexpected key, a missing key, or a foreign
 * prototype all return null so the caller fails closed instead of repairing.
 */
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
        (key) => typeof key !== "string" || !expectedKeys.includes(key),
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

/** A plain array of own data properties, nothing exotic, nothing longer than `max`. */
function readPlainArray(value: unknown, max: number): readonly unknown[] | null {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as
      Record<string, PropertyDescriptor>;
    const length = descriptors.length;
    if (
      length === undefined ||
      !("value" in length) ||
      typeof length.value !== "number" ||
      !Number.isSafeInteger(length.value) ||
      length.value < 0 ||
      length.value > max ||
      Reflect.ownKeys(value).length !== length.value + 1
    ) {
      return null;
    }
    const items: unknown[] = [];
    for (let index = 0; index < length.value; index += 1) {
      const descriptor = descriptors[String(index)];
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        descriptor.enumerable !== true
      ) {
        return null;
      }
      items.push(descriptor.value);
    }
    return items;
  } catch {
    return null;
  }
}

/**
 * Browser-native structured cloning rejects a Proxy. Accessors have already
 * been refused by the descriptor checks above, so this can never invoke an
 * input getter; it only rules out a transparent Proxy imitating a record.
 */
function isCloneable(value: unknown): boolean {
  try {
    if (typeof structuredClone !== "function") return false;
    structuredClone(value);
    return true;
  } catch {
    return false;
  }
}

function isSafeText(value: unknown, max: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= max &&
    value.trim() === value &&
    !UNSAFE_TEXT.test(value)
  );
}

function isSafeTextOrNull(value: unknown, max: number): value is string | null {
  return value === null || isSafeText(value, max);
}

/**
 * Only an absolute https URL with no embedded credentials is admitted. A
 * javascript:, data:, or http: link never reaches an anchor, and a URL that
 * carries a username or password is refused outright rather than sanitized.
 */
export function isSafePaymentUrl(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > EARLY_ACCESS_PAYMENT_INSTRUCTION_LIMITS.paymentUrl ||
    value.trim() !== value ||
    UNSAFE_TEXT.test(value)
  ) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    url.hostname.length > 0
  );
}

function readInstruction(value: unknown): EarlyAccessPaymentInstruction | null {
  const descriptors = readExactDataProperties(value, INSTRUCTION_KEYS);
  if (descriptors === null) return null;

  const limits = EARLY_ACCESS_PAYMENT_INSTRUCTION_LIMITS;
  const code = descriptors.code?.value;
  const methodName = descriptors.methodName?.value;
  const destinationLabel = descriptors.destinationLabel?.value;
  const destinationValue = descriptors.destinationValue?.value;
  const paymentUrl = descriptors.paymentUrl?.value;
  const copyValue = descriptors.copyValue?.value;
  const referenceRequired = descriptors.referenceRequired?.value;

  if (
    !isEarlyAccessPaymentOptionCode(code) ||
    !isSafeText(methodName, limits.methodName) ||
    !isSafeTextOrNull(destinationLabel, limits.destinationLabel) ||
    !isSafeTextOrNull(destinationValue, limits.destinationValue) ||
    !isSafeTextOrNull(copyValue, limits.copyValue) ||
    typeof referenceRequired !== "boolean" ||
    (paymentUrl !== null && !isSafePaymentUrl(paymentUrl))
  ) {
    return null;
  }

  const rawSteps = readPlainArray(descriptors.steps?.value, limits.steps);
  if (rawSteps === null) return null;
  const steps: string[] = [];
  for (const step of rawSteps) {
    if (!isSafeText(step, limits.step)) return null;
    steps.push(step);
  }

  // A card with no name and nothing to act on is not a payment method.
  if (destinationValue === null && paymentUrl === null && steps.length === 0) {
    return null;
  }

  return Object.freeze({
    code,
    methodName,
    destinationLabel: destinationLabel as string | null,
    destinationValue: destinationValue as string | null,
    paymentUrl: paymentUrl as string | null,
    steps: Object.freeze(steps),
    copyValue: copyValue as string | null,
    referenceRequired,
  });
}

/**
 * Decode an untrusted wire value without repairing it. Only the exact
 * presentation union is accepted; anything else returns `null` so the caller
 * shows nothing rather than a partial or reordered set of ways to send money.
 */
export function parseEarlyAccessPaymentInstructionsPresentation(
  value: unknown,
): EarlyAccessPaymentInstructionsPresentation | null {
  const unresolved = readExactDataProperties(value, ["state"]);
  if (unresolved !== null) {
    if (unresolved.state?.value !== "unresolved") return null;
    return isCloneable(value) ? UNRESOLVED : null;
  }

  const descriptors = readExactDataProperties(value, RESOLVED_KEYS);
  if (descriptors === null || descriptors.state?.value !== "resolved") {
    return null;
  }

  const limits = EARLY_ACCESS_PAYMENT_INSTRUCTION_LIMITS;
  const amountDueDisplay = descriptors.amountDueDisplay?.value;
  const currency = descriptors.currency?.value;
  const paymentReference = descriptors.paymentReference?.value;
  const referenceLabel = descriptors.referenceLabel?.value;
  if (
    !isSafeText(amountDueDisplay, limits.amountDueDisplay) ||
    typeof currency !== "string" ||
    !CURRENCY.test(currency) ||
    typeof paymentReference !== "string" ||
    !PAYMENT_REFERENCE.test(paymentReference) ||
    !isSafeText(referenceLabel, limits.referenceLabel)
  ) {
    return null;
  }

  const rawMethods = readPlainArray(
    descriptors.methods?.value,
    EARLY_ACCESS_PAYMENT_OPTION_CODES.length,
  );
  if (rawMethods === null) return null;

  const methods: EarlyAccessPaymentInstruction[] = [];
  let previousIndex = -1;
  for (const raw of rawMethods) {
    const instruction = readInstruction(raw);
    if (instruction === null) return null;
    // Canonical order, no repeats. A duplicated method is a rewritten payload,
    // not a display preference.
    const index = EARLY_ACCESS_PAYMENT_OPTION_CODES.indexOf(instruction.code);
    if (index <= previousIndex) return null;
    previousIndex = index;
    methods.push(instruction);
  }

  // Run this only after every nested shape has passed its descriptor checks, so
  // a hostile nested accessor can never be evaluated by cloning.
  if (!isCloneable(value)) return null;

  return Object.freeze({
    state: "resolved" as const,
    amountDueDisplay,
    currency,
    paymentReference,
    referenceLabel,
    methods: Object.freeze(methods),
  });
}

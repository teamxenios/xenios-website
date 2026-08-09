/**
 * Server-only configuration contract for the Early Access payment screen.
 *
 * WHY THIS EXISTS. `early-access-invoice.ts` deliberately issues a
 * method-agnostic instruction line that names no destination, and
 * `manual-order-payment-method-adapter.ts` publishes category codes only. Both
 * are correct, and together they leave a real gap: a customer holding a valid
 * invoice has no way to learn where to send the money. This module closes that
 * gap in the one way the rest of the system permits, by treating every
 * customer-facing payment value as CONFIGURATION resolved on the server.
 *
 * RULES ENFORCED HERE IN CODE, NOT BY CONVENTION.
 *   - No destination is ever written in source. Zelle addresses, cashtags,
 *     Venmo handles, PayPal identifiers, Apple Cash destinations, and bank
 *     details exist only in the deployment's configuration, never in this
 *     repository and never in a default.
 *   - Configuration is all-or-nothing. One malformed method refuses the whole
 *     document, so a customer never sees a half-resolved list of ways to pay.
 *   - Only https links are admitted, with no embedded credentials.
 *   - Money is formatted ONCE, here, from the server's own integer cents. The
 *     browser receives a string and renders it. It never gets the cents.
 *   - Nothing in this module settles, verifies, or reports a payment. Building
 *     a presentation leaves the order awaiting_payment.
 *
 * Note on sensitivity: these values are customer-facing by design, but they are
 * still payment destinations. They belong in the deployment's secret store
 * alongside other operational configuration, they are served only to an
 * authenticated Early Access customer who owns the order, and `describeConfig`
 * exists so an operator can log that configuration loaded without logging what
 * it contained.
 */

import {
  EARLY_ACCESS_PAYMENT_OPTION_CODES,
  isEarlyAccessPaymentOptionCode,
  type EarlyAccessPaymentOptionCode,
} from "@shared/research/early-access-payment-options";
import {
  EARLY_ACCESS_PAYMENT_INSTRUCTION_LIMITS as LIMITS,
  isSafePaymentUrl,
  unresolvedEarlyAccessPaymentInstructions,
  type EarlyAccessPaymentInstruction,
  type EarlyAccessPaymentInstructionsPresentation,
} from "@shared/research/early-access-payment-instructions";

/**
 * The NAME of the variable is the only thing code knows. The document itself is
 * injected by the platform at boot and is never committed, printed, or echoed.
 */
export const EARLY_ACCESS_PAYMENT_INSTRUCTIONS_ENV =
  "EARLY_ACCESS_PAYMENT_INSTRUCTIONS";

export const DEFAULT_PAYMENT_REFERENCE_LABEL = "Payment reference";

/** One configured method. Every field is data supplied by the deployment. */
export type EarlyAccessPaymentMethodConfig = Readonly<{
  code: EarlyAccessPaymentOptionCode;
  methodName: string;
  destinationLabel: string | null;
  destinationValue: string | null;
  paymentUrl: string | null;
  steps: readonly string[];
  copyValue: string | null;
  referenceRequired: boolean;
}>;

export type EarlyAccessPaymentInstructionsConfig = Readonly<{
  referenceLabel: string;
  methods: readonly EarlyAccessPaymentMethodConfig[];
}>;

export type PaymentInstructionsConfigFailure =
  | "config_absent"
  | "config_invalid";

export type PaymentInstructionsConfigResult =
  | Readonly<{ state: "accepted"; value: EarlyAccessPaymentInstructionsConfig }>
  | Readonly<{ state: "refused"; code: PaymentInstructionsConfigFailure }>;

/** The seam configuration arrives through. Injected, so tests never touch env. */
export interface EarlyAccessPaymentInstructionsConfigSource {
  /** Returns the raw document, or null when the deployment configured none. */
  read(): unknown;
}

const UNSAFE_TEXT = /[\u0000-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/;
const CURRENCY = /^[A-Z]{3}$/;
const PAYMENT_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9-]{7,63}$/;
/** One million dollars. A larger figure is a defect, not an order. */
const MAX_AMOUNT_CENTS = 100_000_000;

const METHOD_KEYS = [
  "code",
  "methodName",
  "destinationLabel",
  "destinationValue",
  "paymentUrl",
  "steps",
  "copyValue",
  "referenceRequired",
] as const;

const OPTIONAL_METHOD_KEYS = [
  "destinationLabel",
  "destinationValue",
  "paymentUrl",
  "steps",
  "copyValue",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasOnlyKnownKeys(
  value: Record<string, unknown>,
  known: readonly string[],
): boolean {
  return Reflect.ownKeys(value).every(
    (key) => typeof key === "string" && known.includes(key),
  );
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= max &&
    !UNSAFE_TEXT.test(value)
    ? value.trim()
    : null;
}

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  return text(value, max) ?? undefined;
}

function readSteps(value: unknown): readonly string[] | undefined {
  if (value === undefined || value === null) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > LIMITS.steps) return undefined;
  const steps: string[] = [];
  for (const raw of value) {
    const step = text(raw, LIMITS.step);
    if (step === null) return undefined;
    steps.push(step);
  }
  return Object.freeze(steps);
}

function readMethod(value: unknown): EarlyAccessPaymentMethodConfig | null {
  if (!isRecord(value) || !hasOnlyKnownKeys(value, METHOD_KEYS)) return null;
  for (const key of METHOD_KEYS) {
    if (
      !(key in value) &&
      !(OPTIONAL_METHOD_KEYS as readonly string[]).includes(key)
    ) {
      return null;
    }
  }

  const code = value.code;
  if (!isEarlyAccessPaymentOptionCode(code)) return null;

  const methodName = text(value.methodName, LIMITS.methodName);
  if (methodName === null) return null;

  const destinationLabel = optionalText(
    value.destinationLabel,
    LIMITS.destinationLabel,
  );
  const destinationValue = optionalText(
    value.destinationValue,
    LIMITS.destinationValue,
  );
  const copyValue = optionalText(value.copyValue, LIMITS.copyValue);
  if (
    destinationLabel === undefined ||
    destinationValue === undefined ||
    copyValue === undefined
  ) {
    return null;
  }

  const steps = readSteps(value.steps);
  if (steps === undefined) return null;

  const rawUrl = value.paymentUrl;
  const paymentUrl =
    rawUrl === undefined || rawUrl === null
      ? null
      : isSafePaymentUrl(rawUrl)
        ? rawUrl
        : undefined;
  if (paymentUrl === undefined) return null;

  if (typeof value.referenceRequired !== "boolean") return null;

  // A method a customer cannot act on is a configuration mistake, not a choice.
  if (destinationValue === null && paymentUrl === null && steps.length === 0) {
    return null;
  }

  return Object.freeze({
    code,
    methodName,
    destinationLabel,
    // The clipboard defaults to the destination, so an operator cannot forget
    // to make the value copyable, and can still override it deliberately.
    destinationValue,
    paymentUrl,
    steps,
    copyValue: copyValue ?? destinationValue,
    referenceRequired: value.referenceRequired,
  });
}

/**
 * Decode the deployment's payment-instruction document. One bad method refuses
 * the whole document: a partially resolved list of ways to send money is worse
 * than none, because the customer cannot tell which part was dropped.
 */
export function parseEarlyAccessPaymentInstructionsConfig(
  value: unknown,
): PaymentInstructionsConfigResult {
  if (value === null || value === undefined) {
    return Object.freeze({ state: "refused" as const, code: "config_absent" as const });
  }
  if (!isRecord(value) || !hasOnlyKnownKeys(value, ["referenceLabel", "methods"])) {
    return Object.freeze({ state: "refused" as const, code: "config_invalid" as const });
  }

  const referenceLabel =
    value.referenceLabel === undefined || value.referenceLabel === null
      ? DEFAULT_PAYMENT_REFERENCE_LABEL
      : text(value.referenceLabel, LIMITS.referenceLabel);
  if (referenceLabel === null) {
    return Object.freeze({ state: "refused" as const, code: "config_invalid" as const });
  }

  if (!Array.isArray(value.methods) || value.methods.length === 0) {
    return Object.freeze({ state: "refused" as const, code: "config_invalid" as const });
  }

  const seen = new Set<EarlyAccessPaymentOptionCode>();
  const methods: EarlyAccessPaymentMethodConfig[] = [];
  for (const raw of value.methods) {
    const method = readMethod(raw);
    if (method === null || seen.has(method.code)) {
      return Object.freeze({ state: "refused" as const, code: "config_invalid" as const });
    }
    seen.add(method.code);
    methods.push(method);
  }

  // Canonical order is decided here, once, so no downstream surface can reorder
  // the ways to pay by rearranging the document.
  methods.sort(
    (a, b) =>
      EARLY_ACCESS_PAYMENT_OPTION_CODES.indexOf(a.code) -
      EARLY_ACCESS_PAYMENT_OPTION_CODES.indexOf(b.code),
  );

  return Object.freeze({
    state: "accepted" as const,
    value: Object.freeze({
      referenceLabel,
      methods: Object.freeze(methods),
    }),
  });
}

/**
 * Read the document from the named environment variable. Absent means absent,
 * not empty: a deployment with no configuration serves no payment details
 * rather than an empty screen that looks configured.
 */
export function createEnvPaymentInstructionsConfigSource(
  env: NodeJS.ProcessEnv = process.env,
  variableName: string = EARLY_ACCESS_PAYMENT_INSTRUCTIONS_ENV,
): EarlyAccessPaymentInstructionsConfigSource {
  return Object.freeze({
    read(): unknown {
      const raw = env[variableName];
      if (typeof raw !== "string" || raw.trim().length === 0) return null;
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        // The parse failure itself is the signal. The document is never echoed,
        // because whatever is in it is a payment destination.
        return Object.freeze({ malformed: true });
      }
    },
  });
}

/**
 * A log-safe description. Codes and counts only, never a destination, a URL, a
 * label, or a step. This is the ONLY shape an operator should ever log.
 */
export function describeEarlyAccessPaymentInstructionsConfig(
  config: EarlyAccessPaymentInstructionsConfig,
): Readonly<{ methodCount: number; codes: readonly EarlyAccessPaymentOptionCode[] }> {
  return Object.freeze({
    methodCount: config.methods.length,
    codes: Object.freeze(config.methods.map((method) => method.code)),
  });
}

/** The server's single money formatting point for this screen. */
function formatAmountDue(amountCents: number, currency: string): string | null {
  try {
    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amountCents / 100);
    return formatted.length > 0 && formatted.length <= LIMITS.amountDueDisplay
      ? formatted
      : null;
  } catch {
    return null;
  }
}

export interface BuildEarlyAccessPaymentInstructionsInput {
  readonly config: EarlyAccessPaymentInstructionsConfig;
  /**
   * Codes the protected method registry currently reports as enabled, from
   * `resolveEarlyAccessPaymentOptionsPresentation`. Configuration alone never
   * makes a method payable: the registry still decides.
   */
  readonly enabledCodes: readonly unknown[];
  readonly amountDueCents: unknown;
  readonly currency: unknown;
  readonly paymentReference: unknown;
}

/**
 * Project configuration plus this order's own invoice into the customer-facing
 * presentation. A method appears only when it is BOTH configured here AND
 * enabled in the protected registry, so an unconfigured or disabled method is
 * absent rather than shown in a broken state.
 *
 * Anything unexpected returns `unresolved`. The screen then tells the customer
 * that details are being confirmed, which is true, instead of guessing.
 */
export function buildEarlyAccessPaymentInstructionsPresentation(
  input: BuildEarlyAccessPaymentInstructionsInput,
): EarlyAccessPaymentInstructionsPresentation {
  const { amountDueCents, currency, paymentReference } = input;
  if (
    typeof amountDueCents !== "number" ||
    !Number.isSafeInteger(amountDueCents) ||
    amountDueCents <= 0 ||
    amountDueCents > MAX_AMOUNT_CENTS ||
    typeof currency !== "string" ||
    !CURRENCY.test(currency) ||
    typeof paymentReference !== "string" ||
    !PAYMENT_REFERENCE.test(paymentReference) ||
    !Array.isArray(input.enabledCodes)
  ) {
    return unresolvedEarlyAccessPaymentInstructions();
  }

  const enabled = new Set<EarlyAccessPaymentOptionCode>();
  for (const code of input.enabledCodes) {
    // An unknown code is a contract drift, not a method to skip quietly.
    if (!isEarlyAccessPaymentOptionCode(code)) {
      return unresolvedEarlyAccessPaymentInstructions();
    }
    enabled.add(code);
  }

  const amountDueDisplay = formatAmountDue(amountDueCents, currency);
  if (amountDueDisplay === null) {
    return unresolvedEarlyAccessPaymentInstructions();
  }

  const methods: EarlyAccessPaymentInstruction[] = input.config.methods
    .filter((method) => enabled.has(method.code))
    .map((method) =>
      Object.freeze({
        code: method.code,
        methodName: method.methodName,
        destinationLabel: method.destinationLabel,
        destinationValue: method.destinationValue,
        paymentUrl: method.paymentUrl,
        steps: method.steps,
        copyValue: method.copyValue,
        referenceRequired: method.referenceRequired,
      }),
    );

  return Object.freeze({
    state: "resolved" as const,
    amountDueDisplay,
    currency,
    paymentReference,
    referenceLabel: input.config.referenceLabel,
    methods: Object.freeze(methods),
  });
}

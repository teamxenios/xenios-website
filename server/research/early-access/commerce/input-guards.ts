/**
 * Defensive input primitives shared by the Early Access manual-payment domain.
 *
 * Every module in this folder is a pure function over injected values. There is no
 * clock, no randomness, no environment, no database, and no network here, so a
 * decision is reproducible from its inputs alone and every branch is reachable from
 * a test. Ids and timestamps are supplied by the caller for the same reason.
 *
 * Hostile input is a closed boundary rather than an exception. A Proxy, an accessor
 * property, an unexpected key, a prototype-polluted object, or a non-finite number
 * all read as "no record", and the caller returns a refusal code instead of throwing.
 */

/** The shared fail-closed union. Callers switch on `code`, never on a message. */
export type CommerceResult<TValue, TCode extends string> =
  | Readonly<{ ok: true; value: TValue }>
  | Readonly<{ ok: false; code: TCode }>;

/** Frozen so an accepted decision cannot be rewritten in place by a later caller. */
export function accepted<TValue, TCode extends string>(
  value: TValue,
): CommerceResult<TValue, TCode> {
  return Object.freeze({ ok: true as const, value });
}

export function refused<TValue, TCode extends string>(
  code: TCode,
): CommerceResult<TValue, TCode> {
  return Object.freeze({ ok: false as const, code });
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{2,127}$/;
const CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** C0 controls, DEL, the C1 range, and the two Unicode line separators. */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029) {
      return true;
    }
  }
  return false;
}

/**
 * Browser-native structured cloning rejects Proxy objects and functions. Accessor
 * properties are already refused by the descriptor walk at every call site, so this
 * runs only over values that already looked like plain data.
 */
function isStructuredCloneable(value: unknown): boolean {
  try {
    if (typeof structuredClone !== "function") return false;
    structuredClone(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a plain object without invoking accessors. Extra keys, missing required keys,
 * getters, exotic prototypes, and Proxy wrappers all produce `null`, which every
 * caller turns into a refusal code.
 */
export function readPlainRecord(
  input: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): Record<string, unknown> | null {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return null;

    const allowedKeys = [...requiredKeys, ...optionalKeys];
    const ownKeys = Reflect.ownKeys(input);
    if (ownKeys.length > allowedKeys.length) return null;
    for (const key of ownKeys) {
      if (typeof key !== "string" || !allowedKeys.includes(key)) return null;
    }
    for (const key of requiredKeys) {
      if (!ownKeys.includes(key)) return null;
    }

    const descriptors = Object.getOwnPropertyDescriptors(input) as Record<
      string,
      PropertyDescriptor | undefined
    >;
    const detached: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of allowedKeys) {
      const descriptor = descriptors[key];
      // An absent optional key is legal; a present one must be a data property.
      if (descriptor === undefined) continue;
      if (!("value" in descriptor) || descriptor.enumerable !== true) return null;
      detached[key] = descriptor.value;
    }

    // Run last, so the descriptor walk has already refused top-level accessors.
    if (!isStructuredCloneable(input)) return null;
    return detached;
  } catch {
    return null;
  }
}

/** Read a dense array of data properties, bounded, without invoking accessors. */
export function readPlainArray(input: unknown, maxLength: number): readonly unknown[] | null {
  try {
    if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(input) as Record<
      string,
      PropertyDescriptor | undefined
    >;
    const lengthDescriptor = descriptors["length"];
    if (!lengthDescriptor || !("value" in lengthDescriptor)) return null;
    const length: unknown = lengthDescriptor.value;
    if (
      typeof length !== "number" ||
      !Number.isSafeInteger(length) ||
      length < 0 ||
      length > maxLength
    ) {
      return null;
    }
    const ownKeys = Reflect.ownKeys(input);
    if (ownKeys.length !== length + 1) return null;

    const detached: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) return null;
      detached.push(descriptor.value);
    }
    if (!isStructuredCloneable(input)) return null;
    return Object.freeze(detached);
  } catch {
    return null;
  }
}

/**
 * True when the input carries any of the named keys. Used to refuse a caller that
 * tries to supply a value this domain must compute for itself, such as an order
 * total, or that tries to hand bytes to a metadata-only lane.
 */
export function carriesAnyKey(input: unknown, keys: readonly string[]): boolean {
  try {
    if (typeof input !== "object" || input === null) return false;
    const ownKeys = Reflect.ownKeys(input);
    return keys.some((key) => ownKeys.includes(key));
  } catch {
    return false;
  }
}

export function isSafeIdentifier(value: unknown): value is string {
  return typeof value === "string" && SAFE_IDENTIFIER.test(value);
}

/** Strict UTC millisecond ISO-8601. Parsing a string is deterministic, not a clock read. */
export function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !CANONICAL_TIMESTAMP.test(value)) return false;
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) return false;
  return new Date(millis).toISOString() === value;
}

/** Canonical UTC timestamps sort lexicographically, so no clock is needed to order them. */
export function isNotBefore(later: string, earlier: string): boolean {
  return later >= earlier;
}

export function isPositiveCents(value: unknown, maxCents: number): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= maxCents
  );
}

export function isBoundedInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}

/** Printable, trimmed, single-line text. Control characters are refused outright. */
export function isBoundedText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    value.trim() === value &&
    !hasControlCharacter(value)
  );
}

export function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

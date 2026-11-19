/**
 * Optional customer-reported referral facts. Neither field is a verified
 * referrer, customer identity, account assignment, access grant or commission.
 * No directory, browser storage, network or clock is consulted here.
 */
export const REFERRAL_NAME_MAX_CODE_POINTS = 80;
export const REFERRAL_CODE_MAX_LENGTH = 24;

export type DeclaredReferralInput = Readonly<{
  referralName?: string;
  referralCode?: string;
}>;

export class InvalidDeclaredReferralInput extends Error {
  readonly code = "invalid_declared_referral_input";
  constructor() {
    // Never put the submitted value into an exception or a log message.
    super("Check the optional referral name or code, or leave it empty.");
    this.name = "InvalidDeclaredReferralInput";
  }
}

const CODE = /^[A-Za-z0-9][A-Za-z0-9-]{1,23}$/;
// Keep ordinary Unicode letters, marks, spaces and punctuation. Reject control
// characters, line separators, and invisible directional overrides/isolation.
// ZWNJ/ZWJ remain valid because they can be meaningful in personal names.
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u200b\u2028\u2029\u202a-\u202e\u2060\u2066-\u2069\ufeff]/u;
const LONE_SURROGATE = /[\ud800-\udfff]/u;
const invalid = (): never => { throw new InvalidDeclaredReferralInput(); };

function normalizeName(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  // Bound work before NFC normalization. The authoritative display limit is
  // measured after normalization in Unicode code points, matching SQL length.
  if (typeof value !== "string" || value.length > 512
    || UNSAFE_TEXT.test(value) || LONE_SURROGATE.test(value)) return invalid();
  const name = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (!name) return undefined;
  if ([...name].length > REFERRAL_NAME_MAX_CODE_POINTS) return invalid();
  return name;
}

function normalizeCode(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  // Preserve the existing optional-intake code contract, including its raw
  // input bound, case and trim behavior. This does not look up a code.
  if (typeof value !== "string" || value.length > 32) return invalid();
  const code = value.trim();
  if (!code) return undefined;
  if (!CODE.test(code)) return invalid();
  return code;
}

/**
 * Undefined, an empty object or empty answers means skipped. A name is never
 * guessed to be a code, and a code is never resolved to a person. Both may be
 * supplied as independent unverified facts for an authorized reviewer.
 */
export function normalizeDeclaredReferralInput(value: unknown): DeclaredReferralInput | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object" || Array.isArray(value)) return invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => key !== "referralName" && key !== "referralCode")) return invalid();
  // Route JSON has data properties; do not execute accessors supplied by other callers.
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) return invalid();
  }
  // Read own data values only: a polluted Object.prototype must not invent an
  // answer or execute an inherited getter for an omitted optional field.
  const referralName = normalizeName(Object.getOwnPropertyDescriptor(value, "referralName")?.value);
  const referralCode = normalizeCode(Object.getOwnPropertyDescriptor(value, "referralCode")?.value);
  if (!referralName && !referralCode) return undefined;
  return Object.freeze({
    ...(referralName ? { referralName } : {}),
    ...(referralCode ? { referralCode } : {}),
  });
}

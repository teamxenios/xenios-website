/**
 * The affiliate code a CUSTOMER TYPED, which is a claim and nothing more.
 *
 * THIS IS NOT ATTRIBUTION. The platform already has attribution: a signed
 * referral cookie the server verifies, resolved by
 * `verifiedAttributionRefFromCookieHeader` and stored on the request as
 * `affiliate_attribution_ref`. That value is proof. This one is a string a
 * stranger typed into a form, and the two must never be written to the same
 * place — the assisted-order service refuses a browser-supplied attribution on
 * purpose, because the browser must not be able to choose which partner an
 * order pays. Collapsing them would hand away exactly that.
 *
 * So a declared code is recorded as its own fact, with its own state, and it
 * stays unmatched until a human matches it. It grants nothing: it cannot change
 * a price, unlock a product, alter a pathway, mark a payment, confer a
 * permission, or move ownership of an order. It exists so the founder can look
 * at a request and see what the customer said.
 *
 * NOTHING HERE THROWS. An unknown or malformed code must never cost a customer
 * their order (founder rule, 2026-08-20): the worst outcome for junk input is
 * that it is dropped and the order proceeds without it.
 */

/** How far a declared code has travelled toward being a real affiliate. */
export type DeclaredAffiliateCodeState =
  /** The customer left the field empty. The overwhelmingly common case. */
  | "not_provided"
  /** A well-formed code nobody has matched to an owner yet. */
  | "captured_unmatched"
  /** A human matched it to an affiliate owner. Only an admin may set this. */
  | "matched_manual"
  /** Something was typed, and it could not be a code. Dropped, never stored. */
  | "invalid_ignored";

export type DeclaredAffiliateCode = Readonly<{
  state: DeclaredAffiliateCodeState;
  /** The normalized code, or null. Never the raw input. */
  code: string | null;
}>;

/**
 * Bounds. Deliberately conservative: this value is displayed in an operator
 * console and an email, so it must not be able to carry a paragraph, a script,
 * or a lookalike of some other identifier.
 */
export const DECLARED_AFFILIATE_CODE_MIN_LENGTH = 2;
export const DECLARED_AFFILIATE_CODE_MAX_LENGTH = 40;

/**
 * Uppercase letters, digits, and three joiners. No spaces, no punctuation that
 * reads as markup or a path, nothing that could be mistaken for an email or a
 * URL. Case is normalized UP so "dana10", "Dana10" and "DANA10" are one code
 * and the founder does not match the same affiliate three times.
 */
const ALLOWED = /^[A-Z0-9][A-Z0-9._-]*$/;

const NOT_PROVIDED: DeclaredAffiliateCode = Object.freeze({
  state: "not_provided" as const,
  code: null,
});

const INVALID: DeclaredAffiliateCode = Object.freeze({
  state: "invalid_ignored" as const,
  code: null,
});

/**
 * Read whatever the browser sent, and answer with a fact.
 *
 * Absent, blank, or the wrong type is `not_provided` rather than invalid: a
 * customer who never touched an optional field did nothing wrong, and calling
 * that "invalid" would put a scary word in an operator's console for the most
 * ordinary case there is.
 */
export function normalizeDeclaredAffiliateCode(raw: unknown): DeclaredAffiliateCode {
  if (typeof raw !== "string") return NOT_PROVIDED;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return NOT_PROVIDED;

  const upper = trimmed.toUpperCase();
  if (
    upper.length < DECLARED_AFFILIATE_CODE_MIN_LENGTH ||
    upper.length > DECLARED_AFFILIATE_CODE_MAX_LENGTH
  ) {
    return INVALID;
  }
  if (!ALLOWED.test(upper)) return INVALID;

  return Object.freeze({ state: "captured_unmatched" as const, code: upper });
}

/**
 * What an authorized operator sees. Separate from the stored fact so a surface
 * cannot accidentally render a raw state name at a customer.
 */
export function describeDeclaredAffiliateCode(value: DeclaredAffiliateCode): string {
  switch (value.state) {
    case "not_provided":
      return "None provided";
    case "captured_unmatched":
      return `${value.code ?? ""} (unmatched)`;
    case "matched_manual":
      return `${value.code ?? ""} (matched)`;
    case "invalid_ignored":
      return "Ignored (not a usable code)";
  }
}

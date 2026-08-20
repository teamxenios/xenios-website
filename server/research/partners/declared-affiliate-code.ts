// xenios research: the customer-declared affiliate code — a CLAIM, not an
// attribution.
//
// Founder requirement 5 (2026-08-20): the customer may type an optional
// affiliate code; it is stored with the request and the canonical order, shown
// to authorized admin, and matched to an owner BY HAND. It changes no retail
// price, no access, no payment, no product eligibility, and no order ownership.
//
// THE ONE DISTINCTION THIS MODULE EXISTS TO PRESERVE. There are two different
// affiliate facts and they must never merge:
//
//   affiliateAttributionRef  — server-verified, from the HMAC-signed xr_aff
//                              cookie. Decides which partner an order could
//                              pay. The browser cannot influence it, and
//                              service.ts:418-421 deliberately ignores any
//                              body-supplied value to keep it that way.
//   declaredAffiliateCode    — this module. A string the customer typed. It is
//                              evidence of intent and nothing more until a
//                              human matches it.
//
// Collapsing them would hand the browser exactly the power that comment exists
// to deny, so nothing here ever writes into `affiliate_attribution_ref`, and
// no value here is ever consulted when money is computed.
//
// AN UNUSABLE CODE MUST NEVER STOP AN ORDER. Every function below is total: it
// returns a typed refusal and never throws, so a customer who pastes an emoji,
// an essay, or their referrer's email address still completes checkout.

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export const DECLARED_AFFILIATE_CODE_STATES = [
  /** The customer left the field empty. The normal case; not a problem. */
  "not_provided",
  /** A usable claim is on file and nobody has matched it yet. */
  "captured_unmatched",
  /** An authorized admin matched the claim to a partner, by hand. */
  "matched_manual",
  /** Something was typed that cannot serve as a code. Never blocks the order. */
  "invalid_ignored",
] as const;

export type DeclaredAffiliateCodeState =
  (typeof DECLARED_AFFILIATE_CODE_STATES)[number];

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/** The field invites "a code, or who referred you", so names must fit. */
export const DECLARED_CODE_MAX_RAW_LENGTH = 80;

/** The comparison key is alphanumeric only, so it stays short. */
export const DECLARED_CODE_MAX_KEY_LENGTH = 64;

export type DeclaredAffiliateCodeNormalization =
  | Readonly<{ state: "not_provided" }>
  | Readonly<{
      state: "captured_unmatched";
      /**
       * The customer's own words, cleaned but not reinterpreted: control
       * characters removed, internal whitespace collapsed, ends trimmed,
       * bounded. Kept verbatim because a human does the matching, and
       * "Jane Smith" is exactly the evidence that person needs.
       */
      rawCode: string;
      /**
       * The comparison key: uppercase, letters and digits only. This is what a
       * manual match compares against a partner's issued code, so "xen-101",
       * "XEN 101" and "Xen101" all reconcile to XEN101 without the operator
       * having to guess at punctuation.
       */
      matchKey: string;
    }>
  | Readonly<{
      state: "invalid_ignored";
      /**
       * Deliberately no value. Two cases reach here, and neither should be
       * stored: an address-shaped entry is another person's identity (the same
       * privacy rule the touch ledger and the binding table enforce), and a
       * punctuation-only entry carries nothing to match. Admin still learns
       * that SOMETHING was typed, which is the part that matters when an
       * affiliate insists they sent the customer.
       */
      reason: "address_shaped" | "no_matchable_characters";
    }>;

// Control characters, including the ones a paste from a document carries.
// Stripped rather than rejected: invisible characters are not the customer's
// fault and must not cost them a referral.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\uFEFF]/g;

/**
 * Normalize whatever the customer typed.
 *
 * Total by construction: every input maps to one of the three outcomes, and
 * nothing throws. `undefined`, `null`, a non-string, and an all-whitespace
 * string are all simply "not_provided" — the overwhelmingly common case, and
 * not an error in any sense.
 */
export function normalizeDeclaredAffiliateCode(
  raw: unknown,
): DeclaredAffiliateCodeNormalization {
  if (typeof raw !== "string") return { state: "not_provided" };

  const cleaned = raw
    .replace(CONTROL_CHARACTERS, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, DECLARED_CODE_MAX_RAW_LENGTH)
    // Slicing can leave a trailing space when the cut lands mid-gap.
    .trim();

  if (cleaned.length === 0) return { state: "not_provided" };

  // An email address is a person, not a code. Refused BEFORE it is stored, so
  // this table can never become a place third-party identity accumulates.
  if (cleaned.includes("@")) {
    return { state: "invalid_ignored", reason: "address_shaped" };
  }

  const matchKey = cleaned
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, DECLARED_CODE_MAX_KEY_LENGTH);

  if (matchKey.length === 0) {
    return { state: "invalid_ignored", reason: "no_matchable_characters" };
  }

  return { state: "captured_unmatched", rawCode: cleaned, matchKey };
}

// ---------------------------------------------------------------------------
// The append-only event ledger
// ---------------------------------------------------------------------------

/**
 * Capture happens once, at submit, and is immutable: it is what the customer
 * actually typed. A manual match is a SEPARATE, later, admin fact.
 *
 * Both are events rather than columns, following the commission ledger's
 * discipline: a mistaken match is corrected by appending a clearing event, and
 * never by rewriting history, so the store needs no UPDATE grant and an
 * operator's earlier judgment stays auditable.
 */
export type DeclaredAffiliateCodeEvent =
  | Readonly<{
      kind: "captured";
      /** The canonical request/order reference this claim belongs to. */
      requestRef: string;
      /** Null exactly when the normalization refused the entry. */
      rawCode: string | null;
      matchKey: string | null;
      invalidReason: "address_shaped" | "no_matchable_characters" | null;
      occurredAt: string;
    }>
  | Readonly<{
      kind: "matched";
      requestRef: string;
      /** The partner an authorized human decided this claim refers to. */
      partnerId: string;
      /** Always named: a manual match is somebody's judgment, on the record. */
      matchedByAdminId: string;
      note: string | null;
      occurredAt: string;
    }>
  | Readonly<{
      kind: "match_cleared";
      requestRef: string;
      clearedByAdminId: string;
      note: string | null;
      occurredAt: string;
    }>;

/** What an authorized admin screen may see about one request's claim. */
export type DeclaredAffiliateCodeProjection = Readonly<{
  state: DeclaredAffiliateCodeState;
  /** The customer's words, when one was usable. Labelled unverified in every UI. */
  rawCode: string | null;
  matchKey: string | null;
  invalidReason: "address_shaped" | "no_matchable_characters" | null;
  /** Set only in matched_manual. */
  matchedPartnerId: string | null;
  matchedByAdminId: string | null;
  matchedAt: string | null;
}>;

const EMPTY_PROJECTION: DeclaredAffiliateCodeProjection = Object.freeze({
  state: "not_provided",
  rawCode: null,
  matchKey: null,
  invalidReason: null,
  matchedPartnerId: null,
  matchedByAdminId: null,
  matchedAt: null,
});

/**
 * Walk one request's events into its current state.
 *
 * Derived every time rather than accumulated, the same discipline the
 * commission balances follow. Events are sorted by their instant, with the
 * ledger's own order breaking ties, so a projection cannot depend on the order
 * rows happen to come back in.
 *
 * A match only means anything on top of a usable capture: a `matched` event for
 * a request whose capture was refused (or absent) is ignored rather than
 * inventing a claim the customer never made.
 */
export function projectDeclaredAffiliateCode(
  events: readonly DeclaredAffiliateCodeEvent[],
): DeclaredAffiliateCodeProjection {
  if (events.length === 0) return EMPTY_PROJECTION;

  const ordered = events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      const at = Date.parse(a.event.occurredAt);
      const bt = Date.parse(b.event.occurredAt);
      // An unparseable instant sorts by arrival rather than poisoning the
      // comparison with NaN.
      if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt;
      return a.index - b.index;
    })
    .map((entry) => entry.event);

  // The FIRST capture is the customer's claim. A second capture for the same
  // request is a replay, not a correction: the claim cannot be re-typed later.
  const capture = ordered.find((event) => event.kind === "captured");
  if (capture === undefined || capture.kind !== "captured") return EMPTY_PROJECTION;

  const captured: DeclaredAffiliateCodeProjection = {
    state:
      capture.rawCode === null
        ? capture.invalidReason === null
          ? "not_provided"
          : "invalid_ignored"
        : "captured_unmatched",
    rawCode: capture.rawCode,
    matchKey: capture.matchKey,
    invalidReason: capture.invalidReason,
    matchedPartnerId: null,
    matchedByAdminId: null,
    matchedAt: null,
  };

  // Only a usable claim can be matched.
  if (captured.state !== "captured_unmatched") return Object.freeze(captured);

  let current = captured;
  for (const event of ordered) {
    if (event.kind === "matched") {
      current = {
        ...current,
        state: "matched_manual",
        matchedPartnerId: event.partnerId,
        matchedByAdminId: event.matchedByAdminId,
        matchedAt: event.occurredAt,
      };
    } else if (event.kind === "match_cleared") {
      current = {
        ...current,
        state: "captured_unmatched",
        matchedPartnerId: null,
        matchedByAdminId: null,
        matchedAt: null,
      };
    }
  }
  return Object.freeze(current);
}

/**
 * Build the capture event for a submit. Pure, and never throws — a submit path
 * must not acquire a new failure mode because someone typed oddly.
 */
export function captureEventFor(
  requestRef: string,
  rawInput: unknown,
  occurredAt: Date,
): DeclaredAffiliateCodeEvent | null {
  const normalized = normalizeDeclaredAffiliateCode(rawInput);
  // Nothing typed, nothing stored. An empty field is not an event.
  if (normalized.state === "not_provided") return null;
  return {
    kind: "captured",
    requestRef,
    rawCode: normalized.state === "captured_unmatched" ? normalized.rawCode : null,
    matchKey: normalized.state === "captured_unmatched" ? normalized.matchKey : null,
    invalidReason: normalized.state === "invalid_ignored" ? normalized.reason : null,
    occurredAt: occurredAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// The admin-facing view
// ---------------------------------------------------------------------------

/**
 * The one sentence an admin surface should render, already carrying its own
 * unverified labelling so no screen can accidentally present a typed claim as
 * a verified attribution. Mirrors the wording the admin email already uses in
 * server/research/assisted-order/communications.ts, so the two surfaces cannot
 * describe the same fact differently.
 */
export function declaredAffiliateCodeSummary(
  projection: DeclaredAffiliateCodeProjection,
): string {
  switch (projection.state) {
    case "not_provided":
      return "No affiliate code entered";
    case "invalid_ignored":
      return projection.invalidReason === "address_shaped"
        ? "An email address was entered instead of a code; not stored"
        : "Something unusable was entered instead of a code; not stored";
    case "captured_unmatched":
      return `Customer-entered "${projection.rawCode}" (unverified, awaiting manual match)`;
    case "matched_manual":
      return `Customer-entered "${projection.rawCode}" (unverified) — manually matched to ${projection.matchedPartnerId}`;
  }
}

/**
 * WHETHER THE REQUIRED AGREEMENTS ARE DONE, AS DECIDED BY THE SERVER.
 *
 * The browser is not allowed an opinion about this. A ticked checkbox is a
 * gesture; the only thing that counts is a record the server will still be able
 * to produce tomorrow, so this module never reads a checkbox, never counts one,
 * and never remembers an acceptance across a render.
 *
 * The gate FAILS CLOSED. `unknown` is the state before any server answer has
 * arrived, and it does not open the gate. That matters more than it looks: the
 * previous journey held a plain `agreed` boolean that started `false`, was set
 * from a server read on the catalogue step, and then simply stayed set. After a
 * step change the boolean was still true even though nothing had re-asked, so
 * "the customer has agreed" and "we asked a while ago and liked the answer"
 * were indistinguishable. Here they are different values.
 *
 * WHAT THIS IS A SEAM FOR
 *
 * Today the server publishes ONE acceptance: the Research Use Policy. The legal
 * lane is replacing that with a versioned package of several documents whose
 * completion is recomputed server-side from immutable signature records. That
 * change lands as a richer `EarlyAccessAgreementStanding`, and nothing in the
 * journey has to move, because the journey only ever asks this module the one
 * question it is allowed to ask.
 */

/**
 * The server's answer about this customer's agreement standing, plus the one
 * value that means "we have not been told yet".
 *
 * These mirror the kinds `loadEarlyAccessAgreementState` already returns, so
 * the adapter's result maps across without translation losing anything.
 */
export type EarlyAccessAgreementStanding =
  | "unknown"
  | "accepted"
  | "required"
  | "locked"
  | "unverified"
  | "error";

export type EarlyAccessAgreementGate = Readonly<{
  /** The only question the journey may ask. True ONLY on a server "accepted". */
  satisfied: boolean;
  /**
   * True when the customer can do something about it here and now. A locked
   * session or a server fault is not the customer's to fix, and offering them
   * a checkbox for it wastes their time.
   */
  actionable: boolean;
  /** Plain-language statement of the current standing. Never internal wording. */
  detail: string;
}>;

const GATE: Readonly<Record<EarlyAccessAgreementStanding, EarlyAccessAgreementGate>> = Object.freeze({
  unknown: Object.freeze({
    satisfied: false,
    actionable: false,
    detail: "Checking which agreements this order needs.",
  }),
  accepted: Object.freeze({
    satisfied: true,
    actionable: false,
    detail: "Your required agreements are on file with us. You can continue to review your order.",
  }),
  required: Object.freeze({
    satisfied: false,
    actionable: true,
    detail: "Read and accept the required agreements before this order can be reviewed or placed.",
  }),
  locked: Object.freeze({
    satisfied: false,
    actionable: false,
    detail:
      "Your private session has ended, so your agreements cannot be recorded. Unlock again to continue. Nothing has been ordered or charged.",
  }),
  unverified: Object.freeze({
    satisfied: false,
    actionable: true,
    detail:
      "Complete identity verification before accepting the required agreements. Nothing has been ordered or charged.",
  }),
  error: Object.freeze({
    satisfied: false,
    actionable: false,
    detail:
      "We could not read your agreement standing just now. This is a fault on our side, and nothing has been ordered or charged.",
  }),
});

export function earlyAccessAgreementGate(
  standing: EarlyAccessAgreementStanding,
): EarlyAccessAgreementGate {
  // An unrecognised value is treated exactly like a fault, not like consent.
  return GATE[standing] ?? GATE.error;
}

/**
 * Narrow a server agreement result to a standing.
 *
 * Anything unrecognised becomes `error`, never `accepted`. A shape this code
 * does not understand is not permission.
 */
export function standingFromAgreementState(state: { kind: string } | null | undefined): EarlyAccessAgreementStanding {
  switch (state?.kind) {
    case "accepted":
      return "accepted";
    case "required":
      return "required";
    case "locked":
      return "locked";
    case "unverified":
      return "unverified";
    default:
      return "error";
  }
}

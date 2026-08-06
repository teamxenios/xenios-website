/**
 * Private Early Access: recording that a customer accepted the required
 * agreement.
 *
 * WHY THIS FILE EXISTS
 *
 * The order path refuses with AGREEMENT_REQUIRED until every configured
 * (kind, version) pair is on file for the customer (order-routes.ts). The
 * acceptance TABLE and the write RPC have existed since migration
 * 20260804120000, but no application code has ever called that RPC, so nothing
 * could put a pair on file and the gate refused everyone forever. This is the
 * missing half, and it is deliberately the smallest thing that closes it: one
 * route, one recorder, no new vocabulary.
 *
 * WHAT IT WILL NOT DO
 *
 * It accepts ONLY the pairs the deployment configured, compared exactly. A
 * request naming any other kind or version is refused rather than recorded,
 * because a record for `terms/v2` when the deployment requires `terms/v1`
 * would be an acceptance of something nobody was shown, and an append-only
 * table cannot take it back.
 *
 * It does not create, price, reserve, or touch an order. Acceptance and
 * purchase are separate acts, and a route that did both would make "I agree"
 * indistinguishable from "buy it" in the audit trail.
 *
 * It cannot open the gate on its own. The gate reads the same table
 * independently (SupabaseEarlyAccessAgreementGate), so a bug here can fail to
 * record an acceptance, which refuses a sale, but it can never fabricate one.
 */

import type { EarlyAccessAgreementGate, EarlyAccessIdentityDirectory } from "./ports";

/** One (kind, version) pair, exactly as the deployment configured it. */
export type EarlyAccessRequiredAgreementPair = Readonly<{
  kind: string;
  version: string;
}>;

/**
 * The evidence recorded alongside an acceptance.
 *
 * `channel` is a constant and `requestIp` is what Express derived from the
 * trusted proxy chain, so both are the server's own. `requestId` is NOT: it is
 * the `x-request-id` header, which is caller-provided request metadata that a
 * client can set to anything. It is recorded for correlation with platform
 * logs, never as proof of anything, and nothing reads it back to make a
 * decision. Keeping it is safe because it is bounded and carries no secret;
 * calling it server-observed would not be true.
 *
 * Nothing here is read from the request BODY, which is the claim that matters:
 * a browser-supplied assertion about who agreed, or when, is not evidence.
 */
export type EarlyAccessAcceptanceEvidence = Readonly<{
  channel: "portal";
  requestIp: string | null;
  requestId: string | null;
}>;

/**
 * What a write attempt meant.
 *
 * The RPC returns `true` when it inserted and `false` when the row was already
 * there, because it catches `unique_violation` and reports it. Those are two
 * different facts with the SAME good outcome: the acceptance is on file. A real
 * failure throws instead, and only that is an error. Collapsing "already on
 * file" into failure is the bug this type exists to make impossible: a customer
 * who double-clicks, or who accepts again after a refresh, is accepted, and
 * telling them otherwise would be false.
 */
export type EarlyAccessRecordOutcome = "recorded" | "already_on_file" | "failed";

export interface EarlyAccessAgreementRecorder {
  record(input: {
    readonly customerRef: string;
    readonly kind: string;
    readonly version: string;
    readonly acceptedAt: string;
    readonly evidence: EarlyAccessAcceptanceEvidence;
  }): Promise<EarlyAccessRecordOutcome>;
}

/** Records nothing, and says so. An unwired deployment sells nothing. */
export class NoEarlyAccessAgreementRecorder implements EarlyAccessAgreementRecorder {
  async record(): Promise<EarlyAccessRecordOutcome> {
    return "failed";
  }
}

export const EARLY_ACCESS_ACCEPT_REFUSALS = [
  "IDENTITY_REQUIRED",
  "REQUEST_INVALID",
  "AGREEMENT_NOT_REQUIRED",
  "NOT_RECORDED",
] as const;

export type EarlyAccessAcceptRefusal = (typeof EARLY_ACCESS_ACCEPT_REFUSALS)[number];

const STATUS: Record<EarlyAccessAcceptRefusal, number> = {
  IDENTITY_REQUIRED: 403,
  REQUEST_INVALID: 400,
  AGREEMENT_NOT_REQUIRED: 400,
  NOT_RECORDED: 502,
};

export interface EarlyAccessAcceptResponsePort {
  status(code: number): EarlyAccessAcceptResponsePort;
  json(body: unknown): unknown;
}

export type EarlyAccessAcceptRequest = Readonly<{
  cookieHeader: unknown;
  body: unknown;
  /** The server's own, from the trusted proxy chain. Never from the body. */
  requestIp?: string | null;
  /** Caller-provided correlation metadata. Recorded, never trusted. */
  requestId?: string | null;
}>;

export type EarlyAccessAcceptDependencies = Readonly<{
  identity: EarlyAccessIdentityDirectory;
  recorder: EarlyAccessAgreementRecorder;
  /** The configured pairs. Empty means this deployment requires nothing yet. */
  required: readonly EarlyAccessRequiredAgreementPair[];
  now: () => number;
}>;

function refuse(
  response: EarlyAccessAcceptResponsePort,
  code: EarlyAccessAcceptRefusal,
): void {
  response.status(STATUS[code]).json({ ok: false, code });
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * POST the acceptance of one required agreement.
 *
 * The customer comes from the session the identity directory resolved, never
 * from the body: a customer reference a caller can name is a customer
 * reference a caller can forge, and this route writes a record that an order
 * later relies on.
 */
export function createEarlyAccessAgreementAcceptRoute(
  deps: EarlyAccessAcceptDependencies,
) {
  return async function acceptAgreement(
    request: EarlyAccessAcceptRequest,
    response: EarlyAccessAcceptResponsePort,
  ): Promise<void> {
    const body = request.body;
    if (typeof body !== "object" || body === null) {
      refuse(response, "REQUEST_INVALID");
      return;
    }
    const kind = readString((body as Record<string, unknown>).kind);
    const version = readString((body as Record<string, unknown>).version);
    if (kind === null || version === null) {
      refuse(response, "REQUEST_INVALID");
      return;
    }

    // Exact match against the configured set, before identity is even
    // resolved. An arbitrary pair is refused rather than recorded, so the
    // append-only table can only ever hold pairs this deployment asked for.
    const matches = deps.required.some(
      (pair) => pair.kind === kind && pair.version === version,
    );
    if (!matches) {
      refuse(response, "AGREEMENT_NOT_REQUIRED");
      return;
    }

    const customer = await deps.identity.resolve({
      cookieHeader: request.cookieHeader,
    });
    if (customer === null || readString(customer.customerRef) === null) {
      refuse(response, "IDENTITY_REQUIRED");
      return;
    }

    const acceptedAt = new Date(deps.now()).toISOString();
    // The RPC does NOT upsert. It inserts, and catches `unique_violation` to
    // report that the row was already there. So a second acceptance writes
    // nothing and the FIRST acceptedAt stands, which is the correct record: the
    // customer agreed when they first agreed. Idempotency is the table's unique
    // constraint, not this handler's memory, so a restart cannot change it.
    const outcome = await deps.recorder.record({
      customerRef: customer.customerRef,
      kind,
      version,
      acceptedAt,
      evidence: Object.freeze({
        channel: "portal" as const,
        requestIp: request.requestIp ?? null,
        requestId: request.requestId ?? null,
      }),
    });
    if (outcome === "failed") {
      refuse(response, "NOT_RECORDED");
      return;
    }

    // `already_on_file` is a success. The customer's acceptance is recorded,
    // which is the only thing the order gate will ask about, and the FIRST
    // acceptedAt stands rather than being overwritten by this call. Reporting
    // it distinctly lets the client show "already accepted" without a second
    // request, and keeps a double-click from looking like a fault.
    response.status(200).json({
      ok: true,
      kind,
      version,
      acceptedAt,
      alreadyAccepted: outcome === "already_on_file",
    });
  };
}

// ---------------------------------------------------------------------------
// Reading back whether THIS session's customer has already agreed
// ---------------------------------------------------------------------------

export type EarlyAccessAgreementStatusDependencies = Readonly<{
  identity: EarlyAccessIdentityDirectory;
  /**
   * The SAME gate the order route consults. Deliberately the same port and not
   * a second query: if this read and the order gate could disagree, the screen
   * would tell a customer they are agreed while checkout refused them, or the
   * reverse. One source means the answer shown is the answer enforced.
   */
  agreements: EarlyAccessAgreementGate;
  /** The configured pairs, echoed so the browser renders what is required. */
  required: readonly EarlyAccessRequiredAgreementPair[];
}>;

export type EarlyAccessAgreementStatusRequest = Readonly<{ cookieHeader: unknown }>;

/**
 * GET the current session customer's agreement standing.
 *
 * WHY THIS EXISTS
 *
 * Acceptance must survive a refresh, and the browser must not be the one who
 * remembers it. localStorage would let anyone who can type in a console open
 * their own checkout, so the only honest answer comes from the server that
 * enforces the gate.
 *
 * WHAT IT WILL NOT DO
 *
 * It reports on ONE customer: the one the session cookie resolved. It takes no
 * customer parameter of any kind, so there is no shape of request that asks
 * about somebody else, and it therefore cannot become an oracle for whether a
 * named person has agreed to anything.
 *
 * It also cannot make a sale possible. The order route asks the gate again for
 * itself. A wrong answer here can only show the wrong screen; it can never
 * place an order.
 */
export function createEarlyAccessAgreementStatusRoute(
  deps: EarlyAccessAgreementStatusDependencies,
) {
  return async function readAgreementStatus(
    request: EarlyAccessAgreementStatusRequest,
    response: EarlyAccessAcceptResponsePort,
  ): Promise<void> {
    const customer = await deps.identity.resolve({
      cookieHeader: request.cookieHeader,
    });
    if (customer === null || readString(customer.customerRef) === null) {
      refuse(response, "IDENTITY_REQUIRED");
      return;
    }

    // The gate answers false when the deployment requires nothing, so an
    // unconfigured deployment reads as "not accepted" rather than as "nothing
    // to accept". That matches what checkout will do, which is the point.
    const accepted = await deps.agreements.accepted(customer.customerRef);

    response.status(200).json({
      ok: true,
      required: deps.required.map((pair) => ({ kind: pair.kind, version: pair.version })),
      accepted,
    });
  };
}

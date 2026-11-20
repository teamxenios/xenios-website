/**
 * The one database seam for Early Access durable persistence.
 *
 * Every adapter in this directory speaks to the database through a single
 * injected function that performs one named RPC. The Supabase client is
 * deliberately not imported anywhere in this directory except the production
 * factory: an adapter is unit-testable with no network, no credential, and no
 * mocking framework, and the service-role key never enters these modules.
 *
 * This is the same shape `SupabasePrivateAccessSessionRepository` already
 * uses; the Early Access commerce lane simply adopts it wholesale.
 */

export type EarlyAccessPersistenceCall = Readonly<{
  fn: string;
  args: Readonly<Record<string, unknown>>;
}>;

export type EarlyAccessPersistenceQuery = (
  call: EarlyAccessPersistenceCall,
) => Promise<unknown>;

/**
 * The fixed reasons a trusted query boundary may report in place of an opaque
 * failure. Each one names a capability that is proven absent, never a guess
 * from an error code or message. Nothing else is ever carried: no driver
 * message, no argument value, no connection detail.
 */
export const EARLY_ACCESS_UNAVAILABLE_REASONS = Object.freeze([
  "shipping_commitments_reader_not_installed",
] as const);

export type EarlyAccessUnavailableReason = (typeof EARLY_ACCESS_UNAVAILABLE_REASONS)[number];

function isEarlyAccessUnavailableReason(value: unknown): value is EarlyAccessUnavailableReason {
  return typeof value === "string"
    && (EARLY_ACCESS_UNAVAILABLE_REASONS as readonly string[]).includes(value);
}

/**
 * Thrown ONLY by a trusted production query boundary, and only when it has
 * structured proof that the exact routine for `fn` is not installed. It is an
 * internal signal for `runEarlyAccessCall`, which re-raises it as the opaque
 * persistence error below with the fixed reason attached. Adapters never see
 * it and never construct it.
 */
export class EarlyAccessCapabilityUnavailableError extends Error {
  constructor(
    readonly fn: string,
    readonly reason: EarlyAccessUnavailableReason,
  ) {
    super(`early-access capability unavailable: ${fn} (${reason})`);
    this.name = "EarlyAccessCapabilityUnavailableError";
  }
}

/**
 * The one error adapters throw for an infrastructure failure.
 *
 * It names the function that failed and nothing else. A PostgREST error can
 * carry the connection string, the function signature, and the argument
 * values, none of which belong in a log line or an HTTP 500 body, so the
 * driver's own error is deliberately not wrapped or echoed.
 *
 * `unavailableReason` is null for every ordinary failure. It is set only when
 * the trusted boundary proved the routine itself is absent, so an operator can
 * tell "not installed" from "broken". It is still a failure: callers treat it
 * exactly as they treat any other persistence error.
 */
export class EarlyAccessPersistenceError extends Error {
  readonly unavailableReason: EarlyAccessUnavailableReason | null;

  constructor(fn: string, unavailableReason: EarlyAccessUnavailableReason | null = null) {
    super(
      unavailableReason === null
        ? `early-access persistence call failed: ${fn}`
        : `early-access persistence call failed: ${fn} (capability unavailable: ${unavailableReason})`,
    );
    this.name = "EarlyAccessPersistenceError";
    this.unavailableReason = unavailableReason;
  }
}

/**
 * Run one call, collapsing every driver failure into the opaque error above.
 *
 * The single exception keeps the error opaque but attaches a fixed reason: a
 * capability-unavailable signal raised by the trusted boundary for THIS call's
 * function, carrying one of the known reasons. A signal for another function,
 * or with an unknown reason, is treated like any other failure.
 */
export async function runEarlyAccessCall(
  query: EarlyAccessPersistenceQuery,
  call: EarlyAccessPersistenceCall,
): Promise<unknown> {
  try {
    return await query(call);
  } catch (error) {
    if (
      error instanceof EarlyAccessCapabilityUnavailableError
      && error.fn === call.fn
      && isEarlyAccessUnavailableReason(error.reason)
    ) {
      throw new EarlyAccessPersistenceError(call.fn, error.reason);
    }
    throw new EarlyAccessPersistenceError(call.fn);
  }
}

/** Narrow an RPC result to a plain object, or throw for a malformed answer. */
export function expectObject(fn: string, value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new EarlyAccessPersistenceError(fn);
  }
  return value as Record<string, unknown>;
}

/** Narrow an RPC result to an array, or throw for a malformed answer. */
export function expectArray(fn: string, value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new EarlyAccessPersistenceError(fn);
  }
  return value;
}

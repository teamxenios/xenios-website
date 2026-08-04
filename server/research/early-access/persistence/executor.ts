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
 * The one error adapters throw for an infrastructure failure.
 *
 * It names the function that failed and nothing else. A PostgREST error can
 * carry the connection string, the function signature, and the argument
 * values, none of which belong in a log line or an HTTP 500 body, so the
 * driver's own error is deliberately not wrapped or echoed.
 */
export class EarlyAccessPersistenceError extends Error {
  constructor(fn: string) {
    super(`early-access persistence call failed: ${fn}`);
    this.name = "EarlyAccessPersistenceError";
  }
}

/**
 * Run one call, collapsing every driver failure into the opaque error above.
 */
export async function runEarlyAccessCall(
  query: EarlyAccessPersistenceQuery,
  call: EarlyAccessPersistenceCall,
): Promise<unknown> {
  try {
    return await query(call);
  } catch {
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

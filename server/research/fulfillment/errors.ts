export type FulfillmentErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "VERSION_CONFLICT"
  | "INVALID_TRANSITION"
  | "IDEMPOTENCY_REUSED"
  | "ALREADY_ASSIGNED"
  | "UNPAID_ORDER";

export class FulfillmentError extends Error {
  readonly code: FulfillmentErrorCode;

  constructor(code: FulfillmentErrorCode, message: string) {
    super(message);
    this.name = "FulfillmentError";
    this.code = code;
  }
}

/**
 * Bounded marker for unavailable or malformed durable evidence. The original
 * adapter/database detail is deliberately not retained on this public-facing
 * error object.
 */
export class FulfillmentPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FulfillmentPersistenceError";
  }
}

export function isFulfillmentError(value: unknown): value is FulfillmentError {
  return value instanceof FulfillmentError;
}

export function isFulfillmentPersistenceError(
  value: unknown,
): value is FulfillmentPersistenceError {
  return value instanceof FulfillmentPersistenceError;
}

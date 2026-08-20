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

export function isFulfillmentError(value: unknown): value is FulfillmentError {
  return value instanceof FulfillmentError;
}

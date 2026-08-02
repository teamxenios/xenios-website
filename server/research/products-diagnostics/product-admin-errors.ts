export class ProductAdminValidationError extends Error {
  readonly code = "validation_failed";
}

export class ProductAdminNotFoundError extends Error {
  readonly code = "not_found";

  constructor(readonly resource: string) {
    super(`${resource} was not found`);
  }
}

export class ProductAdminConflictError extends Error {
  constructor(
    readonly code: string,
    readonly blockingKeys: string[] = [],
  ) {
    super(code);
  }
}

/**
 * A price write refused because the unit's physical presentation is contested,
 * or because the write could not be tied to exactly one variant and therefore
 * cannot be proven undisputed.
 *
 * It is a conflict, so every existing consumer that already handles a conflict
 * keeps working. It carries `reason` because the prior review found the dispute
 * reason was discarded at every consumer: the operator could see that a write
 * was refused but not which two presentations disagreed.
 */
export class ProductAdminStrengthDisputeError extends ProductAdminConflictError {
  constructor(
    code: "variant_strength_disputed" | "variant_identity_unresolved",
    readonly reason: string,
  ) {
    super(code);
    this.message = reason;
  }
}

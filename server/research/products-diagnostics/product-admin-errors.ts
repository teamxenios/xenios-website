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

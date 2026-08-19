// The assisted-order quote engine: issue -> customer view -> accept/decline,
// with supersession and lazy expiry. Deliberately NOT mounted anywhere yet —
// the HTTP doors, the admin UI action, and the status-machine wiring are the
// next slice, behind their own lease on the mount seams. Nothing here mutates
// the request's status: acceptance mints an evidence id the EXISTING status
// authority consumes when the admin advances the request.
//
// Authorization mirrors the parent service exactly:
// - issue/withdraw need assisted_orders:manage (the admin guard runs first at
//   the door; capability is still checked here — admission is not
//   authorization);
// - customer view/accept/decline need the same ownership the status read
//   uses: the request's memberId or Early Access session hash; ownership
//   failures collapse into not-found so no door becomes an existence oracle.

import {
  quoteLineTotalCents,
  quoteTotalCents,
  type AssistedOrderQuoteAcceptance,
  type AssistedOrderQuoteAcceptInput,
  type AssistedOrderQuoteLineView,
  type AssistedOrderQuoteView,
} from "../../../../shared/research/assisted-order/quote-contract";
import type {
  AssistedOrderQuoteDependencies,
  AssistedOrderQuoteIssueInput,
  AssistedOrderQuoteRecord,
  AssistedOrderViewer,
} from "./ports";

export class AssistedOrderQuoteValidationError extends Error {
  public constructor(public readonly field: string, message: string) {
    super(message);
    this.name = "AssistedOrderQuoteValidationError";
  }
}

export class AssistedOrderQuoteAuthorizationError extends Error {
  public constructor(message = "This request is not authorized.") {
    super(message);
    this.name = "AssistedOrderQuoteAuthorizationError";
  }
}

export class AssistedOrderQuoteNotFoundError extends Error {
  public constructor(message = "The quote was not found.") {
    super(message);
    this.name = "AssistedOrderQuoteNotFoundError";
  }
}

export class AssistedOrderQuoteConflictError extends Error {
  public constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "AssistedOrderQuoteConflictError";
  }
}

function requireCapability(
  viewer: AssistedOrderViewer,
  capability: "assisted_orders:manage" | "assisted_orders:read_own",
): void {
  if (!viewer.capabilities.has(capability)) {
    throw new AssistedOrderQuoteAuthorizationError();
  }
}

function ownsRequest(
  viewer: AssistedOrderViewer,
  binding: Readonly<{
    actorMemberId: string | null;
    earlyAccessSessionHash: string | null;
  }>,
): boolean {
  if (viewer.memberId !== null && viewer.memberId === binding.actorMemberId) {
    return true;
  }
  return (
    viewer.earlyAccessSessionHash !== null &&
    viewer.earlyAccessSessionHash === binding.earlyAccessSessionHash
  );
}

function customerView(record: AssistedOrderQuoteRecord): AssistedOrderQuoteView {
  const lines: AssistedOrderQuoteLineView[] = record.lines.map((line) =>
    Object.freeze({
      lineId: line.lineId,
      productId: line.productId,
      variantId: line.variantId,
      productName: line.productName,
      specification: line.specification,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      lineTotalCents: line.lineTotalCents,
      currency: line.currency,
      priceSource: line.priceSource,
      // pricingBasis and internalNote are DELIBERATELY absent here.
    }),
  );
  return Object.freeze({
    quoteId: record.quoteId,
    requestPublicReference: record.requestPublicReference,
    version: record.version,
    state: record.state,
    lines: Object.freeze(lines),
    totalCents: record.totalCents,
    currency: record.currency,
    issuedAt: record.issuedAt,
    validUntil: record.validUntil,
    customerNote: record.customerNote,
    acceptedAt: record.acceptedAt,
    declinedAt: record.declinedAt,
  });
}

export class AssistedOrderQuoteService {
  public constructor(private readonly deps: AssistedOrderQuoteDependencies) {}

  /**
   * Issue a quote against one request. Priced request lines carry their
   * authoritative price and REFUSE an admin-supplied one; price-pending lines
   * require the admin price plus a recorded internal basis. Issuing
   * supersedes any earlier still-issued quote for the same request.
   */
  public async issue(
    viewer: AssistedOrderViewer,
    input: AssistedOrderQuoteIssueInput,
  ): Promise<AssistedOrderQuoteView> {
    requireCapability(viewer, "assisted_orders:manage");
    const binding = await this.deps.requests.bindingFor(input.requestId);
    if (!binding) {
      throw new AssistedOrderQuoteNotFoundError("The request was not found.");
    }
    if (input.lines.length === 0) {
      throw new AssistedOrderQuoteValidationError(
        "lines",
        "A quote requires at least one line.",
      );
    }
    const validUntil = new Date(input.validUntil);
    const now = this.deps.clock.now();
    if (Number.isNaN(validUntil.getTime()) || validUntil.getTime() <= now.getTime()) {
      throw new AssistedOrderQuoteValidationError(
        "validUntil",
        "validUntil must be a future ISO date-time.",
      );
    }

    const requestLines = await this.deps.requestLines.linesFor(input.requestId);
    const byId = new Map(requestLines.map((line) => [line.lineId, line]));
    const seen = new Set<string>();
    const lines = input.lines.map((issueLine) => {
      const stored = byId.get(issueLine.requestLineId);
      if (!stored) {
        throw new AssistedOrderQuoteValidationError(
          "lines",
          `Request line ${issueLine.requestLineId} does not exist on this request.`,
        );
      }
      if (seen.has(stored.lineId)) {
        throw new AssistedOrderQuoteValidationError(
          "lines",
          `Request line ${stored.lineId} appears more than once.`,
        );
      }
      seen.add(stored.lineId);

      let unitPriceCents: number;
      let priceSource: "catalog" | "quoted";
      let pricingBasis: string | null;
      if (stored.unitPriceCents !== null) {
        // The authoritative price the request already carries is the ONLY
        // price for a priced line; an admin number here would be a second
        // price authority.
        if (issueLine.unitPriceCents !== undefined) {
          throw new AssistedOrderQuoteValidationError(
            "lines",
            `Line ${stored.lineId} already carries the authoritative price; a quote cannot restate it.`,
          );
        }
        unitPriceCents = stored.unitPriceCents;
        priceSource = "catalog";
        pricingBasis = null;
      } else {
        if (
          issueLine.unitPriceCents === undefined ||
          !Number.isSafeInteger(issueLine.unitPriceCents) ||
          issueLine.unitPriceCents <= 0
        ) {
          throw new AssistedOrderQuoteValidationError(
            "lines",
            `Price-pending line ${stored.lineId} requires a positive integer-cents admin price.`,
          );
        }
        if (!issueLine.pricingBasis?.trim()) {
          throw new AssistedOrderQuoteValidationError(
            "lines",
            `Price-pending line ${stored.lineId} requires a recorded pricing basis.`,
          );
        }
        unitPriceCents = issueLine.unitPriceCents;
        priceSource = "quoted";
        pricingBasis = issueLine.pricingBasis.trim();
      }

      return Object.freeze({
        lineId: stored.lineId,
        productId: stored.productId,
        variantId: stored.variantId,
        productName: stored.productName,
        specification: stored.specification,
        quantity: stored.quantity,
        unitPriceCents,
        lineTotalCents: quoteLineTotalCents(stored.quantity, unitPriceCents),
        currency: "USD" as const,
        priceSource,
        pricingBasis,
      });
    });

    // Supersede any still-issued predecessor so exactly one quote is open.
    const existing = await this.deps.repository.byRequest(input.requestId);
    let version = 1;
    for (const previous of existing) {
      version = Math.max(version, previous.version + 1);
      if (previous.state === "issued") {
        await this.deps.repository.update({ ...previous, state: "superseded" });
        await this.deps.audit.record({
          type: "assisted_order_quote_superseded",
          quoteId: previous.quoteId,
          requestId: previous.requestId,
          byActor: viewer.actorLabel ?? viewer.normalizedEmail ?? "admin",
          at: now.toISOString(),
        });
      }
      if (previous.state === "accepted") {
        throw new AssistedOrderQuoteConflictError(
          "quote_already_accepted",
          "An accepted quote exists for this request; withdraw it through the supported path before quoting again.",
        );
      }
    }

    const record: AssistedOrderQuoteRecord = Object.freeze({
      quoteId: this.deps.ids.uuid(),
      requestId: binding.requestId,
      requestPublicReference: binding.publicReference,
      version,
      state: "issued",
      lines: Object.freeze(lines),
      totalCents: quoteTotalCents(lines),
      currency: "USD",
      issuedAt: now.toISOString(),
      validUntil: validUntil.toISOString(),
      issuedByActorLabel: viewer.actorLabel ?? viewer.normalizedEmail ?? "admin",
      customerNote: input.customerNote?.trim() || null,
      internalNote: input.internalNote?.trim() || null,
      acceptedAt: null,
      acceptanceId: null,
      declinedAt: null,
    });
    await this.deps.repository.create(record);
    await this.deps.audit.record({
      type: "assisted_order_quote_issued",
      quoteId: record.quoteId,
      requestId: record.requestId,
      version: record.version,
      totalCents: record.totalCents,
      byActor: record.issuedByActorLabel,
      at: record.issuedAt,
    });
    return customerView(record);
  }

  /** The customer's quotes for one request reference. Ownership failures
   * collapse into an empty answer's sibling: not-found. */
  public async forRequest(
    viewer: AssistedOrderViewer,
    publicReference: string,
  ): Promise<readonly AssistedOrderQuoteView[]> {
    const isAdmin = viewer.capabilities.has("assisted_orders:read_all");
    if (!isAdmin) requireCapability(viewer, "assisted_orders:read_own");
    const binding = await this.deps.requests.byPublicReference(publicReference);
    if (!binding || (!isAdmin && !ownsRequest(viewer, binding))) {
      throw new AssistedOrderQuoteNotFoundError("The request was not found.");
    }
    const records = await this.deps.repository.byRequest(binding.requestId);
    const now = this.deps.clock.now();
    const views: AssistedOrderQuoteView[] = [];
    for (const record of records) {
      views.push(customerView(await this.lazilyExpire(record, now)));
    }
    return Object.freeze(views);
  }

  /** Accept exactly the quote the customer saw. Idempotent for an identical
   * repeat; stale version or total refuses with QUOTE_CHANGED. */
  public async accept(
    viewer: AssistedOrderViewer,
    publicReference: string,
    input: AssistedOrderQuoteAcceptInput,
  ): Promise<AssistedOrderQuoteAcceptance> {
    requireCapability(viewer, "assisted_orders:read_own");
    const binding = await this.deps.requests.byPublicReference(publicReference);
    if (!binding || !ownsRequest(viewer, binding)) {
      throw new AssistedOrderQuoteNotFoundError("The request was not found.");
    }
    const record = await this.deps.repository.byId(input.quoteId);
    if (!record || record.requestId !== binding.requestId) {
      throw new AssistedOrderQuoteNotFoundError();
    }
    const now = this.deps.clock.now();
    const current = await this.lazilyExpire(record, now);

    if (current.state === "accepted") {
      if (
        current.version === input.version &&
        current.totalCents === input.expectedTotalCents &&
        current.acceptanceId
      ) {
        return Object.freeze({
          acceptanceId: current.acceptanceId,
          quoteId: current.quoteId,
          requestPublicReference: current.requestPublicReference,
          version: current.version,
          totalCents: current.totalCents,
          acceptedAt: current.acceptedAt ?? now.toISOString(),
          replayed: true,
        });
      }
      throw new AssistedOrderQuoteConflictError(
        "quote_already_accepted",
        "This quote was already accepted.",
      );
    }
    if (current.state !== "issued") {
      throw new AssistedOrderQuoteConflictError(
        `quote_${current.state}`,
        `This quote is ${current.state} and can no longer be accepted.`,
      );
    }
    if (
      current.version !== input.version ||
      current.totalCents !== input.expectedTotalCents
    ) {
      throw new AssistedOrderQuoteConflictError(
        "QUOTE_CHANGED",
        "The quote changed since it was viewed; re-read it before accepting.",
      );
    }

    const acceptanceId = this.deps.ids.uuid();
    const accepted: AssistedOrderQuoteRecord = Object.freeze({
      ...current,
      state: "accepted",
      acceptedAt: now.toISOString(),
      acceptanceId,
    });
    await this.deps.repository.update(accepted);
    await this.deps.audit.record({
      type: "assisted_order_quote_accepted",
      quoteId: accepted.quoteId,
      requestId: accepted.requestId,
      acceptanceId,
      version: accepted.version,
      totalCents: accepted.totalCents,
      at: accepted.acceptedAt,
    });
    return Object.freeze({
      acceptanceId,
      quoteId: accepted.quoteId,
      requestPublicReference: accepted.requestPublicReference,
      version: accepted.version,
      totalCents: accepted.totalCents,
      acceptedAt: accepted.acceptedAt as string,
      replayed: false,
    });
  }

  /** Decline is customer-owned and terminal for that quote only. */
  public async decline(
    viewer: AssistedOrderViewer,
    publicReference: string,
    quoteId: string,
  ): Promise<AssistedOrderQuoteView> {
    requireCapability(viewer, "assisted_orders:read_own");
    const binding = await this.deps.requests.byPublicReference(publicReference);
    if (!binding || !ownsRequest(viewer, binding)) {
      throw new AssistedOrderQuoteNotFoundError("The request was not found.");
    }
    const record = await this.deps.repository.byId(quoteId);
    if (!record || record.requestId !== binding.requestId) {
      throw new AssistedOrderQuoteNotFoundError();
    }
    const now = this.deps.clock.now();
    const current = await this.lazilyExpire(record, now);
    if (current.state !== "issued") {
      throw new AssistedOrderQuoteConflictError(
        `quote_${current.state}`,
        `This quote is ${current.state} and can no longer be declined.`,
      );
    }
    const declined: AssistedOrderQuoteRecord = Object.freeze({
      ...current,
      state: "declined",
      declinedAt: now.toISOString(),
    });
    await this.deps.repository.update(declined);
    await this.deps.audit.record({
      type: "assisted_order_quote_declined",
      quoteId: declined.quoteId,
      requestId: declined.requestId,
      at: declined.declinedAt,
    });
    return customerView(declined);
  }

  /** Admin withdraw for an issued quote (wrong numbers, wrong terms). */
  public async withdraw(
    viewer: AssistedOrderViewer,
    quoteId: string,
  ): Promise<AssistedOrderQuoteView> {
    requireCapability(viewer, "assisted_orders:manage");
    const record = await this.deps.repository.byId(quoteId);
    if (!record) throw new AssistedOrderQuoteNotFoundError();
    const now = this.deps.clock.now();
    const current = await this.lazilyExpire(record, now);
    if (current.state !== "issued") {
      throw new AssistedOrderQuoteConflictError(
        `quote_${current.state}`,
        `This quote is ${current.state} and can no longer be withdrawn.`,
      );
    }
    const withdrawn: AssistedOrderQuoteRecord = Object.freeze({
      ...current,
      state: "withdrawn",
    });
    await this.deps.repository.update(withdrawn);
    await this.deps.audit.record({
      type: "assisted_order_quote_withdrawn",
      quoteId: withdrawn.quoteId,
      requestId: withdrawn.requestId,
      byActor: viewer.actorLabel ?? viewer.normalizedEmail ?? "admin",
      at: now.toISOString(),
    });
    return customerView(withdrawn);
  }

  private async lazilyExpire(
    record: AssistedOrderQuoteRecord,
    now: Date,
  ): Promise<AssistedOrderQuoteRecord> {
    if (
      record.state === "issued" &&
      new Date(record.validUntil).getTime() <= now.getTime()
    ) {
      const expired: AssistedOrderQuoteRecord = Object.freeze({
        ...record,
        state: "expired",
      });
      await this.deps.repository.update(expired);
      await this.deps.audit.record({
        type: "assisted_order_quote_expired",
        quoteId: record.quoteId,
        requestId: record.requestId,
        at: now.toISOString(),
      });
      return expired;
    }
    return record;
  }
}

import type { CarePrincipal } from "../../../../shared/care/contracts";
import { canReadPendingRequestIntent, type RequestIntentStaffReadContext } from "./staff-read-authority";
import { quantityIsAllowed } from "../../../../shared/research/assisted-order/action-policy";
import type { AssistedOrderCatalogQuery } from "../../../../shared/research/assisted-order/contract";
import { assistedOrderFormPair, requiredAssistedOrderFormAcknowledgments } from "../../../../shared/research/assisted-order/form";
import {
  REQUEST_INTENT_KIND, validateRequestIntentInput,
  type RequestIntentDetail, type RequestIntentReceipt, type RequestIntentLine, type RequestIntentQueuePage,
} from "../../../../shared/research/assisted-order/request-intent";
import type {
  AssistedOrderViewer, AssistedOrderHasher, AssistedOrderClock,
  AssistedOrderIdGenerator, AssistedOrderSubmissionStanding, AssistedOrderLegalPort,
} from "../ports";
import type { RequestIntentCatalog } from "./catalog";

export class RequestIntentError extends Error {
  constructor(public readonly code: string, public readonly status: 400 | 401 | 403 | 409 | 503) {
    super(code);
  }
}
export type StoredIntent = Readonly<{ receipt: RequestIntentReceipt; fingerprint: string }>;
export type CreateIntent = Readonly<{
  ownerHash: string; attemptHash: string; fingerprint: string; detail: RequestIntentDetail;
}>;
export type RequestIntentRepository = Readonly<{
  findAttempt(ownerHash: string, attemptHash: string): Promise<StoredIntent | null>;
  createOrReplay(record: CreateIntent): Promise<StoredIntent>;
}>;
/** Backend-only reader; the actor comes from canonical Care authentication, never request data. */
export type RequestIntentStaffReader = Readonly<{
  get(requestId: string, verifiedActorSubjectId: string): Promise<RequestIntentDetail | null>;
  list(verifiedActorSubjectId: string, page: number): Promise<RequestIntentQueuePage>;
}>;
export type RequestIntentDependencies = Readonly<{
  catalog: RequestIntentCatalog;
  repository: RequestIntentRepository;
  standing: AssistedOrderSubmissionStanding;
  legal: AssistedOrderLegalPort;
  hasher: AssistedOrderHasher;
  ids: AssistedOrderIdGenerator;
  clock: AssistedOrderClock;
}>;

/**
 * Private intent only. There is deliberately no outbox, analytics, mirror,
 * payment, prescription, order-conversion or supplier dependency here.
 */
export class RequestIntentService {
  constructor(private readonly deps: RequestIntentDependencies) {}

  private owner(viewer: AssistedOrderViewer): string {
    if (!viewer.capabilities.has("assisted_orders:submit")) throw new RequestIntentError("authentication_required", 401);
    if (viewer.actorType === "member" && viewer.authUserId && viewer.memberId) {
      return this.deps.hasher.stableHash(["request-intent-owner", "member", viewer.authUserId]);
    }
    if (viewer.actorType === "early_access_session" && viewer.earlyAccessCustomerRef && viewer.earlyAccessSessionHash) {
      return this.deps.hasher.stableHash(["request-intent-owner", "session", viewer.earlyAccessCustomerRef, viewer.earlyAccessSessionHash]);
    }
    // Contact email, profile email and the shared entry code establish no owner.
    throw new RequestIntentError("authentication_required", 401);
  }

  async list(viewer: AssistedOrderViewer, query: AssistedOrderCatalogQuery) {
    this.owner(viewer);
    return this.deps.catalog.list(viewer, query);
  }

  /** Same-session recovery returns only an actual committed reference, never a success guess. */
  async recover(viewer: AssistedOrderViewer, idempotencyKey: string): Promise<RequestIntentReceipt | null> {
    const ownerHash = this.owner(viewer);
    if (!/^[0-9a-f-]{36}$/i.test(idempotencyKey)) throw new RequestIntentError("invalid_attempt", 400);
    const stored = await this.deps.repository.findAttempt(ownerHash, this.deps.hasher.hash(idempotencyKey));
    return stored?.receipt ?? null;
  }

  async submit(viewer: AssistedOrderViewer, raw: unknown): Promise<RequestIntentReceipt> {
    const ownerHash = this.owner(viewer);
    const input = validateRequestIntentInput(raw);
    const attemptHash = this.deps.hasher.hash(input.idempotencyKey);
    const fingerprint = this.deps.hasher.stableHash({
      kind: REQUEST_INTENT_KIND, contact: input.contact, agreements: input.agreements, lines: input.lines,
    });
    // Retry identity is based on the submitted facts, not mutable catalog prices.
    // A saved attempt still replays if catalog/legal/standing subsequently changes.
    const prior = await this.deps.repository.findAttempt(ownerHash, attemptHash);
    if (prior) return this.replay(prior, fingerprint);
    if (!await this.deps.standing.accepted(viewer)) throw new RequestIntentError("agreement_standing_required", 403);

    const lines: RequestIntentLine[] = [];
    const resolved = await this.deps.catalog.resolveMany(viewer, input.lines);
    if (resolved.length !== input.lines.length) throw new RequestIntentError("catalog_result_invalid", 503);
    for (const [index, requested] of input.lines.entries()) {
      const item = resolved[index];
      if (!item || item.productId !== requested.productId || item.variantId !== requested.variantId
        || !item.selectableForReview || !item.sourceSelection
        || !quantityIsAllowed(item, requested.quantity)) {
        throw new RequestIntentError("selection_requires_refresh", 400);
      }
      lines.push({
        productId: item.productId, variantId: item.variantId, sourceVariantId: item.sourceSelection.variantId,
        productName: item.productName, specification: item.specification, family: item.family,
        workflowMode: item.workflowMode, quantity: requested.quantity, researchUseOnly: item.researchUseOnly,
        clinicalReviewRequired: item.clinicalReviewRequired, sourceDisplayState: item.sourceDisplayState,
        sourceVariantDisplayState: item.sourceVariantDisplayState, sourceRefusal: item.sourceRefusal,
        catalogVersion: item.catalogVersion, reviewState: "pending",
      });
    }
    let required: Awaited<ReturnType<AssistedOrderLegalPort["requiredAgreements"]>>;
    try { required = await this.deps.legal.requiredAgreements(); }
    catch { throw new RequestIntentError("legal_requirements_unavailable", 503); }
    if (!Array.isArray(required) || required.length === 0 || required.some((pair) => !pair.kind || !pair.version
      || pair.kind.startsWith("assisted_order_form_v1:"))) {
      throw new RequestIntentError("legal_requirements_unavailable", 503);
    }
    const expected = [
      ...required,
      ...requiredAssistedOrderFormAcknowledgments({ includesResearchUseOnly: lines.some((line) => line.researchUseOnly) })
        .map(assistedOrderFormPair),
    ];
    const key = (pair: { kind: string; version: string }) => JSON.stringify([pair.kind, pair.version]);
    const expectedSet = new Set(expected.map(key));
    const actual = new Set(input.agreements.map(key));
    if (expectedSet.size !== actual.size || [...expectedSet].some((pair) => !actual.has(pair))) {
      throw new RequestIntentError("current_acknowledgments_required", 400);
    }
    if (input.agreements.some((agreement) => Date.parse(agreement.acceptedAt) > this.deps.clock.now().getTime() + 300_000)) {
      throw new RequestIntentError("invalid_acceptance_time", 400);
    }
    const now = this.deps.clock.now();
    const requestId = this.deps.ids.uuid();
    const detail: RequestIntentDetail = {
      kind: REQUEST_INTENT_KIND, requestId,
      publicReference: "XRI-" + requestId.replace(/-/g, "").toUpperCase(),
      status: "pending_review", createdAt: now.toISOString(),
      contact: input.contact, agreements: input.agreements, lines,
    };
    // The repository transaction stores every line and audit event or none.
    const saved = await this.deps.repository.createOrReplay({ ownerHash, attemptHash, fingerprint, detail });
    return this.replay(saved, fingerprint);
  }

  private replay(saved: StoredIntent, expected: string): RequestIntentReceipt {
    if (saved.fingerprint !== expected) throw new RequestIntentError("attempt_conflict", 409);
    return saved.receipt;
  }

  async staffRead(
    principal: CarePrincipal | null, context: RequestIntentStaffReadContext,
    reader: RequestIntentStaffReader, requestId: string,
  ): Promise<RequestIntentDetail | null> {
    if (!principal) throw new RequestIntentError("authentication_required", 401);
    if (!canReadPendingRequestIntent(principal, context)) {
      throw new RequestIntentError("private_review_access_required", 403);
    }
    // This application check authorizes no clinical action. The backend reader
    // independently rechecks current clinical_admin assignment and the approved
    // request_intent_pending_read capability on EVERY operation. Whole Care can
    // remain disabled. No direct authenticated Data API access is introduced.
    return reader.get(requestId, principal.subjectId);
  }

  async staffList(principal: CarePrincipal | null, context: RequestIntentStaffReadContext,
    reader: RequestIntentStaffReader, page: number): Promise<RequestIntentQueuePage> {
    if (!principal) throw new RequestIntentError("authentication_required", 401);
    if (!canReadPendingRequestIntent(principal, context)) throw new RequestIntentError("private_review_access_required", 403);
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new RequestIntentError("invalid_page", 400);
    return reader.list(principal.subjectId, page);
  }

  rejectCommercialTransition(): never {
    // No approval/payment/fulfillment state exists on an unapproved intent.
    throw new RequestIntentError("unapproved_intent_has_no_commercial_authority", 409);
  }
}

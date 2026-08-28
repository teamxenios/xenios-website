import {
  earlyAccessCustomerPathway,
  pathwayEntersPayment,
  pathwayEntersRequest,
} from "@shared/research/early-access/customer-pathway";
import {
  ASSISTED_ORDER_CURRENCY,
  ASSISTED_ORDER_SOURCE,
  type AssistedOrderAdminDetail,
  type AssistedOrderAdminListItem,
  type AssistedOrderCatalogPage,
  type AssistedOrderCatalogQuery,
  type AssistedOrderDocumentSide,
  type AssistedOrderDocumentType,
  type AssistedOrderReceipt,
  type AssistedOrderStatus,
  type AssistedOrderStatusUpdateInput,
  type AssistedOrderStatusView,
  type AssistedOrderSubmitInput,
  type AssistedOrderUploadRequest,
  type AssistedOrderUploadTicket,
  type AssistedOrderWorkflowMode,
  AssistedOrderValidationError,
  lineEstimate,
  normalizeRequiredText,
  totalEstimate,
  validateSubmitInput,
} from "../../../shared/research/assisted-order/contract";
import { quantityIsAllowed } from "../../../shared/research/assisted-order/action-policy";
import { normalizeDeclaredAffiliateCode } from "../partners/declared-affiliate-code";
import {
  ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS,
  ASSISTED_ORDER_FORM_ID,
  assistedOrderFormPair,
  requiredAssistedOrderFormAcknowledgments,
} from "../../../shared/research/assisted-order/form";
import type {
  AssistedOrderAdminListPage,
  AssistedOrderDependencies,
  AssistedOrderGoogleMirrorRow,
  AssistedOrderStatusAuthorityEvidenceKind,
  AssistedOrderStatusAuthorization,
  AssistedOrderViewer,
  ResolvedAssistedOrderLine,
} from "./ports";

export class AssistedOrderAuthorizationError extends Error {
  public constructor(message = "Assisted order access is not authorized.") {
    super(message);
    this.name = "AssistedOrderAuthorizationError";
  }
}

export class AssistedOrderAgreementRequiredError extends Error {
  public constructor() {
    super("The server-recorded Early Access agreement is required.");
    this.name = "AssistedOrderAgreementRequiredError";
  }
}

export class AssistedOrderNotFoundError extends Error {
  public constructor() {
    super("The assisted order request was not found.");
    this.name = "AssistedOrderNotFoundError";
  }
}

export class AssistedOrderConflictError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "AssistedOrderConflictError";
    this.code = code;
  }
}

const allowedTransitions: Readonly<Record<AssistedOrderStatus, readonly AssistedOrderStatus[]>> =
  Object.freeze({
    submitted: ["reviewing", "cancelled"],
    reviewing: [
      "waiting_on_customer",
      "identity_requested",
      "agreements_pending",
      "payment_pending",
      "cancelled",
    ],
    waiting_on_customer: ["reviewing", "cancelled"],
    identity_requested: ["identity_received", "cancelled"],
    identity_received: ["reviewing", "agreements_pending", "cancelled"],
    agreements_pending: ["agreements_complete", "cancelled"],
    agreements_complete: ["payment_pending", "cancelled"],
    payment_pending: ["payment_review", "cancelled"],
    payment_review: ["paid", "payment_pending", "cancelled"],
    paid: ["supplier_processing", "cancelled"],
    supplier_processing: ["shipped", "cancelled"],
    shipped: ["delivered"],
    delivered: ["closed"],
    closed: [],
    cancelled: [],
  });

type AssistedOrderUploadMimeType =
  | "image/jpeg"
  | "image/png"
  | "application/pdf";

const uploadMimeTypes = new Set<AssistedOrderUploadMimeType>([
  "image/jpeg",
  "image/png",
  "application/pdf",
]);

function isUploadMimeType(value: string): value is AssistedOrderUploadMimeType {
  return uploadMimeTypes.has(value as AssistedOrderUploadMimeType);
}

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const UPLOAD_TICKET_SECONDS = 15 * 60;
const DOWNLOAD_TICKET_SECONDS = 5 * 60;
const DOCUMENT_RETENTION_DAYS = 30;

function requireCapability(
  viewer: AssistedOrderViewer,
  capability:
    | "assisted_orders:submit"
    | "assisted_orders:read_own"
    | "assisted_orders:read_all"
    | "assisted_orders:manage"
    | "assisted_orders:documents_manage",
): void {
  if (!viewer.capabilities.has(capability)) {
    throw new AssistedOrderAuthorizationError();
  }
}

function viewerActorId(viewer: AssistedOrderViewer): string | null {
  switch (viewer.actorType) {
    case "member":
      return viewer.memberId;
    case "early_access_session":
      return viewer.earlyAccessSessionHash;
    case "admin":
      return viewer.memberId ?? viewer.actorLabel ?? viewer.normalizedEmail;
  }
}

function statusAuthorityEvidenceKinds(
  evidence: AssistedOrderStatusUpdateInput["evidence"],
): readonly AssistedOrderStatusAuthorityEvidenceKind[] {
  if (!evidence) return Object.freeze([]);
  const kinds: AssistedOrderStatusAuthorityEvidenceKind[] = [];
  if (evidence.agreementAttestationId) kinds.push("agreement_attestation");
  if (evidence.paymentVerificationId) kinds.push("payment_verification");
  if (evidence.supplierAssignmentId) kinds.push("supplier_assignment");
  if (evidence.trackingId) kinds.push("tracking");
  if (evidence.cancellationReason) kinds.push("cancellation_reason_present");
  return Object.freeze(kinds);
}

function nextStepsForModes(
  modes: ReadonlySet<AssistedOrderWorkflowMode>,
): readonly string[] {
  const steps = [
    "Xenios will review availability, pricing, and documentation requirements.",
  ];
  if (modes.has("provider_request")) {
    steps.push(
      "Products requiring provider review will follow the separate Xenios Care pathway.",
    );
  }
  if (modes.has("request_pricing")) {
    steps.push("Price-pending items will be quoted before an order is accepted.");
  }
  if (modes.has("request_activation")) {
    steps.push(
      "Items requiring classification or activation will be reviewed before purchase authority is granted.",
    );
  }
  if (modes.has("availability_review")) {
    steps.push("Held or unavailable items will receive an availability review.");
  }
  steps.push("You will receive follow-up instructions from Xenios.");
  return Object.freeze(steps);
}

function evidenceRequired(
  status: AssistedOrderStatus,
  input: AssistedOrderStatusUpdateInput,
): void {
  if (status === "agreements_complete" && !input.evidence?.agreementAttestationId) {
    throw new AssistedOrderConflictError(
      "agreement_evidence_required",
      "Agreement completion requires canonical attestation evidence.",
    );
  }
  if (status === "paid" && !input.evidence?.paymentVerificationId) {
    throw new AssistedOrderConflictError(
      "payment_evidence_required",
      "Paid status requires canonical payment-verification evidence.",
    );
  }
  if (status === "supplier_processing" && !input.evidence?.supplierAssignmentId) {
    throw new AssistedOrderConflictError(
      "supplier_assignment_required",
      "Supplier processing requires an authoritative supplier assignment.",
    );
  }
  if (status === "shipped" && !input.evidence?.trackingId) {
    throw new AssistedOrderConflictError(
      "tracking_evidence_required",
      "Shipped status requires canonical tracking evidence.",
    );
  }
  if (status === "cancelled" && !input.evidence?.cancellationReason) {
    throw new AssistedOrderConflictError(
      "cancellation_reason_required",
      "Cancellation requires a reason.",
    );
  }
}

function safeFileName(fileName: string): string {
  const normalized = fileName
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return normalized || "document";
}

function customerStatusMessage(status: AssistedOrderStatus): string {
  const messages: Readonly<Record<AssistedOrderStatus, string>> = {
    submitted: "Your request has been received.",
    reviewing: "Xenios is reviewing your request.",
    waiting_on_customer: "Additional information is needed from you.",
    identity_requested: "Identity documentation has been requested.",
    identity_received: "Your identity documentation has been received.",
    agreements_pending: "Required agreements are pending.",
    agreements_complete: "Required agreements are complete.",
    payment_pending: "Payment instructions or payment are pending.",
    payment_review: "Your payment information is under review.",
    paid: "Payment has been verified.",
    supplier_processing: "Your request is being processed for fulfillment.",
    shipped: "Your shipment is on the way.",
    delivered: "Your shipment was delivered.",
    closed: "This request is complete.",
    cancelled: "This request was cancelled.",
  };
  return messages[status];
}

export class AssistedOrderService {
  public constructor(private readonly deps: AssistedOrderDependencies) {}

  /**
   * The wizard's config. No capability is required beyond a resolved viewer:
   * the response carries only the feature state, the exact published legal
   * (kind, version) pairs, and the operational form acknowledgments, nothing
   * personal. When the canonical legal set cannot resolve, the feature
   * reports itself disabled up front (D-005) and submission stays refused
   * server-side by the same missing dependency.
   */
  public async config(
    viewer: AssistedOrderViewer,
  ): Promise<import("../../../shared/research/assisted-order/contract").AssistedOrderConfigView> {
    void viewer;
    const formAcknowledgments = Object.freeze(
      ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS.map((acknowledgment) => {
        const pair = assistedOrderFormPair(acknowledgment);
        return Object.freeze({
          id: acknowledgment.id,
          scope: acknowledgment.scope,
          kind: pair.kind,
          version: pair.version,
          copy: acknowledgment.copy,
        });
      }),
    );
    const legal = this.deps.legal ?? null;
    if (!legal) {
      return Object.freeze({
        enabled: false,
        code: "legal_requirements_unavailable" as const,
        formId: ASSISTED_ORDER_FORM_ID,
        requiredAgreements: Object.freeze([]),
        formAcknowledgments,
      });
    }
    try {
      const required = await legal.requiredAgreements();
      if (required.length === 0) {
        return Object.freeze({
          enabled: false,
          code: "legal_requirements_unavailable" as const,
          formId: ASSISTED_ORDER_FORM_ID,
          requiredAgreements: Object.freeze([]),
          formAcknowledgments,
        });
      }
      return Object.freeze({
        enabled: true,
        code: null,
        formId: ASSISTED_ORDER_FORM_ID,
        requiredAgreements: Object.freeze(
          required.map((requirement) =>
            Object.freeze({ kind: requirement.kind, version: requirement.version }),
          ),
        ),
        formAcknowledgments,
      });
    } catch {
      return Object.freeze({
        enabled: false,
        code: "legal_requirements_unavailable" as const,
        formId: ASSISTED_ORDER_FORM_ID,
        requiredAgreements: Object.freeze([]),
        formAcknowledgments,
      });
    }
  }

  public async catalog(
    viewer: AssistedOrderViewer,
    query: AssistedOrderCatalogQuery,
  ): Promise<AssistedOrderCatalogPage> {
    requireCapability(viewer, "assisted_orders:submit");
    return this.deps.catalog.list(viewer, query);
  }

  public async submit(
    viewer: AssistedOrderViewer,
    rawInput: AssistedOrderSubmitInput,
    // The ONLY source of a stored affiliate attribution ref: the transport
    // layer's verification of the signed attribution cookie. A value the
    // browser places in the body is ignored below, never stored, so no
    // request payload can name the partner who gets paid.
    verifiedAffiliateAttributionRef: string | null = null,
  ): Promise<AssistedOrderReceipt> {
    requireCapability(viewer, "assisted_orders:submit");
    // The body carries the exact agreement pairs the customer acknowledged,
    // but those pairs cannot prove the durable Early Access acceptance exists:
    // a caller can forge every body field. Ask the server-recorded standing
    // authority before parsing lines, minting ids, writing, or notifying.
    if (
      !this.deps.submissionStanding ||
      !(await this.deps.submissionStanding.accepted(viewer))
    ) {
      throw new AssistedOrderAgreementRequiredError();
    }
    const input = validateSubmitInput(rawInput);
    const now = this.deps.clock.now();
    const nowIso = now.toISOString();
    const requestId = this.deps.ids.uuid();
    const publicReference = this.deps.ids.publicReference(now);
    const statusToken = this.deps.ids.opaqueToken();
    const statusTokenHash = this.deps.hasher.hash(statusToken);
    const idempotencyKeyHash = this.deps.hasher.hash(
      `${input.contact.email}\u0000${input.idempotencyKey}`,
    );

    // A claim, not attribution. Normalizing here means the row, the operator
    // console and the admin email all read the same canonical value.
    const declaredAffiliateCode = normalizeDeclaredAffiliateCode(
      input.declaredAffiliateCode,
    );

    const resolvedLines: ResolvedAssistedOrderLine[] = [];
    for (let index = 0; index < input.lines.length; index += 1) {
      const requested = input.lines[index];
      // Name the line. The catalog port refuses an unresolvable product with a
      // field-scoped validation error, but it cannot know WHICH line it was
      // handed, and "product" alone leaves the customer guessing across a
      // basket. Only that refusal is re-scoped; anything else (a database that
      // is genuinely down) keeps its own meaning and its own status.
      let authority: ResolvedAssistedOrderLine;
      try {
        authority = await this.deps.catalog.resolveLine(viewer, requested);
      } catch (error) {
        if (error instanceof AssistedOrderValidationError && error.field === "product") {
          throw new AssistedOrderValidationError(`lines.${index}.productId`, error.message);
        }
        throw error;
      }
      if (!quantityIsAllowed(authority, requested.quantity)) {
        throw new AssistedOrderValidationError(
          `lines.${index}.quantity`,
          `Quantity must begin at ${authority.minimumQuantity}, use increments of ${authority.quantityIncrement}, and stay within the current product maximum.`,
        );
      }
      if (
        requested.expectedUnitPriceCents !== undefined &&
        authority.unitPriceCents !== null &&
        requested.expectedUnitPriceCents !== authority.unitPriceCents
      ) {
        throw new AssistedOrderConflictError(
          "price_changed",
          "A product price changed. Refresh the catalog before submitting.",
        );
      }
      if (
        requested.expectedCatalogVersion !== undefined &&
        requested.expectedCatalogVersion !== authority.catalogVersion
      ) {
        throw new AssistedOrderConflictError(
          "catalog_changed",
          "The catalog changed. Refresh before submitting.",
        );
      }
      if (
        requested.expectedPriceVersion !== undefined &&
        requested.expectedPriceVersion !== authority.priceVersion
      ) {
        throw new AssistedOrderConflictError(
          "price_changed",
          "The price authority changed. Refresh before submitting.",
        );
      }
      // SUBMIT-TIME PATHWAY GATE.
      //
      // Everything above re-resolves the line server-side — quantity, price,
      // catalog version, price version — and then accepted whatever pathway
      // came back. The only thing stopping a Care or held product entering a
      // durable order was the BROWSER declining to add it to the basket, and a
      // client-side guard is not a guard. `provider_request` appeared in this
      // file exactly once before now, in the next-steps COPY, which explained
      // the Care pathway to a customer whose Care item had already been
      // accepted.
      //
      // That matters more under manual payment, not less: a wrong acceptance
      // ends with the founder personally emailing payment instructions for a
      // clinical or held product, in writing, with no automated system
      // downstream to catch it.
      //
      // Decided by the SAME derivation the storefront button uses, never a
      // second copy — a shelf and a door that compute admission separately is
      // how the GRP-0422 hold came to be recorded and consulted by nobody.
      // Family is not passed because it cannot change this answer: it only
      // separates buy_now from assisted_order, and BOTH are admitted here.
      // What is refused is Care and unavailable, in either direction.
      const pathway = earlyAccessCustomerPathway({
        workflowMode: authority.workflowMode,
        researchUseOnly: authority.researchUseOnly,
        hasApprovedRetailPrice: authority.unitPriceCents !== null,
        family: "",
      });
      if (!pathwayEntersPayment(pathway) && !pathwayEntersRequest(pathway)) {
        throw new AssistedOrderValidationError(
          `lines.${index}.productId`,
          pathway === "care"
            ? `${authority.productName} is fulfilled through the Xenios Care provider pathway and cannot be ordered here.`
            : `${authority.productName} is not available to order right now.`,
        );
      }

      resolvedLines.push(
        Object.freeze({
          ...authority,
          lineId: this.deps.ids.uuid(),
          quantity: requested.quantity,
          lineEstimateCents: lineEstimate(
            authority.unitPriceCents,
            requested.quantity,
          ),
        }),
      );
    }

    // Agreements are checked AFTER resolution: whether the request carries a
    // Research Use Only line is a fact of the authoritative catalog, never a
    // claim the browser makes about itself.
    await this.requireAgreements(
      input,
      resolvedLines.some((line) => line.researchUseOnly),
    );
    const estimatedTotalCents = totalEstimate(resolvedLines);
    const requestFingerprint = this.deps.hasher.stableHash({
      contact: input.contact,
      agreements: input.agreements,
      lines: resolvedLines.map((line) => ({
        productId: line.productId,
        variantId: line.variantId,
        quantity: line.quantity,
        authoritativeFingerprint: line.authoritativeFingerprint,
      })),
      generalNotes: input.generalNotes ?? null,
      // Pinned null, deliberately, for two reasons: attribution is a fact
      // about the visit, not the request, so a resubmission with a changed
      // cookie state must still replay as the SAME request; and every
      // fingerprint stored before the server-derived seam carried null here
      // (the browser never sent the field), so replays keep matching.
      affiliateAttributionRef: null,
    });

    const stored = await this.deps.repository.createOrReplay(
      Object.freeze({
        requestId,
        publicReference,
        statusTokenHash,
        requestFingerprint,
        idempotencyKeyHash,
        actorMemberId: viewer.memberId,
        earlyAccessSessionHash: viewer.earlyAccessSessionHash,
        normalizedEmail: input.contact.email,
        fullLegalName: input.contact.fullLegalName,
        mobilePhone: input.contact.mobilePhone,
        organizationName: input.contact.organizationName ?? null,
        shippingAddress: input.contact.shippingAddress,
        billingAddress:
          input.contact.billingAddress ?? input.contact.shippingAddress,
        ageConfirmed: true,
        agreements: input.agreements,
        generalNotes: input.generalNotes ?? null,
        // Server-derived or nothing. input.affiliateAttributionRef is
        // deliberately never read: the browser must not be able to choose
        // which partner an order pays.
        affiliateAttributionRef: verifiedAffiliateAttributionRef,
        // The code the CUSTOMER TYPED, kept as a separate fact beside the
        // verified one above. It is accepted from the browser precisely because
        // it grants nothing, and it is normalized rather than refused so an
        // unknown or malformed code cannot cost the customer their order.
        declaredAffiliateCode: declaredAffiliateCode.code,
        declaredAffiliateCodeState: declaredAffiliateCode.state,
        estimatedTotalCents,
        currency: ASSISTED_ORDER_CURRENCY,
        source: ASSISTED_ORDER_SOURCE,
        lines: Object.freeze(resolvedLines),
        createdAt: nowIso,
      }),
      statusToken,
    );

    if (stored.requestFingerprint !== requestFingerprint) {
      throw new AssistedOrderConflictError(
        "idempotency_conflict",
        "This submission key was already used for a different request.",
      );
    }

    const receipt: AssistedOrderReceipt = Object.freeze({
      ...stored.receipt,
      nextSteps: nextStepsForModes(
        new Set(resolvedLines.map((line) => line.workflowMode)),
      ),
    });

    // The stored receipt is identity authority: on replay it carries the
    // ORIGINAL requestId, never the freshly minted one.
    const storedRequestId = stored.receipt.requestId;
    if (stored.replayed || storedRequestId !== requestId) {
      // Idempotent replay. The first submit already ran the notifications,
      // audit event, and Google mirror; repeating them would double-send.
      return receipt;
    }

    // Persistence already succeeded. Notification, audit, and Google mirror
    // failures are isolated and cannot erase the customer's request.
    const workflowModes = Array.from(
      new Set(resolvedLines.map((line) => line.workflowMode)),
    );
    // The one line projection both emails are built from.
    //
    // It is RETAIL ONLY by construction, not by filtering: the catalog
    // authority a line is resolved from carries no wholesale price, no supplier
    // cost, no margin and no benchmark, so there is nothing here to leak. It
    // also carries no address, no document, and no payment evidence. The
    // renderers apply their own allowlist on top of this, so a field added here
    // later still cannot reach an email until a template asks for it.
    const notificationLines = Object.freeze(
      resolvedLines.map((line) =>
        Object.freeze({
          productName: line.productName,
          specification: line.specification,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          lineEstimateCents: line.lineEstimateCents,
          workflowMode: line.workflowMode,
        }),
      ),
    );
    const totalQuantity = resolvedLines.reduce(
      (sum, line) => sum + line.quantity,
      0,
    );
    // Nothing is owed at submission. Saying so plainly in both emails is the
    // point: it is the sentence that stops a customer paying a stranger, and it
    // tells the operator that no money fact exists to reconcile yet.
    const paymentState = "none_due_yet";

    // WHAT THE OPERATOR NEEDS TO WORK THE ORDER FROM THEIR INBOX.
    //
    // Payment is manual at launch: the founder reads this email and replies to
    // the customer with availability and payment instructions. That only works
    // if the email carries the facts required to do it — a shipping address to
    // quote and ship to, a phone number to call, the agreements that were
    // accepted, and anything the customer wrote. Without those the operator has
    // to open the database to answer a customer, which is the thing this email
    // exists to avoid.
    //
    // This is ADMIN ONLY and stays that way. It goes to the configured admin
    // address, never to the customer, and it still carries no wholesale price,
    // no supplier cost, no margin and no benchmark, because the catalog
    // authority these lines resolve from does not hold any.
    const adminPayload = Object.freeze({
      publicReference: receipt.publicReference,
      fullLegalName: input.contact.fullLegalName,
      email: input.contact.email,
      mobilePhone: input.contact.mobilePhone,
      shippingAddress: input.contact.shippingAddress,
      customerNotes: input.generalNotes ?? null,
      agreements: Object.freeze(
        (input.agreements ?? []).map((agreement) =>
          Object.freeze({
            kind: agreement.kind,
            version: agreement.version,
          }),
        ),
      ),
      acceptedAt: nowIso,
      operatorStatus: "Order received. Awaiting manual review.",
      lineCount: resolvedLines.length,
      totalQuantity,
      estimatedTotalCents,
      workflowModes,
      lines: notificationLines,
      paymentState,
      // The server-verified attribution, when one exists. Never a browser-
      // supplied value: `input.affiliateAttributionRef` is ignored on purpose.
      affiliateAttributionRef: verifiedAffiliateAttributionRef,
      // The typed claim, rendered separately and labelled unverified, so an
      // operator never reads it as a proven relationship.
      declaredAffiliateCode: declaredAffiliateCode.code,
      adminPath: `/admin/research/assisted-orders/${storedRequestId}`,
    });

    const effects = await Promise.allSettled([
      this.deps.outbox.enqueue(
        Object.freeze({
          eventId: this.deps.ids.uuid(),
          eventType: "assisted_order.submitted",
          requestId: storedRequestId,
          publicReference: receipt.publicReference,
          recipientKind: "admin",
          recipientAddress: this.deps.adminNotificationEmail,
          templateKey: "research.assisted_order.submitted.admin",
          templateVersion: "v2",
          payload: adminPayload,
          dedupeKey: `assisted-order:${storedRequestId}:submitted:admin`,
          createdAt: nowIso,
        }),
      ),
      this.deps.outbox.enqueue(
        Object.freeze({
          eventId: this.deps.ids.uuid(),
          eventType: "assisted_order.submitted",
          requestId: storedRequestId,
          publicReference: receipt.publicReference,
          recipientKind: "customer",
          recipientAddress: input.contact.email,
          templateKey: "research.assisted_order.submitted.customer",
          templateVersion: "v2",
          payload: Object.freeze({
            publicReference: receipt.publicReference,
            lineCount: resolvedLines.length,
            totalQuantity,
            estimatedTotalCents,
            lines: notificationLines,
            paymentState,
            nextSteps: receipt.nextSteps,
            statusPath: `/research/early-access/order-request/${receipt.publicReference}`,
          }),
          dedupeKey: `assisted-order:${storedRequestId}:submitted:customer`,
          createdAt: nowIso,
        }),
      ),
      this.deps.audit.record(
        Object.freeze({
          eventId: this.deps.ids.uuid(),
          eventType: "assisted_order.submitted",
          requestId: storedRequestId,
          actorType: viewer.actorType,
          actorId: viewerActorId(viewer),
          evidence: Object.freeze({
            lineCount: resolvedLines.length,
            workflowModes,
            requestFingerprint,
          }),
          occurredAt: nowIso,
        }),
      ),
      this.enqueueGoogleMirror({
        requestId: storedRequestId,
        publicReference: receipt.publicReference,
        createdAt: nowIso,
        fullLegalName: input.contact.fullLegalName,
        email: input.contact.email,
        mobilePhone: input.contact.mobilePhone,
        organizationName: input.contact.organizationName ?? null,
        lineCount: resolvedLines.length,
        totalQuantity: resolvedLines.reduce(
          (sum, line) => sum + line.quantity,
          0,
        ),
        estimatedTotalCents,
      }),
    ]);
    effects.forEach((effect, index) => {
      if (effect.status === "rejected") {
        this.deps.logger.warn("Assisted order post-commit effect failed.", {
          requestId: storedRequestId,
          effectIndex: index,
          error:
            effect.reason instanceof Error
              ? effect.reason.message
              : String(effect.reason),
        });
      }
    });

    return receipt;
  }

  public async status(
    viewer: AssistedOrderViewer,
    publicReference: string,
    rawStatusToken?: string,
  ): Promise<AssistedOrderStatusView> {
    const reference = normalizeRequiredText(
      "publicReference",
      publicReference,
      80,
    );
    // Recorded decision: a presented status token is verified against the
    // request first, and a match grants read access to THAT request only,
    // regardless of viewer capabilities (the emailed 30-day link must keep
    // working after the session lapses). The lookup stays bound to the exact
    // public reference, so a token can never enumerate other references.
    if (rawStatusToken) {
      const tokenAuthorization: AssistedOrderStatusAuthorization =
        Object.freeze({
          memberId: null,
          earlyAccessSessionHash: null,
          publicReference: reference,
          statusTokenHash: this.deps.hasher.hash(rawStatusToken),
        });
      const result = await this.deps.repository.getStatus(tokenAuthorization);
      if (!result) {
        throw new AssistedOrderNotFoundError();
      }
      return result;
    }
    // No token presented: fall back to the capability plus ownership path.
    requireCapability(viewer, "assisted_orders:read_own");
    const authorization: AssistedOrderStatusAuthorization = Object.freeze({
      memberId: viewer.memberId,
      earlyAccessSessionHash: viewer.earlyAccessSessionHash,
      publicReference: reference,
      statusTokenHash: null,
    });
    const result = await this.deps.repository.getStatus(authorization);
    if (!result) {
      throw new AssistedOrderNotFoundError();
    }
    return result;
  }

  public async listAdmin(
    viewer: AssistedOrderViewer,
    input: {
      status?: AssistedOrderStatus;
      search?: string;
      page?: number;
      pageSize?: number;
    },
  ): Promise<AssistedOrderAdminListPage> {
    requireCapability(viewer, "assisted_orders:read_all");
    const page = Number.isSafeInteger(input.page) && (input.page as number) > 0
      ? (input.page as number)
      : 1;
    const pageSize =
      Number.isSafeInteger(input.pageSize) &&
      (input.pageSize as number) > 0 &&
      (input.pageSize as number) <= 100
        ? (input.pageSize as number)
        : 25;
    return this.deps.repository.listAdmin({
      status: input.status,
      search: input.search?.trim() || undefined,
      page,
      pageSize,
    });
  }

  public async adminDetail(
    viewer: AssistedOrderViewer,
    requestId: string,
  ): Promise<AssistedOrderAdminDetail> {
    requireCapability(viewer, "assisted_orders:read_all");
    const result = await this.deps.repository.getAdmin(
      normalizeRequiredText("requestId", requestId, 80),
    );
    if (!result) {
      throw new AssistedOrderNotFoundError();
    }
    return result;
  }

  public async updateStatus(
    viewer: AssistedOrderViewer,
    requestId: string,
    input: AssistedOrderStatusUpdateInput,
  ): Promise<AssistedOrderAdminDetail> {
    requireCapability(viewer, "assisted_orders:manage");
    // Repo admins are Supabase JWT email identities, not member rows, so a
    // manage-capability viewer may carry no memberId. The recorded actor
    // falls back to the viewer's label or email; only a viewer with no
    // recordable identity at all is refused.
    const actorId =
      viewer.memberId ?? viewer.actorLabel ?? viewer.normalizedEmail;
    if (!actorId) {
      throw new AssistedOrderAuthorizationError();
    }
    const current = await this.adminDetail(viewer, requestId);
    if (!allowedTransitions[current.status].includes(input.status)) {
      throw new AssistedOrderConflictError(
        "invalid_status_transition",
        `Status cannot move from ${current.status} to ${input.status}.`,
      );
    }
    evidenceRequired(input.status, input);
    const nowIso = this.deps.clock.now().toISOString();
    const updated = await this.deps.repository.updateStatus({
      requestId: current.requestId,
      fromStatus: current.status,
      toStatus: input.status,
      actorId,
      actorType: "admin",
      customerMessage: input.customerMessage?.trim() || null,
      internalNote: input.internalNote?.trim() || null,
      evidence: input.evidence ?? {},
      occurredAt: nowIso,
    });

    const message = input.customerMessage?.trim() || customerStatusMessage(input.status);
    const effects = await Promise.allSettled([
      this.deps.outbox.enqueue(
        Object.freeze({
          eventId: this.deps.ids.uuid(),
          eventType: "assisted_order.status_changed",
          requestId: updated.requestId,
          publicReference: updated.publicReference,
          recipientKind: "customer",
          recipientAddress: updated.email,
          templateKey: "research.assisted_order.status_changed.customer",
          templateVersion: "v1",
          payload: Object.freeze({
            publicReference: updated.publicReference,
            status: updated.status,
            customerMessage: message,
          }),
          dedupeKey: `assisted-order:${updated.requestId}:status:${updated.status}:${updated.updatedAt}`,
          createdAt: nowIso,
        }),
      ),
      this.deps.audit.record(
        Object.freeze({
          eventId: this.deps.ids.uuid(),
          eventType: "assisted_order.status_changed",
          requestId: updated.requestId,
          actorType: "admin",
          actorId,
          evidence: Object.freeze({
            from: current.status,
            to: updated.status,
            authorityEvidenceKinds: statusAuthorityEvidenceKinds(input.evidence),
          }),
          occurredAt: nowIso,
        }),
      ),
    ]);
    effects.forEach((effect) => {
      if (effect.status === "rejected") {
        this.deps.logger.warn("Assisted order status effect failed.", {
          requestId: updated.requestId,
          error:
            effect.reason instanceof Error
              ? effect.reason.message
              : String(effect.reason),
        });
      }
    });

    return updated;
  }

  public async createDocumentUpload(
    viewer: AssistedOrderViewer,
    requestId: string,
    input: AssistedOrderUploadRequest,
  ): Promise<AssistedOrderUploadTicket> {
    requireCapability(viewer, "assisted_orders:read_own");
    const authorizedStatus = await this.deps.repository.getStatus({
      memberId: viewer.memberId,
      earlyAccessSessionHash: viewer.earlyAccessSessionHash,
      publicReference: normalizeRequiredText(
        "publicReference",
        input.publicReference,
        80,
      ),
      statusTokenHash: input.statusToken
        ? this.deps.hasher.hash(input.statusToken)
        : null,
    });
    if (!authorizedStatus || authorizedStatus.requestId !== requestId) {
      throw new AssistedOrderNotFoundError();
    }
    const detail = await this.deps.repository.getAdmin(requestId);
    if (!detail) {
      throw new AssistedOrderNotFoundError();
    }
    if (
      input.documentType === "government_id" &&
      detail.status !== "identity_requested"
    ) {
      throw new AssistedOrderConflictError(
        "identity_not_requested",
        "Identity documents may be uploaded only after Xenios requests them.",
      );
    }
    if (!isUploadMimeType(input.mimeType)) {
      throw new AssistedOrderValidationError(
        "mimeType",
        "Only JPEG, PNG, and PDF files are supported.",
      );
    }
    if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > MAX_UPLOAD_BYTES) {
      throw new AssistedOrderValidationError(
        "sizeBytes",
        "The document must be 15 MB or smaller.",
      );
    }
    const now = this.deps.clock.now();
    const documentId = this.deps.ids.uuid();
    const fileName = safeFileName(input.fileName);
    const objectPath = `${requestId}/${documentId}/${fileName}`;
    const retentionExpiresAt = new Date(
      now.getTime() + DOCUMENT_RETENTION_DAYS * 24 * 60 * 60 * 1_000,
    ).toISOString();

    await this.deps.repository.createDocument({
      documentId,
      requestId,
      objectPath,
      documentType: input.documentType,
      side: input.side,
      fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      status: "upload_pending",
      createdAt: now.toISOString(),
      retentionExpiresAt,
    });

    // Record authorization durably BEFORE asking storage to mint a signed
    // capability. If the audit authority is absent or unavailable, no URL is
    // created or exposed. The event is named "authorized", not "uploaded": a
    // later storage call can still fail and there is no cross-service atomic
    // transaction to pretend otherwise.
    await this.deps.audit.record({
      eventId: this.deps.ids.uuid(),
      eventType: "assisted_order.document_upload_authorized",
      requestId,
      actorType: viewer.actorType,
      actorId: viewerActorId(viewer),
      evidence: Object.freeze({
        documentId,
        documentType: input.documentType,
        side: input.side,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
      }),
      occurredAt: now.toISOString(),
    });
    const ticket = await this.deps.documents.createUpload({
      objectPath,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      expiresInSeconds: UPLOAD_TICKET_SECONDS,
    });
    return Object.freeze({ ...ticket, documentId, objectPath });
  }

  public async completeDocumentUpload(
    viewer: AssistedOrderViewer,
    requestId: string,
    documentId: string,
    publicReference: string,
    rawStatusToken?: string,
  ): Promise<void> {
    requireCapability(viewer, "assisted_orders:read_own");
    const record = await this.deps.repository.getDocument({
      requestId,
      documentId,
    });
    if (!record) {
      throw new AssistedOrderNotFoundError();
    }
    const authorizedStatus = await this.deps.repository.getStatus({
      memberId: viewer.memberId,
      earlyAccessSessionHash: viewer.earlyAccessSessionHash,
      publicReference: normalizeRequiredText(
        "publicReference",
        publicReference,
        80,
      ),
      statusTokenHash: rawStatusToken
        ? this.deps.hasher.hash(rawStatusToken)
        : null,
    });
    if (!authorizedStatus || authorizedStatus.requestId !== requestId) {
      throw new AssistedOrderNotFoundError();
    }
    const detail = await this.deps.repository.getAdmin(requestId);
    if (!detail) {
      throw new AssistedOrderNotFoundError();
    }
    const nowIso = this.deps.clock.now().toISOString();
    // Persist completion authorization before changing the domain row. That
    // guarantees no uploaded state can exist without durable audit coverage,
    // while the event name remains truthful if the later repository write
    // fails. The repository's uploaded row is the completion fact; this
    // separate store never pretends the two writes are one transaction.
    await this.deps.audit.record({
      eventId: this.deps.ids.uuid(),
      eventType: "assisted_order.document_upload_completion_authorized",
      requestId,
      actorType: viewer.actorType,
      actorId: viewerActorId(viewer),
      evidence: Object.freeze({
        documentId,
        documentType: record.documentType,
        sizeBytes: record.sizeBytes,
      }),
      occurredAt: nowIso,
    });
    await this.deps.repository.completeDocument({
      requestId,
      documentId,
      objectPath: record.objectPath,
      uploadedAt: nowIso,
    });

    const effects = await Promise.allSettled([
      this.deps.outbox.enqueue({
        eventId: this.deps.ids.uuid(),
        eventType: "assisted_order.document_uploaded",
        requestId,
        publicReference: detail.publicReference,
        recipientKind: "admin",
        recipientAddress: this.deps.adminNotificationEmail,
        templateKey: "research.assisted_order.document_uploaded.admin",
        templateVersion: "v1",
        payload: Object.freeze({
          publicReference: detail.publicReference,
          documentId,
          documentType: record.documentType,
          adminPath: `/admin/research/assisted-orders/${requestId}`,
        }),
        dedupeKey: `assisted-order:${requestId}:document:${documentId}:uploaded`,
        createdAt: nowIso,
      }),
    ]);
    effects.forEach((effect) => {
      if (effect.status === "rejected") {
        this.deps.logger.warn("Document post-commit effect failed.", {
          requestId,
          documentId,
          error:
            effect.reason instanceof Error
              ? effect.reason.message
              : String(effect.reason),
        });
      }
    });
  }

  public async createDocumentDownload(
    viewer: AssistedOrderViewer,
    requestId: string,
    documentId: string,
  ): Promise<{ url: string; expiresAt: string }> {
    requireCapability(viewer, "assisted_orders:documents_manage");
    const document = await this.deps.repository.getDocument({
      requestId,
      documentId,
    });
    if (!document || document.status === "deleted" || document.status === "expired") {
      throw new AssistedOrderNotFoundError();
    }
    // Authorization is the fact we can prove before capability creation. A
    // signed URL does not prove bytes were downloaded, and no database write
    // can be atomic with the storage provider's signer. Audit first so a sink
    // failure can never leak an unrecorded capability.
    await this.deps.audit.record({
      eventId: this.deps.ids.uuid(),
      eventType: "assisted_order.document_download_authorized",
      requestId,
      actorType: "admin",
      actorId: viewerActorId(viewer),
      evidence: Object.freeze({ documentId }),
      occurredAt: this.deps.clock.now().toISOString(),
    });
    return this.deps.documents.createDownload({
      objectPath: document.objectPath,
      expiresInSeconds: DOWNLOAD_TICKET_SECONDS,
    });
  }

  // Fails closed: a submission is accepted only when every required
  // (kind, version) pair was acknowledged exactly. Extra acknowledged pairs
  // are allowed. Version aliases such as "current" never satisfy a
  // requirement because matching is exact.
  private async requireAgreements(
    input: AssistedOrderSubmitInput,
    includesResearchUseOnly: boolean,
  ): Promise<void> {
    const legal = this.deps.legal ?? null;
    if (!legal) {
      throw new AssistedOrderValidationError(
        "agreements",
        "legal_requirements_unavailable: the required agreement set could not be determined, so the submission is refused.",
      );
    }
    const required = await legal.requiredAgreements();
    // Keys are JSON tuples so kind and version can never blur together.
    const acknowledged = new Set(
      input.agreements.map((agreement) =>
        JSON.stringify([agreement.kind, agreement.version]),
      ),
    );
    for (const requirement of required) {
      const pair = JSON.stringify([requirement.kind, requirement.version]);
      if (!acknowledged.has(pair)) {
        throw new AssistedOrderValidationError(
          "agreements",
          `The agreement ${requirement.kind} (version ${requirement.version}) must be accepted before submitting.`,
        );
      }
    }
    // The operational form facts (D-005): every assisted_order_form_v1
    // acknowledgment must be present at its exact copy hash, so a stale form
    // whose displayed copy drifted refuses with a refresh instead of
    // recording a confirmation the customer never saw.
    for (const acknowledgment of requiredAssistedOrderFormAcknowledgments({
      includesResearchUseOnly,
    })) {
      const formPair = assistedOrderFormPair(acknowledgment);
      if (!acknowledged.has(JSON.stringify([formPair.kind, formPair.version]))) {
        throw new AssistedOrderValidationError(
          "agreements",
          `The ${acknowledgment.id.replace(/_/g, " ")} acknowledgment must be confirmed on the current form before submitting. Refresh the page if the form is stale.`,
        );
      }
    }
  }

  private async enqueueGoogleMirror(input: {
    requestId: string;
    publicReference: string;
    createdAt: string;
    fullLegalName: string;
    email: string;
    mobilePhone: string;
    organizationName: string | null;
    lineCount: number;
    totalQuantity: number;
    estimatedTotalCents: number | null;
  }): Promise<void> {
    if (!this.deps.googleMirror) {
      return;
    }
    const row: AssistedOrderGoogleMirrorRow = Object.freeze({
      publicReference: input.publicReference,
      createdAt: input.createdAt,
      fullLegalName: input.fullLegalName,
      email: input.email,
      mobilePhone: input.mobilePhone,
      organizationName: input.organizationName,
      lineCount: input.lineCount,
      totalQuantity: input.totalQuantity,
      estimatedValue:
        input.estimatedTotalCents === null
          ? null
          : (input.estimatedTotalCents / 100).toFixed(2),
      identityStatus: "not_requested",
      agreementStatus: "pending_review",
      paymentStatus: "not_started",
      supplierStatus: "not_started",
      trackingStatus: "not_started",
      overallStatus: "submitted",
      adminPath: `/admin/research/assisted-orders/${input.requestId}`,
    });
    await this.deps.googleMirror.enqueue(row);
  }
}

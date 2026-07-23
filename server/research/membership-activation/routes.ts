// ---------------------------------------------------------------------------
// xenios research founding membership activation: the HTTP surface.
//
// Registered by the integration lane (server/index.ts calls
// registerFoundingActivationApi once); this module never mounts itself.
// It follows the commerce surface's structure (server/research/commerce/
// routes.ts) exactly:
//
//   1. IDENTITY IS NEVER READ FROM THE CLIENT. The acting member comes only
//      from what the injected guard authenticated (req.researchMember); the
//      acting admin only from the guard-attached admin email. No handler
//      reads a member id, case id-as-identity, or obligation ownership from
//      a body or query, so a request cannot be pointed at another member.
//
//   2. THE THREE-STATE GATE RUNS BEFORE EVERYTHING, including the auth
//      guards. With the flag off every route answers
//      { ok: false, code: "capability_disabled" } and NO store, provider, or
//      auth backend is touched; with the flag on but storage unprovisioned
//      every route answers the precise { ok: false, code: "not_provisioned" }
//      denial. Only the live state reaches a guard or a service.
//
//   3. RICH DOMAIN RECORDS ARE NEVER SERIALIZED to members. The service layer
//      (production-deps.ts) builds every member-facing shape by explicit
//      construction; receiving-instruction plaintext and ciphertext have no
//      field to travel in, and the route layer only relays.
//
// Guards are injected so this module has no opinion about how authentication
// works and cannot define a parallel auth path.
// ---------------------------------------------------------------------------

import type { Express, Request, Response } from "express";
import { SIGNING_MODES, type SigningMode } from "./esign/contracts";
import { FoundingActivationError } from "./obligations";
import { PaymentMethodInvalid, CipherNotConfigured, CiphertextInvalid } from "./payment-methods";
import { BridgeSettingsInvalid } from "./bridge";
import { IdentityInvalidTransition } from "./identity-documents";
import {
  PaymentMethodAlreadyExists,
  PaymentMethodNotFound,
  PaymentMethodStale,
} from "./persistence/payment-methods-store";

// ---------------------------------------------------------------------------
// The injected surface
// ---------------------------------------------------------------------------

/** Every service answer is a discriminated result the route relays. */
export type ServiceResult =
  | ({ ok: true } & Record<string, unknown>)
  | { ok: false; code: string; message?: string; fieldErrors?: string[] };

/** The acting member, from the guard only. */
export interface MemberContext {
  memberId: string;
  email: string;
  ip: string | null;
  userAgent: string | null;
}

/** The acting admin, from the guard only. */
export interface AdminContext {
  adminId: string;
  ip: string | null;
  userAgent: string | null;
}

/**
 * The go-live readiness vocabulary: every item in the admin readiness report
 * is in exactly one of these four states, and the report never carries a
 * secret value (env checks report presence booleans and variable names only).
 */
export const READINESS_STATES = [
  "code_ready",
  "configuration_missing",
  "external_approval_missing",
  "production_test_missing",
] as const;
export type ReadinessItemState = (typeof READINESS_STATES)[number];

export interface ReadinessItem {
  key: string;
  label: string;
  state: ReadinessItemState;
  detail: string | null;
}

export interface ReadinessArea {
  area: string;
  title: string;
  items: ReadinessItem[];
}

export const ADMIN_OBLIGATION_ACTIONS = [
  "reject",
  "request-info",
  "mismatch",
  "duplicate",
  "reversed",
  "refunded",
  "cancel",
] as const;
export type AdminObligationAction = (typeof ADMIN_OBLIGATION_ACTIONS)[number];

/** The wire shape of an agreement signature. Nothing here is ever prechecked:
 * the blank form state is all-false and the domain requires literal true. */
export interface SignAgreementWire {
  documentVersionId: string;
  typedLegalName: string;
  fullDocumentShown: boolean;
  affirmativeConsent: boolean;
  separateAcknowledgment?: boolean;
}

/** The member's payment report fields (the obligation and method are resolved
 * server-side from the authenticated member, never from this body). */
export interface ReportPaymentWire {
  amountCents: number;
  sentDate: string;
  sentTime: string | null;
  senderName: string;
  senderContact: string | null;
  senderIdentifierMasked: string | null;
  externalRef: string | null;
  note: string | null;
  evidenceRef: string | null;
  accuracyCertified: boolean;
}

/** The admin verification fields (verifiedAt is stamped by the server). */
export interface VerifyWire {
  amountReceivedCents: number;
  dateReceived: string;
  receivingDestinationRef: string;
  methodId: string;
  externalRef: string | null;
  reconciliationDate: string;
  note: string | null;
  confirmedReceived: boolean;
}

export interface UploadUrlWire {
  contentType: string;
  contentLengthBytes: number;
  fileName: string;
}

export interface FoundingActivationServices {
  /** The full server-computed activation step tracker. */
  status(member: MemberContext): Promise<ServiceResult>;
  /** E-signature (OpenSign): the member starts a signing session and lists their
   * signing requests. Both refuse with capability_disabled when the provider is
   * off (founding activation on, e-signature off). */
  esign: {
    startSession(
      member: MemberContext,
      input: { mode: SigningMode; documentVersionIds: string[]; idempotencyKey: string },
    ): Promise<ServiceResult>;
    documents(member: MemberContext): Promise<ServiceResult>;
  };
  /** The provider webhook: the ONLY thing that advances an e-sign acceptance.
   * Returns a bare { status, body } the route relays; never throws to the route. */
  esignWebhook(
    rawBody: string,
    signatureHeader: string | null,
    nowMs: number,
  ): Promise<{ status: number; body: Record<string, unknown> }>;
  identity: {
    consent(member: MemberContext, input: { accepted: boolean; consentVersion: string }): Promise<ServiceResult>;
    uploadUrl(member: MemberContext, input: UploadUrlWire): Promise<ServiceResult>;
    markUploaded(member: MemberContext): Promise<ServiceResult>;
    status(member: MemberContext): Promise<ServiceResult>;
  };
  agreements: {
    required(member: MemberContext): Promise<ServiceResult>;
    sign(member: MemberContext, input: SignAgreementWire): Promise<ServiceResult>;
    signed(member: MemberContext): Promise<ServiceResult>;
  };
  payment: {
    methods(member: MemberContext): Promise<ServiceResult>;
    selectMethod(member: MemberContext, methodId: string): Promise<ServiceResult>;
    obligation(member: MemberContext): Promise<ServiceResult>;
    report(member: MemberContext, input: ReportPaymentWire): Promise<ServiceResult>;
    evidenceUploadUrl(member: MemberContext, input: UploadUrlWire): Promise<ServiceResult>;
  };
  admin: {
    queue(): Promise<ServiceResult>;
    detail(obligationId: string): Promise<ServiceResult>;
    verify(
      admin: AdminContext,
      obligationId: string,
      fields: VerifyWire,
      idempotencyKey: string,
    ): Promise<ServiceResult>;
    transition(
      admin: AdminContext,
      obligationId: string,
      action: AdminObligationAction,
      detail: string,
    ): Promise<ServiceResult>;
    migrate(admin: AdminContext, obligationId: string, methodId: string, phase: string): Promise<ServiceResult>;
    bridgeSettings(): Promise<ServiceResult>;
    updateBridgeSettings(admin: AdminContext, body: Record<string, unknown>): Promise<ServiceResult>;
    listMethods(): Promise<ServiceResult>;
    createMethod(admin: AdminContext, body: Record<string, unknown>): Promise<ServiceResult>;
    approveMethod(admin: AdminContext, methodId: string, note: string | undefined): Promise<ServiceResult>;
    disableMethod(admin: AdminContext, methodId: string, reason: string): Promise<ServiceResult>;
    checklist(): Promise<ServiceResult>;
    updateChecklist(admin: AdminContext, key: string, done: boolean, note: string | null): Promise<ServiceResult>;
    reconciliation(): Promise<ServiceResult>;
    reconciliationCsv(): Promise<string>;
    readiness(): Promise<ServiceResult>;
    identityQueue(): Promise<ServiceResult>;
    identityViewUrl(admin: AdminContext, caseId: string): Promise<ServiceResult>;
    identityReview(admin: AdminContext, caseId: string, findings: Record<string, unknown>): Promise<ServiceResult>;
    identityEmergencyDelete(admin: AdminContext, caseId: string): Promise<ServiceResult>;
    // ---- e-signature document center ----
    esignMemberDocuments(memberId: string): Promise<ServiceResult>;
    esignDownloadUrl(
      admin: AdminContext,
      requestId: string,
      which: "signed" | "certificate",
    ): Promise<ServiceResult>;
    esignPacketZip(memberId: string): Promise<Buffer>;
    esignResendNotification(admin: AdminContext, requestId: string): Promise<ServiceResult>;
  };
}

/**
 * The three-state composition (built by production-deps.ts).
 *
 *   disabled       flag off (the production default): every route refuses as
 *                  capability_disabled; no service object even exists.
 *   unprovisioned  flag on, storage not provisioned: every route refuses with
 *                  the precise not_provisioned denial; still no service.
 *   live           flag on and configured: the real composition.
 */
export type FoundingActivationDependencies =
  | { state: "disabled" }
  | { state: "unprovisioned" }
  | { state: "live"; services: FoundingActivationServices };

export interface FoundingActivationGuards {
  requireMember: (req: Request, res: Response, next: () => void) => void | Promise<void>;
  requireSupabaseAdmin: (req: Request, res: Response, next: () => void) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Identity extraction (guard-attached values only; nothing from the request)
// ---------------------------------------------------------------------------

export function memberContextOf(req: Request): MemberContext | null {
  const member = (req as unknown as { researchMember?: Record<string, unknown> }).researchMember;
  if (!member) return null;
  const id = member.id;
  const email = member.email;
  if (typeof id !== "string" || id.length === 0) return null;
  return {
    memberId: id,
    email: typeof email === "string" ? email : "",
    ip: typeof req.ip === "string" ? req.ip : null,
    userAgent: typeof req.get === "function" ? (req.get("user-agent") ?? null) : null,
  };
}

export function adminContextOf(req: Request): AdminContext {
  const email = (req as unknown as { adminEmail?: unknown }).adminEmail;
  return {
    adminId: typeof email === "string" && email.length > 0 ? email : "admin",
    ip: typeof req.ip === "string" ? req.ip : null,
    userAgent: typeof req.get === "function" ? (req.get("user-agent") ?? null) : null,
  };
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function secure(res: Response): Response {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");
  return res;
}

function deny(res: Response, status: number, code: string, message?: string, fieldErrors?: string[]): void {
  secure(res)
    .status(status)
    .json({ ok: false, code, ...(message ? { message } : {}), ...(fieldErrors?.length ? { fieldErrors } : {}) });
}

/** Denial codes that are a missing resource. */
const NOT_FOUND_CODES = new Set(["not_found", "method_not_found", "version_not_found", "case_not_found"]);

/** Denial codes that are a state conflict rather than a bad request. */
const CONFLICT_CODES = new Set([
  "obligation_required",
  "no_obligation",
  "already_active",
  "already_verified",
  "already_extended",
  "already_exists",
  "already_initialized",
  "illegal_transition",
  "invalid_state",
  "amount_mismatch",
  "consent_required",
  "not_published",
  "electronic_consent_required",
  "agreements_unsatisfied",
  "identity_not_verified",
  "identity_rejected",
  "method_exists",
  "method_stale",
  // Bridge creation-gate refusals: the calendar or configuration says no.
  "bridge_not_open_yet",
  "bridge_sunset",
  "bridge_not_configured",
  "method_wrong_category",
  "method_not_usable",
  "method_not_activation_eligible",
  "method_not_renewal_eligible",
  "not_accepting_new_activation_payments",
  "not_accepting_existing_obligation_payments",
]);

const UNAVAILABLE_CODES = new Set(["capability_disabled", "not_provisioned", "cipher_not_configured"]);

function statusForCode(code: string): number {
  if (UNAVAILABLE_CODES.has(code)) return 503;
  if (NOT_FOUND_CODES.has(code)) return 404;
  if (CONFLICT_CODES.has(code)) return 409;
  if (code === "not_permitted" || code === "forbidden") return 403;
  if (code === "provider_error" || code === "storage_error" || code === "internal_error") return 500;
  return 400;
}

function relay(res: Response, result: ServiceResult): void {
  if (result.ok) {
    const { ok: _ok, ...rest } = result as Record<string, unknown> & { ok: true };
    secure(res).json({ ok: true, ...rest });
    return;
  }
  deny(res, statusForCode(result.code), result.code, result.message, result.fieldErrors);
}

/** Thrown domain errors mapped to precise wire denials; nothing internal leaks. */
function relayError(res: Response, error: unknown): void {
  if (error instanceof FoundingActivationError) {
    deny(res, statusForCode(error.code), error.code, error.message, error.fieldErrors);
    return;
  }
  if (error instanceof PaymentMethodAlreadyExists) {
    deny(res, 409, "method_exists", "A payment method with that id already exists.");
    return;
  }
  if (error instanceof PaymentMethodNotFound) {
    deny(res, 404, "method_not_found", "No payment method with that id.");
    return;
  }
  if (error instanceof PaymentMethodStale) {
    deny(res, 409, "method_stale", "The method changed underneath this request. Reload and retry.");
    return;
  }
  if (error instanceof PaymentMethodInvalid || error instanceof BridgeSettingsInvalid) {
    deny(res, 400, error instanceof PaymentMethodInvalid ? "payment_method_invalid" : "bridge_settings_invalid", error.message);
    return;
  }
  if (error instanceof CipherNotConfigured || error instanceof CiphertextInvalid) {
    // The message names the env variable only; no key material exists to leak.
    deny(res, 503, "cipher_not_configured", "Payment instruction encryption is not configured.");
    return;
  }
  if (error instanceof IdentityInvalidTransition) {
    deny(res, 409, "invalid_state", error.message);
    return;
  }
  console.error("[founding-activation] request failed:", error instanceof Error ? error.message : error);
  deny(res, 500, "internal_error", "The request could not be completed.");
}

// ---------------------------------------------------------------------------
// Wire validation (structure only; every business rule lives beneath)
// ---------------------------------------------------------------------------

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseUploadUrlWire(body: unknown): UploadUrlWire | null {
  const record = (body ?? {}) as Record<string, unknown>;
  if (!isNonEmptyString(record.contentType)) return null;
  if (!Number.isInteger(record.contentLengthBytes) || (record.contentLengthBytes as number) <= 0) return null;
  if (!isNonEmptyString(record.fileName)) return null;
  return {
    contentType: record.contentType,
    contentLengthBytes: record.contentLengthBytes as number,
    fileName: record.fileName,
  };
}

function parseSignWire(body: unknown): SignAgreementWire | null {
  const record = (body ?? {}) as Record<string, unknown>;
  if (!isNonEmptyString(record.documentVersionId)) return null;
  if (typeof record.typedLegalName !== "string") return null;
  if (typeof record.fullDocumentShown !== "boolean") return null;
  if (typeof record.affirmativeConsent !== "boolean") return null;
  if (record.separateAcknowledgment !== undefined && typeof record.separateAcknowledgment !== "boolean") return null;
  return {
    documentVersionId: record.documentVersionId,
    typedLegalName: record.typedLegalName,
    fullDocumentShown: record.fullDocumentShown,
    affirmativeConsent: record.affirmativeConsent,
    ...(record.separateAcknowledgment !== undefined
      ? { separateAcknowledgment: record.separateAcknowledgment }
      : {}),
  };
}

function parseReportWire(body: unknown): { wire: ReportPaymentWire } | { errors: string[] } {
  const record = (body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  if (!Number.isInteger(record.amountCents) || (record.amountCents as number) <= 0) {
    errors.push("amountCents must be a positive integer");
  }
  if (!isNonEmptyString(record.sentDate)) errors.push("sentDate is required");
  if (!isNonEmptyString(record.senderName)) errors.push("senderName is required");
  // The certification is NEVER prechecked and never coerced: only the literal
  // boolean true, affirmatively sent, passes the wire.
  if (record.accuracyCertified !== true) errors.push("accuracyCertified must be exactly true");
  if (errors.length > 0) return { errors };
  return {
    wire: {
      amountCents: record.amountCents as number,
      sentDate: record.sentDate as string,
      sentTime: stringOrNull(record.sentTime),
      senderName: record.senderName as string,
      senderContact: stringOrNull(record.senderContact),
      senderIdentifierMasked: stringOrNull(record.senderIdentifierMasked),
      externalRef: stringOrNull(record.externalRef),
      note: stringOrNull(record.note),
      evidenceRef: stringOrNull(record.evidenceRef),
      accuracyCertified: true,
    },
  };
}

function parseVerifyWire(body: unknown): { wire: VerifyWire; idempotencyKey: string } | { errors: string[] } {
  const record = (body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  if (!Number.isInteger(record.amountReceivedCents) || (record.amountReceivedCents as number) <= 0) {
    errors.push("amountReceivedCents must be a positive integer");
  }
  if (!isNonEmptyString(record.dateReceived)) errors.push("dateReceived is required");
  if (!isNonEmptyString(record.receivingDestinationRef)) errors.push("receivingDestinationRef is required");
  if (!isNonEmptyString(record.methodId)) errors.push("methodId is required");
  if (!isNonEmptyString(record.reconciliationDate)) errors.push("reconciliationDate is required");
  // Nothing verifies by omission: the explicit confirmation must be the
  // literal true, and every absent optional is an EXPLICIT null.
  if (record.confirmedReceived !== true) errors.push("confirmedReceived must be exactly true");
  if (!isNonEmptyString(record.idempotencyKey)) errors.push("idempotencyKey is required");
  if (errors.length > 0) return { errors };
  return {
    wire: {
      amountReceivedCents: record.amountReceivedCents as number,
      dateReceived: record.dateReceived as string,
      receivingDestinationRef: record.receivingDestinationRef as string,
      methodId: record.methodId as string,
      externalRef: stringOrNull(record.externalRef),
      reconciliationDate: record.reconciliationDate as string,
      note: stringOrNull(record.note),
      confirmedReceived: true,
    },
    idempotencyKey: (record.idempotencyKey as string).trim(),
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerFoundingActivationApi(
  app: Express,
  deps: FoundingActivationDependencies,
  guards: FoundingActivationGuards,
): void {
  /**
   * The three-state gate, FIRST in every chain, before even the auth guard:
   * with the flag off (or storage unprovisioned) the request is answered here
   * and neither the auth backend nor any store or provider is touched.
   */
  function stateGate(req: Request, res: Response, next: () => void): void {
    void req;
    if (deps.state === "disabled") {
      deny(res, 503, "capability_disabled", "Founding membership activation is not enabled.");
      return;
    }
    if (deps.state === "unprovisioned") {
      deny(
        res,
        503,
        "not_provisioned",
        "Founding membership activation storage is not provisioned. Nothing was changed.",
      );
      return;
    }
    next();
  }

  /** Only the live state reaches a handler, so services are always present. */
  function services(): FoundingActivationServices {
    if (deps.state !== "live") throw new Error("services accessed outside the live state");
    return deps.services;
  }

  type MemberHandler = (
    svc: FoundingActivationServices,
    member: MemberContext,
    req: Request,
    res: Response,
  ) => Promise<void>;

  function memberRoute(handler: MemberHandler) {
    return async (req: Request, res: Response): Promise<void> => {
      const member = memberContextOf(req);
      if (!member) {
        deny(res, 403, "forbidden", "This area requires a research membership.");
        return;
      }
      try {
        await handler(services(), member, req, res);
      } catch (error) {
        relayError(res, error);
      }
    };
  }

  type AdminHandler = (
    svc: FoundingActivationServices,
    admin: AdminContext,
    req: Request,
    res: Response,
  ) => Promise<void>;

  function adminRoute(handler: AdminHandler) {
    return async (req: Request, res: Response): Promise<void> => {
      try {
        await handler(services(), adminContextOf(req), req, res);
      } catch (error) {
        relayError(res, error);
      }
    };
  }

  const member = guards.requireMember;
  const admin = guards.requireSupabaseAdmin;

  // ---- member: the step tracker -------------------------------------------
  app.get(
    "/api/research/activation/status",
    stateGate,
    member,
    memberRoute(async (svc, ctx, _req, res) => relay(res, await svc.status(ctx))),
  );

  // ---- member: identity ----------------------------------------------------
  app.post(
    "/api/research/activation/identity/consent",
    stateGate,
    member,
    memberRoute(async (svc, ctx, req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (typeof body.accepted !== "boolean" || !isNonEmptyString(body.consentVersion)) {
        deny(res, 400, "validation_failed", "Consent needs an explicit accepted boolean and a consentVersion.");
        return;
      }
      relay(res, await svc.identity.consent(ctx, { accepted: body.accepted, consentVersion: body.consentVersion }));
    }),
  );

  app.post(
    "/api/research/activation/identity/upload-url",
    stateGate,
    member,
    memberRoute(async (svc, ctx, req, res) => {
      const wire = parseUploadUrlWire(req.body);
      if (!wire) {
        deny(res, 400, "validation_failed", "An upload needs a contentType, a positive contentLengthBytes, and a fileName.");
        return;
      }
      relay(res, await svc.identity.uploadUrl(ctx, wire));
    }),
  );

  app.post(
    "/api/research/activation/identity/mark-uploaded",
    stateGate,
    member,
    memberRoute(async (svc, ctx, _req, res) => relay(res, await svc.identity.markUploaded(ctx))),
  );

  app.get(
    "/api/research/activation/identity/status",
    stateGate,
    member,
    memberRoute(async (svc, ctx, _req, res) => relay(res, await svc.identity.status(ctx))),
  );

  // ---- member: agreements --------------------------------------------------
  app.get(
    "/api/research/activation/agreements",
    stateGate,
    member,
    memberRoute(async (svc, ctx, _req, res) => relay(res, await svc.agreements.required(ctx))),
  );

  app.post(
    "/api/research/activation/agreements/sign",
    stateGate,
    member,
    memberRoute(async (svc, ctx, req, res) => {
      const wire = parseSignWire(req.body);
      if (!wire) {
        deny(
          res,
          400,
          "validation_failed",
          "A signature needs a documentVersionId, a typed legal name, and explicit boolean consent fields.",
        );
        return;
      }
      relay(res, await svc.agreements.sign(ctx, wire));
    }),
  );

  app.get(
    "/api/research/activation/agreements/signed",
    stateGate,
    member,
    memberRoute(async (svc, ctx, _req, res) => relay(res, await svc.agreements.signed(ctx))),
  );

  // ---- member: payment -----------------------------------------------------
  app.get(
    "/api/research/activation/payment/methods",
    stateGate,
    member,
    memberRoute(async (svc, ctx, _req, res) => relay(res, await svc.payment.methods(ctx))),
  );

  app.post(
    "/api/research/activation/payment/select-method",
    stateGate,
    member,
    memberRoute(async (svc, ctx, req, res) => {
      const methodId = (req.body as { methodId?: unknown })?.methodId;
      if (!isNonEmptyString(methodId)) {
        deny(res, 400, "validation_failed", "Selecting a method needs a methodId.");
        return;
      }
      relay(res, await svc.payment.selectMethod(ctx, methodId));
    }),
  );

  app.get(
    "/api/research/activation/payment/obligation",
    stateGate,
    member,
    memberRoute(async (svc, ctx, _req, res) => relay(res, await svc.payment.obligation(ctx))),
  );

  app.post(
    "/api/research/activation/payment/report",
    stateGate,
    member,
    memberRoute(async (svc, ctx, req, res) => {
      const parsed = parseReportWire(req.body);
      if ("errors" in parsed) {
        deny(res, 400, "validation_failed", "The payment report is incomplete.", parsed.errors);
        return;
      }
      relay(res, await svc.payment.report(ctx, parsed.wire));
    }),
  );

  app.post(
    "/api/research/activation/payment/evidence-upload-url",
    stateGate,
    member,
    memberRoute(async (svc, ctx, req, res) => {
      const wire = parseUploadUrlWire(req.body);
      if (!wire) {
        deny(res, 400, "validation_failed", "An upload needs a contentType, a positive contentLengthBytes, and a fileName.");
        return;
      }
      relay(res, await svc.payment.evidenceUploadUrl(ctx, wire));
    }),
  );

  // ---- member: e-signature -------------------------------------------------
  app.post(
    "/api/research/activation/esign/session",
    stateGate,
    member,
    memberRoute(async (svc, ctx, req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const mode = body.mode;
      const documentVersionIds = body.documentVersionIds;
      const idempotencyKey = body.idempotencyKey;
      if (
        typeof mode !== "string" ||
        !(SIGNING_MODES as readonly string[]).includes(mode) ||
        !Array.isArray(documentVersionIds) ||
        documentVersionIds.length === 0 ||
        !documentVersionIds.every((value) => isNonEmptyString(value)) ||
        !isNonEmptyString(idempotencyKey)
      ) {
        deny(
          res,
          400,
          "validation_failed",
          "A signing session needs a supported mode, at least one documentVersionId, and an idempotencyKey.",
        );
        return;
      }
      relay(
        res,
        await svc.esign.startSession(ctx, {
          mode: mode as SigningMode,
          documentVersionIds: documentVersionIds as string[],
          idempotencyKey: idempotencyKey.trim(),
        }),
      );
    }),
  );

  app.get(
    "/api/research/activation/esign/documents",
    stateGate,
    member,
    memberRoute(async (svc, ctx, _req, res) => relay(res, await svc.esign.documents(ctx))),
  );

  // ---- e-signature: provider webhook (stateGate only; NO member/admin guard) --
  // The raw request bytes captured by the app-level express.json verify hook are
  // the exact input the HMAC verifies. The raw body and the signature are NEVER
  // logged. Completion is processed here, server-side; a browser redirect is not.
  app.post("/api/research/webhooks/esign", stateGate, async (req: Request, res: Response) => {
    try {
      const raw =
        (req as unknown as { rawBody?: Buffer }).rawBody?.toString("utf8") ??
        JSON.stringify(req.body ?? {});
      const signature = typeof req.get === "function" ? (req.get("x-webhook-signature") ?? null) : null;
      const result = await services().esignWebhook(raw, signature, Date.now());
      secure(res).status(result.status).json(result.body);
    } catch (error) {
      // Never surface the raw body or the signature.
      console.error(
        "[founding-activation] esign webhook route failed:",
        error instanceof Error ? error.message : "unknown",
      );
      deny(res, 500, "internal_error", "The webhook could not be processed.");
    }
  });

  // ---- admin: the payment verification queue -------------------------------
  app.get(
    "/api/admin/research/activation/queue",
    stateGate,
    admin,
    adminRoute(async (svc, _ctx, _req, res) => relay(res, await svc.admin.queue())),
  );

  app.get(
    "/api/admin/research/activation/queue/:obligationId",
    stateGate,
    admin,
    adminRoute(async (svc, _ctx, req, res) => relay(res, await svc.admin.detail(String(req.params.obligationId)))),
  );

  app.post(
    "/api/admin/research/activation/queue/:obligationId/verify",
    stateGate,
    admin,
    adminRoute(async (svc, ctx, req, res) => {
      const parsed = parseVerifyWire(req.body);
      if ("errors" in parsed) {
        deny(
          res,
          400,
          "validation_failed",
          "The verification is incomplete; every field and the explicit confirmation are required.",
          parsed.errors,
        );
        return;
      }
      relay(res, await svc.admin.verify(ctx, String(req.params.obligationId), parsed.wire, parsed.idempotencyKey));
    }),
  );

  for (const action of ADMIN_OBLIGATION_ACTIONS) {
    app.post(
      `/api/admin/research/activation/queue/:obligationId/${action}`,
      stateGate,
      admin,
      adminRoute(async (svc, ctx, req, res) => {
        const detail = (req.body as { detail?: unknown })?.detail;
        if (!isNonEmptyString(detail)) {
          deny(res, 400, "validation_failed", `A ${action} needs a detail explaining why.`);
          return;
        }
        relay(res, await svc.admin.transition(ctx, String(req.params.obligationId), action, detail.trim()));
      }),
    );
  }

  app.post(
    "/api/admin/research/activation/queue/:obligationId/migrate",
    stateGate,
    admin,
    adminRoute(async (svc, ctx, req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (!isNonEmptyString(body.methodId) || !isNonEmptyString(body.phase)) {
        deny(res, 400, "validation_failed", "A migration needs a methodId and a phase.");
        return;
      }
      relay(res, await svc.admin.migrate(ctx, String(req.params.obligationId), body.methodId, body.phase));
    }),
  );

  // ---- admin: the bridge ---------------------------------------------------
  app.get(
    "/api/admin/research/activation/bridge/settings",
    stateGate,
    admin,
    adminRoute(async (svc, _ctx, _req, res) => relay(res, await svc.admin.bridgeSettings())),
  );

  app.put(
    "/api/admin/research/activation/bridge/settings",
    stateGate,
    admin,
    adminRoute(async (svc, ctx, req, res) =>
      relay(res, await svc.admin.updateBridgeSettings(ctx, (req.body ?? {}) as Record<string, unknown>)),
    ),
  );

  app.get(
    "/api/admin/research/activation/bridge/checklist",
    stateGate,
    admin,
    adminRoute(async (svc, _ctx, _req, res) => relay(res, await svc.admin.checklist())),
  );

  app.put(
    "/api/admin/research/activation/bridge/checklist",
    stateGate,
    admin,
    adminRoute(async (svc, ctx, req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (!isNonEmptyString(body.key) || typeof body.done !== "boolean") {
        deny(res, 400, "validation_failed", "A checklist update needs an item key and an explicit done boolean.");
        return;
      }
      relay(res, await svc.admin.updateChecklist(ctx, body.key, body.done, stringOrNull(body.note)));
    }),
  );

  // ---- admin: the payment method registry ----------------------------------
  app.get(
    "/api/admin/research/activation/methods",
    stateGate,
    admin,
    adminRoute(async (svc, _ctx, _req, res) => relay(res, await svc.admin.listMethods())),
  );

  // Plaintext receiving instructions are accepted ONLY here, over the
  // authenticated admin route, and are encrypted at rest immediately by the
  // service. They are never echoed back, never serialized, and the request
  // body is never logged (server/index.ts excludes /api/admin/research from
  // body logging; nothing in this module logs a body).
  app.post(
    "/api/admin/research/activation/methods",
    stateGate,
    admin,
    adminRoute(async (svc, ctx, req, res) =>
      relay(res, await svc.admin.createMethod(ctx, (req.body ?? {}) as Record<string, unknown>)),
    ),
  );

  app.post(
    "/api/admin/research/activation/methods/:methodId/approve",
    stateGate,
    admin,
    adminRoute(async (svc, ctx, req, res) => {
      const note = (req.body as { complianceReviewNote?: unknown })?.complianceReviewNote;
      relay(
        res,
        await svc.admin.approveMethod(
          ctx,
          String(req.params.methodId),
          typeof note === "string" ? note : undefined,
        ),
      );
    }),
  );

  app.post(
    "/api/admin/research/activation/methods/:methodId/disable",
    stateGate,
    admin,
    adminRoute(async (svc, ctx, req, res) => {
      const reason = (req.body as { reason?: unknown })?.reason;
      if (!isNonEmptyString(reason)) {
        deny(res, 400, "validation_failed", "Disabling a method needs a reason.");
        return;
      }
      relay(res, await svc.admin.disableMethod(ctx, String(req.params.methodId), reason.trim()));
    }),
  );

  // ---- admin: reconciliation -----------------------------------------------
  app.get(
    "/api/admin/research/activation/reconciliation",
    stateGate,
    admin,
    adminRoute(async (svc, _ctx, req, res) => {
      if (String(req.query?.format ?? "") === "csv") {
        const csv = await svc.admin.reconciliationCsv();
        secure(res).type("text/csv").send(csv);
        return;
      }
      relay(res, await svc.admin.reconciliation());
    }),
  );

  // ---- admin: the go-live readiness report ---------------------------------
  // Four-state vocabulary per item (READINESS_STATES); no secret value ever
  // serializes: environment checks report presence booleans and variable
  // names only, and the details are counts and static citations.
  app.get(
    "/api/admin/research/activation/readiness",
    stateGate,
    admin,
    adminRoute(async (svc, _ctx, _req, res) => relay(res, await svc.admin.readiness())),
  );

  // ---- admin: identity review ----------------------------------------------
  app.get(
    "/api/admin/research/activation/identity/queue",
    stateGate,
    admin,
    adminRoute(async (svc, _ctx, _req, res) => relay(res, await svc.admin.identityQueue())),
  );

  // Every admin view of a document is audited BEFORE the signed URL exists;
  // the service refuses the grant when the audit write fails.
  app.get(
    "/api/admin/research/activation/identity/:caseId/view",
    stateGate,
    admin,
    adminRoute(async (svc, ctx, req, res) => relay(res, await svc.admin.identityViewUrl(ctx, String(req.params.caseId)))),
  );

  app.post(
    "/api/admin/research/activation/identity/:caseId/review",
    stateGate,
    admin,
    adminRoute(async (svc, ctx, req, res) =>
      relay(res, await svc.admin.identityReview(ctx, String(req.params.caseId), (req.body ?? {}) as Record<string, unknown>)),
    ),
  );

  app.post(
    "/api/admin/research/activation/identity/:caseId/emergency-delete",
    stateGate,
    admin,
    adminRoute(async (svc, ctx, req, res) =>
      relay(res, await svc.admin.identityEmergencyDelete(ctx, String(req.params.caseId))),
    ),
  );

  // ---- admin: the e-signature document center ------------------------------
  app.get(
    "/api/admin/research/activation/esign/member/:memberId",
    stateGate,
    admin,
    adminRoute(async (svc, _ctx, req, res) =>
      relay(res, await svc.admin.esignMemberDocuments(String(req.params.memberId))),
    ),
  );

  app.get(
    "/api/admin/research/activation/esign/request/:requestId/download",
    stateGate,
    admin,
    adminRoute(async (svc, ctx, req, res) => {
      const which = String(req.query?.which ?? "signed") === "certificate" ? "certificate" : "signed";
      relay(res, await svc.admin.esignDownloadUrl(ctx, String(req.params.requestId), which));
    }),
  );

  // The signed member packet as a .zip. The memberId is guarded against header
  // injection before it reaches the Content-Disposition filename.
  app.get(
    "/api/admin/research/activation/esign/member/:memberId/packet.zip",
    stateGate,
    admin,
    adminRoute(async (svc, _ctx, req, res) => {
      const memberId = String(req.params.memberId);
      if (!/^[A-Za-z0-9._-]+$/.test(memberId)) {
        deny(res, 400, "validation_failed", "That member id is not valid for a packet download.");
        return;
      }
      const buf = await svc.admin.esignPacketZip(memberId);
      secure(res)
        .type("application/zip")
        .set("Content-Disposition", `attachment; filename="member-${memberId}-packet.zip"`)
        .send(buf);
    }),
  );

  app.post(
    "/api/admin/research/activation/esign/request/:requestId/resend",
    stateGate,
    admin,
    adminRoute(async (svc, ctx, req, res) =>
      relay(res, await svc.admin.esignResendNotification(ctx, String(req.params.requestId))),
    ),
  );
}

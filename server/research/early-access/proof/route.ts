/**
 * THE CUSTOMER UPLOAD DOOR.
 *
 * CONSTRUCTED, NOT REGISTERED. This module exports a route factory, its
 * canonical path, and the raw body handling the path needs. It mounts nothing,
 * for the same reason recorded in `cart/payment-instructions-route.ts`:
 * registration plus the research-wall admission entry is a single, separately
 * reviewed integration step owned by the composition root. An /api/research
 * path that is mounted without its admission entry is answered by the earlier
 * gateway and reads as broken rather than closed.
 *
 * WHY RAW BYTES RATHER THAN JSON. A base64 field inside a JSON body is 1.37x
 * the size, is parsed into a string before anything can validate it, and
 * leaves that string in the heap for the lifetime of the request. Raw bytes
 * with an explicit content type are smaller, are never converted to text, and
 * let the size limit be enforced by the transport rather than after a parse.
 *
 * THE ERROR SHAPE MATTERS. Express raw body failures reject with their own
 * error objects and, without a scoped handler, surface as the framework's HTML
 * error page or a bare 500. A customer's upload client then receives HTML where
 * it expected JSON. `proofBodyErrorHandler` converts exactly the body errors on
 * exactly this path into the same private-header JSON refusal every other
 * Early Access route uses, and it never logs the body.
 */

import type { ProofSubmissionOutcome, ProofSubmissionRefusal } from "./submission-service";
import { customerSubmissionView } from "./customer-view";
import { EARLY_ACCESS_PROOF_CONTENT_TYPES } from "../commerce/payment-proof";
import { TRANSIENT_PROOF_MAX_BYTES } from "./transient-proof";

/**
 * Registered alongside `:cartCheckoutNumber`, after the literal cart paths,
 * for the ordering reason recorded in register.ts.
 */
export const EARLY_ACCESS_CART_PAYMENT_PROOF_PATH =
  "/api/research/early-access/cart/:cartCheckoutNumber/payment-proof";

export type ProofResponsePort = {
  setHeader?(name: string, value: string): unknown;
  status(code: number): { json(body: unknown): unknown } | unknown;
  json(body: unknown): unknown;
};

export type ProofRequestPort = Readonly<{
  cookieHeader?: string;
  cartCheckoutNumber?: unknown;
  /** The raw upload. Never a parsed body, never a string. */
  bytes?: unknown;
  contentType?: unknown;
  /** From a header, so the filename never rides inside the byte stream. */
  filename?: unknown;
  method?: unknown;
  /** What the transport said the length was, before the body was read. */
  declaredContentLength?: unknown;
}>;

export interface ProofIdentityPort {
  resolve(
    cookieHeader: string | undefined,
  ): Promise<Readonly<{ customerRef: string; aliases?: readonly string[] }> | null>;
}

function privateHeaders(response: ProofResponsePort): void {
  response.setHeader?.("Cache-Control", "no-store, private, max-age=0");
  response.setHeader?.("Pragma", "no-cache");
  response.setHeader?.("X-Content-Type-Options", "nosniff");
  // The response is JSON about an upload of unknown provenance. Nothing here
  // is ever a document a browser should consider rendering.
  response.setHeader?.("Content-Disposition", "attachment");
}

function send(response: ProofResponsePort, status: number, body: unknown): void {
  const staged = response.status(status) as { json?(value: unknown): unknown };
  if (staged !== undefined && staged !== null && typeof staged.json === "function") {
    staged.json(body);
    return;
  }
  response.json(body);
}

/**
 * The refusal-to-status mapping.
 *
 * Written as one table so the status a customer sees is a property of the
 * refusal rather than of where in the handler it was raised. 415 for a type
 * the door does not accept, 413 for size, 429 for rate, 503 for capacity and
 * for anything that means the service could not answer, 400 for everything the
 * customer can fix, and 404 for both an unknown and an unowned checkout.
 */
const STATUS_BY_REFUSAL: Readonly<Record<string, number>> = Object.freeze({
  session_required: 401,
  binding_absent: 409,
  binding_unverified: 409,
  binding_owner_mismatch: 404,
  agreements_not_current: 409,
  not_found: 404,
  payment_closed: 409,
  checkout_superseded: 409,
  method_required: 400,
  method_not_enabled: 400,
  presentation_unavailable: 503,
  rate_limited: 429,
  capacity_exhausted: 503,
  store_unavailable: 503,
  send_failed: 502,
  bytes_missing: 400,
  too_large: 413,
  content_type_unsupported: 415,
  declared_type_mismatch: 415,
  signature_unrecognised: 415,
  empty: 400,
  truncated: 400,
  trailing_bytes: 400,
  structure_invalid: 400,
  checksum_invalid: 400,
  encrypted: 400,
  no_pages: 400,
});

/**
 * Customer-facing text for each refusal.
 *
 * Deliberately non-diagnostic about the file's internals. "This file does not
 * open as a valid PNG" is actionable. "IHDR CRC mismatch at offset 8" tells an
 * attacker exactly which check to satisfy next.
 */
const MESSAGE_BY_REFUSAL: Readonly<Record<string, string>> = Object.freeze({
  binding_absent: "Verify your identity before submitting payment proof.",
  binding_unverified: "Verify your identity before submitting payment proof.",
  agreements_not_current: "Your agreements need to be completed or re-accepted before you can submit proof.",
  method_required: "Select the payment method you used before uploading your proof.",
  method_not_enabled: "That payment method is not currently available for this order.",
  presentation_unavailable: "Payment details are being confirmed. Try again shortly.",
  rate_limited: "Too many uploads. Wait a few minutes and try again.",
  capacity_exhausted: "The upload service is busy. Try again in a moment.",
  store_unavailable: "The upload service is unavailable. Try again shortly.",
  send_failed: "The upload could not be delivered. Try again.",
  payment_closed: "This order is no longer awaiting payment proof.",
  checkout_superseded: "This checkout was replaced. Use the current order.",
  too_large: "That file is too large. Upload a file under 8 MB.",
  content_type_unsupported: "Upload a PNG, JPEG, WEBP or PDF.",
  declared_type_mismatch: "That file is not the type it claims to be.",
  signature_unrecognised: "Upload a PNG, JPEG, WEBP or PDF.",
  encrypted: "That PDF is password protected. Upload one that opens without a password.",
});

const DEFAULT_MESSAGE = "That file could not be read. Upload a clear screenshot or PDF.";

export interface EarlyAccessProofRouteDeps {
  readonly identity: ProofIdentityPort;
  readonly submit: (input: {
    readonly customer: Readonly<{ customerRef: string; aliases?: readonly string[] }>;
    readonly cartCheckoutNumber: string;
    readonly bytes: Uint8Array;
    readonly declaredContentType: unknown;
    readonly declaredFilename: unknown;
    readonly method: unknown;
  }) => Promise<ProofSubmissionOutcome>;
  /** Same shape check the cart routes use, injected to avoid a second copy. */
  readonly isCheckoutNumber: (value: unknown) => value is string;
  readonly maxBytes?: number;
}

export function createEarlyAccessCartPaymentProofRoute(deps: EarlyAccessProofRouteDeps) {
  const maxBytes = deps.maxBytes ?? TRANSIENT_PROOF_MAX_BYTES;

  return async (request: ProofRequestPort, response: ProofResponsePort): Promise<void> => {
    privateHeaders(response);

    const customer = await deps.identity.resolve(request.cookieHeader);
    if (customer === null) {
      send(response, 401, { ok: false, code: "SESSION_REQUIRED" });
      return;
    }

    if (!deps.isCheckoutNumber(request.cartCheckoutNumber)) {
      send(response, 404, { ok: false, code: "NOT_FOUND" });
      return;
    }

    // Refuse on the DECLARED length before the body is even considered. The
    // transport limit is the real enforcement, but answering here means an
    // oversized upload is refused without the bytes being held at all.
    const declaredLength = request.declaredContentLength;
    if (typeof declaredLength === "number" && declaredLength > maxBytes) {
      send(response, 413, {
        ok: false,
        code: "TOO_LARGE",
        message: MESSAGE_BY_REFUSAL.too_large,
        maxBytes,
      });
      return;
    }

    const contentType = request.contentType;
    if (
      typeof contentType !== "string" ||
      !(EARLY_ACCESS_PROOF_CONTENT_TYPES as readonly string[]).includes(contentType)
    ) {
      send(response, 415, {
        ok: false,
        code: "CONTENT_TYPE_UNSUPPORTED",
        message: MESSAGE_BY_REFUSAL.content_type_unsupported,
        accepted: [...EARLY_ACCESS_PROOF_CONTENT_TYPES],
      });
      return;
    }

    const bytes = request.bytes;
    if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
      send(response, 400, { ok: false, code: "BYTES_MISSING" });
      return;
    }
    if (bytes.length > maxBytes) {
      send(response, 413, {
        ok: false,
        code: "TOO_LARGE",
        message: MESSAGE_BY_REFUSAL.too_large,
        maxBytes,
      });
      return;
    }

    const outcome = await deps.submit({
      customer,
      cartCheckoutNumber: request.cartCheckoutNumber,
      bytes,
      declaredContentType: contentType,
      declaredFilename: request.filename,
      method: request.method,
    });

    if (outcome.ok) {
      // 201 for a new claim, 200 when this exact claim was already recorded.
      // A duplicate is a success, not a conflict: the customer's proof is in.
      const status = outcome.state === "already_submitted" ? 200 : 201;
      send(response, status, {
        ok: true,
        submission: customerSubmissionView(outcome.row),
      });
      return;
    }

    const code = outcome.code as ProofSubmissionRefusal | "send_failed";
    const status = STATUS_BY_REFUSAL[code] ?? 400;
    send(response, status, {
      ok: false,
      code: code.toUpperCase(),
      message: MESSAGE_BY_REFUSAL[code] ?? DEFAULT_MESSAGE,
    });
  };
}

// ---------------------------------------------------------------------------
// The scoped body error boundary
// ---------------------------------------------------------------------------

export type BodyErrorLike = Readonly<{
  type?: unknown;
  status?: unknown;
  statusCode?: unknown;
  message?: unknown;
}>;

/**
 * Classify a body parser failure without reading the body.
 *
 * Express's raw and json parsers reject with `entity.too.large`,
 * `entity.parse.failed`, `encoding.unsupported` and friends. Mapping them by
 * `type` rather than by message keeps the mapping stable across versions.
 */
export function classifyBodyError(error: BodyErrorLike): number | null {
  const type = typeof error?.type === "string" ? error.type : "";
  if (type === "entity.too.large") return 413;
  if (type === "encoding.unsupported" || type === "charset.unsupported") return 415;
  if (type === "entity.parse.failed" || type === "request.aborted") return 400;

  const status = typeof error?.status === "number" ? error.status : error?.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) return status;
  return null;
}

/**
 * The Express error middleware for this path only.
 *
 * Scoped by path so it cannot change the error behaviour of any other route,
 * which is what makes it safe to add. It writes the same private headers a
 * successful refusal would, because a 413 that is cacheable is a 413 that can
 * be replayed to a different customer by an intermediary.
 */
export function createProofBodyErrorHandler(pathPredicate: (path: string) => boolean) {
  return function proofBodyErrorHandler(
    error: BodyErrorLike,
    request: Readonly<{ path?: string; originalUrl?: string }>,
    response: ProofResponsePort & Readonly<{ headersSent?: boolean }>,
    next: (error?: unknown) => void,
  ): void {
    const path = typeof request?.path === "string" ? request.path : (request?.originalUrl ?? "");
    if (!pathPredicate(path)) {
      next(error);
      return;
    }
    if (response.headersSent === true) {
      next(error);
      return;
    }

    const status = classifyBodyError(error);
    if (status === null) {
      next(error);
      return;
    }

    privateHeaders(response);
    const code =
      status === 413 ? "TOO_LARGE" : status === 415 ? "CONTENT_TYPE_UNSUPPORTED" : "REQUEST_INVALID";
    const message =
      status === 413
        ? MESSAGE_BY_REFUSAL.too_large
        : status === 415
          ? MESSAGE_BY_REFUSAL.content_type_unsupported
          : DEFAULT_MESSAGE;
    // The error is never logged and never echoed. A body parser error object
    // holds a reference to the request, and the request holds the upload.
    send(response, status, { ok: false, code, message });
  };
}

/** True for the concrete proof upload path, whatever checkout number it names. */
export function isProofUploadPath(path: string): boolean {
  return /^\/api\/research\/early-access\/cart\/[^/]+\/payment-proof$/.test(path);
}

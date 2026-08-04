/**
 * Early Access payment proof intake. Server only, pure, side effect free.
 *
 * A customer uploading a screenshot is a claim, not a settlement. This module
 * validates proof METADATA only and produces an intent to store the object under a
 * private key. It never receives bytes, never stores anything, never contacts a
 * provider, and cannot produce a paid, verified, or released state. The single state
 * change it can describe is `payment_under_review`.
 *
 * Only `payment-verification.ts`, driven by an authorized human, can mark a payment
 * received. That separation is what stops a forged screenshot from releasing product.
 */

import {
  isEarlyAccessPaymentOptionCode,
  type EarlyAccessPaymentOptionCode,
} from "@shared/research/early-access-payment-options";
import {
  accepted,
  carriesAnyKey,
  isBoundedInteger,
  isBoundedText,
  isCanonicalTimestamp,
  isNotBefore,
  isOneOf,
  isSafeIdentifier,
  readPlainRecord,
  refused,
  type CommerceResult,
} from "./input-guards";
import { readEarlyAccessOrder, type EarlyAccessOrderStatus } from "./early-access-order";

/** Strict allowlist. Anything outside it is refused, never sniffed or converted. */
export const EARLY_ACCESS_PROOF_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
] as const;

export type EarlyAccessProofContentType = (typeof EARLY_ACCESS_PROOF_CONTENT_TYPES)[number];

export const EARLY_ACCESS_PROOF_MAX_BYTES = 10 * 1024 * 1024;
export const EARLY_ACCESS_PROOF_KEY_PREFIX = "private/early-access-payment-proofs/";

/**
 * Keys that would carry, or point at, the object itself. Present for any reason, the
 * submission is refused: this lane handles metadata, and a byte carrying request has
 * to fail loudly rather than be silently truncated to its metadata.
 */
export const PROOF_BYTE_BEARING_KEYS = [
  "base64",
  "body",
  "buffer",
  "bytes",
  "content",
  "data",
  "downloadUrl",
  "file",
  "fileContents",
  "payload",
  "signedUrl",
  "stream",
  "url",
] as const;

/** A proof may be attached only while payment is still open. */
const PROOF_ACCEPTING_STATUSES = ["awaiting_payment", "payment_under_review"] as const;

export type PaymentProofFailureCode =
  | "proof_bytes_supplied"
  | "input_invalid"
  | "order_invalid"
  | "order_not_awaiting_payment"
  | "proof_id_invalid"
  | "filename_invalid"
  | "content_type_unsupported"
  | "byte_size_invalid"
  | "submitted_at_invalid"
  | "method_unsupported";

/** A description of what a storage adapter should do. Nothing has been done yet. */
export type PaymentProofStorageIntent = Readonly<{
  action: "store_private_proof_object";
  objectKey: string;
  contentType: EarlyAccessProofContentType;
  byteSize: number;
  bytesReceived: false;
  performed: false;
}>;

export type PaymentProofSubmission = Readonly<{
  proofId: string;
  orderId: string;
  filename: string;
  contentType: EarlyAccessProofContentType;
  byteSize: number;
  submittedAt: string;
  method: EarlyAccessPaymentOptionCode;
  transition: Readonly<{ from: EarlyAccessOrderStatus; to: "payment_under_review" }>;
  orderStatus: "payment_under_review";
  /** Structural, not advisory: this lane has no type in which payment is settled. */
  paid: false;
  verified: false;
  storageIntent: PaymentProofStorageIntent;
}>;

export type PaymentProofResult = CommerceResult<PaymentProofSubmission, PaymentProofFailureCode>;

const PROOF_REQUIRED_KEYS = [
  "order",
  "proofId",
  "filename",
  "contentType",
  "byteSize",
  "submittedAt",
  "method",
] as const;

const FILENAME_EXTENSIONS: Readonly<Record<EarlyAccessProofContentType, readonly string[]>> =
  Object.freeze({
    "image/png": Object.freeze([".png"]),
    "image/jpeg": Object.freeze([".jpg", ".jpeg"]),
    // A phone screenshot of a bank transfer is commonly webp. The upload route
    // already accepts it; this allowlist is the layer that actually stores, so
    // the two must agree or a valid proof is accepted and then refused deeper.
    "image/webp": Object.freeze([".webp"]),
    "application/pdf": Object.freeze([".pdf"]),
  });

const FILENAME = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,199}$/;

/**
 * Filenames are attacker controlled. Path separators, traversal, control characters,
 * and a declared type that disagrees with the extension are all refused.
 */
function isAcceptableFilename(value: unknown, contentType: EarlyAccessProofContentType): value is string {
  if (!isBoundedText(value, 200) || !FILENAME.test(value)) return false;
  if (value.includes("..") || value.includes("/") || value.includes("\\")) return false;
  const lowered = value.toLowerCase();
  return FILENAME_EXTENSIONS[contentType].some((extension) => lowered.endsWith(extension));
}

export function earlyAccessProofObjectKey(orderId: string, proofId: string): string {
  return `${EARLY_ACCESS_PROOF_KEY_PREFIX}${orderId}/${proofId}`;
}

/**
 * Describe one proof submission.
 *
 * The order snapshot is supplied so the state transition is computed against real
 * order state rather than asserted by the customer. The result is an intent plus a
 * single transition to `payment_under_review`, and nothing further.
 */
export function describeProofSubmission(input: unknown): PaymentProofResult {
  if (carriesAnyKey(input, PROOF_BYTE_BEARING_KEYS)) return refused("proof_bytes_supplied");

  const record = readPlainRecord(input, PROOF_REQUIRED_KEYS);
  if (!record) return refused("input_invalid");

  const order = readEarlyAccessOrder(record.order);
  if (!order) return refused("order_invalid");
  if (!isOneOf(order.status, PROOF_ACCEPTING_STATUSES)) {
    return refused("order_not_awaiting_payment");
  }

  if (!isSafeIdentifier(record.proofId)) return refused("proof_id_invalid");
  if (!isOneOf(record.contentType, EARLY_ACCESS_PROOF_CONTENT_TYPES)) {
    return refused("content_type_unsupported");
  }
  if (!isAcceptableFilename(record.filename, record.contentType)) {
    return refused("filename_invalid");
  }
  if (!isBoundedInteger(record.byteSize, 1, EARLY_ACCESS_PROOF_MAX_BYTES)) {
    return refused("byte_size_invalid");
  }
  if (!isCanonicalTimestamp(record.submittedAt)) return refused("submitted_at_invalid");
  // A proof cannot predate the order it claims to pay for.
  if (!isNotBefore(record.submittedAt, order.createdAt)) return refused("submitted_at_invalid");
  if (!isEarlyAccessPaymentOptionCode(record.method)) return refused("method_unsupported");

  const storageIntent: PaymentProofStorageIntent = Object.freeze({
    action: "store_private_proof_object" as const,
    objectKey: earlyAccessProofObjectKey(order.orderId, record.proofId),
    contentType: record.contentType,
    byteSize: record.byteSize,
    bytesReceived: false as const,
    performed: false as const,
  });

  return accepted(
    Object.freeze({
      proofId: record.proofId,
      orderId: order.orderId,
      filename: record.filename,
      contentType: record.contentType,
      byteSize: record.byteSize,
      submittedAt: record.submittedAt,
      method: record.method,
      transition: Object.freeze({
        from: order.status,
        to: "payment_under_review" as const,
      }),
      orderStatus: "payment_under_review" as const,
      paid: false as const,
      verified: false as const,
      storageIntent,
    }),
  );
}

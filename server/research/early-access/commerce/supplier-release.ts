/**
 * Early Access supplier release packet. Server only, pure, side effect free.
 *
 * A supplier needs to ship a box. That is the whole of its need, so that is the whole
 * of what it receives: the supplier's own SKU, how many, where it goes, and one
 * reference to reconcile against. The packet is built by explicit construction from an
 * allowlist, never by removing fields from a richer record, so a field added upstream
 * later cannot leak into a supplier payload by default.
 *
 * Deliberately excluded, and asserted excluded by test: payment method, payment proof,
 * price, cost, margin, the member's identity beyond the shipping need, affiliate and
 * referral attribution, and anything belonging to another supplier or another order.
 *
 * A packet can be built only from a verified payment. There is no path from an unpaid
 * or under review order to a supplier release.
 */

import {
  accepted,
  isBoundedInteger,
  isBoundedText,
  isSafeIdentifier,
  readPlainRecord,
  refused,
  type CommerceResult,
} from "./input-guards";
import {
  readEarlyAccessVerifiedOrder,
  supplierReleaseIntentIdFor,
} from "./payment-verification";

export type SupplierReleaseFailureCode =
  | "verified_order_invalid"
  | "release_invalid"
  | "supplier_invalid"
  | "recipient_invalid";

/** The minimum a carrier needs to deliver, and no more. */
export type SupplierShipmentRecipient = Readonly<{
  recipientName: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}>;

export type EarlyAccessSupplierReleasePacket = Readonly<{
  releaseId: string;
  orderReference: string;
  supplierId: string;
  supplierSku: string;
  quantity: number;
  recipient: SupplierShipmentRecipient;
}>;

export type SupplierReleaseResult = CommerceResult<
  EarlyAccessSupplierReleasePacket,
  SupplierReleaseFailureCode
>;

/** The exact public shape. The test asserts the packet has these keys and no others. */
export const SUPPLIER_RELEASE_PACKET_KEYS = [
  "releaseId",
  "orderReference",
  "supplierId",
  "supplierSku",
  "quantity",
  "recipient",
] as const;

export const SUPPLIER_RECIPIENT_KEYS = [
  "recipientName",
  "line1",
  "line2",
  "city",
  "region",
  "postalCode",
  "country",
] as const;

const RELEASE_KEYS = ["supplierId", "supplierSku", "recipient"] as const;

const POSTAL_CODE = /^[A-Za-z0-9][A-Za-z0-9 -]{1,15}$/;
const COUNTRY = /^[A-Z]{2}$/;

function readRecipient(value: unknown): SupplierShipmentRecipient | null {
  const record = readPlainRecord(value, SUPPLIER_RECIPIENT_KEYS);
  if (!record) return null;
  if (!isBoundedText(record.recipientName, 120)) return null;
  if (!isBoundedText(record.line1, 120)) return null;
  if (record.line2 !== null && !isBoundedText(record.line2, 120)) return null;
  if (!isBoundedText(record.city, 64)) return null;
  if (!isBoundedText(record.region, 64)) return null;
  if (typeof record.postalCode !== "string" || !POSTAL_CODE.test(record.postalCode)) return null;
  if (typeof record.country !== "string" || !COUNTRY.test(record.country)) return null;

  return Object.freeze({
    recipientName: record.recipientName,
    line1: record.line1,
    line2: record.line2 === null ? null : record.line2,
    city: record.city,
    region: record.region,
    postalCode: record.postalCode,
    country: record.country,
  });
}

/**
 * Build the supplier packet for a verified order.
 *
 * The supplier's own SKU and the shipping recipient are injected because neither
 * belongs to the order record: the supplier mapping is a supplier side concern, and
 * the address is held under its own consent and retention rules. Passing them in
 * keeps this module free of any store, and keeps the projection explicit.
 */
export function buildSupplierReleasePacket(
  verifiedOrder: unknown,
  release: unknown,
): SupplierReleaseResult {
  // `readEarlyAccessVerifiedOrder` refuses any status other than payment_verified, so
  // an unpaid order cannot reach a supplier through this function.
  const verified = readEarlyAccessVerifiedOrder(verifiedOrder);
  if (!verified) return refused("verified_order_invalid");

  const record = readPlainRecord(release, RELEASE_KEYS);
  if (!record) return refused("release_invalid");
  if (!isSafeIdentifier(record.supplierId) || !isSafeIdentifier(record.supplierSku)) {
    return refused("supplier_invalid");
  }
  const recipient = readRecipient(record.recipient);
  if (!recipient) return refused("recipient_invalid");
  if (!isBoundedInteger(verified.quantity, 1, 3)) return refused("verified_order_invalid");

  return accepted(
    Object.freeze({
      // Same key the verification handed out, so a store keyed on it holds one release.
      releaseId: supplierReleaseIntentIdFor(verified.orderId),
      orderReference: verified.orderId,
      supplierId: record.supplierId,
      supplierSku: record.supplierSku,
      quantity: verified.quantity,
      recipient,
    }),
  );
}

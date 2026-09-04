import { isCustomerAccountOrderReference } from "@shared/research/customer-account/contract";

/**
 * Account-portal routes that are implemented by Lane 04 but composed into the
 * protected application manifest by the Lead. Keeping them in one leaf module
 * lets the protected router import an exact, reviewable set of additions.
 */
export const ACCOUNT_PORTAL_EXTENSION_ROUTES = {
  orderDetail: "/research/account/orders/:reference",
  profile: "/research/account/profile",
  security: "/research/account/security",
  interests: "/research/account/interests",
} as const;

const ACCOUNT_ORDERS_PATH = "/research/account/orders";

/** Build one bounded path segment without treating a reference prefix as a type. */
export function accountOrderDetailPath(reference: string): string {
  if (!isCustomerAccountOrderReference(reference)) {
    return ACCOUNT_ORDERS_PATH;
  }
  return `${ACCOUNT_ORDERS_PATH}/${reference}`;
}

/** Decode a route segment defensively before exact member-scoped matching. */
export function decodeAccountOrderReference(segment: string): string {
  if (segment.length === 0) return "";
  try {
    const decoded = decodeURIComponent(segment);
    return isCustomerAccountOrderReference(decoded) ? decoded : "";
  } catch {
    return "";
  }
}

/**
 * Recognize only the one-segment detail family for protected-layout routing.
 * The check happens before decoding so an encoded reference remains one URL
 * segment, while a genuinely nested path is refused.
 */
export function isAccountOrderDetailPath(path: string): boolean {
  const rawPath = path.split(/[?#]/, 1)[0].replace(/\/+$/, "");
  const prefix = `${ACCOUNT_ORDERS_PATH}/`;
  if (!rawPath.startsWith(prefix)) return false;
  const segment = rawPath.slice(prefix.length);
  return isCustomerAccountOrderReference(segment);
}

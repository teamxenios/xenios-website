import { ACCOUNT_PORTAL_ROUTES } from "../lib/routes";
import { accountOrderDetailPath } from "./routes";

/** Map untrusted wire data to implemented private routes, never raw hrefs. */
export function accountNextActionLink(target: unknown): Readonly<{ href: string; label: string }> {
  if (target !== null && typeof target === "object" && !Array.isArray(target)) {
    const candidate = target as Record<string, unknown>;
    switch (candidate.kind) {
      case "care":
        return { href: ACCOUNT_PORTAL_ROUTES.care, label: "Review Care status" };
      case "membership":
        return { href: ACCOUNT_PORTAL_ROUTES.subscription, label: "Review billing details" };
      case "orders":
        return { href: ACCOUNT_PORTAL_ROUTES.orders, label: "Review commerce history" };
      case "order": {
        const href = typeof candidate.reference === "string"
          ? accountOrderDetailPath(candidate.reference)
          : ACCOUNT_PORTAL_ROUTES.orders;
        return { href, label: href === ACCOUNT_PORTAL_ROUTES.orders ? "Review commerce history" : "Review order details" };
      }
    }
  }
  return { href: ACCOUNT_PORTAL_ROUTES.support, label: "Review with support" };
}

import type {
  EarlyAccessCartCapability,
  EarlyAccessCartCheckout,
  EarlyAccessCartCheckoutRequest,
  EarlyAccessCartCheckoutResult,
  EarlyAccessCartQuoteRequest,
  EarlyAccessCartQuoteResult,
  EarlyAccessCartStatus,
} from "@shared/research/early-access-cart";

export const EARLY_ACCESS_CART_ROOT = "/api/research/early-access/cart";
export const EARLY_ACCESS_CART_CAPABILITY_PATH = `${EARLY_ACCESS_CART_ROOT}/capability`;
export const EARLY_ACCESS_CART_QUOTE_PATH = `${EARLY_ACCESS_CART_ROOT}/quote`;
export const EARLY_ACCESS_CART_CHECKOUT_PATH = `${EARLY_ACCESS_CART_ROOT}/checkout`;
export const EARLY_ACCESS_CART_READ_PATH = (checkoutNumber: string) =>
  `${EARLY_ACCESS_CART_ROOT}/${encodeURIComponent(checkoutNumber)}`;
export const EARLY_ACCESS_CART_STATUS_PATH = (checkoutNumber: string) =>
  `${EARLY_ACCESS_CART_ROOT}/${encodeURIComponent(checkoutNumber)}/status`;

async function jsonObject(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await response.json();
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function requestJson(
  path: string,
  init: RequestInit = {},
): Promise<{ response: Response; body: Record<string, unknown> | null }> {
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(init.headers ?? {}),
    },
    ...init,
  });
  return { response, body: await jsonObject(response) };
}

export async function loadEarlyAccessCartCapability(): Promise<
  | { kind: "enabled"; capability: EarlyAccessCartCapability }
  | { kind: "disabled" }
  | { kind: "locked" }
  | { kind: "error" }
> {
  try {
    const { response, body } = await requestJson(EARLY_ACCESS_CART_CAPABILITY_PATH);
    if (response.status === 401 || response.status === 403) return { kind: "locked" };
    // The route is unmounted while the flag is false. 404 is the disabled state,
    // not an application error and not a reason to show the cart UI.
    if (response.status === 404) return { kind: "disabled" };
    if (!response.ok || body?.ok !== true || body.capability === null || typeof body.capability !== "object") {
      return { kind: "error" };
    }
    return {
      kind: "enabled",
      capability: body.capability as EarlyAccessCartCapability,
    };
  } catch {
    return { kind: "error" };
  }
}

export async function quoteEarlyAccessCartRequest(
  input: EarlyAccessCartQuoteRequest,
): Promise<EarlyAccessCartQuoteResult> {
  try {
    const { response, body } = await requestJson(EARLY_ACCESS_CART_QUOTE_PATH, {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (body !== null && typeof body.ok === "boolean") {
      return body as unknown as EarlyAccessCartQuoteResult;
    }
    return { ok: false, code: response.status === 503 ? "UNAVAILABLE" : "CART_INVALID" };
  } catch {
    return { ok: false, code: "UNAVAILABLE" };
  }
}

export async function confirmEarlyAccessCart(
  input: EarlyAccessCartCheckoutRequest,
): Promise<EarlyAccessCartCheckoutResult | { ok: false; code: "CONNECTION_FAILED" }> {
  try {
    const { response, body } = await requestJson(EARLY_ACCESS_CART_CHECKOUT_PATH, {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (body !== null && typeof body.ok === "boolean") {
      return body as unknown as EarlyAccessCartCheckoutResult;
    }
    return { ok: false, code: response.status === 503 ? "UNAVAILABLE" : "CART_INVALID" };
  } catch {
    return { ok: false, code: "CONNECTION_FAILED" };
  }
}

export async function loadEarlyAccessCartCheckout(
  checkoutNumber: string,
): Promise<
  | { kind: "ok"; checkout: EarlyAccessCartCheckout }
  | { kind: "not_found" }
  | { kind: "locked" }
  | { kind: "error" }
> {
  try {
    const { response, body } = await requestJson(EARLY_ACCESS_CART_READ_PATH(checkoutNumber));
    if (response.status === 401 || response.status === 403) return { kind: "locked" };
    if (response.status === 404) return { kind: "not_found" };
    if (!response.ok || body?.ok !== true || typeof body.checkout !== "object" || body.checkout === null) {
      return { kind: "error" };
    }
    return { kind: "ok", checkout: body.checkout as EarlyAccessCartCheckout };
  } catch {
    return { kind: "error" };
  }
}

export async function loadEarlyAccessCartStatus(
  checkoutNumber: string,
): Promise<
  | { kind: "ok"; status: EarlyAccessCartStatus }
  | { kind: "not_found" }
  | { kind: "locked" }
  | { kind: "error" }
> {
  try {
    const { response, body } = await requestJson(EARLY_ACCESS_CART_STATUS_PATH(checkoutNumber));
    if (response.status === 401 || response.status === 403) return { kind: "locked" };
    if (response.status === 404) return { kind: "not_found" };
    if (!response.ok || body?.ok !== true || typeof body.status !== "object" || body.status === null) {
      return { kind: "error" };
    }
    return { kind: "ok", status: body.status as EarlyAccessCartStatus };
  } catch {
    return { kind: "error" };
  }
}

export const EARLY_ACCESS_ORDERS_PATH = "/api/research/early-access/orders";

export type EarlyAccessShipTo = Readonly<{
  recipientName: string; line1: string; line2: string | null; city: string;
  region: string; postalCode: string; country: string;
}>;

/**
 * How operations reaches this customer about THIS order. The initial-code
 * pilot has no roster record behind a session-scoped identity, so the order
 * itself must carry a way to reach the buyer. Contact is DATA, never
 * authorization: the server resolves identity from the session credential
 * alone, and nothing typed here changes who the customer is.
 */
export type EarlyAccessContact = Readonly<{
  email: string;
  phone: string;
}>;

export type EarlyAccessOrderView = Readonly<{
  orderNumber: string; placedAt: string; paymentState: string;
  unit: Readonly<{ sku: string; quantity: number }>;
  money: Readonly<{ currency: string; unitPriceCents: number; subtotalCents: number;
    discountCents: number; discountLabel: string | null; payableTotalCents: number }>;
  invoice: Readonly<{ invoiceNumber: string; paymentReference: string; issuedAt: string }>;
  /** Echoed only on the purchaser's own order view; null on rows placed before contact existed. */
  contact: EarlyAccessContact | null;
  shipTo: EarlyAccessShipTo;
}>;

export type EarlyAccessInvoiceView = Readonly<{
  invoiceNumber: string; orderNumber: string; issuedAt: string; status: string;
  lines: readonly unknown[]; subtotalCents: number; discountCents: number;
  discountLabel: string | null; payableTotalCents: number; currency: string;
  paymentReference: string; instructions: unknown;
}>;

export type EarlyAccessOrderStatusView = Readonly<{
  order: EarlyAccessOrderView; payment: Readonly<{ state: string; paid: boolean }>;
  receipt: unknown; fulfilment: Readonly<{ released: boolean; tracking: readonly unknown[]; shippedAt: string | null }>;
}>;

export type PlaceEarlyAccessOrderInput = Readonly<{
  idempotencyKey: string; productId: string; variantId: string; quantity: number;
  expectedUnitPriceCents: number; expectedCurrency: string;
  contact: EarlyAccessContact; shipTo: EarlyAccessShipTo;
}>;

export type CheckoutResult<T> =
  | Readonly<{ ok: true; value: T; replayed?: boolean }>
  | Readonly<{ ok: false; status: number; code: string; detail: Record<string, unknown> | null }>;

async function json(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await response.json();
    return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
  } catch { return null; }
}

function refusal(response: Response, body: Record<string, unknown> | null): CheckoutResult<never> {
  return { ok: false, status: response.status, code: typeof body?.code === "string" ? body.code : "UNAVAILABLE", detail: body };
}

export async function placeEarlyAccessOrder(
  input: PlaceEarlyAccessOrderInput,
  request: typeof fetch = fetch,
): Promise<CheckoutResult<EarlyAccessOrderView>> {
  try {
    const response = await request(EARLY_ACCESS_ORDERS_PATH, {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(input),
    });
    const body = await json(response);
    if (!response.ok || body?.ok !== true || typeof body.order !== "object" || body.order === null) {
      return refusal(response, body);
    }
    return { ok: true, value: body.order as EarlyAccessOrderView, replayed: body.replayed === true };
  } catch { return { ok: false, status: 0, code: "CONNECTION_FAILED", detail: null }; }
}

export async function loadEarlyAccessInvoice(
  orderNumber: string, request: typeof fetch = fetch,
): Promise<CheckoutResult<EarlyAccessInvoiceView>> {
  try {
    const response = await request(`${EARLY_ACCESS_ORDERS_PATH}/${encodeURIComponent(orderNumber)}/invoice`, {
      credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" },
    });
    const body = await json(response);
    if (!response.ok || body?.ok !== true || typeof body.invoice !== "object" || body.invoice === null) return refusal(response, body);
    return { ok: true, value: body.invoice as EarlyAccessInvoiceView };
  } catch { return { ok: false, status: 0, code: "CONNECTION_FAILED", detail: null }; }
}

export async function loadEarlyAccessOrderStatus(
  orderNumber: string, request: typeof fetch = fetch,
): Promise<CheckoutResult<EarlyAccessOrderStatusView>> {
  try {
    const response = await request(`${EARLY_ACCESS_ORDERS_PATH}/${encodeURIComponent(orderNumber)}`, {
      credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" },
    });
    const body = await json(response);
    if (!response.ok || body?.ok !== true || typeof body.order !== "object" || body.order === null) return refusal(response, body);
    return { ok: true, value: body as unknown as EarlyAccessOrderStatusView };
  } catch { return { ok: false, status: 0, code: "CONNECTION_FAILED", detail: null }; }
}

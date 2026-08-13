import { assertEmailPayloadSafe } from "../membership-activation/emails";

export const BUYER_COMMERCE_EMAIL_EVENTS = [
  "buyer_request_received",
  "buyer_request_operations",
] as const;
export type BuyerCommerceEmailEvent = (typeof BUYER_COMMERCE_EMAIL_EVENTS)[number];

const ALLOWED_KEYS: Readonly<Record<BuyerCommerceEmailEvent, readonly string[]>> = Object.freeze({
  buyer_request_received: ["customerName", "requestRef", "lines"],
  buyer_request_operations: ["requestRef", "lineCount", "orderRequestCount", "carePathwayCount"],
});

export function safeBuyerCommercePayload(
  event: BuyerCommerceEmailEvent,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const key of ALLOWED_KEYS[event]) {
    if (payload[key] !== undefined) safe[key] = payload[key];
  }
  assertEmailPayloadSafe(safe);
  return safe;
}

function text(payload: Record<string, unknown>, key: string): string {
  return typeof payload[key] === "string" ? payload[key] : "";
}

function lines(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((line) => {
      const item = line as { name?: unknown; quantity?: unknown };
      if (typeof item.name !== "string" || typeof item.quantity !== "number") return "";
      return `- ${item.quantity} x ${item.name}`;
    })
    .filter(Boolean)
    .join("\n");
}

export function renderBuyerCommerceOutboxEmail(
  templateKey: string,
  payload: Record<string, unknown>,
): { subject: string; text: string } | null {
  if (!(BUYER_COMMERCE_EMAIL_EVENTS as readonly string[]).includes(templateKey)) return null;
  assertEmailPayloadSafe(payload);
  const requestRef = text(payload, "requestRef");
  const signoff = "Xenios Research\nresearch@xeniostechnology.com";

  if (templateKey === "buyer_request_received") {
    const requested = lines(payload.lines);
    return {
      subject: `Buyer request ${requestRef} received`,
      text: [
        `Hello ${text(payload, "customerName") || "there"},`,
        `We received buyer request ${requestRef}.`,
        requested ? `Requested items:\n${requested}` : "",
        "This is a request acknowledgement, not an order confirmation, price promise, payment request, or fulfillment commitment.",
        "Xenios Research will confirm exact-variant availability, final pricing, payment, and fulfillment before release.",
        "Keep this reference. It can be used to connect this request to an account you claim later.",
        signoff,
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
  }

  return {
    subject: `Buyer request ${requestRef} received`,
    text: [
      `Buyer request ${requestRef} is durable and ready in the existing order/request operations queue.`,
      `Lines: ${String(payload.lineCount ?? 0)}`,
      `Order-request lines: ${String(payload.orderRequestCount ?? 0)}`,
      `Care pathway: ${String(payload.carePathwayCount ?? 0)}`,
      "Open the authenticated admin surface for customer, address, and line detail. This email intentionally carries no customer contact or shipping data.",
      signoff,
    ].join("\n\n"),
  };
}

import type { BuyerOrderRequestRecord } from "@shared/research/buyer-commerce";
import { enqueueNotification } from "../outbox";
import { safeBuyerCommercePayload } from "./communications";
import type { BuyerNotificationPort } from "./service";

export const BUYER_OPERATIONS_EMAIL_DEFAULT = "research@xeniostechnology.com";

/** Writes both messages into the repository's one durable notification outbox. */
export class BuyerCommerceOutboxAdapter implements BuyerNotificationPort {
  async notify(record: BuyerOrderRequestRecord): Promise<Readonly<{
    customerQueued: boolean;
    operationsQueued: boolean;
  }>> {
    const manualReviewCount = record.resolvedLines.filter(
      (line) => line.disposition === "manual_early_access_request",
    ).length;
    const carePathwayCount = record.resolvedLines.filter(
      (line) => line.disposition === "care_pathway",
    ).length;
    const [customerQueued, operationsQueued] = await Promise.all([
      enqueueNotification({
        eventKey: `buyer:request-received:${record.requestRef}`,
        eventType: "buyer_request_received",
        templateKey: "buyer_request_received",
        recipient: record.payload.identity.email,
        payload: safeBuyerCommercePayload("buyer_request_received", {
          customerName: record.payload.identity.firstName,
          requestRef: record.requestRef,
          lines: record.resolvedLines.map((line) => ({
            name: [line.productName, line.strengthLabel].filter(Boolean).join(" "),
            quantity: line.requestedQuantity,
          })),
        }),
      }),
      enqueueNotification({
        eventKey: `buyer:request-operations:${record.requestRef}`,
        eventType: "buyer_request_operations",
        templateKey: "buyer_request_operations",
        recipient:
          process.env.RESEARCH_BUYER_OPERATIONS_EMAIL?.trim() ||
          BUYER_OPERATIONS_EMAIL_DEFAULT,
        payload: safeBuyerCommercePayload("buyer_request_operations", {
          requestRef: record.requestRef,
          lineCount: record.resolvedLines.length,
          manualReviewCount,
          carePathwayCount,
        }),
      }),
    ]);
    return Object.freeze({ customerQueued, operationsQueued });
  }
}

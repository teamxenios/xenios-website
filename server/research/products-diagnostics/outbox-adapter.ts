import { enqueueNotification } from "../outbox";
import {
  productDiagnosticTemplateKey,
  safeProductDiagnosticPayload,
  type ProductDiagnosticEmailEvent,
} from "./communications";

/**
 * Canonical durable adapter for Website 3 communications. It writes to the
 * shared Research outbox and stores only the event-specific allowlist.
 */
export async function enqueueProductDiagnosticEmail(input: {
  eventKey: string;
  eventType: ProductDiagnosticEmailEvent;
  recipient: string;
  payload: Record<string, unknown>;
}): Promise<boolean> {
  return enqueueNotification({
    eventKey: input.eventKey,
    eventType: input.eventType,
    templateKey: productDiagnosticTemplateKey(input.eventType),
    recipient: input.recipient,
    payload: safeProductDiagnosticPayload(input.eventType, input.payload),
  });
}

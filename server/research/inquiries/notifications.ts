import { adminRecipients } from "../../services/email-config";
import { enqueueNotification } from "../outbox";
import { parsePublicInquiryPayload } from "./classifier";
import {
  PUBLIC_INQUIRY_NOTIFICATION_TEMPLATES,
} from "./notification-templates";
import {
  researchInquiryReference,
  type DurableInquiryRecord,
} from "./service";

export type PublicInquiryNotificationResult = Readonly<{
  customer: "queued" | "not_queued";
  operator: "queued" | "not_queued";
}>;

function firstName(fullName: unknown): string {
  return typeof fullName === "string"
    ? fullName.trim().split(/\s+/u)[0]?.slice(0, 80) || "there"
    : "there";
}

export async function enqueuePublicInquiryNotifications(
  record: DurableInquiryRecord,
): Promise<PublicInquiryNotificationResult> {
  const detail = parsePublicInquiryPayload(record.why_interested);
  if (!detail || typeof record.email !== "string" || !record.email) {
    return { customer: "not_queued", operator: "not_queued" };
  }

  const reference = researchInquiryReference(record.id);
  const root = `public-inquiry:${record.id}`;
  const customerPayload = {
    reference,
    inquiryType: detail.inquiryType,
    firstName: firstName(record.name),
  };
  const operatorPayload = {
    reference,
    inquiryType: detail.inquiryType,
    fullName: record.name,
    email: record.email,
    phone: record.phone,
    organizationName: detail.organization.name,
    role: detail.contactRole,
    region: detail.organization.region,
    message: detail.message,
  };

  const [customer, ...operators] = await Promise.all([
    enqueueNotification({
      eventKey: `${root}:customer`,
      eventType: "public_inquiry_received",
      templateKey: PUBLIC_INQUIRY_NOTIFICATION_TEMPLATES.customer,
      recipient: record.email,
      payload: customerPayload,
    }),
    ...adminRecipients().map((recipient) => enqueueNotification({
      eventKey: `${root}:operator:${recipient}`,
      eventType: "public_inquiry_received",
      templateKey: PUBLIC_INQUIRY_NOTIFICATION_TEMPLATES.operator,
      recipient,
      payload: operatorPayload,
    })),
  ]);

  return {
    customer: customer ? "queued" : "not_queued",
    operator: operators.length > 0 && operators.every(Boolean)
      ? "queued"
      : "not_queued",
  };
}

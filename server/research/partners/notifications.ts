import { adminRecipients } from "../../services/email-config";
import { enqueueNotification } from "../outbox";
import { PARTNER_NOTIFICATION_TEMPLATES } from "./notification-templates";

type ApplicationNotice = { partnerId: string; contactEmail: string; legalName: string; role: string; state: string };
type LifecycleNotice = { partnerId: string; contactEmail: string; action: string; state: string; updatedAt: string };

async function enqueuePair(eventRoot: string, customer: { recipient: string; templateKey: string }, adminTemplate: string, payload: Record<string, unknown>) {
  await Promise.all([
    enqueueNotification({ eventKey: `${eventRoot}:customer`, eventType: eventRoot, templateKey: customer.templateKey, recipient: customer.recipient, payload }),
    ...adminRecipients().map((recipient) => enqueueNotification({ eventKey: `${eventRoot}:admin:${recipient}`, eventType: eventRoot, templateKey: adminTemplate, recipient, payload })),
  ]);
}

export async function enqueuePartnerApplicationNotifications(input: ApplicationNotice) {
  await enqueuePair(`partner:${input.partnerId}:application`, { recipient: input.contactEmail, templateKey: PARTNER_NOTIFICATION_TEMPLATES.customerApplication }, PARTNER_NOTIFICATION_TEMPLATES.adminApplication, input);
}

export async function enqueuePartnerLifecycleNotifications(input: LifecycleNotice) {
  await enqueuePair(`partner:${input.partnerId}:lifecycle:${input.updatedAt}:${input.state}`, { recipient: input.contactEmail, templateKey: PARTNER_NOTIFICATION_TEMPLATES.customerLifecycle }, PARTNER_NOTIFICATION_TEMPLATES.adminLifecycle, input);
}

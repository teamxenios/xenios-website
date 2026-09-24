import type { ContactMessage } from "@shared/schema";
import { sendContactMessage, sendContactAutoReply } from "./email";

export type ContactDeliveryPorts = {
  sendMessage: (message: ContactMessage) => Promise<void>;
  sendAutoReply: (message: ContactMessage) => Promise<void>;
};

// The team email is the existing contact record. A courtesy confirmation is
// independent: its failure must not invite a duplicate of an accepted inquiry.
export async function deliverContact(message: ContactMessage, ports: ContactDeliveryPorts = {
  sendMessage: sendContactMessage,
  sendAutoReply: sendContactAutoReply,
}): Promise<{ accepted: false } | { accepted: true; autoReplySent: boolean }> {
  try {
    await ports.sendMessage(message);
  } catch {
    console.error("[contact] team email acceptance unavailable");
    return { accepted: false };
  }
  try {
    await ports.sendAutoReply(message);
    return { accepted: true, autoReplySent: true };
  } catch {
    console.error("[contact] courtesy confirmation acceptance unavailable");
    return { accepted: true, autoReplySent: false };
  }
}

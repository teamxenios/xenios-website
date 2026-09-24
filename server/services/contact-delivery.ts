import type { ContactMessage } from "@shared/schema";
import { sendContactMessage, sendContactAutoReply } from "./email";

export type ContactDeliveryPorts = {
  sendMessage: (message: ContactMessage) => Promise<void>;
  sendAutoReply: (message: ContactMessage) => Promise<void>;
};

// A timeout cannot prove rejection: the provider may already have accepted.
// Email sends use provider idempotency keys so an unchanged retry is safe
// within the provider's 24-hour retention window.
async function bounded(operation: Promise<void>, milliseconds: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Contact acceptance timed out")), milliseconds);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

// The team email is the existing contact record. A courtesy confirmation is
// independent: its failure must not invite a duplicate of an accepted inquiry.
export async function deliverContact(message: ContactMessage, ports: ContactDeliveryPorts = {
  sendMessage: sendContactMessage,
  sendAutoReply: sendContactAutoReply,
}): Promise<{ accepted: false } | { accepted: true; autoReplySent: boolean }> {
  try {
    await bounded(ports.sendMessage(message), 10_000);
  } catch {
    console.error("[contact] team email acceptance unavailable");
    return { accepted: false };
  }
  try {
    await bounded(ports.sendAutoReply(message), 2_000);
    return { accepted: true, autoReplySent: true };
  } catch {
    console.error("[contact] courtesy confirmation acceptance unavailable");
    return { accepted: true, autoReplySent: false };
  }
}

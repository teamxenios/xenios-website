import type { Env } from "./notification-reconciler";

export const REQUEST_INTENT_NOTIFICATION_TEMPLATE = "request_intent_pending_staff_v1";
export const REQUEST_INTENT_NOTIFICATION_SEND = "RESEARCH_REQUEST_INTENT_NOTIFICATIONS_SEND_ENABLED";
export const REQUEST_INTENT_NOTIFICATION_RECIPIENTS = "RESEARCH_REQUEST_INTENT_NOTIFICATION_RECIPIENTS";

/** Explicit feature allowlist, never adminRecipients()'s implicit fallback. */
export function notificationRecipients(env: Env): string[] {
  const raw = env[REQUEST_INTENT_NOTIFICATION_RECIPIENTS];
  if (!raw || raw.length > 1600 || /[\r\n]/.test(raw)) return [];
  const values = raw.split(",").map(value => value.trim().toLowerCase());
  if (values.length > 5 || values.some(value => !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(value))
    || new Set(values).size !== values.length) return [];
  return values.sort();
}
export function notificationSendEnabled(env: Env): boolean {
  return env[REQUEST_INTENT_NOTIFICATION_SEND] === "true";
}
export function renderRequestIntentNotification(
  template: string, payload: unknown, recipient: unknown, env: Env,
): { subject: string; text: string } | null {
  if (template !== REQUEST_INTENT_NOTIFICATION_TEMPLATE) return null;
  if (typeof recipient !== "string" || !notificationRecipients(env).includes(recipient)
    || typeof payload !== "object" || payload === null || Array.isArray(payload)
    || Object.keys(payload).length !== 1 || !Object.hasOwn(payload, "publicReference")
    || typeof (payload as any).publicReference !== "string"
    || !/^XRI-[A-F0-9]{32}$/.test((payload as any).publicReference)) {
    throw new Error("request_intent_notification_invalid");
  }
  let origin: URL;
  try { origin = new URL(env.SITE_URL ?? ""); } catch { throw new Error("request_intent_notification_origin_invalid"); }
  if (origin.protocol !== "https:" || origin.username || origin.password
    || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("request_intent_notification_origin_invalid");
  }
  return {
    subject: "Quick Order request pending review",
    text: "A Quick Order request is pending review.\nReference: " + (payload as any).publicReference
      + "\nSign in to the request queue: " + new URL("/care/request-intents", origin).toString()
      + "\nThis is a request for review, not a payment, prescription, or fulfillment confirmation.",
  };
}

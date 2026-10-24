import { notificationRecipients } from "./notification-communications";

export type Env = Readonly<Record<string, string | undefined>>;
export const REQUEST_INTENT_NOTIFICATION_ENQUEUE = "RESEARCH_REQUEST_INTENT_NOTIFICATIONS_ENQUEUE_ENABLED";
export type NotificationRpc = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
export type ProjectionResult = Readonly<{ state: "disabled" | "blocked" | "ok"; selected: number; inserted: number }>;
/** No request or recipient data is returned or logged. SQL owns eligibility and the unique outbox insertion. */
export async function reconcileRequestIntentNotifications(
  env: Env, client: () => NotificationRpc,
): Promise<ProjectionResult> {
  if (env[REQUEST_INTENT_NOTIFICATION_ENQUEUE] !== "true") return { state: "disabled", selected: 0, inserted: 0 };
  const recipients = notificationRecipients(env);
  if (!recipients.length) return { state: "blocked", selected: 0, inserted: 0 };
  try {
    const { data, error } = await client().rpc("request_intent_reconcile_notifications", { p_recipients: recipients, p_limit: 10 });
    const row = data as Record<string, unknown> | null;
    if (error || !row || Array.isArray(row) || Object.keys(row).length !== 2
      || !Number.isSafeInteger(row.selected) || !Number.isSafeInteger(row.inserted)
      || (row.selected as number) < 0 || (row.selected as number) > 10
      || (row.inserted as number) < 0 || (row.inserted as number) > (row.selected as number)) {
      return { state: "blocked", selected: 0, inserted: 0 };
    }
    return { state: "ok", selected: row.selected as number, inserted: row.inserted as number };
  } catch { return { state: "blocked", selected: 0, inserted: 0 }; }
}

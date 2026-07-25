import { createHash } from "node:crypto";

export type NotificationChannel = "in_app" | "email" | "sms" | "telegram";
export type NotificationSensitivity = "public" | "operational" | "customer_sensitive";
export type NotificationStatus =
  | "pending"
  | "processing"
  | "sent"
  | "failed_retryable"
  | "failed_permanent"
  | "suppressed";

export interface NotificationAudience {
  kind: "member" | "affiliate" | "professional" | "operator";
  /** Opaque application id. Providers resolve destinations outside the outbox. */
  id: string;
}

export interface NotificationMessage {
  title: string;
  body: string;
  actionUrl?: string;
}

export interface OutboxNotification {
  id: string;
  audience: NotificationAudience;
  channel: NotificationChannel;
  topic: string;
  dedupeKey: string;
  sensitivity: NotificationSensitivity;
  message: NotificationMessage;
  status: NotificationStatus;
  attemptCount: number;
  nextAttemptAt: string;
  leaseUntil: string | null;
  providerReference: string | null;
  failureCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ProviderResult =
  | { ok: true; providerReference: string }
  | { ok: false; retryable: boolean; code: string };

export interface NotificationProvider {
  send(notification: Readonly<OutboxNotification>): Promise<ProviderResult>;
}

export interface OutboxRepository {
  get(id: string): OutboxNotification | null;
  findUnique(audience: NotificationAudience, channel: NotificationChannel, dedupeKey: string): OutboxNotification | null;
  insertIfAbsent(notification: OutboxNotification): OutboxNotification;
  save(notification: OutboxNotification): void;
  list(): OutboxNotification[];
}

const copy = <T>(value: T): T => structuredClone(value);

export class InMemoryOutboxRepository implements OutboxRepository {
  private readonly records = new Map<string, OutboxNotification>();

  get(id: string): OutboxNotification | null {
    const value = this.records.get(id);
    return value ? copy(value) : null;
  }

  findUnique(audience: NotificationAudience, channel: NotificationChannel, dedupeKey: string): OutboxNotification | null {
    const value = Array.from(this.records.values()).find(
      (record) =>
        record.audience.kind === audience.kind &&
        record.audience.id === audience.id &&
        record.channel === channel &&
        record.dedupeKey === dedupeKey,
    );
    return value ? copy(value) : null;
  }

  insertIfAbsent(notification: OutboxNotification): OutboxNotification {
    const existing = this.findUnique(notification.audience, notification.channel, notification.dedupeKey);
    if (existing) return existing;
    this.records.set(notification.id, copy(notification));
    return copy(notification);
  }

  save(notification: OutboxNotification): void {
    this.records.set(notification.id, copy(notification));
  }

  list(): OutboxNotification[] {
    return copy(Array.from(this.records.values()));
  }
}

const TRANSIENT_BACKOFF_MS = [60_000, 5 * 60_000, 20 * 60_000, 60 * 60_000, 6 * 60 * 60_000] as const;
const SAFE_EXTERNAL_SENSITIVITY: ReadonlySet<NotificationSensitivity> = new Set<NotificationSensitivity>([
  "public",
  "operational",
]);
const SENSITIVE_CONTENT = [
  /\bdiagnos(?:is|ed|tic)\b/i,
  /\bprescri(?:be|ption|bed)\b/i,
  /\bmedication\b/i,
  /\bpatient\b/i,
  /\bmedical\b/i,
  /\bhealth\s+(?:record|condition|data)\b/i,
  /\bssn\b/i,
  /\bdate of birth\b/i,
] as const;

function idFor(audience: NotificationAudience, channel: NotificationChannel, dedupeKey: string): string {
  return `ntf_${createHash("sha256")
    .update(`${audience.kind}:${audience.id}:${channel}:${dedupeKey}`)
    .digest("hex")
    .slice(0, 22)}`;
}

function messageIsSensitive(message: NotificationMessage): boolean {
  const text = `${message.title} ${message.body}`;
  return SENSITIVE_CONTENT.some((pattern) => pattern.test(text));
}

export type EnqueueResult =
  | { ok: true; notifications: OutboxNotification[]; idempotent: boolean }
  | { ok: false; code: "invalid_message" | "invalid_dedupe_key"; message: string };

/**
 * One outbox for every channel. Enqueue uniqueness is audience + channel +
 * dedupe key, so repeated events cannot create notification storms.
 */
export class NotificationOutbox {
  constructor(
    private readonly repository: OutboxRepository,
    private readonly providers: Partial<Record<NotificationChannel, NotificationProvider>>,
  ) {}

  enqueue(input: {
    audience: NotificationAudience;
    channels: readonly NotificationChannel[];
    topic: string;
    dedupeKey: string;
    sensitivity: NotificationSensitivity;
    message: NotificationMessage;
    occurredAt: Date;
  }): EnqueueResult {
    if (!input.dedupeKey.trim()) return { ok: false, code: "invalid_dedupe_key", message: "A dedupe key is required." };
    if (!input.message.title.trim() || !input.message.body.trim()) {
      return { ok: false, code: "invalid_message", message: "Notification title and body are required." };
    }
    const channels = Array.from(new Set(input.channels));
    const notifications: OutboxNotification[] = [];
    let idempotent = true;
    for (const channel of channels) {
      const existing = this.repository.findUnique(input.audience, channel, input.dedupeKey);
      if (existing) {
        notifications.push(existing);
        continue;
      }
      idempotent = false;
      const suppressExternal =
        (channel === "sms" || channel === "telegram") &&
        (!SAFE_EXTERNAL_SENSITIVITY.has(input.sensitivity) || messageIsSensitive(input.message));
      const now = input.occurredAt.toISOString();
      const record: OutboxNotification = {
        id: idFor(input.audience, channel, input.dedupeKey),
        audience: copy(input.audience),
        channel,
        topic: input.topic.trim(),
        dedupeKey: input.dedupeKey.trim(),
        sensitivity: input.sensitivity,
        message: copy(input.message),
        status: suppressExternal ? "suppressed" : "pending",
        attemptCount: 0,
        nextAttemptAt: now,
        leaseUntil: null,
        providerReference: null,
        failureCode: suppressExternal ? "external_privacy_policy" : null,
        createdAt: now,
        updatedAt: now,
      };
      notifications.push(this.repository.insertIfAbsent(record));
    }
    return { ok: true, notifications, idempotent };
  }

  list(status?: NotificationStatus): OutboxNotification[] {
    return this.repository
      .list()
      .filter((record) => !status || record.status === status)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async run(now: Date, limit = 50): Promise<{ attempted: number; sent: number; failed: number; suppressed: number }> {
    const due = this.repository
      .list()
      .filter(
        (record) =>
          (record.status === "pending" || record.status === "failed_retryable" || this.leaseExpired(record, now)) &&
          Date.parse(record.nextAttemptAt) <= now.getTime(),
      )
      .sort((a, b) => a.nextAttemptAt.localeCompare(b.nextAttemptAt))
      .slice(0, Math.max(0, Math.min(limit, 100)));
    const summary = { attempted: 0, sent: 0, failed: 0, suppressed: 0 };
    for (const candidate of due) {
      const current = this.repository.get(candidate.id);
      if (!current || !["pending", "failed_retryable", "processing"].includes(current.status)) continue;
      current.status = "processing";
      current.leaseUntil = new Date(now.getTime() + 60_000).toISOString();
      current.updatedAt = now.toISOString();
      this.repository.save(current);
      summary.attempted += 1;

      const provider = this.providers[current.channel];
      const result: ProviderResult = provider
        ? await provider.send(Object.freeze(copy(current)))
        : { ok: false, retryable: true, code: "provider_unavailable" };
      const completed = this.repository.get(current.id)!;
      completed.attemptCount += 1;
      completed.leaseUntil = null;
      completed.updatedAt = now.toISOString();
      if (result.ok) {
        completed.status = "sent";
        completed.providerReference = result.providerReference;
        completed.failureCode = null;
        summary.sent += 1;
      } else {
        completed.failureCode = result.code;
        const retryIndex = completed.attemptCount - 1;
        if (result.retryable && retryIndex < TRANSIENT_BACKOFF_MS.length) {
          completed.status = "failed_retryable";
          completed.nextAttemptAt = new Date(now.getTime() + TRANSIENT_BACKOFF_MS[retryIndex]).toISOString();
        } else {
          completed.status = "failed_permanent";
        }
        summary.failed += 1;
      }
      this.repository.save(completed);
    }
    summary.suppressed = this.repository.list().filter((record) => record.status === "suppressed").length;
    return summary;
  }

  retry(id: string, now: Date): OutboxNotification | null {
    const record = this.repository.get(id);
    if (!record || !["failed_retryable", "failed_permanent"].includes(record.status)) return null;
    record.status = "pending";
    record.nextAttemptAt = now.toISOString();
    record.leaseUntil = null;
    record.failureCode = null;
    record.updatedAt = now.toISOString();
    this.repository.save(record);
    return record;
  }

  private leaseExpired(record: OutboxNotification, now: Date): boolean {
    return record.status === "processing" && record.leaseUntil !== null && Date.parse(record.leaseUntil) <= now.getTime();
  }
}

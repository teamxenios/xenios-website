import {
  STATUS_RECOVERY_NEUTRAL_RESPONSE,
  STATUS_RECOVERY_SESSION_LIFETIME_HOURS,
  isEligibleStatusRecoveryReference,
  isStatusRecoveryEmail,
  isStatusRecoveryToken,
  normalizeStatusRecoveryEmail,
  normalizeStatusRecoveryReference,
  type StatusRecoveryRequestInput,
  type StatusRecoveryStatusView,
} from "../../../shared/research/status-recovery/contract";
import type {
  StatusRecoveryClock,
  StatusRecoveryCrypto,
  StatusRecoveryOutbox,
  StatusRecoveryRateLimiter,
  StatusRecoveryStore,
} from "./ports";

const REQUEST_WINDOW_SECONDS = 10 * 60;
const REQUESTS_PER_IP = 5;
const REQUESTS_PER_EMAIL = 3;
const IDEMPOTENCY_BUCKET_MS = 5 * 60 * 1000;

export class StatusRecoveryCredentialError extends Error {}

export type StatusRecoveryServiceDependencies = Readonly<{
  store: StatusRecoveryStore;
  outbox: StatusRecoveryOutbox;
  rateLimit: StatusRecoveryRateLimiter;
  clock: StatusRecoveryClock;
  crypto: StatusRecoveryCrypto;
  minimumResponseMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}>;

export class StatusRecoveryService {
  public constructor(private readonly deps: StatusRecoveryServiceDependencies) {}

  public async request(
    input: StatusRecoveryRequestInput,
    publicClientKey: string,
  ): Promise<typeof STATUS_RECOVERY_NEUTRAL_RESPONSE> {
    const startedAt = this.deps.clock.nowMs();
    const reference = normalizeStatusRecoveryReference(input?.reference);
    const email = normalizeStatusRecoveryEmail(input?.email);
    try {
      const ipAllowed = await this.deps.rateLimit(
        `status-recovery:ip:${this.deps.crypto.stableHash(publicClientKey)}`,
        REQUEST_WINDOW_SECONDS,
        REQUESTS_PER_IP,
      );
      const emailAllowed = isStatusRecoveryEmail(email)
        ? await this.deps.rateLimit(
            `status-recovery:email:${this.deps.crypto.stableHash(email)}`,
            REQUEST_WINDOW_SECONDS,
            REQUESTS_PER_EMAIL,
          )
        : false;
      if (!ipAllowed || !emailAllowed || !isEligibleStatusRecoveryReference(reference)) {
        return STATUS_RECOVERY_NEUTRAL_RESPONSE;
      }

      const subject = await this.deps.store.findEligibleSubject(reference, email);
      if (!subject) return STATUS_RECOVERY_NEUTRAL_RESPONSE;

      const bucket = Math.floor(this.deps.clock.nowMs() / IDEMPOTENCY_BUCKET_MS);
      const idempotencyKey = this.deps.crypto.stableHash(
        `status_recovery\0${subject.subjectType}\0${subject.subjectId}\0${bucket}`,
      );
      await this.deps.outbox.enqueue({
        eventKey: `status-recovery:${idempotencyKey}`,
        eventType: "research.status_recovery.requested",
        templateKey: "research.status_recovery.link",
        recipient: subject.canonicalEmail,
        applicationId: subject.subjectId,
        payload: Object.freeze({
          subjectType: subject.subjectType,
          subjectId: subject.subjectId,
          ownerId: subject.ownerId,
          publicReference: subject.publicReference,
          idempotencyKey,
        }),
      });
      return STATUS_RECOVERY_NEUTRAL_RESPONSE;
    } catch {
      // Public callers receive the same answer for match, mismatch, storage,
      // rate-limit and outbox outcomes. Operational failure stays observable
      // in the durable outbox/admin surfaces without becoming an oracle.
      return STATUS_RECOVERY_NEUTRAL_RESPONSE;
    } finally {
      const minimum = this.deps.minimumResponseMs ?? 75;
      const remaining = minimum - (this.deps.clock.nowMs() - startedAt);
      if (remaining > 0) {
        await (this.deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(remaining);
      }
    }
  }

  public async exchange(rawToken: unknown): Promise<string> {
    if (!isStatusRecoveryToken(rawToken)) throw new StatusRecoveryCredentialError();
    const rawSession = this.deps.crypto.randomToken();
    const now = this.deps.clock.now();
    const accepted = await this.deps.store.exchange({
      tokenDigest: this.deps.crypto.digestToken(rawToken),
      sessionDigest: this.deps.crypto.digestToken(`session\0${rawSession}`),
      createdAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + STATUS_RECOVERY_SESSION_LIFETIME_HOURS * 60 * 60 * 1000,
      ).toISOString(),
    });
    if (!accepted) throw new StatusRecoveryCredentialError();
    return rawSession;
  }

  public async status(rawSession: unknown): Promise<StatusRecoveryStatusView> {
    if (!isStatusRecoveryToken(rawSession)) throw new StatusRecoveryCredentialError();
    const view = await this.deps.store.getStatus(
      this.deps.crypto.digestToken(`session\0${rawSession}`),
      this.deps.clock.now().toISOString(),
    );
    if (!view) throw new StatusRecoveryCredentialError();
    return view;
  }

  public async end(rawSession: unknown): Promise<void> {
    if (!isStatusRecoveryToken(rawSession)) return;
    await this.deps.store.revokeSession(
      this.deps.crypto.digestToken(`session\0${rawSession}`),
      this.deps.clock.now().toISOString(),
    );
  }

}

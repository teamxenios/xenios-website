import type {
  StatusRecoveryStatusView,
  StatusRecoverySubjectType,
} from "../../../shared/research/status-recovery/contract";

export type StatusRecoverySubject = Readonly<{
  subjectType: StatusRecoverySubjectType;
  subjectId: string;
  ownerId: string | null;
  publicReference: string;
  canonicalEmail: string;
}>;

export type StatusRecoveryDeliveryBinding = Readonly<{
  tokenRecordId: string;
  canonicalEmail: string;
  publicReference: string;
}>;

export type StatusRecoveryStore = Readonly<{
  findEligibleSubject(
    publicReference: string,
    normalizedEmail: string,
  ): Promise<StatusRecoverySubject | null>;
  prepareDelivery(input: Readonly<{
    subjectType: StatusRecoverySubjectType;
    subjectId: string;
    ownerId: string | null;
    idempotencyKey: string;
    tokenDigest: string;
    createdAt: string;
    expiresAt: string;
    source: "public_status_recovery";
  }>): Promise<StatusRecoveryDeliveryBinding | null>;
  exchange(input: Readonly<{
    tokenDigest: string;
    sessionDigest: string;
    createdAt: string;
    expiresAt: string;
  }>): Promise<boolean>;
  getStatus(sessionDigest: string, now: string): Promise<StatusRecoveryStatusView | null>;
  revokeSession(sessionDigest: string, revokedAt: string): Promise<void>;
}>;

export type StatusRecoveryNotificationIntent = Readonly<{
  eventKey: string;
  eventType: "research.status_recovery.requested";
  templateKey: "research.status_recovery.link";
  recipient: string;
  applicationId: string;
  payload: Readonly<{
    subjectType: StatusRecoverySubjectType;
    subjectId: string;
    ownerId: string | null;
    publicReference: string;
    idempotencyKey: string;
  }>;
}>;

export type StatusRecoveryOutbox = Readonly<{
  enqueue(intent: StatusRecoveryNotificationIntent): Promise<boolean>;
}>;

export type StatusRecoveryRateLimiter = (
  key: string,
  windowSeconds: number,
  maxHits: number,
) => Promise<boolean>;

export type StatusRecoveryClock = Readonly<{
  now(): Date;
  nowMs(): number;
}>;

export type StatusRecoveryCrypto = Readonly<{
  randomToken(): string;
  deliveryToken(idempotencyKey: string): string;
  digestToken(rawToken: string): string;
  stableHash(value: string): string;
}>;

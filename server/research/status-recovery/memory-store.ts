import type { StatusRecoveryStatusView } from "../../../shared/research/status-recovery/contract";
import type { StatusRecoveryStore, StatusRecoverySubject } from "./ports";

type TokenRecord = {
  id: string;
  subjectId: string;
  idempotencyKey: string;
  tokenDigest: string;
  expiresAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
};

type SessionRecord = {
  subjectId: string;
  expiresAt: string;
  revokedAt: string | null;
};

export class InMemoryStatusRecoveryStore implements StatusRecoveryStore {
  private readonly subjects = new Map<string, StatusRecoverySubject & { view: StatusRecoveryStatusView }>();
  private readonly tokens = new Map<string, TokenRecord>();
  private readonly sessions = new Map<string, SessionRecord>();
  private tokenSequence = 0;

  public addSubject(subject: StatusRecoverySubject, view: StatusRecoveryStatusView): void {
    this.subjects.set(subject.subjectId, Object.freeze({ ...subject, view }));
  }

  public tokenRows(): readonly Readonly<TokenRecord>[] {
    return Object.freeze(Array.from(this.tokens.values()).map((value) => Object.freeze({ ...value })));
  }

  public async findEligibleSubject(reference: string, email: string) {
    return Array.from(this.subjects.values()).find(
      (subject) => subject.publicReference === reference && subject.canonicalEmail === email,
    ) ?? null;
  }

  public async prepareDelivery(input: Parameters<StatusRecoveryStore["prepareDelivery"]>[0]) {
    const subject = this.subjects.get(input.subjectId);
    if (!subject || subject.subjectType !== input.subjectType || subject.ownerId !== input.ownerId) return null;
    const existing = Array.from(this.tokens.values()).find(
      (token) => token.subjectId === input.subjectId && token.idempotencyKey === input.idempotencyKey,
    );
    if (existing) {
      if (
        existing.tokenDigest !== input.tokenDigest
        || existing.consumedAt !== null
        || existing.revokedAt !== null
        || existing.expiresAt <= input.createdAt
      ) return null;
      return Object.freeze({ tokenRecordId: existing.id, canonicalEmail: subject.canonicalEmail, publicReference: subject.publicReference });
    }
    for (const token of this.tokens.values()) {
      if (token.subjectId === input.subjectId && token.consumedAt === null && token.revokedAt === null) {
        token.revokedAt = input.createdAt;
      }
    }
    const id = `token-${++this.tokenSequence}`;
    this.tokens.set(input.tokenDigest, {
      id,
      subjectId: input.subjectId,
      idempotencyKey: input.idempotencyKey,
      tokenDigest: input.tokenDigest,
      expiresAt: input.expiresAt,
      consumedAt: null,
      revokedAt: null,
    });
    return Object.freeze({ tokenRecordId: id, canonicalEmail: subject.canonicalEmail, publicReference: subject.publicReference });
  }

  public async exchange(input: Parameters<StatusRecoveryStore["exchange"]>[0]): Promise<boolean> {
    const token = this.tokens.get(input.tokenDigest);
    if (!token || token.consumedAt !== null || token.revokedAt !== null || token.expiresAt <= input.createdAt) return false;
    token.consumedAt = input.createdAt;
    this.sessions.set(input.sessionDigest, { subjectId: token.subjectId, expiresAt: input.expiresAt, revokedAt: null });
    return true;
  }

  public async getStatus(sessionDigest: string, now: string) {
    const session = this.sessions.get(sessionDigest);
    if (!session || session.revokedAt !== null || session.expiresAt <= now) return null;
    return this.subjects.get(session.subjectId)?.view ?? null;
  }

  public async revokeSession(sessionDigest: string, revokedAt: string): Promise<void> {
    const session = this.sessions.get(sessionDigest);
    if (session) session.revokedAt = revokedAt;
  }
}

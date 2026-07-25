import { createHash } from "node:crypto";
import { roleCan, type OperationsActor } from "./state-machines";

export type CrmContactKind = "member" | "applicant" | "affiliate" | "professional";
export type CrmStage =
  | "new"
  | "pending_application"
  | "pending_activation"
  | "payment_verification"
  | "active"
  | "paused"
  | "closed";
export type CrmEventKind = "created" | "stage_changed" | "note" | "order_linked" | "exception_linked" | "follow_up";

export interface CrmContact {
  id: string;
  kind: CrmContactKind;
  displayName: string;
  email: string;
  stage: CrmStage;
  version: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CrmEvent {
  id: string;
  contactId: string;
  kind: CrmEventKind;
  actorId: string;
  actorRole: OperationsActor["role"];
  summary: string;
  referenceType: "order" | "exception" | null;
  referenceId: string | null;
  occurredAt: string;
}

export type CrmResult<T> =
  | { ok: true; value: T; idempotent: boolean }
  | { ok: false; code: "forbidden" | "not_found" | "stale_write" | "invalid_input" | "privacy_refused" | "idempotency_conflict"; message: string };

const PRIVATE_NOTE_PATTERNS = [
  /\bdiagnos(?:is|ed|tic)\b/i,
  /\bprescri(?:be|ption|bed)\b/i,
  /\bpatient\b/i,
  /\bmedical\b/i,
  /\bmedication\b/i,
  /\bssn\b/i,
  /\bdate of birth\b/i,
] as const;

const clone = <T>(value: T): T => structuredClone(value);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

/**
 * Operational CRM only. It does not accept clinical notes, diagnosis,
 * prescription, patient-referral, or medication-value data.
 */
export class CrmService {
  private readonly contacts = new Map<string, CrmContact>();
  private readonly events: CrmEvent[] = [];
  private readonly commands = new Map<string, { fingerprint: string; value: unknown }>();

  create(input: {
    id: string;
    kind: CrmContactKind;
    displayName: string;
    email: string;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): CrmResult<CrmContact> {
    const fp = hash(JSON.stringify({ action: "create", ...input, occurredAt: input.occurredAt.toISOString() }));
    const replay = this.replay<CrmContact>(input.idempotencyKey, fp);
    if (replay) return replay;
    if (!roleCan(input.actor.role, "crm:write")) return this.failure("forbidden", "This role cannot create CRM contacts.");
    if (!input.displayName.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) {
      return this.failure("invalid_input", "A display name and valid email are required.");
    }
    if (this.contacts.has(input.id)) return this.failure("idempotency_conflict", "That CRM contact already exists.");
    const now = input.occurredAt.toISOString();
    const contact: CrmContact = {
      id: input.id,
      kind: input.kind,
      displayName: input.displayName.trim(),
      email: input.email.trim().toLowerCase(),
      stage: "new",
      version: 1,
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
    this.contacts.set(contact.id, contact);
    this.appendEvent(contact.id, "created", input.actor, "Contact created.", null, null, input.idempotencyKey, input.occurredAt);
    return this.store(input.idempotencyKey, fp, contact);
  }

  get(id: string, actor: OperationsActor): CrmResult<{ contact: CrmContact; timeline: CrmEvent[] }> {
    if (!roleCan(actor.role, "crm:read")) return this.failure("forbidden", "This role cannot access CRM records.");
    const contact = this.contacts.get(id);
    if (!contact) return this.failure("not_found", "CRM contact not found.");
    return {
      ok: true,
      value: { contact: clone(contact), timeline: clone(this.events.filter((event) => event.contactId === id)) },
      idempotent: true,
    };
  }

  transitionStage(input: {
    contactId: string;
    to: CrmStage;
    expectedVersion: number;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): CrmResult<CrmContact> {
    return this.write(input, `stage:${input.to}`, (contact) => {
      const from = contact.stage;
      contact.stage = input.to;
      this.appendEvent(
        contact.id,
        "stage_changed",
        input.actor,
        `${from} → ${input.to}`,
        null,
        null,
        input.idempotencyKey,
        input.occurredAt,
      );
    });
  }

  addNote(input: {
    contactId: string;
    summary: string;
    expectedVersion: number;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): CrmResult<CrmContact> {
    if (PRIVATE_NOTE_PATTERNS.some((pattern) => pattern.test(input.summary))) {
      return this.failure("privacy_refused", "Clinical, patient, and highly sensitive identity data do not belong in operations CRM.");
    }
    return this.write(input, "note", (contact) => {
      this.appendEvent(
        contact.id,
        "note",
        input.actor,
        input.summary.trim(),
        null,
        null,
        input.idempotencyKey,
        input.occurredAt,
      );
    });
  }

  linkReference(input: {
    contactId: string;
    referenceType: "order" | "exception";
    referenceId: string;
    expectedVersion: number;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): CrmResult<CrmContact> {
    if (!input.referenceId.trim()) return this.failure("invalid_input", "A reference id is required.");
    return this.write(input, `link:${input.referenceType}`, (contact) => {
      this.appendEvent(
        contact.id,
        input.referenceType === "order" ? "order_linked" : "exception_linked",
        input.actor,
        `${input.referenceType} linked`,
        input.referenceType,
        input.referenceId,
        input.idempotencyKey,
        input.occurredAt,
      );
    });
  }

  list(actor: OperationsActor, stage?: CrmStage, search?: string): CrmResult<CrmContact[]> {
    if (!roleCan(actor.role, "crm:read")) return this.failure("forbidden", "This role cannot access CRM records.");
    const query = search?.trim().toLowerCase() ?? "";
    const contacts = Array.from(this.contacts.values())
      .filter((contact) => !stage || contact.stage === stage)
      .filter(
        (contact) =>
          !query ||
          contact.displayName.toLowerCase().includes(query) ||
          contact.email.toLowerCase().includes(query),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { ok: true, value: clone(contacts), idempotent: true };
  }

  private write(
    input: {
      contactId: string;
      expectedVersion: number;
      actor: OperationsActor;
      idempotencyKey: string;
      occurredAt: Date;
    },
    action: string,
    mutate: (contact: CrmContact) => void,
  ): CrmResult<CrmContact> {
    const fp = hash(JSON.stringify({ action, ...input, occurredAt: input.occurredAt.toISOString() }));
    const replay = this.replay<CrmContact>(input.idempotencyKey, fp);
    if (replay) return replay;
    if (!roleCan(input.actor.role, "crm:write")) return this.failure("forbidden", "This role cannot update CRM records.");
    const contact = this.contacts.get(input.contactId);
    if (!contact) return this.failure("not_found", "CRM contact not found.");
    if (contact.version !== input.expectedVersion) return this.failure("stale_write", "The CRM record changed; reload it.");
    mutate(contact);
    contact.version += 1;
    contact.updatedAt = input.occurredAt.toISOString();
    return this.store(input.idempotencyKey, fp, contact);
  }

  private appendEvent(
    contactId: string,
    kind: CrmEventKind,
    actor: OperationsActor,
    summary: string,
    referenceType: CrmEvent["referenceType"],
    referenceId: string | null,
    key: string,
    occurredAt: Date,
  ): void {
    this.events.push({
      id: `crm_evt_${hash(`${contactId}:${key}`).slice(0, 18)}`,
      contactId,
      kind,
      actorId: actor.id,
      actorRole: actor.role,
      summary,
      referenceType,
      referenceId,
      occurredAt: occurredAt.toISOString(),
    });
  }

  private replay<T>(key: string, fp: string): CrmResult<T> | null {
    const prior = this.commands.get(key);
    if (!prior) return null;
    if (prior.fingerprint !== fp) return this.failure("idempotency_conflict", "That idempotency key belongs to another CRM command.");
    return { ok: true, value: clone(prior.value as T), idempotent: true };
  }

  private store<T>(key: string, fp: string, value: T): CrmResult<T> {
    this.commands.set(key, { fingerprint: fp, value: clone(value) });
    return { ok: true, value: clone(value), idempotent: false };
  }

  private failure(code: Extract<CrmResult<never>, { ok: false }>["code"], message: string): CrmResult<never> {
    return { ok: false, code, message };
  }
}

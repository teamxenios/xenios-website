import { createHash } from "node:crypto";
import { roleCan, type OperationsActor } from "./state-machines";

export const PROFESSIONAL_PROGRAMS = [
  "wholesale",
  "reseller",
  "professional_membership",
  "directory",
  "education",
  "event",
  "implementation",
  "software",
  "future_clinical_partnership",
] as const;
export type ProfessionalProgram = (typeof PROFESSIONAL_PROGRAMS)[number];

export type ProfessionalLifecycle =
  | "applied"
  | "under_review"
  | "approved"
  | "active"
  | "paused"
  | "rejected"
  | "terminated";

export interface ProfessionalEconomicTerms {
  wholesaleDiscountBps: number;
  resellerDiscountBps: number;
  membershipFeeCents: number;
  directoryFeeCents: number;
  educationFeeCents: number;
  eventFeeCents: number;
  implementationFeeCents: number;
  softwareFeeCents: number;
}

export const DEFAULT_PROFESSIONAL_ECONOMIC_TERMS: Readonly<ProfessionalEconomicTerms> = Object.freeze({
  wholesaleDiscountBps: 0,
  resellerDiscountBps: 0,
  membershipFeeCents: 0,
  directoryFeeCents: 0,
  educationFeeCents: 0,
  eventFeeCents: 0,
  implementationFeeCents: 0,
  softwareFeeCents: 0,
});

export interface ProfessionalAccount {
  id: string;
  accountType: "practitioner" | "professional";
  organizationName: string;
  contactEmail: string;
  programs: ProfessionalProgram[];
  state: ProfessionalLifecycle;
  version: number;
  economicTerms: ProfessionalEconomicTerms;
  agreementVersion: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProfessionalAuditEvent {
  id: string;
  accountId: string;
  action: string;
  actorId: string;
  actorRole: OperationsActor["role"] | "public";
  occurredAt: string;
}

export type ProfessionalResult<T> =
  | { ok: true; value: T; idempotent: boolean }
  | {
      ok: false;
      code:
        | "forbidden"
        | "not_found"
        | "stale_write"
        | "invalid_input"
        | "invalid_state"
        | "clinical_economics_refused"
        | "idempotency_conflict";
      message: string;
    };

const FORBIDDEN_ECONOMIC_KEYS = new Set([
  "prescriptionPaymentCents",
  "patientReferralPaymentCents",
  "diagnosisPaymentCents",
  "clinicalApprovalPaymentCents",
  "medicationValuePaymentCents",
  "prescription",
  "patientReferral",
  "diagnosis",
  "clinicalApproval",
  "medicationValue",
]);
const LIFECYCLE: Readonly<Record<ProfessionalLifecycle, readonly ProfessionalLifecycle[]>> = {
  applied: ["under_review", "rejected", "terminated"],
  under_review: ["approved", "rejected", "terminated"],
  approved: ["active", "rejected", "terminated"],
  active: ["paused", "terminated"],
  paused: ["active", "terminated"],
  rejected: [],
  terminated: [],
};
const clone = <T>(value: T): T => structuredClone(value);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

function wholeNonNegative(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

export function hasClinicalReferralEconomics(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.keys(value as Record<string, unknown>).some((key) => FORBIDDEN_ECONOMIC_KEYS.has(key));
}

export class ProfessionalAccountService {
  private readonly accounts = new Map<string, ProfessionalAccount>();
  private readonly commands = new Map<string, { fingerprint: string; value: unknown }>();
  private readonly audit: ProfessionalAuditEvent[] = [];

  apply(input: {
    id: string;
    accountType: "practitioner" | "professional";
    organizationName: string;
    contactEmail: string;
    programs: ProfessionalProgram[];
    proposedEconomics?: Record<string, unknown>;
    idempotencyKey: string;
    occurredAt: Date;
  }): ProfessionalResult<ProfessionalAccount> {
    const fp = this.fingerprint("apply", input);
    const replay = this.replay<ProfessionalAccount>(input.idempotencyKey, fp);
    if (replay) return replay;
    if (
      !input.organizationName.trim() ||
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.contactEmail) ||
      !input.programs.length ||
      input.programs.some((program) => !PROFESSIONAL_PROGRAMS.includes(program))
    ) {
      return this.failure("invalid_input", "Organization, email, and at least one valid program are required.");
    }
    if (hasClinicalReferralEconomics(input.proposedEconomics)) {
      return this.failure(
        "clinical_economics_refused",
        "Prescription, patient referral, diagnosis, clinical approval, and medication-value economics are prohibited.",
      );
    }
    if (this.accounts.has(input.id)) return this.failure("idempotency_conflict", "That professional account exists.");
    const now = input.occurredAt.toISOString();
    const account: ProfessionalAccount = {
      id: input.id,
      accountType: input.accountType,
      organizationName: input.organizationName.trim(),
      contactEmail: input.contactEmail.trim().toLowerCase(),
      programs: Array.from(new Set(input.programs)),
      state: "applied",
      version: 1,
      economicTerms: clone(DEFAULT_PROFESSIONAL_ECONOMIC_TERMS),
      agreementVersion: null,
      createdAt: now,
      updatedAt: now,
    };
    this.accounts.set(account.id, account);
    this.record(account.id, "applied", null, input.idempotencyKey, input.occurredAt);
    return this.store(input.idempotencyKey, fp, account);
  }

  review(input: {
    accountId: string;
    to: Exclude<ProfessionalLifecycle, "applied">;
    expectedVersion: number;
    actor: OperationsActor;
    agreementVersion?: string;
    idempotencyKey: string;
    occurredAt: Date;
  }): ProfessionalResult<ProfessionalAccount> {
    const fp = this.fingerprint("review", input);
    const replay = this.replay<ProfessionalAccount>(input.idempotencyKey, fp);
    if (replay) return replay;
    if (!roleCan(input.actor.role, "professional:review")) return this.failure("forbidden", "This role cannot review professional accounts.");
    const account = this.accounts.get(input.accountId);
    if (!account) return this.failure("not_found", "Professional account not found.");
    if (account.version !== input.expectedVersion) return this.failure("stale_write", "Professional account changed; reload it.");
    if (!LIFECYCLE[account.state].includes(input.to)) {
      return this.failure("invalid_state", `Cannot move ${account.state} to ${input.to}.`);
    }
    if (input.to === "approved") {
      if (!input.agreementVersion?.trim()) return this.failure("invalid_input", "Agreement version is required for approval.");
      account.agreementVersion = input.agreementVersion.trim();
    }
    if (input.to === "active" && !account.agreementVersion) {
      return this.failure("invalid_state", "An approved agreement is required before activation.");
    }
    account.state = input.to;
    account.version += 1;
    account.updatedAt = input.occurredAt.toISOString();
    this.record(account.id, input.to, input.actor, input.idempotencyKey, input.occurredAt);
    return this.store(input.idempotencyKey, fp, account);
  }

  updateTerms(input: {
    accountId: string;
    expectedVersion: number;
    terms: Partial<ProfessionalEconomicTerms> & Record<string, unknown>;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): ProfessionalResult<ProfessionalAccount> {
    const fp = this.fingerprint("terms", input);
    const replay = this.replay<ProfessionalAccount>(input.idempotencyKey, fp);
    if (replay) return replay;
    if (!roleCan(input.actor.role, "professional:review")) return this.failure("forbidden", "This role cannot update professional terms.");
    if (hasClinicalReferralEconomics(input.terms)) {
      return this.failure(
        "clinical_economics_refused",
        "Clinical and patient-referral economics cannot be added to a professional account.",
      );
    }
    const account = this.accounts.get(input.accountId);
    if (!account) return this.failure("not_found", "Professional account not found.");
    if (account.version !== input.expectedVersion) return this.failure("stale_write", "Professional account changed; reload it.");
    const next = { ...account.economicTerms, ...input.terms } as ProfessionalEconomicTerms;
    if (
      Object.values(next).some((value) => !wholeNonNegative(value)) ||
      next.wholesaleDiscountBps > 10_000 ||
      next.resellerDiscountBps > 10_000
    ) {
      return this.failure("invalid_input", "Professional economic terms must be whole non-negative cents or valid basis points.");
    }
    account.economicTerms = next;
    account.version += 1;
    account.updatedAt = input.occurredAt.toISOString();
    this.record(account.id, "terms_updated", input.actor, input.idempotencyKey, input.occurredAt);
    return this.store(input.idempotencyKey, fp, account);
  }

  get(id: string, actor: OperationsActor): ProfessionalResult<ProfessionalAccount> {
    if (!roleCan(actor.role, "professional:review") && actor.id !== id) {
      return this.failure("forbidden", "This role cannot access the professional account.");
    }
    const account = this.accounts.get(id);
    if (!account) return this.failure("not_found", "Professional account not found.");
    return { ok: true, value: clone(account), idempotent: true };
  }

  list(actor: OperationsActor, state?: ProfessionalLifecycle): ProfessionalResult<ProfessionalAccount[]> {
    if (!roleCan(actor.role, "professional:review")) return this.failure("forbidden", "This role cannot list professional accounts.");
    return {
      ok: true,
      value: clone(Array.from(this.accounts.values()).filter((account) => !state || account.state === state)),
      idempotent: true,
    };
  }

  listAudit(actor: OperationsActor): ProfessionalResult<ProfessionalAuditEvent[]> {
    if (!roleCan(actor.role, "audit:read")) return this.failure("forbidden", "This role cannot read professional audit.");
    return { ok: true, value: clone(this.audit), idempotent: true };
  }

  private record(accountId: string, action: string, actor: OperationsActor | null, key: string, occurredAt: Date): void {
    this.audit.push({
      id: `pro_evt_${digest(`${accountId}:${key}`).slice(0, 18)}`,
      accountId,
      action,
      actorId: actor?.id ?? "public",
      actorRole: actor?.role ?? "public",
      occurredAt: occurredAt.toISOString(),
    });
  }

  private fingerprint(action: string, input: unknown): string {
    return digest(JSON.stringify({ action, input }));
  }

  private replay<T>(key: string, fp: string): ProfessionalResult<T> | null {
    const prior = this.commands.get(key);
    if (!prior) return null;
    if (prior.fingerprint !== fp) return this.failure("idempotency_conflict", "That key belongs to another professional command.");
    return { ok: true, value: clone(prior.value as T), idempotent: true };
  }

  private store<T>(key: string, fp: string, value: T): ProfessionalResult<T> {
    this.commands.set(key, { fingerprint: fp, value: clone(value) });
    return { ok: true, value: clone(value), idempotent: false };
  }

  private failure(
    code: Extract<ProfessionalResult<never>, { ok: false }>["code"],
    message: string,
  ): ProfessionalResult<never> {
    return { ok: false, code, message };
  }
}

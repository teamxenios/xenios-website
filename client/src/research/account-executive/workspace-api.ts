import {
  aeCommandEnvelopeSchema, aeFailureSchema, aeIdentifier, type AeCommandReceipt,
  type AeWorkspace, type AeWorkspaceCommand,
} from "@shared/research/account-executive/workspace";
import { freezeAeCommand, readAeWorkspace } from "./workspace-model";

export interface AeSessionBinding {
  readonly actorAuthUserId: string;
  readonly scopeId: string;
  readonly accessToken: string;
  readonly sessionInstance: object;
}
export type AeApiFailure = "session_expired" | "denied" | "not_found" | "conflict" | "invalid_input" | "unavailable" | "stale";
export class AeWorkspaceApiError extends Error {
  constructor(readonly kind: AeApiFailure) { super("AE operation could not be confirmed."); }
}
export interface AeWorkspaceApi {
  read(signal?: AbortSignal): Promise<AeWorkspace>;
  command(command: Readonly<AeWorkspaceCommand>, openFollowupIds: readonly string[], signal?: AbortSignal): Promise<AeCommandReceipt>;
}
/** Fixed relative endpoints; the binding only narrows work, never authorizes it. */
export function createAeWorkspaceApi(binding: AeSessionBinding, isCurrent: () => boolean,
  transport: typeof fetch = globalThis.fetch): AeWorkspaceApi {
  function current(signal?: AbortSignal) {
    if (!isCurrent() || signal?.aborted) throw new AeWorkspaceApiError("stale");
    if (!aeIdentifier.safeParse(binding.actorAuthUserId).success || !aeIdentifier.safeParse(binding.scopeId).success
      || !binding.accessToken || /[\r\n]/.test(binding.accessToken)) throw new AeWorkspaceApiError("session_expired");
  }
  async function request(path: string, body?: string, signal?: AbortSignal): Promise<unknown> {
    current(signal);
    let response: Response, value: unknown;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        (async () => {
          const response = await transport(path, { method: body === undefined ? "GET" : "POST", body, signal: controller.signal,
            credentials: "same-origin", cache: "no-store", redirect: "error",
            headers: { Authorization: `Bearer ${binding.accessToken}`, Accept: "application/json",
              ...(body === undefined ? {} : { "Content-Type": "application/json" }) } });
          current(signal); const value: unknown = await response.json(); current(signal); return { response, value };
        })(),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => {
          controller.abort(); reject(new AeWorkspaceApiError("unavailable"));
        }, 30_000); }),
      ]);
      response = result.response; value = result.value;
    } catch (error) {
      if (error instanceof AeWorkspaceApiError) throw error;
      current(signal); throw new AeWorkspaceApiError("unavailable");
    } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
    if (response.status === 200) return value;
    const failure = aeFailureSchema.safeParse(value);
    if (!failure.success) throw new AeWorkspaceApiError("unavailable");
    const code = failure.data.code;
    if (code === "access_denied" && response.status === 401) throw new AeWorkspaceApiError("session_expired");
    if (code === "access_denied" && response.status === 403) throw new AeWorkspaceApiError("denied");
    if (code === "not_found" && response.status === 404) throw new AeWorkspaceApiError("not_found");
    if ((code === "revision_conflict" || code === "idempotency_conflict") && response.status === 409) throw new AeWorkspaceApiError("conflict");
    if (code === "invalid_input" && response.status === 400) throw new AeWorkspaceApiError("invalid_input");
    throw new AeWorkspaceApiError("unavailable");
  }
  return {
    async read(signal) {
      const raw = await request("/api/research/account-executive/workspace", undefined, signal);
      const value = readAeWorkspace(raw, binding);
      if (!value) throw new AeWorkspaceApiError("unavailable");
      return value;
    },
    async command(input, openFollowupIds, signal) {
      const command = freezeAeCommand(input);
      if (!command) throw new AeWorkspaceApiError("invalid_input");
      const raw = await request("/api/research/account-executive/commands", JSON.stringify(command), signal);
      const parsed = aeCommandEnvelopeSchema.safeParse(raw);
      if (!parsed.success || !parsed.data.ok) throw new AeWorkspaceApiError("unavailable");
      const value = parsed.data.value, assignment = value.assignment, audit = value.audit;
      if (value.commandId !== command.commandId || assignment.id !== command.assignmentId
        || assignment.customerAuthUserId !== command.customerAuthUserId || assignment.scopeId !== binding.scopeId
        || assignment.revision !== command.expectedRevision + 1 || audit.commandId !== command.commandId
        || audit.actorAuthUserId !== binding.actorAuthUserId || audit.assignmentId !== command.assignmentId
        || audit.customerAuthUserId !== command.customerAuthUserId) throw new AeWorkspaceApiError("unavailable");
      if (command.kind === "record_followup") {
        const followup = value.followup;
        if (value.followupTransfers.length || assignment.assigneeAuthUserId !== binding.actorAuthUserId
          || audit.kind !== "followup_recorded" || !followup || followup.assignmentId !== assignment.id
          || followup.customerAuthUserId !== assignment.customerAuthUserId || followup.ownerAuthUserId !== binding.actorAuthUserId
          || followup.purpose !== command.purpose || followup.dueAt !== command.dueAt || followup.state !== "open"
          || followup.createdAt !== audit.occurredAt) throw new AeWorkspaceApiError("unavailable");
      } else if (command.kind === "complete_followup" || command.kind === "reschedule_followup") {
        const followup = value.followup;
        // The recorded receipt can replay after the task is no longer open.
        // These operations transfer no tasks and use no current-open-ID hint.
        if (value.followupTransfers.length || assignment.assigneeAuthUserId !== binding.actorAuthUserId
          || !followup || followup.id !== command.followupId || followup.assignmentId !== assignment.id
          || followup.customerAuthUserId !== assignment.customerAuthUserId || followup.ownerAuthUserId !== binding.actorAuthUserId
          || Date.parse(followup.createdAt) > Date.parse(audit.occurredAt)
          || (command.kind === "complete_followup"
            ? audit.kind !== "followup_completed" || followup.state !== "completed"
            : audit.kind !== "followup_rescheduled" || followup.state !== "open" || followup.dueAt !== command.dueAt)) {
          throw new AeWorkspaceApiError("unavailable");
        }
      } else if (command.kind === "reassign") {
        if (assignment.assigneeAuthUserId !== command.nextAssigneeAuthUserId
          || command.nextAssigneeAuthUserId === binding.actorAuthUserId || audit.kind !== "assignment_reassigned"
          || value.followup !== null || value.followupTransfers.length !== openFollowupIds.length
          || new Set(value.followupTransfers.map(row => row.followupId)).size !== openFollowupIds.length
          || value.followupTransfers.some(row => !openFollowupIds.includes(row.followupId)
            || row.fromOwnerAuthUserId !== binding.actorAuthUserId || row.toOwnerAuthUserId !== command.nextAssigneeAuthUserId
            || row.auditId !== audit.id || row.occurredAt !== audit.occurredAt)) throw new AeWorkspaceApiError("unavailable");
      } else throw new AeWorkspaceApiError("unavailable");
      return value;
    },
  };
}

export type AeAttemptStatus = "pending" | "uncertain" | "conflict" | "confirmed" | "denied";
export interface AeCommandAttempt {
  readonly command: Readonly<AeWorkspaceCommand>;
  readonly openFollowupIds: readonly string[];
  readonly status: AeAttemptStatus;
}
/** Browser-memory command coordination. No token, customer detail or receipt. */
export class AeCommandJournal {
  readonly #attempts = new Map<string, { command: Readonly<AeWorkspaceCommand>; openFollowupIds: readonly string[]; status: AeAttemptStatus }>();
  readonly #listeners = new Set<() => void>();
  readonly #recoverableDenials = new Set<AeCommandAttempt>();
  #version = 0;
  constructor(readonly sessionInstance: object, readonly actorAuthUserId: string, readonly scopeId: string) {}
  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  snapshot = () => this.#version;
  #publish() { this.#version++; for (const listener of this.#listeners) { try { listener(); } catch { /* Observers grant no authority. */ } } }
  matches(sessionInstance: object, actor: string, scope: string) {
    return this.sessionInstance === sessionInstance && this.actorAuthUserId === actor && this.scopeId === scope;
  }
  entries(): readonly AeCommandAttempt[] { return [...this.#attempts.values()]; }
  prepare(value: unknown, openFollowupIds: readonly string[]): AeCommandAttempt | null {
    const command = freezeAeCommand(value);
    if (!command || this.#attempts.has(command.assignmentId)
      || this.entries().some(row => row.status === "pending" || row.status === "uncertain")) return null;
    const attempt = { command, openFollowupIds: Object.freeze([...openFollowupIds]), status: "pending" as AeAttemptStatus };
    this.#attempts.set(command.assignmentId, attempt); this.#publish(); return attempt;
  }
  retry(attempt: AeCommandAttempt): boolean {
    const owned = this.#attempts.get(attempt.command.assignmentId);
    if (owned !== attempt || owned.status !== "uncertain") return false;
    owned.status = "pending"; this.#publish(); return true;
  }
  settle(attempt: AeCommandAttempt, status: AeAttemptStatus, recoverAfterRead = false) {
    const owned = this.#attempts.get(attempt.command.assignmentId);
    if (owned === attempt && owned.status === "pending") {
      owned.status = status;
      if (status === "denied" && recoverAfterRead) this.#recoverableDenials.add(owned);
      this.#publish();
    }
  }
  readback(value: AeWorkspace) {
    this.#readback(value, new Set());
  }
  /** Capture before GET: a read already in flight cannot reconcile a later denial. */
  beginReadback() {
    const deniedAtRead = new Set(this.entries().filter(attempt => attempt.status === "denied"
      && this.#recoverableDenials.has(attempt)));
    return (value: AeWorkspace) => this.#readback(value, deniedAtRead);
  }
  #readback(value: AeWorkspace, deniedAtRead: ReadonlySet<AeCommandAttempt>) {
    if (value.actorAuthUserId !== this.actorAuthUserId || value.scopeId !== this.scopeId) return;
    for (const customer of value.customers) {
      const attempt = this.#attempts.get(customer.assignment.id);
      if (!attempt) continue;
      const recoveredDenial = attempt.status === "denied" && deniedAtRead.has(attempt) && this.#recoverableDenials.has(attempt)
        && customer.assignment.customerAuthUserId === attempt.command.customerAuthUserId
        && customer.assignment.assigneeAuthUserId === this.actorAuthUserId && customer.assignment.scopeId === this.scopeId
        && customer.assignment.revision === attempt.command.expectedRevision;
      if (recoveredDenial || ((attempt.status === "conflict" || attempt.status === "confirmed")
        && customer.assignment.revision >= attempt.command.expectedRevision)) {
        this.#attempts.delete(customer.assignment.id); this.#recoverableDenials.delete(attempt); this.#publish();
      }
    }
  }
}
export function createAeCommandJournal(sessionInstance: object, actorAuthUserId: string, scopeId: string) {
  return new AeCommandJournal(sessionInstance, aeIdentifier.parse(actorAuthUserId), aeIdentifier.parse(scopeId));
}

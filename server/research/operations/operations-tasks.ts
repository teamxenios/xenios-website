import { createHash } from "node:crypto";
import { roleCan, type OperationsActor } from "./state-machines";

export type OperationsTaskStatus = "open" | "in_progress" | "blocked" | "completed" | "cancelled";
export type OperationsTaskPriority = "normal" | "urgent" | "samuel_decision";

export interface OperationsTask {
  id: string;
  title: string;
  description: string | null;
  status: OperationsTaskStatus;
  priority: OperationsTaskPriority;
  assignedTo: string | null;
  sourceType: string | null;
  sourceId: string | null;
  dueAt: string | null;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export type OperationsTaskResult<T> =
  | { ok: true; value: T; idempotent: boolean }
  | {
      ok: false;
      code: "forbidden" | "not_found" | "stale_write" | "invalid_input" | "idempotency_conflict";
      message: string;
    };

const clone = <T>(value: T): T => structuredClone(value);
const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export class OperationsTaskService {
  private readonly tasks = new Map<string, OperationsTask>();
  private readonly commands = new Map<string, { fingerprint: string; value: OperationsTask }>();

  list(actor: OperationsActor, status?: OperationsTaskStatus): OperationsTaskResult<OperationsTask[]> {
    if (!roleCan(actor.role, "operations:read")) {
      return { ok: false, code: "forbidden", message: "This role cannot access operations tasks." };
    }
    return {
      ok: true,
      value: clone(
        Array.from(this.tasks.values())
          .filter((task) => !status || task.status === status)
          .sort((a, b) => {
            const priority = { samuel_decision: 0, urgent: 1, normal: 2 };
            return priority[a.priority] - priority[b.priority] || a.createdAt.localeCompare(b.createdAt);
          }),
      ),
      idempotent: true,
    };
  }

  create(input: {
    id: string;
    title: string;
    description?: string | null;
    priority?: OperationsTaskPriority;
    assignedTo?: string | null;
    sourceType?: string | null;
    sourceId?: string | null;
    dueAt?: string | null;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): OperationsTaskResult<OperationsTask> {
    const fp = fingerprint({ action: "create", ...input, occurredAt: input.occurredAt.toISOString() });
    const replay = this.replay(input.idempotencyKey, fp);
    if (replay) return replay;
    if (!roleCan(input.actor.role, "operations:read") || ["mitch", "logistics"].includes(input.actor.role)) {
      return { ok: false, code: "forbidden", message: "This role cannot create operations tasks." };
    }
    if (!input.id.trim() || !input.title.trim()) {
      return { ok: false, code: "invalid_input", message: "Task id and title are required." };
    }
    if (this.tasks.has(input.id)) {
      return { ok: false, code: "idempotency_conflict", message: "That task already exists." };
    }
    const occurredAt = input.occurredAt.toISOString();
    const task: OperationsTask = {
      id: input.id,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      status: "open",
      priority: input.priority ?? "normal",
      assignedTo: input.assignedTo?.trim() || null,
      sourceType: input.sourceType?.trim() || null,
      sourceId: input.sourceId?.trim() || null,
      dueAt: input.dueAt ?? null,
      version: 1,
      createdBy: input.actor.id,
      createdAt: occurredAt,
      updatedAt: occurredAt,
      completedAt: null,
    };
    this.tasks.set(task.id, task);
    return this.store(input.idempotencyKey, fp, task);
  }

  transition(input: {
    taskId: string;
    to: OperationsTaskStatus;
    assignedTo?: string | null;
    expectedVersion: number;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): OperationsTaskResult<OperationsTask> {
    const fp = fingerprint({ action: "transition", ...input, occurredAt: input.occurredAt.toISOString() });
    const replay = this.replay(input.idempotencyKey, fp);
    if (replay) return replay;
    if (!roleCan(input.actor.role, "operations:read") || ["mitch", "logistics"].includes(input.actor.role)) {
      return { ok: false, code: "forbidden", message: "This role cannot update operations tasks." };
    }
    const task = this.tasks.get(input.taskId);
    if (!task) return { ok: false, code: "not_found", message: "Operations task not found." };
    if (task.version !== input.expectedVersion) {
      return { ok: false, code: "stale_write", message: "The task changed; reload it." };
    }
    const allowed: Record<OperationsTaskStatus, OperationsTaskStatus[]> = {
      open: ["in_progress", "blocked", "completed", "cancelled"],
      in_progress: ["open", "blocked", "completed", "cancelled"],
      blocked: ["open", "in_progress", "completed", "cancelled"],
      completed: [],
      cancelled: [],
    };
    if (!allowed[task.status].includes(input.to)) {
      return { ok: false, code: "invalid_input", message: "That task transition is not allowed." };
    }
    task.status = input.to;
    if (input.assignedTo !== undefined) task.assignedTo = input.assignedTo?.trim() || null;
    task.version += 1;
    task.updatedAt = input.occurredAt.toISOString();
    task.completedAt = input.to === "completed" || input.to === "cancelled" ? task.updatedAt : null;
    return this.store(input.idempotencyKey, fp, task);
  }

  private replay(key: string, fp: string): OperationsTaskResult<OperationsTask> | null {
    const prior = this.commands.get(key);
    if (!prior) return null;
    if (prior.fingerprint !== fp) {
      return { ok: false, code: "idempotency_conflict", message: "That idempotency key belongs to another task command." };
    }
    return { ok: true, value: clone(prior.value), idempotent: true };
  }

  private store(key: string, fp: string, value: OperationsTask): OperationsTaskResult<OperationsTask> {
    this.commands.set(key, { fingerprint: fp, value: clone(value) });
    return { ok: true, value: clone(value), idempotent: false };
  }
}

// The operational caller for the bounded checkout recovery pass.
//
// IMPLEMENTED, NOT ACTIVATED. Nothing in the application imports or starts this
// module. Activation is a separate, explicit step: set the environment below,
// provision the approval document, and call `start` from the composition root.
//
// Authority comes from one place: an approval DOCUMENT whose exact bytes hash to
// a digest pinned separately in the deployment environment. Every authorize()
// re-reads that document, re-hashes it, re-parses it, and cross-checks it
// against facts the process observes for itself, never against the context the
// caller already holds:
//
//   * the environment the deployment declares it is,
//   * the commit the platform says is running (RENDER_GIT_COMMIT),
//   * the database the process is actually configured to talk to.
//
// So a document edited after start, a deploy of different code, an expiry, or a
// connection to another project all refuse the next database or provider call.
// Missing configuration answers `unavailable` with a precise code before any
// read of the document, any client construction, and any provider call.
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { DurablePaymentProvider } from "../providers/payment";
import {
  createCheckoutRecoveryPass,
  RECOVERY_PASS_EFFECTS,
  type CheckoutRecoveryPassInput,
  type RecoveryPassContext,
} from "./checkout-recovery-pass";
import type { CheckoutRecoveryOperationOptions, CheckoutRecoveryOperationResult } from "./checkout-recovery-operation";
import type { CheckoutExecutionClient } from "./persistence/checkout-executions-store";

/** Every variable this caller reads, by name. */
export const RECOVERY_CALLER_ENV = Object.freeze({
  /** Exactly "true" to run. Anything else is disabled and touches nothing. */
  enabled: "XENIOS_CHECKOUT_RECOVERY_ENABLED",
  /** Where the approval document lives. */
  approvalPath: "XENIOS_CHECKOUT_RECOVERY_APPROVAL_PATH",
  /** sha256 of the document's exact bytes, pinned independently of the file. */
  approvalSha256: "XENIOS_CHECKOUT_RECOVERY_APPROVAL_SHA256",
  /** "staging" or "production", declared by the deployment, not the document. */
  environment: "XENIOS_DEPLOYMENT_ENVIRONMENT",
  /** Set by the hosting platform to the running commit. */
  applicationSha: "RENDER_GIT_COMMIT",
  /** The database this process is configured to use. */
  databaseUrl: "SUPABASE_URL",
});

export const RECOVERY_APPROVAL_KIND = "xenios.checkout_recovery_approval.v1";
const DOCUMENT_KEYS = ["kind", "environment", "projectRef", "applicationSha", "expiresAt", "effects", "memberIds", "approvedBy", "approvedAt"] as const;
/** A staging approval can never name the production project. */
const PRODUCTION_PROJECT = "yvzeduaxbwgcwllhywff";
const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type RecoveryCallerUnavailable =
  | "approval_not_configured"
  | "approval_unreadable"
  | "approval_digest_mismatch"
  | "approval_invalid"
  | "approval_expired"
  | "environment_not_declared"
  | "environment_mismatch"
  | "application_identity_missing"
  | "application_mismatch"
  | "database_target_missing"
  | "database_target_mismatch"
  | "already_running";

export type RecoveryCallerResult =
  | { ok: false; status: "disabled" }
  | { ok: false; status: "unavailable"; code: RecoveryCallerUnavailable }
  | CheckoutRecoveryOperationResult;

type Pass = { runOnce(options: CheckoutRecoveryOperationOptions): Promise<CheckoutRecoveryOperationResult> };

export interface RecoveryCallerDeps {
  env?: Record<string, string | undefined>;
  readApproval?(path: string): Promise<Uint8Array | string>;
  /** Builds a client for EXACTLY this origin. No ambient singleton. */
  createExecutionClient(origin: string): CheckoutExecutionClient;
  /** Only the two capabilities the pass accepts. */
  payment: Pick<DurablePaymentProvider, "retrievePayment" | "cancelAuthorization">;
  now?(): Date;
  newId?(): string;
  bounds?: Pick<CheckoutRecoveryOperationOptions, "maxAttempts" | "maxPages" | "pageSize">;
  /** Operator visibility. Receives status, code and counts only: no identities. */
  onOutcome?(result: RecoveryCallerResult): void;
  /** Test seam. Production always uses the real pass. */
  createPass?(input: CheckoutRecoveryPassInput): Pass;
}

export class RecoveryCallerUnavailableError extends Error {
  constructor(readonly code: RecoveryCallerUnavailable) {
    super(code);
    this.name = "RecoveryCallerUnavailableError";
  }
}
const unavailable = (code: RecoveryCallerUnavailable): never => {
  throw new RecoveryCallerUnavailableError(code);
};
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Fresh verification of the approval against observed facts. Returns the exact
 * context the pass binds to, or throws with the single thing that is wrong.
 */
export async function verifyRecoveryApproval(deps: {
  env: Record<string, string | undefined>;
  readApproval(path: string): Promise<Uint8Array | string>;
  now(): Date;
}): Promise<RecoveryPassContext> {
  const E = RECOVERY_CALLER_ENV;
  const path = (deps.env[E.approvalPath] ?? "").trim();
  const pinned = (deps.env[E.approvalSha256] ?? "").trim();
  if (!path || !pinned) unavailable("approval_not_configured");
  if (!/^[a-f0-9]{64}$/.test(pinned)) unavailable("approval_not_configured");

  // Observed facts first, so a misconfigured process refuses without reading
  // the document at all.
  const environment = deps.env[E.environment];
  if (environment !== "staging" && environment !== "production") unavailable("environment_not_declared");
  const runningSha = deps.env[E.applicationSha] ?? "";
  if (!/^[a-f0-9]{40}$/.test(runningSha)) unavailable("application_identity_missing");
  let databaseOrigin: string;
  try {
    databaseOrigin = new URL(deps.env[E.databaseUrl] ?? "").origin;
  } catch {
    return unavailable("database_target_missing");
  }
  const observedRef = /^https:\/\/([a-z]{20})\.supabase\.co$/.exec(databaseOrigin)?.[1];
  if (!observedRef) unavailable("database_target_missing");

  let bytes: Uint8Array | string;
  try {
    bytes = await deps.readApproval(path);
  } catch {
    return unavailable("approval_unreadable");
  }
  const raw = typeof bytes === "string" ? Buffer.from(bytes, "utf8") : Buffer.from(bytes);
  if (createHash("sha256").update(raw).digest("hex") !== pinned) unavailable("approval_digest_mismatch");

  let document: unknown;
  try {
    document = JSON.parse(raw.toString("utf8"));
  } catch {
    return unavailable("approval_invalid");
  }
  if (!isObject(document) || Object.keys(document).length !== DOCUMENT_KEYS.length
    || !DOCUMENT_KEYS.every((key) => Object.hasOwn(document as object, key))) unavailable("approval_invalid");
  const d = document as Record<string, unknown>;
  const now = deps.now();
  if (d.kind !== RECOVERY_APPROVAL_KIND
    || (d.environment !== "staging" && d.environment !== "production")
    || typeof d.projectRef !== "string" || !/^[a-z]{20}$/.test(d.projectRef)
    || typeof d.applicationSha !== "string" || !/^[a-f0-9]{40}$/.test(d.applicationSha)
    || typeof d.expiresAt !== "string" || !ISO_MS.test(d.expiresAt) || new Date(d.expiresAt).toISOString() !== d.expiresAt
    || !Array.isArray(d.effects) || d.effects.length !== RECOVERY_PASS_EFFECTS.length
    || new Set(d.effects).size !== RECOVERY_PASS_EFFECTS.length
    || !RECOVERY_PASS_EFFECTS.every((effect) => (d.effects as unknown[]).includes(effect))
    || (d.memberIds !== "all" && (!Array.isArray(d.memberIds) || d.memberIds.length < 1 || d.memberIds.length > 1000
      || !d.memberIds.every((id) => typeof id === "string" && UUID.test(id)) || new Set(d.memberIds).size !== d.memberIds.length))
    || typeof d.approvedBy !== "string" || d.approvedBy.trim().length === 0 || d.approvedBy.length > 200
    || typeof d.approvedAt !== "string" || !ISO_MS.test(d.approvedAt) || Date.parse(d.approvedAt) > now.getTime()) {
    unavailable("approval_invalid");
  }
  if (Date.parse(d.expiresAt as string) <= now.getTime()) unavailable("approval_expired");

  // Cross-checks against what this process observes for itself.
  if (d.environment !== environment) unavailable("environment_mismatch");
  if (d.environment === "staging" && d.projectRef === PRODUCTION_PROJECT) unavailable("environment_mismatch");
  if (d.projectRef !== observedRef) unavailable("database_target_mismatch");
  if (d.applicationSha !== runningSha) unavailable("application_mismatch");

  return {
    environment: d.environment as RecoveryPassContext["environment"],
    projectRef: d.projectRef as string,
    applicationSha: d.applicationSha as string,
    approvalSha256: pinned,
    expiresAt: d.expiresAt as string,
    effects: [...RECOVERY_PASS_EFFECTS],
    memberIds: d.memberIds === "all" ? "all" : [...(d.memberIds as string[])],
  };
}

export function createCheckoutRecoveryCaller(deps: RecoveryCallerDeps) {
  const env = deps.env ?? process.env;
  const readApproval = deps.readApproval ?? ((path: string) => readFile(path));
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? randomUUID;
  const verification = { env, readApproval, now };
  // One stable lease owner per caller instance.
  const owner = newId();
  let running = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const report = (result: RecoveryCallerResult): RecoveryCallerResult => {
    try {
      deps.onOutcome?.(result);
    } catch {
      // Visibility must never change the outcome.
    }
    return result;
  };

  async function runOnce(): Promise<RecoveryCallerResult> {
    if (env[RECOVERY_CALLER_ENV.enabled] !== "true") return report({ ok: false, status: "disabled" });
    if (running) return report({ ok: false, status: "unavailable", code: "already_running" });
    running = true;
    try {
      let context: RecoveryPassContext;
      try {
        context = await verifyRecoveryApproval(verification);
      } catch (error) {
        const code = error instanceof RecoveryCallerUnavailableError ? error.code : "approval_invalid";
        return report({ ok: false, status: "unavailable", code });
      }
      const pass = (deps.createPass ?? createCheckoutRecoveryPass)({
        enabled: true,
        context,
        // Fresh every time the pass asks: re-read, re-hash, re-observe.
        authorize: () => verifyRecoveryApproval(verification),
        connect(verified) {
          const origin = `https://${verified.projectRef}.supabase.co`;
          if (new URL(env[RECOVERY_CALLER_ENV.databaseUrl] ?? "").origin !== origin) {
            throw new Error("recovery_connection_refused");
          }
          return deps.createExecutionClient(origin);
        },
        payment: deps.payment,
        now,
        newId,
      });
      return report(await pass.runOnce({ owner, ...(deps.bounds ?? {}) }));
    } finally {
      running = false;
    }
  }

  function stop(): void {
    if (timer) clearInterval(timer);
    timer = null;
  }

  /**
   * The schedule. Not called anywhere in the application; calling it is the
   * activation step. Overlapping ticks cannot run concurrently in one process,
   * and the pass's own database lease covers concurrent processes.
   */
  function start(intervalMs: number): () => void {
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 60_000) {
      throw new Error("recovery_interval_must_be_at_least_one_minute");
    }
    if (timer) return stop;
    timer = setInterval(() => {
      void runOnce();
    }, intervalMs);
    (timer as { unref?: () => void }).unref?.();
    return stop;
  }

  return { runOnce, start, stop };
}

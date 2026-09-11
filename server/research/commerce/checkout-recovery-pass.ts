// One explicitly authorized pass, not a scheduler or checkout route. The caller
// must verify the actual connection/source and authentic approval in authorize.
// This composition never resolves ambient credentials or expands that authority.
import type { DurablePaymentProvider } from "../providers/payment";
import { createProviderVerifiedPaymentPort } from "./durable-payment-port";
import { createDurableCheckoutExecutor, type CanonicalCheckoutExecutionStore } from "./durable-checkout-executor";
import { createSupabaseCheckoutExecutionStore, type CheckoutExecutionClient } from "./persistence/checkout-executions-store";
import { createSupabaseCheckoutRecoveryOperationStore } from "./persistence/checkout-recovery-operation-store";
import { createCheckoutRecoveryOperation, type CheckoutRecoveryOperationOptions, type CheckoutRecoveryOperationResult } from "./checkout-recovery-operation";
import type { RecoveryOperationState, RecoveryOperationStore } from "./checkout-recovery-operation-contract";

export const RECOVERY_PASS_EFFECTS = ["durable_recovery_metadata", "canonical_local_settlement", "inspect_existing_payment", "cancel_existing_authorization"] as const;
export interface RecoveryPassContext {
  environment: "staging" | "production";
  projectRef: string;
  applicationSha: string;
  approvalSha256: string;
  /** The caller supplies the actual approval's validity window, not a default. */
  expiresAt: string;
  effects: readonly (typeof RECOVERY_PASS_EFFECTS)[number][];
  /** Discovery is project-wide. Refuse mixed pages; NEVER filter them silently. */
  memberIds: readonly string[] | "all";
}
export interface CheckoutRecoveryPassInput {
  enabled?: boolean;
  context: RecoveryPassContext;
  /** Fresh verified project/source/approval/effects. Called before construction
   * and every database/provider operation. A flag is not an approval receipt. */
  authorize(): Promise<RecoveryPassContext>;
  /** Must return the connection verified by authorize. No ambient singleton. */
  connect(context: Readonly<RecoveryPassContext>): CheckoutExecutionClient;
  /** Only these two provider capabilities are accepted; no normal checkout port. */
  payment: Pick<DurablePaymentProvider, "retrievePayment" | "cancelAuthorization">;
  now(): Date;
  newId(): string;
}
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const REF = /^[a-z]{20}$/;
const counts = () => ({ considered: 0, attempted: 0, recorded: 0, settled: 0, skipped: 0, escalated: 0, deferred: 0, pages: 0, resumed: 0 });
const deny = (): never => { throw new Error("recovery_pass_refused"); };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
function checkedContext(value: unknown, now: Date): RecoveryPassContext {
  const keys = ["environment", "projectRef", "applicationSha", "approvalSha256", "expiresAt", "effects", "memberIds"];
  if (!object(value) || Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))
    || typeof value.environment !== "string" || !["staging", "production"].includes(value.environment) || typeof value.projectRef !== "string" || !REF.test(value.projectRef)
    || typeof value.applicationSha !== "string" || !/^[a-f0-9]{40}$/.test(value.applicationSha)
    || typeof value.approvalSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.approvalSha256)
    || !(now instanceof Date) || !Number.isFinite(now.getTime()) || typeof value.expiresAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.expiresAt)
    || !Number.isFinite(Date.parse(value.expiresAt)) || new Date(value.expiresAt).toISOString() !== value.expiresAt
    || Date.parse(value.expiresAt) <= now.getTime()
    || !Array.isArray(value.effects) || value.effects.length !== RECOVERY_PASS_EFFECTS.length
    || new Set(value.effects).size !== RECOVERY_PASS_EFFECTS.length || !RECOVERY_PASS_EFFECTS.every(effect => (value.effects as unknown[]).includes(effect))
    || (value.memberIds !== "all" && (!Array.isArray(value.memberIds) || value.memberIds.length < 1 || value.memberIds.length > 1000
      || !value.memberIds.every(id => typeof id === "string" && UUID.test(id)) || new Set(value.memberIds).size !== value.memberIds.length))) return deny();
  return Object.freeze({ environment: value.environment as RecoveryPassContext["environment"], projectRef: value.projectRef,
    applicationSha: value.applicationSha, approvalSha256: value.approvalSha256, expiresAt: value.expiresAt,
    effects: Object.freeze([...RECOVERY_PASS_EFFECTS]), memberIds: value.memberIds === "all" ? "all" : Object.freeze([...value.memberIds].sort()) });
}

export function createCheckoutRecoveryPass(input: CheckoutRecoveryPassInput) {
  // No input callback, provider method, client construction, clock or I/O here.
  return {
    async runOnce(options: CheckoutRecoveryOperationOptions): Promise<CheckoutRecoveryOperationResult> {
      if (input.enabled !== true) return { ...counts(), ok: false, status: "disabled" };
      try {
        // Validate options before authorization can involve a connection read.
        if (!object(options) || typeof options.owner !== "string" || !UUID.test(options.owner)
          || Object.keys(options).some(key => !["owner", "maxAttempts", "maxPages", "pageSize"].includes(key))) return deny();
        for (const [key, maximum] of [["maxAttempts", 200], ["maxPages", 50], ["pageSize", 200]] as const) {
          if (options[key] !== undefined && (!Number.isSafeInteger(options[key]) || options[key]! < 1 || options[key]! > maximum)) return deny();
        }
        const context = checkedContext(input.context, input.now());
        const binding = JSON.stringify(context);
        const authorize = async () => {
          const observed = await input.authorize();
          if (JSON.stringify(checkedContext(observed, input.now())) !== binding) return deny();
        };
        await authorize();
        const connected = input.connect(context);
        const inScope = (member: string) => context.memberIds === "all" || context.memberIds.includes(member);
        const scoped = <T extends { memberId: string } | null>(record: T): T => {
          if (record && !inScope(record.memberId)) return deny();
          return record;
        };
        const raw = createSupabaseCheckoutExecutionStore(() => connected);
        if (typeof raw.listRecoverable !== "function") return deny();
        const executions: CanonicalCheckoutExecutionStore = {
          authority: raw.authority,
          async getForMember(member, key) { if (!inScope(member)) return deny(); await authorize(); return scoped(await raw.getForMember(member, key)); },
          async claim(...args) { await authorize(); return scoped(await raw.claim(...args)); },
          async recordProvider(...args) { await authorize(); return scoped(await raw.recordProvider(...args)); },
          async commitCaptured(...args) { await authorize(); return scoped(await raw.commitCaptured(...args)); },
          async commitCancelled(...args) { await authorize(); return scoped(await raw.commitCancelled(...args)); },
        };
        // Even accidental use of the larger canonical port cannot gain creation,
        // capture, refund, webhook or notification capabilities from this object.
        const provider: DurablePaymentProvider = {
          name: "bounded_recovery", supportsDeferredCapture: false,
          createAuthorization: async () => deny(), createAuthorizationOrPending: async () => deny(),
          captureAuthorization: async () => deny(), refund: async () => deny(), retrieveStatus: async () => deny(), verifyWebhook: async () => deny(),
          async retrievePayment(reference) { await authorize(); return input.payment.retrievePayment(reference); },
          async cancelAuthorization(reference) { await authorize(); return input.payment.cancelAuthorization(reference); },
        };
        const canonicalPort = createProviderVerifiedPaymentPort(provider);
        const executor = createDurableCheckoutExecutor(executions, { authority: canonicalPort.authority,
          inspect: canonicalPort.inspect, cancel: canonicalPort.cancel,
          authorize: async () => deny(), capture: async () => deny(), reconcile: async () => deny() });
        const rawControl = createSupabaseCheckoutRecoveryOperationStore({
          async rpc(name, args) { await authorize(); return connected.rpc(name, { ...args }); },
        });
        const stateScope = (state: RecoveryOperationState | null) => {
          if (state?.pending && !inScope(state.pending.memberId)) return deny();
          return state;
        };
        const control: RecoveryOperationStore = {
          ...rawControl,
          async claim(owner) {
            // A restored pending intent might belong to a different approved run.
            // Refuse it before claiming. If another writer installs pending work
            // during that read/claim race, the operation adopts the lease first,
            // then getForMember refuses its owner before any settlement/completion.
            // The operation can therefore release the exact acknowledged lease.
            stateScope(await rawControl.read());
            return rawControl.claim(owner);
          },
        };
        return await createCheckoutRecoveryOperation({ enabled: true, store: control, executions: {
          getForMember: executions.getForMember,
          async listRecoverable(request) { await authorize(); const page = await raw.listRecoverable!(request); page.forEach(scoped); return page; },
        }, settleUnattended: executor.settleUnattended, now: input.now, newId: input.newId }).run(options);
      } catch {
        // Never serialize connection errors, provider payloads or private identity.
        return { ...counts(), ok: false, status: "failed", code: "unavailable", releaseFailed: false };
      }
    },
  };
}

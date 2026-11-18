import { z } from "zod";
import type { SupabaseRpcClient } from "../../supabase-repository";

const identity = z.object({ requestId: z.string().uuid(), executionId: z.string().uuid() }).strict();
const blocked = z.object({
  status: z.literal("blocked"),
  reason: z.enum(["disabled", "not_active", "root_binding_missing", "root_binding_changed",
    "immutable_guard_binding_missing", "authority_ineligible", "lifecycle_unknown", "request_missing",
    "timeline_invalid", "clinical_or_unknown_line", "policy_snapshot_missing", "policy_snapshot_ineligible",
    "not_due", "dependency_graph_unsupported"]),
}).strict();
const erased = z.object({
  status: z.literal("erased"), requestId: z.string().uuid(), executionId: z.string().uuid(),
  erasedAt: z.string().datetime({ offset: true }), deadlineAt: z.string().datetime({ offset: true }),
  removedAccessEvents: z.number().int().min(0).max(1000),
  removedPolicySnapshots: z.literal(1), removedRequests: z.literal(1),
}).strict();
const result = z.discriminatedUnion("status", [blocked, erased]);
export type RetentionExecutionResult = z.infer<typeof result>;

/** Explicit backend operation only. No route, timer, scan, retry, local clock or
 * supplied policy/lifecycle facts. Unknown SQL/transport errors remain failures;
 * a lost reply is not evidence of rollback and must be reconciled by Root.
 */
export function retentionExecutionAdapter(client: SupabaseRpcClient) {
  return {
    async execute(raw: unknown): Promise<RetentionExecutionResult> {
      const input = identity.parse(raw);
      const response = await client.rpc("request_intent_retention_execute", {
        p_request_id: input.requestId, p_execution_id: input.executionId,
      });
      if (response.error) throw new Error("Retention execution failed.", { cause: response.error });
      const parsed = result.parse(response.data);
      if (parsed.status === "erased" && (parsed.requestId !== input.requestId || parsed.executionId !== input.executionId
        || Date.parse(parsed.deadlineAt) > Date.parse(parsed.erasedAt))) {
        throw new Error("Retention execution returned inconsistent evidence.");
      }
      return parsed;
    },
  };
}

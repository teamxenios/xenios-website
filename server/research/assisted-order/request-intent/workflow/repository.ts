import { parseRequestWorkflow, parseStartReviewResult, parseStaffRequestWorkflow, type StaffRequestWorkflowV1, type RequestWorkflowV1, type StartReviewResultV1, type StartReviewV1 } from "../../../../../shared/research/assisted-order/request-intent-workflow";
import type { RequestIntentRpcClient } from "../rpc-repository";
import type { WorkflowScope } from "./config";

export class RequestWorkflowError extends Error {
  constructor(public readonly code: string, public readonly status: 400 | 401 | 403 | 404 | 409 | 503) { super(code); }
}
export interface RequestWorkflowRepository {
  owner(requestId: string, ownerHash: string): Promise<RequestWorkflowV1 | null>;
  staff(requestId: string, actorId: string, eligibility: Readonly<{ mfaVerified: boolean; processingEnabled: boolean }>): Promise<StaffRequestWorkflowV1 | null>;
  startReview(requestId: string, actorId: string, mfa: boolean, command: StartReviewV1): Promise<StartReviewResultV1 | null>;
}
export function requestWorkflowRepository(client: RequestIntentRpcClient, scope: WorkflowScope): RequestWorkflowRepository {
  async function call(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, { p_environment: scope.environment, p_start_at: scope.startAt, ...args });
    if (error) {
      if (error.code === "42501") throw new RequestWorkflowError("workflow_access_required", 403);
      if (error.code === "40001" || error.code === "23505") throw new RequestWorkflowError("workflow_revision_conflict", 409);
      if (error.code === "22023") throw new RequestWorkflowError("invalid_workflow_command", 400);
      throw new RequestWorkflowError("request_workflow_unavailable", 503);
    }
    return data;
  }
  async function read(name: string, args: Record<string, unknown>) {
    const value = await call(name, args);
    if (value === null) return null;
    try { return parseRequestWorkflow(value); }
    catch { throw new RequestWorkflowError("request_workflow_unavailable", 503); }
  }
  return {
    owner: (id, hash) => read("request_intent_workflow_owner_get", { p_request_id: id, p_owner_hash: hash }),
    async staff(id, actor, eligibility) {
      const value = await call("request_intent_workflow_staff_get", { p_request_id: id, p_actor_user_id: actor,
        p_mfa_verified: eligibility.mfaVerified, p_processing_enabled: eligibility.processingEnabled });
      if (value === null) return null;
      try { return parseStaffRequestWorkflow(value); }
      catch { throw new RequestWorkflowError("request_workflow_unavailable", 503); }
    },
    async startReview(id, actor, mfa, command) {
      const value = await call("request_intent_start_review", { p_request_id: id, p_actor_user_id: actor,
        p_mfa_verified: mfa, p_expected_revision: command.expectedRevision, p_command_id: command.commandId });
      if (value === null) return null;
      try { return parseStartReviewResult(value); }
      catch { throw new RequestWorkflowError("request_workflow_unavailable", 503); }
    },
  };
}

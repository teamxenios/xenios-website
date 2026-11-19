import { aeIdentifier } from "../../../shared/research/account-executive/workspace";
import {
  aeRpcFailure, createAeIdentityBinding, memberOwnerHash, type AeCanonicalRpc,
} from "./identity-binding";
import type {
  AeWorkspaceAuthorityPort, AeAuthorizedSnapshot, AeAtomicCommandResult, AeCustomerOperationScope,
} from "./workspace";
import type { AeResult } from "../../../shared/research/account-executive/workspace";

/** Concrete RPC repository over the private candidate. It installs no routes,
 * roles or schema and has no in-memory or broad-staff-reader fallback. */
export function createAeCanonicalAdapter(client: AeCanonicalRpc, operationalScopeId: string): AeWorkspaceAuthorityPort {
  const scope = aeIdentifier.parse(operationalScopeId), identity = createAeIdentityBinding(client, scope);
  async function call<T>(name: string, args: Record<string, unknown>): Promise<AeResult<T>> {
    try {
      const response = await client.rpc(name, { ...args, p_scope_id: scope });
      if (response.error) return aeRpcFailure(response.error);
      if (response.data === null || typeof response.data !== "object") return { ok: false, code: "unavailable" };
      return { ok: true, value: response.data as T };
    } catch { return { ok: false, code: "unavailable" }; }
  }
  return {
    async readAssignedSnapshot(actor, _at, sessionId) {
      const response = await call<AeAuthorizedSnapshot>("ae_workspace_read", { p_actor_user_id: actor, p_session_id: sessionId });
      if (!response.ok) return response;
      try {
        if (!Array.isArray(response.value.customers)) return { ok: false, code: "unavailable" };
        for (const customer of response.value.customers) {
          const customerId = aeIdentifier.parse(customer.assignment.customerAuthUserId);
          if (!Array.isArray(customer.requests)) return { ok: false, code: "unavailable" };
          for (const request of customer.requests) {
            if (request.ownerHash === memberOwnerHash(customerId)) continue;
            const evidence = await identity.verifyGuestRequestOwnership({ actorAuthUserId: actor, sessionId,
              customerAuthUserId: customerId, requestId: request.receipt.requestId, ownerHash: request.ownerHash });
            if (!evidence) return { ok: false, code: "unavailable" };
            request.ownershipEvidence = evidence;
          }
        }
        return response;
      } catch { return { ok: false, code: "unavailable" }; }
    },
    authorizeCustomerOperation: input => call<AeCustomerOperationScope>("ae_workspace_authorize", {
      p_actor_user_id: input.actorAuthUserId, p_session_id: input.sessionId,
      p_customer_auth_user_id: input.customerAuthUserId, p_capability: input.capability,
    }),
    commitAuthorizedCommand: input => call<AeAtomicCommandResult>("ae_workspace_command", {
      p_actor_user_id: input.actorAuthUserId, p_session_id: input.sessionId, p_command: input.command,
      p_grant_id: input.expectedAuthority.grantId, p_grant_revision: input.expectedAuthority.grantRevision,
    }),
    commitInitialAssignment: input => call<AeAtomicCommandResult>("ae_workspace_assign", {
      p_actor_user_id: input.actorAuthUserId, p_session_id: input.sessionId, p_command: input.command,
    }),
  };
}

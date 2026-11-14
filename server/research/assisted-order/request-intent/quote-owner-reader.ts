import type { RequestIntentRpcClient } from "./rpc-repository";
import { RequestIntentError } from "./service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PAGE_SIZE = 100;

/** Pass the canonical hash derived from a live server-resolved principal. */
export function requestIntentQuoteOwnerReader(client: RequestIntentRpcClient) {
  async function read(ownerHash: string, requestId: string | null, afterId: string | null): Promise<string[]> {
    if (!/^[0-9a-f]{64}$/.test(ownerHash) ||
        (requestId !== null && !UUID.test(requestId)) ||
        (afterId !== null && !UUID.test(afterId))) {
      throw new RequestIntentError("invalid_quote_owner_scope", 403);
    }

    const { data, error } = await client.rpc("request_intent_owned_ids", {
      p_owner_hash: ownerHash,
      p_request_id: requestId,
      p_after_id: afterId,
    });
    if (error) throw new RequestIntentError("request_intent_persistence_uncertain", 503);
    if (!Array.isArray(data) || data.length > (requestId === null ? PAGE_SIZE : 1)) {
      throw new RequestIntentError("invalid_persistence_result", 503);
    }

    const ids: string[] = [];
    let previous = afterId;
    for (const id of data) {
      if (typeof id !== "string" || !UUID.test(id) ||
          (previous !== null && id <= previous) ||
          (requestId !== null && id !== requestId)) {
        throw new RequestIntentError("invalid_persistence_result", 503);
      }
      ids.push(id);
      previous = id;
    }
    return ids;
  }

  return {
    async owns(ownerHash: string, requestId: string): Promise<boolean> {
      return (await read(ownerHash, requestId, null)).length === 1;
    },
    list(ownerHash: string, afterId: string | null = null): Promise<string[]> {
      return read(ownerHash, null, afterId);
    },
  };
}

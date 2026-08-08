import type { EarlyAccessPersistenceQuery } from "../persistence/executor";
import { SupabaseEarlyAccessCartStore } from "./supabase-store";

/**
 * Explicit production constructor. No default, no process-memory fallback.
 * production-deps.ts should call this only when Supabase is the chosen durable
 * persistence mode and pass the resulting object as `cartCheckoutStore`.
 */
export function buildEarlyAccessDurableCartStore(
  query: EarlyAccessPersistenceQuery,
): SupabaseEarlyAccessCartStore {
  return new SupabaseEarlyAccessCartStore(query);
}

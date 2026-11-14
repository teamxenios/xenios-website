import type { Pool } from "pg";
export type QuoteQuery = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
export const RESTRICTED_RUNTIME_ROLES: Readonly<Record<"staging" | "production", Readonly<{ runtime: string; login: string }>>>;
export function pgTransactions(pool: Pool, options?: { assumeStagingRuntimeRole?: boolean; runtimeRole?: "staging" | "production" | null }):
  <T>(tenant: string, xriId: string, work: (query: QuoteQuery) => Promise<T>) => Promise<T>;

import type { Pool } from "pg";
export type QuoteQuery = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
export function pgTransactions(pool: Pool, options?: { assumeStagingRuntimeRole?: boolean }):
  <T>(tenant: string, xriId: string, work: (query: QuoteQuery) => Promise<T>) => Promise<T>;

// Staging store port for client imports. The identity-bearing staged records
// live ONLY behind this port (production: a service-role Supabase table from
// the candidate SQL; tests: memory). The port deliberately has no method that
// returns staged records to an HTTP surface — admin reads get reports.

import type {
  ImportDryRunReportDto,
  StagedClientRecord,
} from "@shared/research/client-import/contract";

export interface ClientImportStagingStore {
  saveBatch(
    report: ImportDryRunReportDto,
    staged: readonly StagedClientRecord[],
  ): Promise<void>;
  reportFor(batchId: string): Promise<ImportDryRunReportDto | null>;
  listReports(): Promise<readonly ImportDryRunReportDto[]>;
}

export function createMemoryClientImportStagingStore(): ClientImportStagingStore {
  const reports = new Map<string, ImportDryRunReportDto>();
  // Staged records are held but never exposed — mirroring the production
  // shape, where they live in a service-role table with no read RPC.
  const vault = new Map<string, readonly StagedClientRecord[]>();

  return {
    async saveBatch(report, staged) {
      reports.set(report.batchId, report);
      vault.set(report.batchId, staged);
    },
    async reportFor(batchId) {
      return reports.get(batchId) ?? null;
    },
    async listReports() {
      return Array.from(reports.values());
    },
  };
}

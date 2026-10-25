import type { ReportingSink, ReportingSinkResult } from "./port";

export const GOOGLE_SHEETS_REPORTING_DISABLED_REASON = "google_sheets_reporting_not_configured";

/** Credential-free release boundary: this adapter never performs network I/O. */
export function createDisabledGoogleSheetsAdapter(): ReportingSink {
  return Object.freeze({
    async write(): Promise<ReportingSinkResult> {
      return { status: "permanent_failure", reason: GOOGLE_SHEETS_REPORTING_DISABLED_REASON };
    },
  });
}

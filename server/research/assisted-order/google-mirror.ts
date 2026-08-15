import type {
  AssistedOrderGoogleMirrorQueue,
  AssistedOrderGoogleMirrorRow,
  AssistedOrderLogger,
} from "./ports";

export class DisabledGoogleMirrorQueue
  implements AssistedOrderGoogleMirrorQueue
{
  public async enqueue(_row: AssistedOrderGoogleMirrorRow): Promise<void> {
    return;
  }
}

/**
 * Optional adapter. Submission must already be durable before this is called.
 * The access token must come from the existing Google Workspace credential
 * provider. Do not persist it in this class or in the repository.
 */
export class GoogleSheetsMirrorQueue implements AssistedOrderGoogleMirrorQueue {
  public constructor(
    private readonly options: Readonly<{
      spreadsheetId: string;
      sheetName: string;
      accessToken: () => Promise<string>;
      fetch: typeof globalThis.fetch;
      logger: AssistedOrderLogger;
    }>,
  ) {}

  public async enqueue(row: AssistedOrderGoogleMirrorRow): Promise<void> {
    const token = await this.options.accessToken();
    const range = encodeURIComponent(`${this.options.sheetName}!A:O`);
    const response = await this.options.fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        this.options.spreadsheetId,
      )}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          majorDimension: "ROWS",
          values: [
            [
              row.publicReference,
              row.createdAt,
              row.fullLegalName,
              row.email,
              row.mobilePhone,
              row.organizationName ?? "",
              row.lineCount,
              row.totalQuantity,
              row.estimatedValue ?? "",
              row.identityStatus,
              row.agreementStatus,
              row.paymentStatus,
              row.supplierStatus,
              row.trackingStatus,
              row.overallStatus,
              row.adminPath,
            ],
          ],
        }),
      },
    );
    if (!response.ok) {
      const text = await response.text();
      this.options.logger.warn("Google Sheets assisted-order mirror failed.", {
        status: response.status,
        response: text.slice(0, 500),
      });
      throw new Error("Google Sheets mirror request failed.");
    }
  }
}
